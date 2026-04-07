use std::error::Error;
use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use crate::microphone_catalog::{
    build_microphone_input_devices, resolve_microphone_choice, MicrophoneInputDevice,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioCaptureArtifact {
    pub wav_path: PathBuf,
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_count: usize,
    pub duration_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecordedAudioClip {
    samples: Vec<i16>,
    sample_rate: u32,
    channels: u16,
}

pub struct MicrophoneRecordingSession {
    stop_tx: mpsc::Sender<()>,
    worker: Option<thread::JoinHandle<Result<RecordedAudioClip, AudioCaptureError>>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MicrophoneCaptureReady {
    pub requested_device_id: Option<String>,
    pub selected_device_id: String,
    pub selected_device_label: String,
    pub is_default_device: bool,
    pub used_fallback: bool,
}

struct StreamingResampler {
    input_sample_rate: u32,
    output_sample_rate: u32,
    source: Vec<i16>,
    next_output_position: f64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioCaptureError {
    message: String,
}

impl Display for AudioCaptureError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for AudioCaptureError {}

impl RecordedAudioClip {
    pub fn new(samples: Vec<i16>, sample_rate: u32, channels: u16) -> Self {
        Self {
            samples,
            sample_rate,
            channels,
        }
    }

    pub fn samples(&self) -> &[i16] {
        &self.samples
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.channels
    }

    pub fn duration_ms(&self) -> u64 {
        if self.sample_rate == 0 || self.channels == 0 {
            return 0;
        }

        let frame_count = self.samples.len() as u64 / self.channels as u64;
        frame_count.saturating_mul(1_000) / self.sample_rate as u64
    }

    pub fn transcript_text(&self) -> String {
        format!("Recorded audio clip ({} ms).", self.duration_ms())
    }

    pub fn detail_text(&self) -> String {
        format!(
            "Captured {} ms of microphone audio at {} Hz.",
            self.duration_ms(),
            self.sample_rate
        )
    }

    pub fn persist_temp_wav(&self) -> Result<AudioCaptureArtifact, AudioCaptureError> {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|cause| AudioCaptureError::new(format!("system clock error: {cause}")))?
            .as_millis();
        let path = std::env::temp_dir().join(format!("voice-app-recording-{stamp}.wav"));

        self.persist_wav(&path)
    }

    pub fn persist_wav(&self, path: &Path) -> Result<AudioCaptureArtifact, AudioCaptureError> {
        let spec = hound::WavSpec {
            channels: self.channels,
            sample_rate: self.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).map_err(|cause| {
            AudioCaptureError::new(format!("failed to create wav file: {cause}"))
        })?;

        for sample in &self.samples {
            writer.write_sample(*sample).map_err(|cause| {
                AudioCaptureError::new(format!("failed to write wav sample: {cause}"))
            })?;
        }

        writer.finalize().map_err(|cause| {
            AudioCaptureError::new(format!("failed to finalize wav file: {cause}"))
        })?;

        Ok(AudioCaptureArtifact {
            wav_path: path.to_path_buf(),
            sample_rate: self.sample_rate,
            channels: self.channels,
            sample_count: self.samples.len(),
            duration_ms: self.duration_ms(),
        })
    }
}

impl AudioCaptureArtifact {
    pub fn transcript_text(&self) -> String {
        format!("Recorded audio clip ({} ms).", self.duration_ms)
    }

    pub fn result_text(&self) -> String {
        format!("Saved WAV to {}.", self.wav_path.display())
    }

    pub fn detail_text(&self) -> String {
        format!(
            "Captured {} ms of microphone audio at {} Hz.",
            self.duration_ms, self.sample_rate
        )
    }
}

impl MicrophoneRecordingSession {
    pub fn start_default() -> Result<Self, AudioCaptureError> {
        Self::start_with_preferred_device_and_chunk_callback(None, 16_000, |_| {})
            .map(|(session, _)| session)
    }

    pub fn start_with_chunk_callback<F>(
        target_sample_rate: u32,
        on_chunk: F,
    ) -> Result<Self, AudioCaptureError>
    where
        F: Fn(&[i16]) + Send + Sync + 'static,
    {
        Self::start_with_preferred_device_and_chunk_callback(None, target_sample_rate, on_chunk)
            .map(|(session, _)| session)
    }

    pub fn start_with_preferred_device_and_chunk_callback<F>(
        preferred_device_id: Option<&str>,
        target_sample_rate: u32,
        on_chunk: F,
    ) -> Result<(Self, MicrophoneCaptureReady), AudioCaptureError>
    where
        F: Fn(&[i16]) + Send + Sync + 'static,
    {
        if target_sample_rate == 0 {
            return Err(AudioCaptureError::new(
                "target microphone sample rate must be greater than 0",
            ));
        }

        let preferred_device_id = preferred_device_id.map(str::to_string);
        let on_chunk = Arc::new(on_chunk);
        let (ready_tx, ready_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let worker = thread::spawn(move || {
            capture_microphone_until_stopped(
                ready_tx,
                stop_rx,
                preferred_device_id,
                target_sample_rate,
                on_chunk,
            )
        });

        let ready = ready_rx.recv().map_err(|cause| {
            AudioCaptureError::new(format!("failed to receive microphone readiness: {cause}"))
        })??;

        Ok((
            Self {
                stop_tx,
                worker: Some(worker),
            },
            ready,
        ))
    }

    pub fn stop(mut self) -> Result<RecordedAudioClip, AudioCaptureError> {
        let _ = self.stop_tx.send(());
        let worker = self
            .worker
            .take()
            .ok_or_else(|| AudioCaptureError::new("microphone worker already consumed"))?;

        worker
            .join()
            .map_err(|_| AudioCaptureError::new("microphone capture thread panicked"))?
    }
}

pub fn list_microphone_input_devices() -> Result<Vec<MicrophoneInputDevice>, AudioCaptureError> {
    let host = cpal::default_host();
    let default_label = resolve_default_device_label(&host);
    let raw_devices = collect_input_devices(&host)?;
    let labels = raw_devices
        .iter()
        .enumerate()
        .map(|(index, device)| resolve_device_label(device, index))
        .collect::<Vec<_>>();

    Ok(build_microphone_input_devices(
        &labels,
        default_label.as_deref(),
    ))
}

impl AudioCaptureError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

fn capture_microphone_until_stopped(
    ready_tx: mpsc::Sender<Result<MicrophoneCaptureReady, AudioCaptureError>>,
    stop_rx: mpsc::Receiver<()>,
    preferred_device_id: Option<String>,
    target_sample_rate: u32,
    on_chunk: Arc<dyn Fn(&[i16]) + Send + Sync>,
) -> Result<RecordedAudioClip, AudioCaptureError> {
    let (device, capture_ready) =
        match resolve_microphone_capture_device(preferred_device_id.as_deref()) {
            Ok(value) => value,
            Err(error) => {
                let _ = ready_tx.send(Err(error.clone()));
                return Err(error);
            }
        };
    let config = match device
        .default_input_config()
        .map_err(|cause| AudioCaptureError::new(format!("failed to read input config: {cause}")))
    {
        Ok(value) => value,
        Err(error) => {
            let _ = ready_tx.send(Err(error.clone()));
            return Err(error);
        }
    };
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;
    let samples = Arc::new(Mutex::new(Vec::<i16>::new()));
    let error = Arc::new(Mutex::new(None));
    let resampler = Arc::new(Mutex::new(StreamingResampler::new(
        sample_rate,
        target_sample_rate,
    )));

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let samples = Arc::clone(&samples);
            let error_state = Arc::clone(&error);
            let on_chunk = Arc::clone(&on_chunk);
            let resampler = Arc::clone(&resampler);
            device
                .build_input_stream(
                    &config.clone().into(),
                    move |data: &[f32], _| {
                        let chunk = normalize_f32_samples(data, channels);
                        let chunk = resample_chunk(&chunk, &resampler);
                        append_chunk(&chunk, &samples, &on_chunk);
                    },
                    move |cause| {
                        if let Ok(mut error) = error_state.lock() {
                            *error = Some(cause.to_string());
                        }
                    },
                    None,
                )
                .map_err(|cause| {
                    AudioCaptureError::new(format!("failed to build input stream: {cause}"))
                })?
        }
        cpal::SampleFormat::I16 => {
            let samples = Arc::clone(&samples);
            let error_state = Arc::clone(&error);
            let on_chunk = Arc::clone(&on_chunk);
            let resampler = Arc::clone(&resampler);
            device
                .build_input_stream(
                    &config.clone().into(),
                    move |data: &[i16], _| {
                        let chunk = normalize_i16_samples(data, channels);
                        let chunk = resample_chunk(&chunk, &resampler);
                        append_chunk(&chunk, &samples, &on_chunk);
                    },
                    move |cause| {
                        if let Ok(mut error) = error_state.lock() {
                            *error = Some(cause.to_string());
                        }
                    },
                    None,
                )
                .map_err(|cause| {
                    AudioCaptureError::new(format!("failed to build input stream: {cause}"))
                })?
        }
        cpal::SampleFormat::U16 => {
            let samples = Arc::clone(&samples);
            let error_state = Arc::clone(&error);
            let on_chunk = Arc::clone(&on_chunk);
            let resampler = Arc::clone(&resampler);
            device
                .build_input_stream(
                    &config.into(),
                    move |data: &[u16], _| {
                        let chunk = normalize_u16_samples(data, channels);
                        let chunk = resample_chunk(&chunk, &resampler);
                        append_chunk(&chunk, &samples, &on_chunk);
                    },
                    move |cause| {
                        if let Ok(mut error) = error_state.lock() {
                            *error = Some(cause.to_string());
                        }
                    },
                    None,
                )
                .map_err(|cause| {
                    AudioCaptureError::new(format!("failed to build input stream: {cause}"))
                })?
        }
        sample_format => {
            let error = AudioCaptureError::new(format!(
                "unsupported microphone sample format: {sample_format:?}"
            ));
            let _ = ready_tx.send(Err(error.clone()));
            return Err(error);
        }
    };

    if let Err(error) = stream
        .play()
        .map_err(|cause| AudioCaptureError::new(format!("failed to start input stream: {cause}")))
    {
        let _ = ready_tx.send(Err(error.clone()));
        return Err(error);
    }
    let _ = ready_tx.send(Ok(capture_ready));

    loop {
        match stop_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Some(message) = error
                    .lock()
                    .expect("audio error state lock poisoned")
                    .take()
                {
                    return Err(AudioCaptureError::new(format!(
                        "microphone stream failed while recording: {message}"
                    )));
                }
            }
        }
    }

    drop(stream);

    let samples = samples
        .lock()
        .expect("audio sample buffer lock poisoned")
        .clone();

    Ok(RecordedAudioClip::new(samples, target_sample_rate, 1))
}

