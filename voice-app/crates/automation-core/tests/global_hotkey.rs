use automation_core::{GlobalHotkey, KeyboardHookEvent};

#[test]
fn normalizes_hold_prefix_into_tauri_shortcut() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("default hotkey should parse");

    assert_eq!(hotkey.display(), "Hold Alt+Space");
    assert_eq!(hotkey.accelerator(), "Alt+Space");
}

#[test]
fn trims_extra_spacing_around_hotkey_tokens() {
    let hotkey = GlobalHotkey::parse("  Hold  Alt + Space  ").expect("spacing should normalize");

    assert_eq!(hotkey.accelerator(), "Alt+Space");
}

#[test]
fn rejects_empty_hotkey_labels() {
    let error = GlobalHotkey::parse("  ").expect_err("empty hotkey labels must be rejected");

    assert_eq!(error.to_string(), "热键不能为空。");
}

#[test]
fn matches_modifier_plus_primary_key_pressed_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("default hotkey should parse");
    let event = KeyboardHookEvent::pressed("Space", ["Alt"], 1_000);

    assert!(hotkey.matches_pressed_event(&event));
}

#[test]
fn matches_modifier_plus_primary_key_released_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("default hotkey should parse");
    let event = KeyboardHookEvent::released("Space", ["Alt"], 1_120);

    assert!(hotkey.matches_released_event(&event));
}

#[test]
fn matches_single_key_hotkey_event_and_marks_echo_cleanup() {
    let hotkey = GlobalHotkey::parse("Hold Space").expect("single-key hotkey should parse");
    let event = KeyboardHookEvent::pressed("Space", Vec::<&str>::new(), 1_000);

    assert!(hotkey.matches_pressed_event(&event));
    assert!(hotkey.needs_input_echo_cleanup());
}

#[test]
fn matches_single_modifier_hotkey_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt").expect("single modifier hotkey should parse");
    let event = KeyboardHookEvent::pressed("Alt", Vec::<&str>::new(), 1_000);

    assert!(hotkey.matches_pressed_event(&event));
    assert!(!hotkey.needs_input_echo_cleanup());
}

#[test]
fn ignores_non_matching_modifier_combination() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("default hotkey should parse");
    let event = KeyboardHookEvent::pressed("Space", ["Control"], 1_000);

    assert!(!hotkey.matches_pressed_event(&event));
}

#[test]
fn generic_modifier_hotkey_still_matches_exact_side_modifier_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("default hotkey should parse");

    assert!(hotkey.matches_pressed_event(&KeyboardHookEvent::pressed(
        "Space",
        ["RightAlt"],
        1_050,
    )));
}

#[test]
fn matches_recorded_key_aliases_for_letters_digits_and_arrows() {
    let letter_hotkey = GlobalHotkey::parse("Hold A").expect("letter hotkey should parse");
    let digit_hotkey = GlobalHotkey::parse("Hold 1").expect("digit hotkey should parse");
    let arrow_hotkey = GlobalHotkey::parse("Hold Up").expect("arrow hotkey should parse");

    assert!(
        letter_hotkey.matches_pressed_event(&KeyboardHookEvent::pressed(
            "KeyA",
            Vec::<&str>::new(),
            1_000,
        ))
    );
    assert!(
        digit_hotkey.matches_pressed_event(&KeyboardHookEvent::pressed(
            "Digit1",
            Vec::<&str>::new(),
            1_100,
        ))
    );
    assert!(
        arrow_hotkey.matches_pressed_event(&KeyboardHookEvent::pressed(
            "ArrowUp",
            Vec::<&str>::new(),
            1_200,
        ))
    );
}

#[test]
fn parses_exact_right_alt_single_key_hotkey() {
    let hotkey = GlobalHotkey::parse("RightAlt").expect("exact modifier hotkey should parse");

    assert_eq!(hotkey.display(), "RightAlt");
    assert_eq!(hotkey.accelerator(), "Alt");
    assert_eq!(hotkey.primary_key(), "RightAlt");
    assert_eq!(hotkey.modifier_count(), 0);
}

#[test]
fn exact_right_alt_does_not_match_left_alt() {
    let hotkey = GlobalHotkey::parse("RightAlt").expect("exact modifier hotkey should parse");

    assert!(hotkey.matches_pressed_event(&KeyboardHookEvent::pressed(
        "RightAlt",
        Vec::<&str>::new(),
        2_000,
    )));
    assert!(!hotkey.matches_pressed_event(&KeyboardHookEvent::pressed(
        "LeftAlt",
        Vec::<&str>::new(),
        2_100,
    )));
}

#[test]
fn exact_modifier_combination_matches_only_same_side_tokens() {
    let hotkey = GlobalHotkey::parse("LeftCtrl+K").expect("exact combo should parse");

    assert!(hotkey.matches_pressed_event(&KeyboardHookEvent::pressed("K", ["LeftCtrl"], 3_000,)));
    assert!(!hotkey.matches_pressed_event(&KeyboardHookEvent::pressed("K", ["RightCtrl"], 3_100,)));
}
