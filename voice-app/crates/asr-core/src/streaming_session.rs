use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;

use futures_util::{SinkExt, StreamExt};
use http::{header::HeaderName, HeaderValue, Response, StatusCode};
use tokio::runtime::Builder;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Error as WebSocketError;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

use crate::{
    build_doubao_audio_frame, build_doubao_session_start_frame, parse_doubao_server_events,
    DoubaoAsrConfig, DoubaoAsrError, DoubaoSessionEvent,
};

enum SessionCommand {
    AppendAudio(Vec<u8>),
    Commit,
    Close,
}

#[derive(Clone)]
pub struct DoubaoStreamingClient {
    command_tx: UnboundedSender<SessionCommand>,
    final_packet_sent: Arc<AtomicBool>,
}

pub struct DoubaoStreamingSession {
    command_tx: UnboundedSender<SessionCommand>,
    final_packet_sent: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

pub fn ensure_rustls_crypto_provider_installed() -> Result<(), DoubaoAsrError> {
    if rustls::crypto::CryptoProvider::get_default().is_some() {
        return Ok(());
    }

    match rustls::crypto::ring::default_provider().install_default() {
        Ok(()) => Ok(()),
        Err(_) if rustls::crypto::CryptoProvider::get_default().is_some() => Ok(()),
        Err(_) => Err(DoubaoAsrError::new(
            "failed to install rustls crypto provider for doubao websocket",
        )),
    }
}

impl DoubaoStreamingSession {
    pub fn connect(
        config: DoubaoAsrConfig,
    ) -> Result<(Self, mpsc::Receiver<DoubaoSessionEvent>), DoubaoAsrError> {
        ensure_rustls_crypto_provider_installed()?;
        let (command_tx, command_rx) = unbounded_channel();
        let (event_tx, event_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let ready_sent = Arc::new(AtomicBool::new(false));
        let final_packet_sent = Arc::new(AtomicBool::new(false));
        let worker_final_packet_sent = Arc::clone(&final_packet_sent);

        let worker = thread::spawn(move || {
            let runtime = match Builder::new_current_thread().enable_all().build() {
                Ok(runtime) => runtime,
                Err(cause) => {
                    let _ = ready_tx.send(Err(DoubaoAsrError::new(format!(
                        "failed to build tokio runtime: {cause}"
                    ))));
                    return;
                }
            };

            let ready_error_tx = ready_tx.clone();
            let ready_sent = Arc::clone(&ready_sent);
            if let Err(cause) = runtime.block_on(run_session_loop(
                config,
                command_rx,
                event_tx,
                ready_tx,
                Arc::clone(&ready_sent),
            )) {
                if !ready_sent.swap(true, Ordering::SeqCst) {
                    let _ = ready_error_tx.send(Err(cause));
                }
            }

            worker_final_packet_sent.store(true, Ordering::SeqCst);
        });

        match ready_rx.recv() {
            Ok(Ok(())) => Ok((
                Self {
                    command_tx,
                    final_packet_sent,
                    worker: Some(worker),
                },
                event_rx,
            )),
            Ok(Err(error)) => {
                let _ = worker.join();
                Err(error)
            }
            Err(cause) => {
                let _ = worker.join();
                Err(DoubaoAsrError::new(format!(
                    "failed to receive doubao session readiness: {cause}"
                )))
            }
        }
    }

    pub fn append_audio(&self, chunk: Vec<u8>) -> Result<(), DoubaoAsrError> {
        self.client().append_audio(chunk)
    }

    pub fn commit(&self) -> Result<(), DoubaoAsrError> {
        self.client().commit()
    }

    pub fn client(&self) -> DoubaoStreamingClient {
        DoubaoStreamingClient {
            command_tx: self.command_tx.clone(),
            final_packet_sent: Arc::clone(&self.final_packet_sent),
        }
    }

    pub fn close(mut self) -> Result<(), DoubaoAsrError> {
        self.final_packet_sent.store(true, Ordering::SeqCst);
        let _ = self.command_tx.send(SessionCommand::Close);

        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .map_err(|_| DoubaoAsrError::new("doubao session worker panicked"))?;
        }

        Ok(())
    }
}

impl DoubaoStreamingClient {
    pub fn append_audio(&self, chunk: Vec<u8>) -> Result<(), DoubaoAsrError> {
        if chunk.is_empty() {
            return Ok(());
        }

        if self.final_packet_sent.load(Ordering::SeqCst) {
            return Err(DoubaoAsrError::new(
                "doubao session has already sent the final audio packet",
            ));
        }

        self.command_tx
            .send(SessionCommand::AppendAudio(chunk))
            .map_err(|_| DoubaoAsrError::new("doubao session is no longer running"))
    }

