use serde::{Deserialize, Serialize};

fn default_shortcut_enabled() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeyboardShortcut {
    pub id: String,
    pub trigger_words: Vec<String>,
    #[serde(default)]
    pub key_codes: Vec<String>,
    #[serde(default)]
    pub recorded_keys: Vec<String>,
    #[serde(default = "default_shortcut_enabled")]
    pub enabled: bool,
}

impl KeyboardShortcut {
    fn new(id: &str, trigger_words: &[&str], recorded_keys: &[&str], key_codes: &[&str]) -> Self {
        Self {
            id: id.to_string(),
            trigger_words: trigger_words
                .iter()
                .map(|value| value.to_string())
                .collect(),
            key_codes: key_codes.iter().map(|value| value.to_string()).collect(),
            recorded_keys: recorded_keys
                .iter()
                .map(|value| value.to_string())
                .collect(),
            enabled: true,
        }
    }
}

pub fn default_keyboard_shortcuts() -> Vec<KeyboardShortcut> {
    if cfg!(target_os = "macos") {
        return vec![
            KeyboardShortcut::new(
                "ks_copy",
                &["复制", "拷贝"],
                &["MetaLeft", "KeyC"],
                &["110700E3", "11070006", "10070006", "100700E3"],
            ),
            KeyboardShortcut::new(
                "ks_paste",
                &["粘贴"],
                &["MetaLeft", "KeyV"],
                &["110700E3", "11070019", "10070019", "100700E3"],
            ),
            KeyboardShortcut::new(
                "ks_cut",
                &["剪切"],
                &["MetaLeft", "KeyX"],
                &["110700E3", "1107001B", "1007001B", "100700E3"],
            ),
            KeyboardShortcut::new(
                "ks_undo",
                &["撤销"],
                &["MetaLeft", "KeyZ"],
                &["110700E3", "1107001D", "1007001D", "100700E3"],
            ),
            KeyboardShortcut::new(
                "ks_redo",
                &["重做"],
                &["MetaLeft", "ShiftLeft", "KeyZ"],
                &[
                    "110700E3", "110700E1", "1107001D", "1007001D", "100700E1", "100700E3",
                ],
            ),
            KeyboardShortcut::new(
                "ks_select_all",
                &["全选"],
                &["MetaLeft", "KeyA"],
                &["110700E3", "11070004", "10070004", "100700E3"],
            ),
            KeyboardShortcut::new(
                "ks_save",
                &["保存"],
                &["MetaLeft", "KeyS"],
                &["110700E3", "11070016", "10070016", "100700E3"],
            ),
            KeyboardShortcut::new(
                "ks_enter",
                &["回车", "换行"],
                &["Enter"],
                &["11070028", "10070028"],
            ),
            KeyboardShortcut::new(
                "ks_backspace",
                &["删除", "退格"],
                &["Backspace"],
                &["1107002A", "1007002A"],
            ),
            KeyboardShortcut::new(
                "ks_tab",
                &["Tab", "制表符"],
                &["Tab"],
                &["1107002B", "1007002B"],
            ),
            KeyboardShortcut::new(
                "ks_switch_window",
                &["切换窗口"],
                &["MetaLeft", "Tab"],
                &["110700E3", "1107002B", "1007002B", "100700E3"],
            ),
            KeyboardShortcut::new(
                "ks_escape",
                &["取消", "退出"],
                &["Escape"],
                &["11070029", "10070029"],
            ),
        ];
    }

    vec![
        KeyboardShortcut::new(
            "ks_copy",
            &["复制", "拷贝"],
            &["ControlLeft", "KeyC"],
            &["110700E0", "11070006", "10070006", "100700E0"],
        ),
        KeyboardShortcut::new(
            "ks_paste",
            &["粘贴"],
            &["ControlLeft", "KeyV"],
            &["110700E0", "11070019", "10070019", "100700E0"],
        ),
        KeyboardShortcut::new(
            "ks_cut",
            &["剪切"],
            &["ControlLeft", "KeyX"],
            &["110700E0", "1107001B", "1007001B", "100700E0"],
        ),
        KeyboardShortcut::new(
            "ks_undo",
            &["撤销"],
            &["ControlLeft", "KeyZ"],
            &["110700E0", "1107001D", "1007001D", "100700E0"],
        ),
        KeyboardShortcut::new(
            "ks_redo",
            &["重做"],
            &["ControlLeft", "KeyY"],
            &["110700E0", "1107001C", "1007001C", "100700E0"],
        ),
        KeyboardShortcut::new(
            "ks_select_all",
            &["全选"],
            &["ControlLeft", "KeyA"],
            &["110700E0", "11070004", "10070004", "100700E0"],
        ),
        KeyboardShortcut::new(
            "ks_save",
            &["保存"],
            &["ControlLeft", "KeyS"],
            &["110700E0", "11070016", "10070016", "100700E0"],
        ),
        KeyboardShortcut::new(
            "ks_enter",
            &["回车", "换行"],
            &["Enter"],
            &["11070028", "10070028"],
        ),
        KeyboardShortcut::new(
            "ks_backspace",
            &["删除", "退格"],
            &["Backspace"],
            &["1107002A", "1007002A"],
        ),
        KeyboardShortcut::new(
            "ks_tab",
            &["Tab", "制表符"],
            &["Tab"],
            &["1107002B", "1007002B"],
        ),
        KeyboardShortcut::new(
            "ks_switch_window",
            &["切换窗口"],
            &["AltLeft", "Tab"],
            &["110700E2", "1107002B", "1007002B", "100700E2"],
        ),
        KeyboardShortcut::new(
            "ks_escape",
            &["取消", "退出"],
            &["Escape"],
            &["11070029", "10070029"],
        ),
    ]
}
