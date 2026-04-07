use std::time::{SystemTime, UNIX_EPOCH};

use asr_core::RecordedAudioClip;

#[test]
fn derives_duration_and_summary_from_pcm_samples() {
    let clip = RecordedAudioClip::new(vec![0; 16_000], 16_000, 1);

    assert_eq!(clip.duration_ms(), 1_000);
    assert_eq!(clip.transcript_text(), "Recorded audio clip (1000 ms).");
    assert_eq!(
        clip.detail_text(),
        "Captured 1000 ms of microphone audio at 16000 Hz."
    );
}

#[test]
fn persists_wav_file_with_expected_metadata() {
    let clip = RecordedAudioClip::new(vec![0, 100, -100, 50], 16_000, 1);
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_millis();
    let path = std::env::temp_dir().join(format!("voice-app-test-{suffix}.wav"));

    let artifact = clip
        .persist_wav(&path)
        .expect("wav artifact should persist");

    assert_eq!(artifact.sample_rate, 16_000);
    assert_eq!(artifact.channels, 1);
    assert_eq!(artifact.sample_count, 4);
    assert!(artifact
        .result_text()
        .contains(path.to_string_lossy().as_ref()));
    assert!(path.exists());

    let reader = hound::WavReader::open(&path).expect("written wav should open");
    assert_eq!(reader.spec().sample_rate, 16_000);
    assert_eq!(reader.spec().channels, 1);

    std::fs::remove_file(path).expect("test wav file should be removable");
}
