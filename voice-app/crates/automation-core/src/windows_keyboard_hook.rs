use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};

use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_BACK, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_F10,
    VK_F11, VK_F12, VK_F13, VK_F14, VK_F15, VK_F16, VK_F17, VK_F18, VK_F19, VK_F2, VK_F20, VK_F21,
    VK_F22, VK_F23, VK_F24, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8, VK_F9, VK_HOME, VK_INSERT,
    VK_LCONTROL, VK_LEFT, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_NEXT, VK_OEM_1, VK_OEM_2,
    VK_OEM_3, VK_OEM_4, VK_OEM_5, VK_OEM_6, VK_OEM_7, VK_OEM_COMMA, VK_OEM_MINUS, VK_OEM_PERIOD,
    VK_OEM_PLUS, VK_PRIOR, VK_RCONTROL, VK_RETURN, VK_RIGHT, VK_RMENU, VK_RSHIFT, VK_RWIN,
    VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW,
    SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT,
    LLKHF_INJECTED, MSG, PM_NOREMOVE, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN,
    WM_SYSKEYUP,
};

use crate::{
    KeyboardHookBackend, KeyboardHookError, KeyboardHookEvent, KeyboardHookEventCallback,
    KeyboardHookHandle,
};

pub struct WindowsKeyboardHookBackend;

impl WindowsKeyboardHookBackend {
    pub fn new() -> Self {
        Self
    }
}

impl KeyboardHookBackend for WindowsKeyboardHookBackend {
    fn start(
        &self,
        callback: KeyboardHookEventCallback,
    ) -> Result<Box<dyn KeyboardHookHandle>, KeyboardHookError> {
        let shared = Arc::new(WindowsHookShared::new(callback));
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let thread_shared = Arc::clone(&shared);
        let join = thread::Builder::new()
            .name("voice-app-windows-keyboard-hook".to_string())
            .spawn(move || run_hook_thread(thread_shared, ready_tx))
            .map_err(|cause| {
                KeyboardHookError::new(format!("启动 Windows 键盘 Hook 线程失败: {cause}"))
            })?;

        let thread_id = match ready_rx.recv() {
            Ok(Ok(thread_id)) => thread_id,
            Ok(Err(cause)) => {
                let _ = join.join();
                return Err(cause);
            }
            Err(_) => {
                let _ = join.join();
                return Err(KeyboardHookError::new(
                    "Windows 键盘 Hook 初始化阶段意外退出。",
                ));
            }
        };

        Ok(Box::new(WindowsKeyboardHookHandle::new(
            thread_id, shared, join,
        )))
    }
}

struct WindowsKeyboardHookHandle {
    thread_id: u32,
    shared: Arc<WindowsHookShared>,
    join: Option<JoinHandle<()>>,
}

impl WindowsKeyboardHookHandle {
    fn new(thread_id: u32, shared: Arc<WindowsHookShared>, join: JoinHandle<()>) -> Self {
        Self {
            thread_id,
            shared,
            join: Some(join),
        }
    }
}

impl KeyboardHookHandle for WindowsKeyboardHookHandle {
    fn close(&mut self) -> Result<(), KeyboardHookError> {
        self.shared.stop_requested.store(true, Ordering::SeqCst);
        unsafe {
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0);
        }
        if let Some(join) = self.join.take() {
            join.join()
                .map_err(|_| KeyboardHookError::new("Windows 键盘 Hook 线程异常退出。"))?;
        }
        Ok(())
    }
}

