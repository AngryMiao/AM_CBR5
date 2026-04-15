use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use flate2::write::GzEncoder;
use flate2::Compression;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::io::{Read, Write};
use tokio::runtime::Runtime;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

use asr_core::{DoubaoAsrConfig, DoubaoSessionEvent, DoubaoStreamingSession};

const PROTOCOL_VERSION: u8 = 0x1;
const HEADER_SIZE_WORDS: u8 = 0x1;
const SERIALIZATION_JSON: u8 = 0x1;
const COMPRESSION_GZIP: u8 = 0x1;
const MESSAGE_TYPE_FULL_SERVER_RESPONSE: u8 = 0x9;
const MESSAGE_FLAG_NONE: u8 = 0x0;
const MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE: u8 = 0x3;

fn build_server_frame(flags: u8, payload: serde_json::Value, sequence: Option<i32>) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(payload.to_string().as_bytes())
        .expect("payload should compress");
    let body = encoder.finish().expect("gzip should finish");

    let mut frame = vec![
        (PROTOCOL_VERSION << 4) | HEADER_SIZE_WORDS,
        (MESSAGE_TYPE_FULL_SERVER_RESPONSE << 4) | flags,
        (SERIALIZATION_JSON << 4) | COMPRESSION_GZIP,
        0,
    ];

    if let Some(sequence) = sequence {
        frame.extend_from_slice(&sequence.to_be_bytes());
    }

    frame.extend_from_slice(&(body.len() as u32).to_be_bytes());
    frame.extend_from_slice(&body);
    frame
}

fn spawn_test_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    listener
        .set_nonblocking(true)
        .expect("listener should become nonblocking");
    let address = format!(
        "ws://{}",
        listener.local_addr().expect("address should exist")
    );

    thread::spawn(move || {
        let runtime = Runtime::new().expect("runtime should build");
        runtime.block_on(async move {
            let listener =
                tokio::net::TcpListener::from_std(listener).expect("tokio listener should wrap");
            let (stream, _) = listener.accept().await.expect("client should connect");
            let mut websocket = accept_async(stream)
                .await
                .expect("websocket handshake should succeed");

            let _ = websocket.next().await;
            websocket
                .send(Message::Binary(
                    build_server_frame(
                        MESSAGE_FLAG_NONE,
                        json!({
                          "code": 20000000,
                          "result": [
                            {
                              "text": "实时片段"
                            }
                          ]
                        })
                        .into(),
                        None,
                    )
                    .into(),
                ))
                .await
                .expect("partial response should send");

            let _ = websocket.next().await;
            websocket
                .send(Message::Binary(
                    build_server_frame(
                        MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE,
                        json!({
                          "code": 20000000,
                          "result": [
                            {
                              "text": "最终识别结果",
                              "utterances": [
                                {
                                  "text": "最终识别结果",
                                  "definite": true
                                }
                              ]
                            }
                          ]
                        })
                        .into(),
                        Some(-1),
                    )
                    .into(),
                ))
                .await
                .expect("completed response should send");

            // Windows 上如果这里立刻 close，客户端有时会先收到 TCP reset，
            // 导致 completed frame 还没来得及被消费就变成连接异常。
            tokio::time::sleep(Duration::from_millis(50)).await;

            websocket
                .close(None)
                .await
                .expect("websocket should close cleanly");
        });
    });

    address
}

fn spawn_server_that_reports_frames_after_commit() -> (String, mpsc::Receiver<bool>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    listener
        .set_nonblocking(true)
        .expect("listener should become nonblocking");
    let address = format!(
        "ws://{}",
        listener.local_addr().expect("address should exist")
    );
    let (report_tx, report_rx) = mpsc::channel();

    thread::spawn(move || {
        let runtime = Runtime::new().expect("runtime should build");
        runtime.block_on(async move {
            let listener =
                tokio::net::TcpListener::from_std(listener).expect("tokio listener should wrap");
            let (stream, _) = listener.accept().await.expect("client should connect");
            let mut websocket = accept_async(stream)
                .await
                .expect("websocket handshake should succeed");

            let _ = websocket.next().await;
            let _ = websocket.next().await;
            let _ = websocket.next().await;

            let extra_binary_frame_seen = matches!(
                tokio::time::timeout(Duration::from_millis(250), websocket.next()).await,
                Ok(Some(Ok(Message::Binary(_))))
            );
            let _ = report_tx.send(extra_binary_frame_seen);

            websocket
                .close(None)
                .await
                .expect("websocket should close cleanly");
        });
    });

    (address, report_rx)
}

fn unused_ws_url() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let address = listener.local_addr().expect("address should exist");
    drop(listener);
    format!("ws://{address}")
}

fn spawn_http_403_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let address = format!(
        "ws://{}",
        listener.local_addr().expect("address should exist")
    );

    thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("client should connect");
        let mut request = [0_u8; 2048];
        let _ = stream.read(&mut request);
        stream
      .write_all(
        b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\nX-Tt-Logid: test-log-id\r\n\r\n",
      )
      .expect("http 403 response should send");
    });

    address
}