    pub fn commit(&self) -> Result<(), DoubaoAsrError> {
        if self.final_packet_sent.swap(true, Ordering::SeqCst) {
            return Err(DoubaoAsrError::new(
                "doubao session has already sent the final audio packet",
            ));
        }

        self.command_tx
            .send(SessionCommand::Commit)
            .map_err(|_| DoubaoAsrError::new("doubao session is no longer running"))
    }
}

async fn run_session_loop(
    config: DoubaoAsrConfig,
    mut command_rx: UnboundedReceiver<SessionCommand>,
    event_tx: mpsc::Sender<DoubaoSessionEvent>,
    ready_tx: mpsc::Sender<Result<(), DoubaoAsrError>>,
    ready_sent: Arc<AtomicBool>,
) -> Result<(), DoubaoAsrError> {
    let session_id = Uuid::new_v4().to_string();
    let connect_id = Uuid::new_v4().to_string();
    let request = build_connect_request(&config, &connect_id)?;
    let (stream, _) = connect_async(request).await.map_err(format_connect_error)?;
    let (mut write, mut read) = stream.split();

    let start_frame = build_doubao_session_start_frame(&config, &session_id)?;
    write
        .send(Message::Binary(start_frame.into()))
        .await
        .map_err(|cause| {
            DoubaoAsrError::new(format!("failed to send doubao start frame: {cause}"))
        })?;

    ready_sent.store(true, Ordering::SeqCst);
    let _ = ready_tx.send(Ok(()));

    let mut terminal_event_seen = false;

    loop {
        tokio::select! {
          biased;

          command = command_rx.recv() => {
            match command {
              Some(SessionCommand::AppendAudio(chunk)) => {
                let frame = build_doubao_audio_frame(&chunk, false)?;
                write
                  .send(Message::Binary(frame.into()))
                  .await
                  .map_err(|cause| DoubaoAsrError::new(format!("failed to send doubao audio frame: {cause}")))?;
              }
              Some(SessionCommand::Commit) => {
                let frame = build_doubao_audio_frame(&[], true)?;
                write
                  .send(Message::Binary(frame.into()))
                  .await
                  .map_err(|cause| DoubaoAsrError::new(format!("failed to send doubao commit frame: {cause}")))?;
              }
              Some(SessionCommand::Close) => {
                break;
              }
              None => {
                break;
              }
            }
          }

          message = read.next() => {
            match message {
              Some(Ok(Message::Binary(bytes))) => {
                for event in parse_doubao_server_events(&bytes)? {
                  if matches!(event, DoubaoSessionEvent::Completed { .. } | DoubaoSessionEvent::Error { .. }) {
                    terminal_event_seen = true;
                  }

                  let _ = event_tx.send(event);
                }

                if terminal_event_seen {
                  break;
                }
              }
              Some(Ok(Message::Close(_))) | None => {
                if !terminal_event_seen {
                  let _ = event_tx.send(DoubaoSessionEvent::Error {
                    message: "豆包双向流式识别连接已关闭".to_string(),
                  });
                }
                break;
              }
              Some(Ok(_)) => {}
              Some(Err(cause)) => {
                if !terminal_event_seen {
                  let _ = event_tx.send(DoubaoSessionEvent::Error {
                    message: format!("豆包双向流式识别连接异常: {cause}"),
                  });
                }
                break;
              }
            }
          }
        }
    }

    let _ = write.close().await;
    Ok(())
}

fn format_connect_error(cause: WebSocketError) -> DoubaoAsrError {
    match cause {
        WebSocketError::Http(response) => map_http_connect_error(response),
        other => DoubaoAsrError::new(format!("failed to connect doubao websocket: {other}")),
    }
}

fn map_http_connect_error(response: Response<Option<Vec<u8>>>) -> DoubaoAsrError {
    let status = response.status();
    let log_id_suffix = response
        .headers()
        .get("x-tt-logid")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("，logid: {value}"))
        .unwrap_or_default();

    match status {
    StatusCode::FORBIDDEN => DoubaoAsrError::new(format!(
      "豆包 WebSocket 鉴权失败或资源未开通（HTTP 403）。请检查豆包 App ID、豆包 Access Token 与豆包 Resource ID 是否属于同一个火山引擎应用{}",
      log_id_suffix
    )),
    _ => DoubaoAsrError::new(format!(
      "failed to connect doubao websocket: HTTP error: {status}{log_id_suffix}"
    )),
  }
}

fn build_connect_request(
    config: &DoubaoAsrConfig,
    connect_id: &str,
) -> Result<http::Request<()>, DoubaoAsrError> {
    let mut request =
        config.url.as_str().into_client_request().map_err(|cause| {
            DoubaoAsrError::new(format!("invalid doubao websocket url: {cause}"))
        })?;

    request.headers_mut().insert(
        HeaderName::from_static("x-api-app-key"),
        HeaderValue::from_str(&config.app_id).map_err(|cause| {
            DoubaoAsrError::new(format!("invalid doubao app id header: {cause}"))
        })?,
    );
    request.headers_mut().insert(
        HeaderName::from_static("x-api-access-key"),
        HeaderValue::from_str(&config.access_token).map_err(|cause| {
            DoubaoAsrError::new(format!("invalid doubao access token header: {cause}"))
        })?,
    );
    request.headers_mut().insert(
        HeaderName::from_static("x-api-resource-id"),
        HeaderValue::from_str(&config.resource_id).map_err(|cause| {
            DoubaoAsrError::new(format!("invalid doubao resource id header: {cause}"))
        })?,
    );
    request.headers_mut().insert(
        HeaderName::from_static("x-api-connect-id"),
        HeaderValue::from_str(connect_id).map_err(|cause| {
            DoubaoAsrError::new(format!("invalid doubao connect id header: {cause}"))
        })?,
    );

    Ok(request.map(|_| ()))
}
