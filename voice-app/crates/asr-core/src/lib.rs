mod config;
mod doubao_protocol;
mod microphone;
mod microphone_catalog;
mod streaming_session;

pub use config::{AsrRuntimeConfig, DoubaoAsrConfig, DoubaoAsrError};
pub use doubao_protocol::{
    build_doubao_audio_frame, build_doubao_session_start_frame, parse_doubao_server_events,
    DoubaoSessionEvent,
};
pub use microphone::{
    list_microphone_input_devices, AudioCaptureArtifact, AudioCaptureError, MicrophoneCaptureReady,
    MicrophoneRecordingSession, RecordedAudioClip,
};
pub use microphone_catalog::MicrophoneInputDevice;
pub use streaming_session::{
    ensure_rustls_crypto_provider_installed, DoubaoStreamingClient, DoubaoStreamingSession,
};