fn resolve_microphone_capture_device(
    preferred_device_id: Option<&str>,
) -> Result<(cpal::Device, MicrophoneCaptureReady), AudioCaptureError> {
    let host = cpal::default_host();
    let default_label = resolve_default_device_label(&host);
    let raw_devices = collect_input_devices(&host)?;
    let labels = raw_devices
        .iter()
        .enumerate()
        .map(|(index, device)| resolve_device_label(device, index))
        .collect::<Vec<_>>();
    let devices = build_microphone_input_devices(&labels, default_label.as_deref());
    let choice = resolve_microphone_choice(&devices, preferred_device_id)
        .ok_or_else(|| AudioCaptureError::new("no microphone input device available"))?;

    for (info, device) in devices.into_iter().zip(raw_devices.into_iter()) {
        if info.id == choice.selected_id {
            return Ok((
                device,
                MicrophoneCaptureReady {
                    requested_device_id: choice.requested_id,
                    selected_device_id: choice.selected_id,
                    selected_device_label: choice.selected_label,
                    is_default_device: choice.is_default,
                    used_fallback: choice.used_fallback,
                },
            ));
        }
    }

    Err(AudioCaptureError::new(
        "resolved microphone device could not be opened",
    ))
}

fn collect_input_devices(host: &cpal::Host) -> Result<Vec<cpal::Device>, AudioCaptureError> {
    Ok(host
        .input_devices()
        .map_err(|cause| {
            AudioCaptureError::new(format!("failed to enumerate input devices: {cause}"))
        })?
        .collect::<Vec<_>>())
}