impl Drop for WindowsKeyboardHookHandle {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

struct WindowsHookShared {
    callback: KeyboardHookEventCallback,
    stop_requested: AtomicBool,
}

impl WindowsHookShared {
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

fn hook_slot() -> &'static Mutex<Option<Arc<WindowsHookShared>>> {
    static SLOT: OnceLock<Mutex<Option<Arc<WindowsHookShared>>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn run_hook_thread(
    shared: Arc<WindowsHookShared>,
    ready_tx: mpsc::SyncSender<Result<u32, KeyboardHookError>>,
) {
    unsafe {
        let mut msg = MSG::default();
        PeekMessageW(&mut msg, ptr::null_mut(), 0, 0, PM_NOREMOVE);

        let mut slot = hook_slot().lock().expect("windows hook slot poisoned");
        if slot.is_some() {
            let _ = ready_tx.send(Err(KeyboardHookError::new(
                "Windows 原生键盘 Hook 已在运行。",
            )));
            return;
        }
        *slot = Some(Arc::clone(&shared));
        drop(slot);

        let module = GetModuleHandleW(ptr::null());
        if module.is_null() {
            clear_hook_slot();
            let _ = ready_tx.send(Err(last_error("获取当前模块句柄失败")));
            return;
        }

        let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(windows_keyboard_proc), module, 0);
        if hook.is_null() {
            clear_hook_slot();
            let _ = ready_tx.send(Err(last_error("安装 Windows 原生键盘 Hook 失败")));
            return;
        }

        let _ = ready_tx.send(Ok(GetCurrentThreadId()));
        let mut unexpected_error = None;
        loop {
            let status = GetMessageW(&mut msg, ptr::null_mut(), 0, 0);
            if status == -1 {
                unexpected_error = Some(last_error("Windows 键盘 Hook 消息循环失败"));
                break;
            }
            if status == 0 {
                break;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let _ = UnhookWindowsHookEx(hook);
        clear_hook_slot();
        if let Some(error) =
            unexpected_error.filter(|_| !shared.stop_requested.load(Ordering::SeqCst))
        {
            shared.emit(KeyboardHookEvent::cancelled(error.to_string(), 0));
        }
    }
}

fn clear_hook_slot() {
    let mut slot = hook_slot().lock().expect("windows hook slot poisoned");
    *slot = None;
}

unsafe extern "system" fn windows_keyboard_proc(code: i32, wparam: usize, lparam: isize) -> isize {
    if code != HC_ACTION as i32 {
        return CallNextHookEx(ptr::null_mut(), code, wparam, lparam);
    }
    let Some(shared) = hook_slot()
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(Arc::clone))
    else {
        return CallNextHookEx(ptr::null_mut(), code, wparam, lparam);
    };
    let data = &*(lparam as *const KBDLLHOOKSTRUCT);
    if data.flags & LLKHF_INJECTED != 0 {
        return CallNextHookEx(ptr::null_mut(), code, wparam, lparam);
    }
    let Some(key) = virtual_key_to_token(data.vkCode) else {
        return CallNextHookEx(ptr::null_mut(), code, wparam, lparam);
    };
    let modifiers = active_modifiers(&key);
    let event = match wparam as u32 {
        WM_KEYDOWN | WM_SYSKEYDOWN => Some(KeyboardHookEvent::pressed(
            key,
            modifiers,
            current_time_ms(),
        )),
        WM_KEYUP | WM_SYSKEYUP => Some(KeyboardHookEvent::released(
            key,
            modifiers,
            current_time_ms(),
        )),
        _ => None,
    };
    if let Some(event) = event {
        shared.emit(event);
    }
    CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
}

fn active_modifiers(current_key: &str) -> Vec<&'static str> {
    let mut modifiers = Vec::new();
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_LMENU as i32),
        "Alt",
        "LeftAlt",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_RMENU as i32),
        "Alt",
        "RightAlt",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_LCONTROL as i32),
        "Control",
        "LeftCtrl",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_RCONTROL as i32),
        "Control",
        "RightCtrl",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_LSHIFT as i32),
        "Shift",
        "LeftShift",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_RSHIFT as i32),
        "Shift",
        "RightShift",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_LWIN as i32),
        "Meta",
        "LeftMeta",
    );
    maybe_push_modifier(
        &mut modifiers,
        current_key,
        is_pressed(VK_RWIN as i32),
        "Meta",
        "RightMeta",
    );
    modifiers
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

