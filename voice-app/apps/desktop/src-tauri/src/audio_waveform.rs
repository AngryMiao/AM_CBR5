use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::Channel;

pub const AUDIO_WAVEFORM_BAR_COUNT: usize = 8;
const AUDIO_WAVEFORM_MAX_LEVEL: u8 = 100;
const AUDIO_WAVEFORM_NOISE_GATE: f32 = 0.015;
const AUDIO_WAVEFORM_GAIN: f32 = 2.15;
const AUDIO_WAVEFORM_RESPONSE_CURVE: f32 = 0.72;
const AUDIO_WAVEFORM_EMIT_INTERVAL: Duration = Duration::from_millis(50);
const AUDIO_WAVEFORM_AVERAGE_WEIGHT: f32 = 0.72;
const AUDIO_WAVEFORM_PEAK_WEIGHT: f32 = 0.28;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct AudioWaveformFrame {
    pub bars: Vec<u8>,
    pub active: bool,
}

pub struct AudioWaveformAccumulator {
    bars: [u8; AUDIO_WAVEFORM_BAR_COUNT],
}

pub struct AudioWaveformStream {
    accumulator: AudioWaveformAccumulator,
    active: bool,
    last_emit_at: Option<Instant>,
    pending_level_sum: u32,
    pending_level_peak: u8,
    pending_level_count: u16,
    subscribers: HashMap<String, Channel<AudioWaveformFrame>>,
}

impl Default for AudioWaveformAccumulator {
    fn default() -> Self {
        Self {
            bars: [0; AUDIO_WAVEFORM_BAR_COUNT],
        }
    }
}

impl AudioWaveformAccumulator {
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn push_samples(&mut self, chunk: &[i16]) {
        self.push_level(level_from_samples(chunk));
    }

    pub fn clear(&mut self) {
        self.bars = [0; AUDIO_WAVEFORM_BAR_COUNT];
    }

    pub fn frame(&self, active: bool) -> AudioWaveformFrame {
        AudioWaveformFrame {
            bars: self.bars.to_vec(),
            active,
        }
    }

    fn push_level(&mut self, level: u8) {
        self.bars.rotate_left(1);
        self.bars[AUDIO_WAVEFORM_BAR_COUNT - 1] = level;
    }
}

impl Default for AudioWaveformStream {
    fn default() -> Self {
        Self {
            accumulator: AudioWaveformAccumulator::default(),
            active: false,
            last_emit_at: None,
            pending_level_sum: 0,
            pending_level_peak: 0,
            pending_level_count: 0,
            subscribers: HashMap::new(),
        }
    }
}

impl AudioWaveformStream {
    pub fn register_subscriber(
        &mut self,
        window_label: String,
        channel: Channel<AudioWaveformFrame>,
    ) -> AudioWaveformFrame {
        self.subscribers.insert(window_label, channel);
        self.current_frame()
    }

    pub fn activate(&mut self) -> AudioWaveformFrame {
        self.active = true;
        self.last_emit_at = None;
        self.accumulator.clear();
        self.reset_pending_levels();
        self.current_frame()
    }

    pub fn deactivate(&mut self) -> AudioWaveformFrame {
        self.active = false;
        self.last_emit_at = None;
        self.accumulator.clear();
        self.reset_pending_levels();
        self.current_frame()
    }

    pub fn push_samples(&mut self, chunk: &[i16]) -> Option<AudioWaveformFrame> {
        if !self.active {
            return None;
        }

        self.record_pending_level(level_from_samples(chunk));

        if self
            .last_emit_at
            .is_some_and(|last_emit_at| last_emit_at.elapsed() < AUDIO_WAVEFORM_EMIT_INTERVAL)
        {
            return None;
        }

        self.last_emit_at = Some(Instant::now());
        let pending_level = self.take_pending_level();
        self.accumulator.push_level(pending_level);
        Some(self.current_frame())
    }

    pub fn current_frame(&self) -> AudioWaveformFrame {
        self.accumulator.frame(self.active)
    }

    pub fn subscriber_channels(&self) -> Vec<(String, Channel<AudioWaveformFrame>)> {
        self.subscribers
            .iter()
            .map(|(window_label, channel)| (window_label.clone(), channel.clone()))
            .collect()
    }

    pub fn remove_subscribers(&mut self, window_labels: &[String]) {
        for window_label in window_labels {
            self.subscribers.remove(window_label);
        }
    }

    fn record_pending_level(&mut self, level: u8) {
        self.pending_level_sum += u32::from(level);
        self.pending_level_peak = self.pending_level_peak.max(level);
        self.pending_level_count += 1;
    }

