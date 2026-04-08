use std::io::{Read, Write};

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde_json::{Map, Value};

use crate::{DoubaoAsrConfig, DoubaoAsrError};

const SUCCESS_CODE: i64 = 20_000_000;
const PROTOCOL_VERSION: u8 = 0x1;
const HEADER_SIZE_WORDS: u8 = 0x1;
const SERIALIZATION_NONE: u8 = 0x0;
const SERIALIZATION_JSON: u8 = 0x1;
const COMPRESSION_GZIP: u8 = 0x1;
const MESSAGE_TYPE_FULL_CLIENT_REQUEST: u8 = 0x1;
const MESSAGE_TYPE_AUDIO_ONLY_REQUEST: u8 = 0x2;
const MESSAGE_TYPE_FULL_SERVER_RESPONSE: u8 = 0x9;
const MESSAGE_TYPE_ERROR_RESPONSE: u8 = 0xf;
const MESSAGE_FLAG_NONE: u8 = 0x0;
const MESSAGE_FLAG_HAS_POSITIVE_SEQUENCE: u8 = 0x1;
const MESSAGE_FLAG_LAST_PACKAGE: u8 = 0x2;
const MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE: u8 = 0x3;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DoubaoSessionEvent {
    Partial { text: String },
    Final { text: String },
    Completed { text: String },
    Error { message: String },
}

#[derive(Debug)]
struct ParsedFrame {
    flags: u8,
    message_type: u8,
    payload: Value,
    sequence: Option<i32>,
    error_code: Option<u32>,
}

pub fn build_doubao_session_start_frame(
    config: &DoubaoAsrConfig,
    session_id: &str,
) -> Result<Vec<u8>, DoubaoAsrError> {
    let mut request = Map::new();
    request.insert(
        "model_name".to_string(),
        Value::String(config.model.clone()),
    );
    request.insert("enable_itn".to_string(), Value::Bool(config.enable_itn));
    request.insert("enable_ddc".to_string(), Value::Bool(config.enable_ddc));
    request.insert("enable_punc".to_string(), Value::Bool(config.enable_punc));
    request.insert(
        "show_utterances".to_string(),
        Value::Bool(config.show_utterances),
    );
    request.insert(
        "force_to_speech_time".to_string(),
        Value::Number(config.force_to_speech_time.into()),
    );
    request.insert(
        "end_window_size".to_string(),
        Value::Number((config.end_window_size as u64).into()),
    );
    request.insert("enable_nonstream".to_string(), Value::Bool(false));

    if config.boosting_table_id.is_some() || config.context_json.is_some() {
        let mut corpus = Map::new();

        if let Some(boosting_table_id) = config.boosting_table_id.clone() {
            corpus.insert(
                "boosting_table_id".to_string(),
                Value::String(boosting_table_id),
            );
        }

        if let Some(context_json) = config.context_json.clone() {
            let context = serde_json::from_str::<Value>(&context_json).map_err(|cause| {
                DoubaoAsrError::new(format!("Context JSON 不是合法 JSON: {cause}"))
            })?;
            corpus.insert("context".to_string(), context);
        }

        request.insert("corpus".to_string(), Value::Object(corpus));
    }

    let payload = Value::Object(Map::from_iter([
        (
            "user".to_string(),
            Value::Object(Map::from_iter([(
                "uid".to_string(),
                Value::String(session_id.to_string()),
            )])),
        ),
        (
            "audio".to_string(),
            Value::Object(Map::from_iter([
                (
                    "format".to_string(),
                    Value::String(config.audio_format.clone()),
                ),
                ("codec".to_string(), Value::String("raw".to_string())),
                ("rate".to_string(), Value::Number(config.audio_rate.into())),
                (
                    "bits".to_string(),
                    Value::Number((config.audio_bits as u64).into()),
                ),
                (
                    "channel".to_string(),
                    Value::Number((config.audio_channel as u64).into()),
                ),
                (
                    "language".to_string(),
                    Value::String(config.audio_language.clone()),
                ),
            ])),
        ),
        ("request".to_string(), Value::Object(request)),
    ]));

    build_frame(
        MESSAGE_TYPE_FULL_CLIENT_REQUEST,
        MESSAGE_FLAG_NONE,
        SERIALIZATION_JSON,
        Some(payload.to_string().into_bytes()),
        None,
    )
}

pub fn build_doubao_audio_frame(
    payload: &[u8],
    is_last_packet: bool,
) -> Result<Vec<u8>, DoubaoAsrError> {
    build_frame(
        MESSAGE_TYPE_AUDIO_ONLY_REQUEST,
        if is_last_packet {
            MESSAGE_FLAG_LAST_PACKAGE
        } else {
            MESSAGE_FLAG_NONE
        },
        SERIALIZATION_NONE,
        Some(payload.to_vec()),
        None,
    )
}