#[test]
fn session_rejects_audio_appends_after_commit() {
    let (url, report_rx) = spawn_server_that_reports_frames_after_commit();
    let config = DoubaoAsrConfig {
        url,
        app_id: "app-id".to_string(),
        access_token: "token".to_string(),
        resource_id: "volc.bigasr.sauc.duration".to_string(),
        model: "bigmodel".to_string(),
        audio_format: "pcm".to_string(),
        audio_rate: 16_000,
        audio_bits: 16,
        audio_channel: 1,
        audio_language: "zh-CN".to_string(),
        enable_itn: false,
        enable_ddc: false,
        enable_punc: false,
        show_utterances: true,
        force_to_speech_time: 0,
        end_window_size: 800,
        boosting_table_id: None,
        context_json: None,
    };

    let (session, _) = DoubaoStreamingSession::connect(config).expect("session should connect");
    let client = session.client();
    client
        .append_audio(vec![0, 1, 2, 3])
        .expect("initial audio append should succeed");
    session.commit().expect("commit should succeed");

    let append_after_commit = client.append_audio(vec![4, 5, 6, 7]);

    assert!(
        append_after_commit.is_err(),
        "append_audio after commit must be rejected locally"
    );
    assert_eq!(
        report_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("server should report whether an extra frame arrived"),
        false,
        "server must not receive binary frames after the commit frame"
    );

    session.close().expect("session should close cleanly");
}

#[test]
fn session_emits_partial_then_completed_events() {
    let url = spawn_test_server();
    let config = DoubaoAsrConfig {
        url,
        app_id: "app-id".to_string(),
        access_token: "token".to_string(),
        resource_id: "volc.bigasr.sauc.duration".to_string(),
        model: "bigmodel".to_string(),
        audio_format: "pcm".to_string(),
        audio_rate: 16_000,
        audio_bits: 16,
        audio_channel: 1,
        audio_language: "zh-CN".to_string(),
        enable_itn: false,
        enable_ddc: false,
        enable_punc: false,
        show_utterances: true,
        force_to_speech_time: 0,
        end_window_size: 800,
        boosting_table_id: None,
        context_json: None,
    };

    let (session, events) =
        DoubaoStreamingSession::connect(config).expect("session should connect");
    session
        .append_audio(vec![0, 1, 2, 3])
        .expect("audio append should succeed");
    session.commit().expect("commit should succeed");

    let partial = events
        .recv_timeout(Duration::from_secs(2))
        .expect("partial event should arrive");
    let completed = events
        .recv_timeout(Duration::from_secs(2))
        .expect("completed event should arrive");

    assert_eq!(
        partial,
        DoubaoSessionEvent::Partial {
            text: "实时片段".to_string(),
        }
    );
    assert_eq!(
        completed,
        DoubaoSessionEvent::Completed {
            text: "最终识别结果".to_string(),
        }
    );

    session.close().expect("session should close cleanly");
}

#[test]
fn connect_surfaces_runtime_connect_errors_instead_of_closed_channel() {
    let config = DoubaoAsrConfig {
        url: unused_ws_url(),
        app_id: "app-id".to_string(),
        access_token: "token".to_string(),
        resource_id: "volc.bigasr.sauc.duration".to_string(),
        model: "bigmodel".to_string(),
        audio_format: "pcm".to_string(),
        audio_rate: 16_000,
        audio_bits: 16,
        audio_channel: 1,
        audio_language: "zh-CN".to_string(),
        enable_itn: false,
        enable_ddc: false,
        enable_punc: false,
        show_utterances: true,
        force_to_speech_time: 0,
        end_window_size: 800,
        boosting_table_id: None,
        context_json: None,
    };

    let error = match DoubaoStreamingSession::connect(config) {
        Ok(_) => panic!("connect should fail"),
        Err(error) => error,
    };
    let message = error.to_string();

    assert!(message.contains("failed to connect doubao websocket"));
    assert!(!message.contains("failed to receive doubao session readiness"));
}

#[test]
fn connect_translates_http_403_into_actionable_doubao_error() {
    let config = DoubaoAsrConfig {
        url: spawn_http_403_server(),
        app_id: "app-id".to_string(),
        access_token: "token".to_string(),
        resource_id: "volc.bigasr.sauc.duration".to_string(),
        model: "bigmodel".to_string(),
        audio_format: "pcm".to_string(),
        audio_rate: 16_000,
        audio_bits: 16,
        audio_channel: 1,
        audio_language: "zh-CN".to_string(),
        enable_itn: false,
        enable_ddc: false,
        enable_punc: false,
        show_utterances: true,
        force_to_speech_time: 0,
        end_window_size: 800,
        boosting_table_id: None,
        context_json: None,
    };

    let error = match DoubaoStreamingSession::connect(config) {
        Ok(_) => panic!("connect should fail"),
        Err(error) => error,
    };
    let message = error.to_string();

    assert!(message.contains("HTTP 403"));
    assert!(message.contains("鉴权失败"));
    assert!(message.contains("test-log-id"));
}