    fn take_pending_level(&mut self) -> u8 {
        if self.pending_level_count == 0 {
            return 0;
        }

        let average =
            self.pending_level_sum as f32 / self.pending_level_count as f32;
        let blended = (average * AUDIO_WAVEFORM_AVERAGE_WEIGHT)
            + (f32::from(self.pending_level_peak) * AUDIO_WAVEFORM_PEAK_WEIGHT);

        self.reset_pending_levels();
        blended.round() as u8
    }

    fn reset_pending_levels(&mut self) {
        self.pending_level_sum = 0;
        self.pending_level_peak = 0;
        self.pending_level_count = 0;
    }
}

fn level_from_samples(chunk: &[i16]) -> u8 {
    if chunk.is_empty() {
        return 0;
    }

    let mut peak = 0.0_f32;
    let mut sum_squares = 0.0_f64;

    for sample in chunk {
        let normalized = (*sample as f32).abs() / i16::MAX as f32;
        peak = peak.max(normalized);
        sum_squares += f64::from(normalized * normalized);
    }

    let rms = (sum_squares / chunk.len() as f64).sqrt() as f32;
    let combined = (rms * 0.65) + (peak * 0.35);

    if combined <= AUDIO_WAVEFORM_NOISE_GATE {
        return 0;
    }

    let gated =
        ((combined - AUDIO_WAVEFORM_NOISE_GATE) / (1.0 - AUDIO_WAVEFORM_NOISE_GATE)).min(1.0);
    let boosted = (gated * AUDIO_WAVEFORM_GAIN)
        .min(1.0)
        .powf(AUDIO_WAVEFORM_RESPONSE_CURVE);

    (boosted * AUDIO_WAVEFORM_MAX_LEVEL as f32).round() as u8
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::{
        level_from_samples, AudioWaveformAccumulator, AudioWaveformStream,
        AUDIO_WAVEFORM_BAR_COUNT, AUDIO_WAVEFORM_EMIT_INTERVAL,
    };

    #[test]
    fn loud_audio_pushes_a_non_zero_bar() {
        let mut accumulator = AudioWaveformAccumulator::default();

        accumulator.push_samples(&[0, 8_000, -12_000, 16_000, -10_000, 4_000]);

        let frame = accumulator.frame(true);
        assert_eq!(frame.bars.len(), AUDIO_WAVEFORM_BAR_COUNT);
        assert!(frame.bars.iter().any(|value| *value > 0));
    }

    #[test]
    fn clear_resets_the_waveform_to_silence() {
        let mut accumulator = AudioWaveformAccumulator::default();

        accumulator.push_samples(&[0, 10_000, -10_000, 8_000]);
        accumulator.clear();

        assert_eq!(accumulator.frame(false).bars, vec![0; AUDIO_WAVEFORM_BAR_COUNT]);
    }

    #[test]
    fn deactivating_stream_resets_bars_and_active_state() {
        let mut stream = AudioWaveformStream::default();

        stream.activate();
        let _ = stream.push_samples(&[0, 12_000, -12_000, 8_000]);
        let frame = stream.deactivate();

        assert!(!frame.active);
        assert_eq!(frame.bars, vec![0; AUDIO_WAVEFORM_BAR_COUNT]);
    }

    #[test]
    fn medium_loud_audio_keeps_dynamic_range_before_full_saturation() {
        let chunks = [
            [0, 6_000, -6_000, 4_000],
            [0, 8_000, -8_000, 5_000],
            [0, 10_000, -10_000, 6_000],
            [0, 12_000, -12_000, 8_000],
            [0, 14_000, -14_000, 9_000],
        ];

        let levels: Vec<u8> = chunks
            .iter()
            .map(|chunk| level_from_samples(chunk))
            .collect();

        assert!(levels.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(levels.last().copied().unwrap_or_default() < 100);
    }

    #[test]
    fn stream_batches_chunks_within_single_emit_window() {
        let mut stream = AudioWaveformStream::default();

        stream.activate();
        let first = stream
            .push_samples(&[0, 6_000, -6_000, 4_000])
            .expect("first chunk should emit an initial frame");

        assert_eq!(
            first.bars.iter().filter(|value| **value > 0).count(),
            1
        );

        let second = stream.push_samples(&[0, 12_000, -12_000, 9_000]);
        assert!(second.is_none());
        assert_eq!(stream.current_frame(), first);

        stream.last_emit_at = Some(Instant::now() - AUDIO_WAVEFORM_EMIT_INTERVAL);

        let third = stream
            .push_samples(&[0, 14_000, -14_000, 10_000])
            .expect("elapsed interval should emit a batched frame");

        assert_eq!(
            third.bars.iter().filter(|value| **value > 0).count(),
            2
        );
        assert!(third.bars[7] > third.bars[6]);
    }
}