fn is_pressed(vk: i32) -> bool {
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn last_error(prefix: &str) -> KeyboardHookError {
    KeyboardHookError::new(format!("{prefix}: {}", std::io::Error::last_os_error()))
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default()
}

fn virtual_key_to_token(vk: u32) -> Option<&'static str> {
    match vk {
        0x30..=0x39 => Some(match vk {
            0x30 => "0",
            0x31 => "1",
            0x32 => "2",
            0x33 => "3",
            0x34 => "4",
            0x35 => "5",
            0x36 => "6",
            0x37 => "7",
            0x38 => "8",
            _ => "9",
        }),
        0x41..=0x5A => Some(match vk {
            0x41 => "A",
            0x42 => "B",
            0x43 => "C",
            0x44 => "D",
            0x45 => "E",
            0x46 => "F",
            0x47 => "G",
            0x48 => "H",
            0x49 => "I",
            0x4A => "J",
            0x4B => "K",
            0x4C => "L",
            0x4D => "M",
            0x4E => "N",
            0x4F => "O",
            0x50 => "P",
            0x51 => "Q",
            0x52 => "R",
            0x53 => "S",
            0x54 => "T",
            0x55 => "U",
            0x56 => "V",
            0x57 => "W",
            0x58 => "X",
            0x59 => "Y",
            _ => "Z",
        }),
        value if value == VK_SPACE as u32 => Some("Space"),
        value if value == VK_RETURN as u32 => Some("Enter"),
        value if value == VK_TAB as u32 => Some("Tab"),
        value if value == VK_ESCAPE as u32 => Some("Escape"),
        value if value == VK_BACK as u32 => Some("Backspace"),
        value if value == VK_DELETE as u32 => Some("Delete"),
        value if value == VK_INSERT as u32 => Some("Insert"),
        value if value == VK_HOME as u32 => Some("Home"),
        value if value == VK_END as u32 => Some("End"),
        value if value == VK_PRIOR as u32 => Some("PageUp"),
        value if value == VK_NEXT as u32 => Some("PageDown"),
        value if value == VK_UP as u32 => Some("Up"),
        value if value == VK_DOWN as u32 => Some("Down"),
        value if value == VK_LEFT as u32 => Some("Left"),
        value if value == VK_RIGHT as u32 => Some("Right"),
        value if value == VK_MENU as u32 => Some("Alt"),
        value if value == VK_LMENU as u32 => Some("LeftAlt"),
        value if value == VK_RMENU as u32 => Some("RightAlt"),
        value if value == VK_CONTROL as u32 => Some("Control"),
        value if value == VK_LCONTROL as u32 => Some("LeftCtrl"),
        value if value == VK_RCONTROL as u32 => Some("RightCtrl"),
        value if value == VK_SHIFT as u32 => Some("Shift"),
        value if value == VK_LSHIFT as u32 => Some("LeftShift"),
        value if value == VK_RSHIFT as u32 => Some("RightShift"),
        value if value == VK_LWIN as u32 => Some("LeftMeta"),
        value if value == VK_RWIN as u32 => Some("RightMeta"),
        value if value == VK_OEM_MINUS as u32 => Some("Minus"),
        value if value == VK_OEM_PLUS as u32 => Some("Equal"),
        value if value == VK_OEM_COMMA as u32 => Some("Comma"),
        value if value == VK_OEM_PERIOD as u32 => Some("Period"),
        value if value == VK_OEM_1 as u32 => Some("Semicolon"),
        value if value == VK_OEM_2 as u32 => Some("Slash"),
        value if value == VK_OEM_3 as u32 => Some("Backquote"),
        value if value == VK_OEM_4 as u32 => Some("BracketLeft"),
        value if value == VK_OEM_5 as u32 => Some("Backslash"),
        value if value == VK_OEM_6 as u32 => Some("BracketRight"),
        value if value == VK_OEM_7 as u32 => Some("Quote"),
        value if value == VK_F1 as u32 => Some("F1"),
        value if value == VK_F2 as u32 => Some("F2"),
        value if value == VK_F3 as u32 => Some("F3"),
        value if value == VK_F4 as u32 => Some("F4"),
        value if value == VK_F5 as u32 => Some("F5"),
        value if value == VK_F6 as u32 => Some("F6"),
        value if value == VK_F7 as u32 => Some("F7"),
        value if value == VK_F8 as u32 => Some("F8"),
        value if value == VK_F9 as u32 => Some("F9"),
        value if value == VK_F10 as u32 => Some("F10"),
        value if value == VK_F11 as u32 => Some("F11"),
        value if value == VK_F12 as u32 => Some("F12"),
        value if value == VK_F13 as u32 => Some("F13"),
        value if value == VK_F14 as u32 => Some("F14"),
        value if value == VK_F15 as u32 => Some("F15"),
        value if value == VK_F16 as u32 => Some("F16"),
        value if value == VK_F17 as u32 => Some("F17"),
        value if value == VK_F18 as u32 => Some("F18"),
        value if value == VK_F19 as u32 => Some("F19"),
        value if value == VK_F20 as u32 => Some("F20"),
        value if value == VK_F21 as u32 => Some("F21"),
        value if value == VK_F22 as u32 => Some("F22"),
        value if value == VK_F23 as u32 => Some("F23"),
        value if value == VK_F24 as u32 => Some("F24"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::virtual_key_to_token;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN,
    };

    #[test]
    fn maps_left_and_right_modifier_virtual_keys_to_generic_tokens() {
        assert_eq!(virtual_key_to_token(VK_LMENU as u32), Some("LeftAlt"));
        assert_eq!(virtual_key_to_token(VK_RMENU as u32), Some("RightAlt"));
        assert_eq!(virtual_key_to_token(VK_LCONTROL as u32), Some("LeftCtrl"));
        assert_eq!(virtual_key_to_token(VK_RCONTROL as u32), Some("RightCtrl"));
        assert_eq!(virtual_key_to_token(VK_LSHIFT as u32), Some("LeftShift"));
        assert_eq!(virtual_key_to_token(VK_RSHIFT as u32), Some("RightShift"));
        assert_eq!(virtual_key_to_token(VK_LWIN as u32), Some("LeftMeta"));
        assert_eq!(virtual_key_to_token(VK_RWIN as u32), Some("RightMeta"));
    }

    #[test]
    fn maps_left_and_right_modifier_virtual_keys_to_exact_tokens() {
        assert_eq!(virtual_key_to_token(VK_LMENU as u32), Some("LeftAlt"));
        assert_eq!(virtual_key_to_token(VK_RMENU as u32), Some("RightAlt"));
        assert_eq!(virtual_key_to_token(VK_LCONTROL as u32), Some("LeftCtrl"));
        assert_eq!(virtual_key_to_token(VK_RCONTROL as u32), Some("RightCtrl"));
        assert_eq!(virtual_key_to_token(VK_LSHIFT as u32), Some("LeftShift"));
        assert_eq!(virtual_key_to_token(VK_RSHIFT as u32), Some("RightShift"));
        assert_eq!(virtual_key_to_token(VK_LWIN as u32), Some("LeftMeta"));
        assert_eq!(virtual_key_to_token(VK_RWIN as u32), Some("RightMeta"));
    }
}