pub fn parse_doubao_server_events(frame: &[u8]) -> Result<Vec<DoubaoSessionEvent>, DoubaoAsrError> {
    let parsed = parse_frame(frame)?;

    if parsed.message_type == MESSAGE_TYPE_ERROR_RESPONSE {
        return Ok(vec![DoubaoSessionEvent::Error {
            message: extract_error_message(&parsed.payload, parsed.error_code),
        }]);
    }

    if parsed.message_type != MESSAGE_TYPE_FULL_SERVER_RESPONSE {
        return Ok(Vec::new());
    }

    if parsed.payload.is_null() {
        return Ok(Vec::new());
    }

    let payload = parsed
        .payload
        .as_object()
        .ok_or_else(|| DoubaoAsrError::new("豆包响应 payload 不是对象。"))?;

    if !is_successful_payload(payload) {
        return Ok(vec![DoubaoSessionEvent::Error {
            message: extract_error_message(
                &parsed.payload,
                payload
                    .get("code")
                    .and_then(Value::as_u64)
                    .map(|value| value as u32),
            ),
        }]);
    }

    let text = extract_transcript_text(payload);
    let definite_text = extract_definite_text(payload);

    if is_completed_response(parsed.flags, parsed.sequence) {
        return Ok(vec![DoubaoSessionEvent::Completed { text }]);
    }

    if !definite_text.is_empty() {
        return Ok(vec![DoubaoSessionEvent::Final {
            text: definite_text,
        }]);
    }

    if !text.is_empty() {
        return Ok(vec![DoubaoSessionEvent::Partial { text }]);
    }

    Ok(Vec::new())
}

fn build_frame(
    message_type: u8,
    flags: u8,
    serialization: u8,
    payload: Option<Vec<u8>>,
    sequence: Option<i32>,
) -> Result<Vec<u8>, DoubaoAsrError> {
    let body = compress_payload(payload.unwrap_or_default())?;
    let mut frame = vec![
        (PROTOCOL_VERSION << 4) | HEADER_SIZE_WORDS,
        (message_type << 4) | flags,
        (serialization << 4) | COMPRESSION_GZIP,
        0,
    ];

    if let Some(sequence) = sequence {
        frame.extend_from_slice(&sequence.to_be_bytes());
    }

    frame.extend_from_slice(&(body.len() as u32).to_be_bytes());
    frame.extend_from_slice(&body);
    Ok(frame)
}

fn compress_payload(payload: Vec<u8>) -> Result<Vec<u8>, DoubaoAsrError> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&payload)
        .map_err(|cause| DoubaoAsrError::new(format!("failed to gzip payload: {cause}")))?;
    encoder
        .finish()
        .map_err(|cause| DoubaoAsrError::new(format!("failed to finalize gzip payload: {cause}")))
}

fn decompress_payload(payload: &[u8]) -> Result<Vec<u8>, DoubaoAsrError> {
    let mut decoder = GzDecoder::new(payload);
    let mut buffer = Vec::new();
    decoder
        .read_to_end(&mut buffer)
        .map_err(|cause| DoubaoAsrError::new(format!("failed to gunzip payload: {cause}")))?;
    Ok(buffer)
}

fn parse_frame(frame: &[u8]) -> Result<ParsedFrame, DoubaoAsrError> {
    if frame.len() < 8 {
        return Err(DoubaoAsrError::new("豆包响应帧长度不足。"));
    }

    let header_size_words = frame[0] & 0x0f;
    let message_type = (frame[1] >> 4) & 0x0f;
    let flags = frame[1] & 0x0f;
    let serialization = (frame[2] >> 4) & 0x0f;
    let compression = frame[2] & 0x0f;

    let mut offset = (header_size_words as usize) * 4;
    let mut sequence = None;

    if flags == MESSAGE_FLAG_HAS_POSITIVE_SEQUENCE || flags == MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE {
        if frame.len() < offset + 4 {
            return Err(DoubaoAsrError::new("豆包响应帧缺少 sequence 数据。"));
        }

        sequence = Some(read_i32_be(frame, offset)?);
        offset += 4;
    }

    let mut error_code = None;
    if message_type == MESSAGE_TYPE_ERROR_RESPONSE {
        if frame.len() < offset + 4 {
            return Err(DoubaoAsrError::new("豆包错误响应缺少错误码。"));
        }

        error_code = Some(read_u32_be(frame, offset)?);
        offset += 4;
    }

    if frame.len() < offset + 4 {
        return Err(DoubaoAsrError::new("豆包响应帧缺少 payload 长度。"));
    }

    let payload_size = read_u32_be(frame, offset)? as usize;
    offset += 4;

    if frame.len() < offset + payload_size {
        return Err(DoubaoAsrError::new("豆包响应帧 payload 长度不完整。"));
    }

    let payload_bytes = &frame[offset..offset + payload_size];
    let payload = decode_payload(payload_bytes, serialization, compression)?;

    Ok(ParsedFrame {
        flags,
        message_type,
        payload,
        sequence,
        error_code,
    })
}

