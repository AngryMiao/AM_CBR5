use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    KeyboardHookBackend, KeyboardHookError, KeyboardHookEvent, KeyboardHookEventCallback,
    KeyboardHookHandle,
};

type CFMachPortRef = *mut c_void;
type CFRunLoopRef = *mut c_void;
type CFRunLoopSourceRef = *mut c_void;
type CFAllocatorRef = *const c_void;
type CFRunLoopMode = *const c_void;
type CGEventRef = *const c_void;
type CGEventFlags = u64;
type CGEventMask = u64;
type CGEventTapProxy = *const c_void;
type CGEventField = u32;

const CG_EVENT_FLAG_SHIFT: CGEventFlags = 0x0002_0000;
const CG_EVENT_FLAG_CONTROL: CGEventFlags = 0x0004_0000;
const CG_EVENT_FLAG_ALTERNATE: CGEventFlags = 0x0008_0000;
const CG_EVENT_FLAG_COMMAND: CGEventFlags = 0x0010_0000;
const NX_DEVICELCTLKEYMASK: CGEventFlags = 0x0000_0001;
const NX_DEVICELSHIFTKEYMASK: CGEventFlags = 0x0000_0002;
const NX_DEVICERSHIFTKEYMASK: CGEventFlags = 0x0000_0004;
const NX_DEVICELCMDKEYMASK: CGEventFlags = 0x0000_0008;
const NX_DEVICERCMDKEYMASK: CGEventFlags = 0x0000_0010;
const NX_DEVICELALTKEYMASK: CGEventFlags = 0x0000_0020;
const NX_DEVICERALTKEYMASK: CGEventFlags = 0x0000_0040;
const NX_DEVICERCTLKEYMASK: CGEventFlags = 0x0000_2000;
const KEYBOARD_EVENT_KEYCODE: CGEventField = 9;

pub struct MacosKeyboardHookBackend;

impl MacosKeyboardHookBackend {
    pub fn new() -> Self {
        Self
    }
}

impl KeyboardHookBackend for MacosKeyboardHookBackend {
    fn start(
        &self,
        callback: KeyboardHookEventCallback,
    ) -> Result<Box<dyn KeyboardHookHandle>, KeyboardHookError> {
        let shared = Arc::new(MacosHookShared::new(callback));
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let thread_shared = Arc::clone(&shared);
        let join = thread::Builder::new()
            .name("voice-app-macos-keyboard-hook".to_string())
            .spawn(move || run_hook_thread(thread_shared, ready_tx))
            .map_err(|cause| {
                KeyboardHookError::new(format!("启动 macOS 键盘 Hook 线程失败: {cause}"))
            })?;

        let run_loop = match ready_rx.recv() {
            Ok(Ok(run_loop)) => run_loop,
            Ok(Err(cause)) => {
                let _ = join.join();
                return Err(cause);
            }
            Err(_) => {
                let _ = join.join();
                return Err(KeyboardHookError::new(
                    "macOS 键盘 Hook 初始化阶段意外退出。",
                ));
            }
        };

        Ok(Box::new(MacosKeyboardHookHandle::new(
            run_loop, shared, join,
        )))
    }
}

struct MacosKeyboardHookHandle {
    run_loop: usize,
    shared: Arc<MacosHookShared>,
    join: Option<JoinHandle<()>>,
}

impl MacosKeyboardHookHandle {
    fn new(run_loop: usize, shared: Arc<MacosHookShared>, join: JoinHandle<()>) -> Self {
        Self {
            run_loop,
            shared,
            join: Some(join),
        }
    }
}

impl KeyboardHookHandle for MacosKeyboardHookHandle {
    fn close(&mut self) -> Result<(), KeyboardHookError> {
        self.shared.stop_requested.store(true, Ordering::SeqCst);
        unsafe {
            let run_loop = self.run_loop as CFRunLoopRef;
            if !run_loop.is_null() {
                CFRunLoopStop(run_loop);
                CFRunLoopWakeUp(run_loop);
            }
        }
        if let Some(join) = self.join.take() {
            join.join()
                .map_err(|_| KeyboardHookError::new("macOS 键盘 Hook 线程异常退出。"))?;
        }
        Ok(())
    }
}

impl Drop for MacosKeyboardHookHandle {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

struct MacosHookShared {
    callback: KeyboardHookEventCallback,
    stop_requested: AtomicBool,
}

impl MacosHookShared {
    fn new(callback: KeyboardHookEventCallback) -> Self {
        Self {
            callback,
            stop_requested: AtomicBool::new(false),
        }
    }