fn resolve_default_device_label(host: &cpal::Host) -> Option<String> {
    let device = host.default_input_device()?;
    Some(resolve_device_label(&device, 0))
}

fn resolve_device_label(device: &cpal::Device, index: usize) -> String {
    device
        .name()
        .ok()
        .map(|label| label.trim().to_string())
        .filter(|label| !label.is_empty())
        .unwrap_or_else(|| format!("麦克风 {}", index + 1))
}

fn append_chunk(
    chunk: &[i16],
    target: &Arc<Mutex<Vec<i16>>>,
    on_chunk: &Arc<dyn Fn(&[i16]) + Send + Sync>,
) {
    if chunk.is_empty() {
        return;
    }

    {
        let mut samples = target.lock().expect("audio sample buffer lock poisoned");
        samples.extend_from_slice(chunk);
    }

    on_chunk(chunk);
}

fn resample_chunk(chunk: &[i16], resampler: &Arc<Mutex<StreamingResampler>>) -> Vec<i16> {
    resampler
        .lock()
        .expect("streaming resampler lock poisoned")
        .process_chunk(chunk)
}

fn normalize_f32_samples(data: &[f32], channels: usize) -> Vec<i16> {
    data.chunks(channels)
        .map(|frame| {
            let sample = frame.first().copied().unwrap_or_default();
            (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
        })
        .collect()
}

fn normalize_i16_samples(data: &[i16], channels: usize) -> Vec<i16> {
    data.chunks(channels)
        .map(|frame| *frame.first().unwrap_or(&0))
        .collect()
}

fn normalize_u16_samples(data: &[u16], channels: usize) -> Vec<i16> {
    data.chunks(channels)
        .map(|frame| {
            let sample = frame.first().copied().unwrap_or_default();
            (sample as i32 - 32_768) as i16
        })
        .collect()
}

impl StreamingResampler {
    fn new(input_sample_rate: u32, output_sample_rate: u32) -> Self {
        Self {
            input_sample_rate,
            output_sample_rate,
            source: Vec::new(),
            next_output_position: 0.0,
        }
    }

    fn process_chunk(&mut self, chunk: &[i16]) -> Vec<i16> {
        if chunk.is_empty() {
            return Vec::new();
        }

        if self.input_sample_rate == self.output_sample_rate {
            return chunk.to_vec();
        }

        self.source.extend_from_slice(chunk);

        let step = self.input_sample_rate as f64 / self.output_sample_rate as f64;
        let mut output = Vec::new();

        while self.next_output_position + 1.0 < self.source.len() as f64 {
            let left = self.next_output_position.floor() as usize;
            let right = left + 1;
            let fraction = self.next_output_position - left as f64;
            let left_sample = self.source[left] as f64;
            let right_sample = self.source[right] as f64;
            let interpolated = ((1.0 - fraction) * left_sample) + (fraction * right_sample);
            output.push(interpolated.round().clamp(i16::MIN as f64, i16::MAX as f64) as i16);
            self.next_output_position += step;
        }

        let consumed = self.next_output_position.floor() as usize;
        if consumed > 0 {
            self.source.drain(..consumed);
            self.next_output_position -= consumed as f64;
        }

        output
    }
}

#[cfg(test)]
mod tests {
    use super::StreamingResampler;

    #[test]
    fn resampler_keeps_samples_when_input_matches_output_rate() {
        let mut resampler = StreamingResampler::new(16_000, 16_000);
        let samples = vec![1, 2, 3, 4];

        assert_eq!(resampler.process_chunk(&samples), samples);
    }

    #[test]
    fn resampler_downsamples_48k_stream_to_16k_across_chunk_boundaries() {
        let mut resampler = StreamingResampler::new(48_000, 16_000);

        let mut output = resampler.process_chunk(&(0_i16..24_i16).collect::<Vec<_>>());
        output.extend(resampler.process_chunk(&(24_i16..48_i16).collect::<Vec<_>>()));

        assert_eq!(
            output,
            vec![0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45]
        );
    }
}