fn decode_payload(
    payload: &[u8],
    serialization: u8,
    compression: u8,
) -> Result<Value, DoubaoAsrError> {
    let bytes = if compression == COMPRESSION_GZIP {
        decompress_payload(payload)?
    } else {
        payload.to_vec()
    };

    if bytes.is_empty() {
        return Ok(Value::Null);
    }

    if serialization == SERIALIZATION_JSON {
        return serde_json::from_slice::<Value>(&bytes).map_err(|cause| {
            DoubaoAsrError::new(format!("failed to parse doubao payload json: {cause}"))
        });
    }

    Ok(Value::Null)
}

fn extract_error_message(payload: &Value, error_code: Option<u32>) -> String {
    if let Some(message) = payload.get("message").and_then(Value::as_str) {
        let message = message.trim();
        if !message.is_empty() {
            return message.to_string();
        }
    }

    if let Some(message) = payload.get("error").and_then(Value::as_str) {
        let message = message.trim();
        if !message.is_empty() {
            return message.to_string();
        }
    }

    if let Some(error_code) = error_code {
        return format!("豆包流式识别失败，错误码 {error_code}");
    }

    "豆包流式识别失败".to_string()
}

fn is_successful_payload(payload: &Map<String, Value>) -> bool {
    payload
        .get("code")
        .and_then(Value::as_i64)
        .map(|code| code == SUCCESS_CODE)
        .unwrap_or(true)
}

fn extract_transcript_text(payload: &Map<String, Value>) -> String {
    let segments = collect_segments(payload);

    let definite = segments
        .iter()
        .filter(|segment| segment.definite)
        .map(|segment| segment.text.as_str())
        .collect::<String>();
    if !definite.is_empty() {
        return definite;
    }

    segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<String>()
}

fn extract_definite_text(payload: &Map<String, Value>) -> String {
    collect_segments(payload)
        .into_iter()
        .filter(|segment| segment.definite)
        .map(|segment| segment.text)
        .collect::<String>()
}

fn collect_segments(payload: &Map<String, Value>) -> Vec<TranscriptSegment> {
    let mut segments = Vec::new();

    match payload.get("result") {
        Some(Value::Array(results)) => {
            for result in results {
                segments.extend(collect_segments_from_result(result));
            }
        }
        Some(Value::Object(_)) => {
            if let Some(result) = payload.get("result") {
                segments.extend(collect_segments_from_result(result));
            }
        }
        _ => {}
    }

    if segments.is_empty() {
        if let Some(text) = payload.get("text").and_then(Value::as_str) {
            let text = text.trim();
            if !text.is_empty() {
                segments.push(TranscriptSegment {
                    text: text.to_string(),
                    definite: false,
                });
            }
        }
    }

    segments
}

fn collect_segments_from_result(result: &Value) -> Vec<TranscriptSegment> {
    let mut segments = Vec::new();
    let Some(record) = result.as_object() else {
        return segments;
    };

    if let Some(Value::Array(utterances)) = record.get("utterances") {
        let mut utterance_segments = Vec::new();
        for utterance in utterances {
            let Some(entry) = utterance.as_object() else {
                continue;
            };

            let text = extract_segment_text(entry);
            if !text.is_empty() {
                utterance_segments.push(TranscriptSegment {
                    text,
                    definite: entry
                        .get("definite")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                });
            }
        }

        if !utterance_segments.is_empty() {
            return utterance_segments;
        }
    }

    let text = extract_segment_text(record);
    if !text.is_empty() {
        segments.push(TranscriptSegment {
            text,
            definite: false,
        });
    }

    segments
}

fn extract_segment_text(entry: &Map<String, Value>) -> String {
    if let Some(text) = entry.get("text").and_then(Value::as_str) {
        let text = text.trim();
        if !text.is_empty() {
            return text.to_string();
        }
    }

    if let Some(Value::Array(words)) = entry.get("words") {
        let text = words
            .iter()
            .filter_map(Value::as_object)
            .filter_map(|word| word.get("text").and_then(Value::as_str))
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .collect::<String>();

        if !text.is_empty() {
            return text;
        }
    }

    String::new()
}

fn is_completed_response(flags: u8, sequence: Option<i32>) -> bool {
    flags == MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE
        || flags == MESSAGE_FLAG_LAST_PACKAGE
        || sequence.map(|value| value < 0).unwrap_or(false)
}

fn read_i32_be(buffer: &[u8], offset: usize) -> Result<i32, DoubaoAsrError> {
    let bytes = buffer
        .get(offset..offset + 4)
        .ok_or_else(|| DoubaoAsrError::new("豆包响应帧读取 i32 越界。"))?;
    Ok(i32::from_be_bytes(
        bytes.try_into().expect("slice length already verified"),
    ))
}

fn read_u32_be(buffer: &[u8], offset: usize) -> Result<u32, DoubaoAsrError> {
    let bytes = buffer
        .get(offset..offset + 4)
        .ok_or_else(|| DoubaoAsrError::new("豆包响应帧读取 u32 越界。"))?;
    Ok(u32::from_be_bytes(
        bytes.try_into().expect("slice length already verified"),
    ))
}

#[derive(Clone, Debug)]
struct TranscriptSegment {
    text: String,
    definite: bool,
}