    fn emit(&self, event: KeyboardHookEvent) {
        (self.callback)(event);
    }
}

fn hook_slot() -> &'static Mutex<Option<Arc<MacosHookShared>>> {
    static SLOT: OnceLock<Mutex<Option<Arc<MacosHookShared>>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn run_hook_thread(
    shared: Arc<MacosHookShared>,
    ready_tx: mpsc::SyncSender<Result<usize, KeyboardHookError>>,
) {
    unsafe {
        if !AXIsProcessTrustedWithOptions(ptr::null()) {
            let _ = ready_tx.send(Err(KeyboardHookError::new(
                "macOS 缺少辅助功能权限，无法启动原生键盘 Hook。",
            )));
            return;
        }
        let run_loop = CFRunLoopGetCurrent();
        let tap = CGEventTapCreate(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            event_mask(),
            macos_keyboard_proc,
            ptr::null(),
        );
        if tap.is_null() {
            let _ = ready_tx.send(Err(KeyboardHookError::new("创建 macOS CGEventTap 失败。")));
            return;
        }
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
        if source.is_null() {
            CFMachPortInvalidate(tap);
            CFRelease(tap);
            let _ = ready_tx.send(Err(KeyboardHookError::new(
                "创建 macOS RunLoop Source 失败。",
            )));
            return;
        }
        let mut slot = hook_slot().lock().expect("macos hook slot poisoned");
        if slot.is_some() {
            CFRelease(source);
            CFMachPortInvalidate(tap);
            CFRelease(tap);
            let _ = ready_tx.send(Err(KeyboardHookError::new(
                "macOS 原生键盘 Hook 已在运行。",
            )));
            return;
        }
        *slot = Some(Arc::clone(&shared));
        drop(slot);
        CFRunLoopAddSource(run_loop, source, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);
        let _ = ready_tx.send(Ok(run_loop as usize));
        CFRunLoopRun();
        CFRunLoopRemoveSource(run_loop, source, kCFRunLoopCommonModes);
        CFMachPortInvalidate(tap);
        CFRelease(source);
        CFRelease(tap);
        clear_hook_slot();
    }
}

fn clear_hook_slot() {
    let mut slot = hook_slot().lock().expect("macos hook slot poisoned");
    *slot = None;
}

unsafe extern "C" fn macos_keyboard_proc(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: CGEventRef,
    _user_info: *const c_void,
) -> CGEventRef {
    let Some(shared) = hook_slot()
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(Arc::clone))
    else {
        return event;
    };
    if matches!(
        event_type,
        CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput
    ) && !shared.stop_requested.load(Ordering::SeqCst)
    {
        shared.emit(KeyboardHookEvent::cancelled(
            "macOS CGEventTap 已失效。",
            current_time_ms(),
        ));
        return event;
    }
    if !matches!(
        event_type,
        CGEventType::KeyDown | CGEventType::KeyUp | CGEventType::FlagsChanged
    ) {
        return event;
    }
    let keycode = CGEventGetIntegerValueField(event, KEYBOARD_EVENT_KEYCODE) as u16;
    let Some(key) = mac_keycode_to_token(keycode) else {
        return event;
    };
    let flags = CGEventGetFlags(event);
    let modifiers = active_modifiers(flags, &key);
    let pressed = match event_type {
        CGEventType::KeyDown => true,
        CGEventType::KeyUp => false,
        CGEventType::FlagsChanged => modifier_key_is_pressed(keycode, flags),
        _ => false,
    };
    let hook_event = if pressed {
        KeyboardHookEvent::pressed(key, modifiers, current_time_ms())
    } else {
        KeyboardHookEvent::released(key, modifiers, current_time_ms())
    };
    shared.emit(hook_event);
    event
}

fn event_mask() -> CGEventMask {
    (1u64 << CGEventType::KeyDown as u64)
        | (1u64 << CGEventType::KeyUp as u64)
        | (1u64 << CGEventType::FlagsChanged as u64)
}

