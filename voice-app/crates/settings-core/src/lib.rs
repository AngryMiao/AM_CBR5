mod default_hotkey;
mod keyboard_shortcuts;
mod model;
mod store;

pub use default_hotkey::{
    normalize_stored_default_hotkey, parse_save_default_hotkey, DEFAULT_HOTKEY,
};
pub use keyboard_shortcuts::{default_keyboard_shortcuts, KeyboardShortcut};
pub use model::{
    EditableSecretValueInput, EditableVoiceSettings, RuntimeVoiceSettings,
    SaveEditableVoiceSettingsInput, StoredVoiceSettings, VoiceSettings,
    DEFAULT_DOUBAO_ASR_ENABLE_DDC, DEFAULT_DOUBAO_ASR_ENABLE_ITN, DEFAULT_DOUBAO_ASR_ENABLE_PUNC,
    DEFAULT_DOUBAO_ASR_END_WINDOW_SIZE, DEFAULT_DOUBAO_ASR_FORCE_TO_SPEECH_TIME,
    DEFAULT_DOUBAO_ASR_MODEL, DEFAULT_DOUBAO_ASR_RESOURCE_ID,
    DEFAULT_DOUBAO_ASR_SHOW_UTTERANCES, DEFAULT_DOUBAO_ASR_URL, DEFAULT_DOUBAO_AUDIO_BITS,
    DEFAULT_DOUBAO_AUDIO_CHANNEL, DEFAULT_DOUBAO_AUDIO_FORMAT, DEFAULT_DOUBAO_AUDIO_LANGUAGE,
    DEFAULT_DOUBAO_AUDIO_RATE, DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL,
    DEFAULT_LLM_SYSTEM_PROMPT, SETTINGS_SCHEMA_VERSION,
};
pub use store::SettingsStore;
