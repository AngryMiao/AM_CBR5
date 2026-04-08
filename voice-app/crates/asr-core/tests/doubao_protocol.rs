use flate2::write::GzEncoder;
use flate2::Compression;
use serde_json::json;
use std::io::Write;

use asr_core::{parse_doubao_server_events, DoubaoSessionEvent};

const PROTOCOL_VERSION: u8 = 0x1;
const HEADER_SIZE_WORDS: u8 = 0x1;
const SERIALIZATION_NONE: u8 = 0x0;
const SERIALIZATION_JSON: u8 = 0x1;
const COMPRESSION_GZIP: u8 = 0x1;
const MESSAGE_TYPE_FULL_SERVER_RESPONSE: u8 = 0x9;
const MESSAGE_TYPE_ERROR_RESPONSE: u8 = 0xf;
const MESSAGE_FLAG_NONE: u8 = 0x0;
const MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE: u8 = 0x3;

fn build_test_frame(
    message_type: u8,
    flags: u8,
    payload: &[u8],
    serialization: u8,
    error_code: Option<u32>,
    sequence: Option<i32>,
) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(payload).expect("payload should compress");
    let body = encoder.finish().expect("gzip should finish");

    let mut frame = vec![
        (PROTOCOL_VERSION << 4) | HEADER_SIZE_WORDS,
        (message_type << 4) | flags,
        (serialization << 4) | COMPRESSION_GZIP,
        0,
    ];

    if let Some(sequence) = sequence {
        frame.extend_from_slice(&sequence.to_be_bytes());
    }

    if let Some(error_code) = error_code {
        frame.extend_from_slice(&error_code.to_be_bytes());
    }

    frame.extend_from_slice(&(body.len() as u32).to_be_bytes());
    frame.extend_from_slice(&body);
    frame
}

#[test]
fn parses_partial_transcript_events() {
    let payload = json!({
      "code": 20000000,
      "result": [
        {
          "text": "你好世界"
        }
      ]
    });
    let frame = build_test_frame(
        MESSAGE_TYPE_FULL_SERVER_RESPONSE,
        MESSAGE_FLAG_NONE,
        payload.to_string().as_bytes(),
        SERIALIZATION_JSON,
        None,
        None,
    );

    let events = parse_doubao_server_events(&frame).expect("partial frame should parse");

    assert_eq!(
        events,
        vec![DoubaoSessionEvent::Partial {
            text: "你好世界".to_string(),
        }]
    );
}

#[test]
fn partial_events_do_not_duplicate_result_text_and_utterances() {
    let payload = json!({
      "code": 20000000,
      "result": [
        {
          "text": "你好世界",
          "utterances": [
            {
              "text": "你好世界",
              "definite": false
            }
          ]
        }
      ]
    });
    let frame = build_test_frame(
        MESSAGE_TYPE_FULL_SERVER_RESPONSE,
        MESSAGE_FLAG_NONE,
        payload.to_string().as_bytes(),
        SERIALIZATION_JSON,
        None,
        None,
    );

    let events = parse_doubao_server_events(&frame).expect("partial frame should parse");

    assert_eq!(
        events,
        vec![DoubaoSessionEvent::Partial {
            text: "你好世界".to_string(),
        }]
    );
}

#[test]
fn parses_completed_transcript_events() {
    let payload = json!({
      "code": 20000000,
      "result": [
        {
          "text": "你好，豆包",
          "utterances": [
            {
              "text": "你好，豆包",
              "definite": true
            }
          ]
        }
      ]
    });
    let frame = build_test_frame(
        MESSAGE_TYPE_FULL_SERVER_RESPONSE,
        MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE,
        payload.to_string().as_bytes(),
        SERIALIZATION_JSON,
        None,
        Some(-1),
    );

    let events = parse_doubao_server_events(&frame).expect("completed frame should parse");

    assert_eq!(
        events,
        vec![DoubaoSessionEvent::Completed {
            text: "你好，豆包".to_string(),
        }]
    );
}

#[test]
fn parses_completed_transcript_from_words_when_utterance_text_is_missing() {
    let payload = json!({
      "code": 20000000,
      "result": {
        "utterances": [
          {
            "text": "",
            "definite": true,
            "words": [
              {
                "text": "你好"
              },
              {
                "text": "，"
              },
              {
                "text": "豆包"
              }
            ]
          }
        ]
      }
    });
    let frame = build_test_frame(
        MESSAGE_TYPE_FULL_SERVER_RESPONSE,
        MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE,
        payload.to_string().as_bytes(),
        SERIALIZATION_JSON,
        None,
        Some(-1),
    );

    let events = parse_doubao_server_events(&frame).expect("completed frame should parse");

    assert_eq!(
        events,
        vec![DoubaoSessionEvent::Completed {
            text: "你好，豆包".to_string(),
        }]
    );
}

#[test]
fn parses_completed_event_even_when_transcript_is_empty() {
    let payload = json!({
      "code": 20000000,
      "result": [
        {
          "text": ""
        }
      ]
    });
    let frame = build_test_frame(
        MESSAGE_TYPE_FULL_SERVER_RESPONSE,
        MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE,
        payload.to_string().as_bytes(),
        SERIALIZATION_JSON,
        None,
        Some(-1),
    );

    let events = parse_doubao_server_events(&frame).expect("completed frame should parse");

    assert_eq!(
        events,
        vec![DoubaoSessionEvent::Completed {
            text: String::new(),
        }]
    );
}

#[test]
fn parses_error_response_message() {
    let payload = json!({
      "message": "token expired"
    });
    let frame = build_test_frame(
        MESSAGE_TYPE_ERROR_RESPONSE,
        MESSAGE_FLAG_NONE,
        payload.to_string().as_bytes(),
        SERIALIZATION_JSON,
        Some(401),
        None,
    );

    let events = parse_doubao_server_events(&frame).expect("error frame should parse");

    assert_eq!(
        events,
        vec![DoubaoSessionEvent::Error {
            message: "token expired".to_string(),
        }]
    );
}

#[test]
fn ignores_empty_binary_payload() {
    let frame = build_test_frame(
        MESSAGE_TYPE_FULL_SERVER_RESPONSE,
        MESSAGE_FLAG_NONE,
        &[],
        SERIALIZATION_NONE,
        None,
        None,
    );

    let events = parse_doubao_server_events(&frame).expect("empty frame should parse");
    assert!(events.is_empty());
}