fn active_modifiers(flags: CGEventFlags, current_key: &str) -> Vec<&'static str> {
    let mut modifiers = Vec::new();
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICELSHIFTKEYMASK != 0,
        "Shift",
        "LeftShift",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICERSHIFTKEYMASK != 0,
        "Shift",
        "RightShift",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICELCTLKEYMASK != 0,
        "Control",
        "LeftCtrl",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICERCTLKEYMASK != 0,
        "Control",
        "RightCtrl",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICELALTKEYMASK != 0,
        "Alt",
        "LeftAlt",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICERALTKEYMASK != 0,
        "Alt",
        "RightAlt",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICELCMDKEYMASK != 0,
        "Meta",
        "LeftMeta",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        flags & NX_DEVICERCMDKEYMASK != 0,
        "Meta",
        "RightMeta",
    );

    if !modifiers
        .iter()
        .any(|value| matches!(*value, "LeftShift" | "RightShift"))
        && current_key != "Shift"
        && flags & CG_EVENT_FLAG_SHIFT != 0
    {
        modifiers.push("Shift");
    }
    if !modifiers
        .iter()
        .any(|value| matches!(*value, "LeftCtrl" | "RightCtrl"))
        && current_key != "Control"
        && flags & CG_EVENT_FLAG_CONTROL != 0
    {
        modifiers.push("Control");
    }
    if !modifiers
        .iter()
        .any(|value| matches!(*value, "LeftAlt" | "RightAlt"))
        && current_key != "Alt"
        && flags & CG_EVENT_FLAG_ALTERNATE != 0
    {
        modifiers.push("Alt");
    }
    if !modifiers
        .iter()
        .any(|value| matches!(*value, "LeftMeta" | "RightMeta"))
        && current_key != "Meta"
        && flags & CG_EVENT_FLAG_COMMAND != 0
    {
        modifiers.push("Meta");
    }

    modifiers
}

fn modifier_key_is_pressed(keycode: u16, flags: CGEventFlags) -> bool {
    match keycode {
        0x38 => flags & NX_DEVICELSHIFTKEYMASK != 0 || flags & CG_EVENT_FLAG_SHIFT != 0,
        0x3C => flags & NX_DEVICERSHIFTKEYMASK != 0 || flags & CG_EVENT_FLAG_SHIFT != 0,
        0x3B => flags & NX_DEVICELCTLKEYMASK != 0 || flags & CG_EVENT_FLAG_CONTROL != 0,
        0x3E => flags & NX_DEVICERCTLKEYMASK != 0 || flags & CG_EVENT_FLAG_CONTROL != 0,
        0x3A => flags & NX_DEVICELALTKEYMASK != 0 || flags & CG_EVENT_FLAG_ALTERNATE != 0,
        0x3D => flags & NX_DEVICERALTKEYMASK != 0 || flags & CG_EVENT_FLAG_ALTERNATE != 0,
        0x37 => flags & NX_DEVICELCMDKEYMASK != 0 || flags & CG_EVENT_FLAG_COMMAND != 0,
        0x36 => flags & NX_DEVICERCMDKEYMASK != 0 || flags & CG_EVENT_FLAG_COMMAND != 0,
        _ => false,
    }
}

fn maybe_push_modifier(
    modifiers: &mut Vec<&'static str>,
    current_key: &str,
    pressed: bool,
    generic_token: &str,
    exact_token: &'static str,
) {
    if !pressed {
        return;
    }

    if current_key == generic_token || current_key == exact_token {
        return;
    }

    modifiers.push(exact_token);
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default()
}

