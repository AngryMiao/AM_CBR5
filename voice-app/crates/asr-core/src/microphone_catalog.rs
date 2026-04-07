use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct MicrophoneInputDevice {
    pub id: String,
    pub label: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ResolvedMicrophoneChoice {
    pub requested_id: Option<String>,
    pub selected_id: String,
    pub selected_label: String,
    pub is_default: bool,
    pub used_fallback: bool,
}

pub(crate) fn build_microphone_input_devices(
    labels: &[String],
    default_label: Option<&str>,
) -> Vec<MicrophoneInputDevice> {
    let normalized_default = default_label.map(normalize_label);
    let mut default_marked = false;
    let mut seen_normalized_labels: Vec<String> = Vec::new();

    labels
        .iter()
        .enumerate()
        .map(|(index, label)| {
            let normalized_label = normalize_label(label);
            let duplicate_index = seen_normalized_labels
                .iter()
                .filter(|value| **value == normalized_label)
                .count()
                + 1;
            seen_normalized_labels.push(normalized_label.clone());

            let is_default = !default_marked
                && normalized_default
                    .as_ref()
                    .is_some_and(|default_label| default_label == &normalized_label);
            if is_default {
                default_marked = true;
            }

            MicrophoneInputDevice {
                id: build_device_id(&normalized_label, duplicate_index),
                label: if normalized_label.is_empty() {
                    format!("麦克风 {}", index + 1)
                } else {
                    normalized_label
                },
                is_default,
            }
        })
        .collect()
}

pub(crate) fn resolve_microphone_choice(
    devices: &[MicrophoneInputDevice],
    preferred_device_id: Option<&str>,
) -> Option<ResolvedMicrophoneChoice> {
    let requested_id = preferred_device_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if let Some(requested_id) = requested_id.as_ref() {
        if let Some(device) = devices.iter().find(|device| device.id == *requested_id) {
            return Some(ResolvedMicrophoneChoice {
                requested_id: Some(requested_id.clone()),
                selected_id: device.id.clone(),
                selected_label: device.label.clone(),
                is_default: device.is_default,
                used_fallback: false,
            });
        }
    }

    let fallback = devices
        .iter()
        .find(|device| device.is_default)
        .or_else(|| devices.first())?;

    Some(ResolvedMicrophoneChoice {
        requested_id,
        selected_id: fallback.id.clone(),
        selected_label: fallback.label.clone(),
        is_default: fallback.is_default,
        used_fallback: preferred_device_id.is_some_and(|value| !value.trim().is_empty()),
    })
}

fn normalize_label(label: &str) -> String {
    label.trim().to_string()
}

fn build_device_id(label: &str, duplicate_index: usize) -> String {
    let slug = slugify_ascii(label);
    let base = if slug.is_empty() {
        format!("mic-{:016x}", fnv1a64(label.as_bytes()))
    } else {
        slug
    };

    if duplicate_index == 1 {
        base
    } else {
        format!("{base}-{duplicate_index}")
    }
}

fn slugify_ascii(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_dash = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_was_dash = false;
            continue;
        }

        if !previous_was_dash && !slug.is_empty() {
            slug.push('-');
            previous_was_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;

    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    hash
}

#[cfg(test)]
mod tests {
    use super::{build_microphone_input_devices, resolve_microphone_choice};

    #[test]
    fn builds_unique_device_ids_for_duplicate_labels() {
        let devices = build_microphone_input_devices(
            &[
                "USB Mic".to_string(),
                "USB Mic".to_string(),
                "内置麦克风".to_string(),
            ],
            Some("USB Mic"),
        );

        assert_eq!(devices[0].id, "usb-mic");
        assert_eq!(devices[1].id, "usb-mic-2");
        assert!(devices[0].is_default);
        assert!(!devices[1].is_default);
        assert!(devices[2].id.starts_with("mic-"));
    }

    #[test]
    fn resolves_requested_device_when_it_is_available() {
        let devices = build_microphone_input_devices(
            &["USB Mic".to_string(), "Built-in Mic".to_string()],
            Some("Built-in Mic"),
        );

        let resolved =
            resolve_microphone_choice(&devices, Some("usb-mic")).expect("device should resolve");

        assert_eq!(resolved.selected_id, "usb-mic");
        assert!(!resolved.used_fallback);
        assert!(!resolved.is_default);
    }

    #[test]
    fn falls_back_to_default_device_when_saved_device_is_missing() {
        let devices = build_microphone_input_devices(
            &["USB Mic".to_string(), "Built-in Mic".to_string()],
            Some("Built-in Mic"),
        );

        let resolved = resolve_microphone_choice(&devices, Some("missing-device"))
            .expect("fallback device should resolve");

        assert_eq!(resolved.requested_id.as_deref(), Some("missing-device"));
        assert_eq!(resolved.selected_id, "built-in-mic");
        assert!(resolved.used_fallback);
        assert!(resolved.is_default);
    }
}