fn mac_keycode_to_token(keycode: u16) -> Option<&'static str> {
    match keycode {
        0x00 => Some("A"),
        0x01 => Some("S"),
        0x02 => Some("D"),
        0x03 => Some("F"),
        0x04 => Some("H"),
        0x05 => Some("G"),
        0x06 => Some("Z"),
        0x07 => Some("X"),
        0x08 => Some("C"),
        0x09 => Some("V"),
        0x0B => Some("B"),
        0x0C => Some("Q"),
        0x0D => Some("W"),
        0x0E => Some("E"),
        0x0F => Some("R"),
        0x10 => Some("Y"),
        0x11 => Some("T"),
        0x12 => Some("1"),
        0x13 => Some("2"),
        0x14 => Some("3"),
        0x15 => Some("4"),
        0x16 => Some("6"),
        0x17 => Some("5"),
        0x18 => Some("Equal"),
        0x19 => Some("9"),
        0x1A => Some("7"),
        0x1B => Some("Minus"),
        0x1C => Some("8"),
        0x1D => Some("0"),
        0x1E => Some("BracketRight"),
        0x1F => Some("O"),
        0x20 => Some("U"),
        0x21 => Some("BracketLeft"),
        0x22 => Some("I"),
        0x23 => Some("P"),
        0x24 => Some("Enter"),
        0x25 => Some("L"),
        0x26 => Some("J"),
        0x27 => Some("Quote"),
        0x28 => Some("K"),
        0x29 => Some("Semicolon"),
        0x2A => Some("Backslash"),
        0x2B => Some("Comma"),
        0x2C => Some("Slash"),
        0x2D => Some("N"),
        0x2E => Some("M"),
        0x2F => Some("Period"),
        0x30 => Some("Tab"),
        0x31 => Some("Space"),
        0x32 => Some("Backquote"),
        0x33 => Some("Backspace"),
        0x35 => Some("Escape"),
        0x36 => Some("RightMeta"),
        0x37 => Some("LeftMeta"),
        0x38 => Some("LeftShift"),
        0x3C => Some("RightShift"),
        0x3A => Some("LeftAlt"),
        0x3D => Some("RightAlt"),
        0x3B => Some("LeftCtrl"),
        0x3E => Some("RightCtrl"),
        0x60 => Some("F5"),
        0x61 => Some("F6"),
        0x62 => Some("F7"),
        0x63 => Some("F3"),
        0x64 => Some("F8"),
        0x65 => Some("F9"),
        0x67 => Some("F11"),
        0x69 => Some("F13"),
        0x6A => Some("F16"),
        0x6B => Some("F14"),
        0x6D => Some("F10"),
        0x6F => Some("F12"),
        0x71 => Some("F15"),
        0x72 => Some("Insert"),
        0x73 => Some("Home"),
        0x74 => Some("PageUp"),
        0x75 => Some("Delete"),
        0x76 => Some("F4"),
        0x77 => Some("End"),
        0x78 => Some("F2"),
        0x79 => Some("PageDown"),
        0x7A => Some("F1"),
        0x7B => Some("Left"),
        0x7C => Some("Right"),
        0x7D => Some("Down"),
        0x7E => Some("Up"),
        _ => None,
    }
}

#[repr(u32)]
#[derive(Clone, Copy)]
enum CGEventTapLocation {
    Session = 1,
}
#[repr(u32)]
#[derive(Clone, Copy)]
enum CGEventTapPlacement {
    HeadInsertEventTap = 0,
}
#[repr(u32)]
#[derive(Clone, Copy)]
enum CGEventTapOptions {
    ListenOnly = 1,
}
#[repr(u32)]
#[derive(Clone, Copy, PartialEq, Eq)]
enum CGEventType {
    KeyDown = 10,
    KeyUp = 11,
    FlagsChanged = 12,
    #[allow(dead_code)] // 仅由 CoreGraphics 事件回调返回，Rust 侧不会直接构造
    TapDisabledByTimeout = 0xFFFF_FFFE,
    #[allow(dead_code)] // 仅由 CoreGraphics 事件回调返回，Rust 侧不会直接构造
    TapDisabledByUserInput = 0xFFFF_FFFF,
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
}
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    static kCFAllocatorDefault: CFAllocatorRef;
    static kCFRunLoopCommonModes: CFRunLoopMode;
    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CFRunLoopRun();
    fn CFRunLoopStop(rl: CFRunLoopRef);
    fn CFRunLoopWakeUp(rl: CFRunLoopRef);
    fn CFMachPortCreateRunLoopSource(
        allocator: CFAllocatorRef,
        port: CFMachPortRef,
        order: isize,
    ) -> CFRunLoopSourceRef;
    fn CFMachPortInvalidate(port: CFMachPortRef);
    fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFRunLoopMode);
    fn CFRunLoopRemoveSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFRunLoopMode);
    fn CFRelease(cftype: *const c_void);
}
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventTapCreate(
        tap: CGEventTapLocation,
        place: CGEventTapPlacement,
        options: CGEventTapOptions,
        events_of_interest: CGEventMask,
        callback: unsafe extern "C" fn(
            CGEventTapProxy,
            CGEventType,
            CGEventRef,
            *const c_void,
        ) -> CGEventRef,
        user_info: *const c_void,
    ) -> CFMachPortRef;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    fn CGEventGetFlags(event: CGEventRef) -> CGEventFlags;
    fn CGEventGetIntegerValueField(event: CGEventRef, field: CGEventField) -> i64;
}
