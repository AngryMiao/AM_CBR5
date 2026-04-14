use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

use mcp_core::McpServerConfig;
use serde::{Deserialize, Serialize};
use settings_core::StoredVoiceSettings;

const ANGRYMIAO_BUNDLE_ID: &str = "angrymiao-voice-control";
const ANGRYMIAO_RUNTIME_ID: &str = "system-control";
pub const BUNDLED_SKILL_BUNDLE_RESOURCE_DIR: &str = "skill-bundles";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillBundleManifest {
    id: String,
    version: String,
    name: String,
    description: String,
    prompt: Option<SkillBundlePrompt>,
    #[serde(default)]
    runtimes: Vec<SkillBundleRuntime>,
    #[serde(default)]
    platforms: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillBundlePrompt {
    file: String,
    examples_file: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillBundleRuntime {
    id: String,
    transport: String,
    launcher: String,
    entry: String,
    name: Option<String>,
    server: SkillBundleServer,
    #[serde(default)]
    env: Vec<SkillBundleEnvBinding>,
    #[serde(default)]
    platforms: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SkillBundleServer {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillBundleEnvBinding {
    name: String,
    source: String,
    setting_path: Option<String>,
    value: Option<String>,
    default_bundle_path: Option<String>,
    #[serde(default)]
    required: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct SkillBundleInventoryItem {
    pub id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    pub bundle_dir: String,
    pub platforms: Vec<String>,
    pub supported_on_current_platform: bool,
    pub is_builtin: bool,
    pub prompt_file: String,
    pub prompt_examples_file: Option<String>,
    pub runtimes: Vec<SkillBundleRuntimeInventoryItem>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct SkillBundleRuntimeInventoryItem {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub launcher: String,
    pub entry: String,
    pub server_id: String,
    pub server_name: String,
    pub platforms: Vec<String>,
    pub supported_on_current_platform: bool,
    pub missing_required_env: Vec<String>,
    pub resolved_env: BTreeMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AngrymiaoPromptAssets {
    pub prompt_template: String,
    pub hid_reference: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct AngrymiaoRuntimeDiagnostics {
    pub enabled_in_settings: bool,
    pub bundle_dir: Option<String>,
    pub bundle_installed: bool,
    pub supported_on_current_platform: bool,
    pub runtime_entry: Option<String>,
    pub runtime_entry_exists: bool,
    pub server_id: Option<String>,
    pub keyboard_driver_source: String,
    pub keyboard_driver_path: Option<String>,
    pub keyboard_driver_exists: bool,
    pub missing_required_env: Vec<String>,
    pub error: Option<String>,
}

pub fn default_skill_bundle_root() -> PathBuf {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../skill-bundles");
    std::fs::canonicalize(&path).unwrap_or(path)
}

pub fn list_installed_skill_bundles(
    root: Option<&Path>,
    settings: &StoredVoiceSettings,
) -> Result<Vec<SkillBundleInventoryItem>, String> {
    let Some(root) = root else {
        return Ok(Vec::new());
    };

    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut bundles = Vec::new();
    let entries =
        std::fs::read_dir(root).map_err(|cause| format!("读取 skill bundle 目录失败: {cause}"))?;

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let bundle_dir = entry.path();
        let manifest_path = bundle_dir.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        let manifest = match load_manifest(&manifest_path) {
            Ok(manifest) => manifest,
            Err(_) => continue,
        };
        if manifest.prompt.is_none() {
            continue;
        }

        bundles.push(build_inventory_item(&bundle_dir, &manifest, settings)?);
    }

    bundles.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(bundles)
}

pub fn read_skill_bundle_text_file(
    root: Option<&Path>,
    bundle_id: &str,
    relative_path: &str,
) -> Result<String, String> {
    let root = root.ok_or_else(|| "skill bundle 根目录尚未初始化。".to_string())?;
    let bundle_dir = root.join(bundle_id);
    let file_path = resolve_path_inside(&bundle_dir, relative_path)?;

    std::fs::read_to_string(&file_path)
        .map_err(|cause| format!("读取 skill bundle 文本文件失败: {cause}"))
}

pub fn install_skill_bundle_from_dir(
    root: Option<&Path>,
    source_dir: &Path,
    settings: &StoredVoiceSettings,
) -> Result<SkillBundleInventoryItem, String> {
    let root = root.ok_or_else(|| "skill bundle 根目录尚未初始化。".to_string())?;
    if !source_dir.exists() {
        return Err(format!(
            "待安装的 skill bundle 目录不存在: {}",
            source_dir.display()
        ));
    }
    if !source_dir.is_dir() {
        return Err(format!(
            "待安装的 skill bundle 路径不是目录: {}",
            source_dir.display()
        ));
    }

    let manifest_path = source_dir.join("manifest.json");
    let manifest = load_manifest(&manifest_path)?;
    validate_bundle_id(&manifest.id)?;

    std::fs::create_dir_all(root)
        .map_err(|cause| format!("创建 skill bundle 根目录失败: {cause}"))?;
    let target_dir = root.join(&manifest.id);
    if target_dir.exists() {
        return Err(format!(
            "skill bundle `{}` 已存在，请先删除旧目录后再安装。",
            manifest.id
        ));
    }

    copy_dir_recursively(source_dir, &target_dir)?;
    build_inventory_item(&target_dir, &manifest, settings)
}

pub fn resolve_builtin_mcp_servers(
    root: Option<&Path>,
    settings: &StoredVoiceSettings,
) -> Result<Vec<McpServerConfig>, String> {
    let mut servers = settings.mcp_servers.clone();

    if let Some(server) = resolve_angrymiao_runtime(root, settings)? {
        servers.push(server);
    }

    Ok(servers)
}

pub fn resolve_angrymiao_prompt_assets(
    root: Option<&Path>,
    settings: &StoredVoiceSettings,
) -> Result<Option<AngrymiaoPromptAssets>, String> {
    if !settings.angrymiao_skill_enabled {
        return Ok(None);
    }

    let Some(root) = root else {
        return Ok(None);
    };

    let bundle_dir = root.join(ANGRYMIAO_BUNDLE_ID);
    let manifest = load_manifest(&bundle_dir.join("manifest.json"))?;
    if !supports_current_platform(&manifest.platforms) {
        return Ok(None);
    }

    let prompt = manifest
        .prompt
        .ok_or_else(|| "AngryMiao skill bundle 缺少 prompt.file 配置。".to_string())?;
    let prompt_path = resolve_path_inside(&bundle_dir, &prompt.file)?;
    let prompt_template = std::fs::read_to_string(&prompt_path)
        .map_err(|cause| format!("读取 AngryMiao SKILL.md 失败: {cause}"))?;
    let hid_reference_path = resolve_path_inside(&bundle_dir, "docs/keyboard-hid-reference.md")?;
    let hid_reference = if hid_reference_path.exists() {
        std::fs::read_to_string(&hid_reference_path)
            .map_err(|cause| format!("读取 AngryMiao HID 参考失败: {cause}"))?
    } else {
        String::new()
    };

    Ok(Some(AngrymiaoPromptAssets {
        prompt_template,
        hid_reference,
    }))
}

pub fn inspect_angrymiao_runtime(
    root: Option<&Path>,
    settings: &StoredVoiceSettings,
) -> AngrymiaoRuntimeDiagnostics {
    let strict = settings.angrymiao_skill_enabled;
    let bundle_dir = root.map(|root| root.join(ANGRYMIAO_BUNDLE_ID));
    let bundle_dir_display = bundle_dir.as_ref().map(|path| path.display().to_string());

    let mut diagnostics = AngrymiaoRuntimeDiagnostics {
        enabled_in_settings: settings.angrymiao_skill_enabled,
        bundle_dir: bundle_dir_display,
        bundle_installed: bundle_dir.as_ref().is_some_and(|path| path.exists()),
        supported_on_current_platform: false,
        runtime_entry: None,
        runtime_entry_exists: false,
        server_id: None,
        keyboard_driver_source: "未解析".to_string(),
        keyboard_driver_path: None,
        keyboard_driver_exists: false,
        missing_required_env: Vec::new(),
        error: None,
    };

    let Some(bundle_dir) = bundle_dir else {
        if strict {
            diagnostics.error = Some("skill bundle 根目录尚未初始化。".to_string());
        }
        return diagnostics;
    };

    let manifest_path = bundle_dir.join("manifest.json");
    if !manifest_path.exists() {
        if strict {
            diagnostics.error = Some(format!(
                "未找到 AngryMiao skill bundle manifest: {}",
                manifest_path.display()
            ));
        }
        return diagnostics;
    }

    let manifest = match load_manifest(&manifest_path) {
        Ok(manifest) => manifest,
        Err(cause) => {
            if strict {
                diagnostics.error = Some(cause);
            }
            return diagnostics;
        }
    };

    diagnostics.supported_on_current_platform = supports_current_platform(&manifest.platforms);

    let Some(runtime) = manifest
        .runtimes
        .iter()
        .find(|item| item.id == ANGRYMIAO_RUNTIME_ID)
    else {
        if strict {
            diagnostics.error =
                Some("AngryMiao skill bundle 缺少 system-control runtime。".to_string());
        }
        return diagnostics;
    };

    diagnostics.server_id = Some(runtime.server.id.clone());
    diagnostics.supported_on_current_platform =
        diagnostics.supported_on_current_platform && supports_current_platform(&runtime.platforms);

    let runtime_entry = match resolve_path_inside(&bundle_dir, &runtime.entry) {
        Ok(path) => path,
        Err(cause) => {
            if strict {
                diagnostics.error = Some(cause);
            }
            return diagnostics;
        }
    };
    diagnostics.runtime_entry = Some(runtime_entry.display().to_string());
    diagnostics.runtime_entry_exists = runtime_entry.exists();

    let env_resolution = match collect_runtime_env(runtime, &bundle_dir, settings) {
        Ok(resolution) => resolution,
        Err(cause) => {
            if strict {
                diagnostics.error = Some(cause);
            }
            return diagnostics;
        }
    };
    diagnostics.missing_required_env = env_resolution.missing_required_env;

    if let Some(binding) = runtime
        .env
        .iter()
        .find(|binding| binding.name == "KEYBOARD_DRIVER_PATH")
    {
        if !settings.keyboard_driver_path.trim().is_empty() {
            diagnostics.keyboard_driver_source = "设置路径".to_string();
            diagnostics.keyboard_driver_path =
                Some(settings.keyboard_driver_path.trim().to_string());
        } else if let Some(default_bundle_path) = &binding.default_bundle_path {
            match resolve_path_inside(&bundle_dir, default_bundle_path) {
                Ok(path) => {
                    diagnostics.keyboard_driver_source = "bundle 默认路径".to_string();
                    diagnostics.keyboard_driver_path = Some(path.display().to_string());
                }
                Err(cause) => {
                    if strict {
                        diagnostics.error = Some(cause);
                    }
                }
            }
        } else if let Some(path) = env_resolution.env.get("KEYBOARD_DRIVER_PATH") {
            diagnostics.keyboard_driver_source = "运行时解析".to_string();
            diagnostics.keyboard_driver_path = Some(path.clone());
        } else {
            diagnostics.keyboard_driver_source = "未配置".to_string();
        }
    }

    diagnostics.keyboard_driver_exists = diagnostics
        .keyboard_driver_path
        .as_ref()
        .is_some_and(|path| Path::new(path).exists());

    if strict && diagnostics.error.is_none() && !diagnostics.runtime_entry_exists {
        diagnostics.error = Some("AngryMiao runtime entry 不存在。".to_string());
    }

    diagnostics
}

fn resolve_angrymiao_runtime(
    root: Option<&Path>,
    settings: &StoredVoiceSettings,
) -> Result<Option<McpServerConfig>, String> {
    if !settings.angrymiao_skill_enabled {
        return Ok(None);
    }

    let Some(root) = root else {
        return Ok(None);
    };

    let bundle_dir = root.join(ANGRYMIAO_BUNDLE_ID);
    let manifest_path = bundle_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(format!(
            "未找到 AngryMiao skill bundle manifest: {}",
            manifest_path.display()
        ));
    }

    let manifest = load_manifest(&manifest_path)?;
    if !supports_current_platform(&manifest.platforms) {
        return Ok(None);
    }

    let runtime = manifest
        .runtimes
        .into_iter()
        .find(|item| item.id == ANGRYMIAO_RUNTIME_ID)
        .ok_or_else(|| "AngryMiao skill bundle 缺少 system-control runtime。".to_string())?;

    if !supports_current_platform(&runtime.platforms) {
        return Ok(None);
    }

    if runtime.transport != "mcp-stdio" {
        return Err("AngryMiao runtime transport 必须为 mcp-stdio。".to_string());
    }

    if runtime.launcher != "node-script" {
        return Err("AngryMiao runtime launcher 必须为 node-script。".to_string());
    }

    let entry_path = resolve_path_inside(&bundle_dir, &runtime.entry)?;
    if !entry_path.exists() {
        return Err(format!(
            "AngryMiao runtime entry 不存在: {}",
            entry_path.display()
        ));
    }

    let env = resolve_runtime_env(&runtime, &bundle_dir, settings)?;

    Ok(Some(McpServerConfig::stdio(
        runtime.server.id,
        runtime.server.name,
        "node",
        vec![entry_path.display().to_string()],
        env,
    )))
}

fn load_manifest(path: &Path) -> Result<SkillBundleManifest, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|cause| format!("读取 skill bundle manifest 失败: {cause}"))?;

    serde_json::from_str::<SkillBundleManifest>(&raw)
        .map_err(|cause| format!("解析 skill bundle manifest 失败: {cause}"))
}

fn validate_bundle_id(bundle_id: &str) -> Result<(), String> {
    let trimmed = bundle_id.trim();
    if trimmed.is_empty() {
        return Err("skill bundle id 不能为空。".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err(format!("skill bundle id 非法: {bundle_id}"));
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err(format!("skill bundle id 非法: {bundle_id}"));
    }

    Ok(())
}

fn copy_dir_recursively(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target_dir)
        .map_err(|cause| format!("创建 skill bundle 目录失败: {cause}"))?;

    for entry in std::fs::read_dir(source_dir)
        .map_err(|cause| format!("读取 skill bundle 源目录失败: {cause}"))?
    {
        let entry = entry.map_err(|cause| format!("遍历 skill bundle 源目录失败: {cause}"))?;
        let file_type = entry
            .file_type()
            .map_err(|cause| format!("读取 skill bundle 文件类型失败: {cause}"))?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());

        if file_type.is_symlink() {
            return Err(format!(
                "skill bundle 安装暂不支持符号链接: {}",
                source_path.display()
            ));
        }

        if file_type.is_dir() {
            copy_dir_recursively(&source_path, &target_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&source_path, &target_path).map_err(|cause| {
                format!(
                    "复制 skill bundle 文件失败: {} -> {}: {cause}",
                    source_path.display(),
                    target_path.display()
                )
            })?;
        }
    }

    Ok(())
}

fn resolve_runtime_env(
    runtime: &SkillBundleRuntime,
    bundle_dir: &Path,
    settings: &StoredVoiceSettings,
) -> Result<BTreeMap<String, String>, String> {
    let resolution = collect_runtime_env(runtime, bundle_dir, settings)?;

    if resolution.missing_required_env.is_empty() {
        return Ok(resolution.env);
    }

    Err(format!(
        "AngryMiao runtime 缺少必填环境变量 {}。",
        resolution.missing_required_env.join("、")
    ))
}

fn build_inventory_item(
    bundle_dir: &Path,
    manifest: &SkillBundleManifest,
    settings: &StoredVoiceSettings,
) -> Result<SkillBundleInventoryItem, String> {
    let prompt = manifest
        .prompt
        .as_ref()
        .ok_or_else(|| "skill bundle 缺少 prompt.file 配置。".to_string())?;

    let runtimes = manifest
        .runtimes
        .iter()
        .map(|runtime| build_runtime_inventory_item(runtime, bundle_dir, settings))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(SkillBundleInventoryItem {
        id: manifest.id.clone(),
        version: manifest.version.clone(),
        name: manifest.name.clone(),
        description: manifest.description.clone(),
        bundle_dir: bundle_dir.display().to_string(),
        platforms: manifest.platforms.clone(),
        supported_on_current_platform: supports_current_platform(&manifest.platforms),
        is_builtin: manifest.id == ANGRYMIAO_BUNDLE_ID,
        prompt_file: prompt.file.clone(),
        prompt_examples_file: prompt.examples_file.clone(),
        runtimes,
    })
}

fn build_runtime_inventory_item(
    runtime: &SkillBundleRuntime,
    bundle_dir: &Path,
    settings: &StoredVoiceSettings,
) -> Result<SkillBundleRuntimeInventoryItem, String> {
    let resolution = collect_runtime_env(runtime, bundle_dir, settings)?;

    Ok(SkillBundleRuntimeInventoryItem {
        id: runtime.id.clone(),
        name: runtime.name.clone().unwrap_or_else(|| runtime.id.clone()),
        transport: runtime.transport.clone(),
        launcher: runtime.launcher.clone(),
        entry: runtime.entry.clone(),
        server_id: runtime.server.id.clone(),
        server_name: runtime.server.name.clone(),
        platforms: runtime.platforms.clone(),
        supported_on_current_platform: supports_current_platform(&runtime.platforms),
        missing_required_env: resolution.missing_required_env,
        resolved_env: resolution.env,
    })
}

struct RuntimeEnvResolution {
    env: BTreeMap<String, String>,
    missing_required_env: Vec<String>,
}

fn collect_runtime_env(
    runtime: &SkillBundleRuntime,
    bundle_dir: &Path,
    settings: &StoredVoiceSettings,
) -> Result<RuntimeEnvResolution, String> {
    let mut env = BTreeMap::new();
    let mut missing_required_env = Vec::new();

    for binding in &runtime.env {
        let mut value = match binding.source.as_str() {
            "literal" => binding.value.clone().unwrap_or_default(),
            "settings-path" => resolve_setting_path(settings, binding.setting_path.as_deref()),
            _ => String::new(),
        };

        if value.is_empty() {
            if let Some(default_bundle_path) = &binding.default_bundle_path {
                let resolved = resolve_path_inside(bundle_dir, default_bundle_path)?;
                if resolved.exists() {
                    value = resolved.display().to_string();
                }
            }
        }

        if value.is_empty() {
            if binding.required {
                missing_required_env.push(binding.name.clone());
            }
            continue;
        }

        env.insert(binding.name.clone(), value);
    }

    Ok(RuntimeEnvResolution {
        env,
        missing_required_env,
    })
}

fn resolve_setting_path(settings: &StoredVoiceSettings, path: Option<&str>) -> String {
    match path {
        Some("voice.keyboardDriverPath") => settings.keyboard_driver_path.trim().to_string(),
        _ => String::new(),
    }
}

fn supports_current_platform(platforms: &[String]) -> bool {
    if platforms.is_empty() {
        return true;
    }

    let current = current_platform_tag();
    platforms.iter().any(|item| item == current)
}

fn current_platform_tag() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

fn resolve_path_inside(base_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let mut resolved = PathBuf::from(base_dir);

    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(value) => resolved.push(value),
            Component::CurDir => {}
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                return Err(format!("skill bundle 路径越界: {relative_path}"));
            }
        }
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::{
        default_skill_bundle_root, inspect_angrymiao_runtime, install_skill_bundle_from_dir,
        list_installed_skill_bundles, read_skill_bundle_text_file,
        resolve_angrymiao_prompt_assets,
    };
    use settings_core::StoredVoiceSettings;

    #[test]
    fn default_skill_bundle_root_points_inside_voice_app_workspace() {
        let root = default_skill_bundle_root();
        let normalized = root.to_string_lossy().replace('\\', "/");

        assert!(
            normalized.ends_with("/voice-app/skill-bundles"),
            "expected skill bundle root inside voice-app workspace, got {normalized}"
        );
    }

    #[test]
    fn resolves_angrymiao_prompt_assets_from_bundle_files() {
        let bundle_root = tempfile::tempdir().expect("temp dir should exist");
        let bundle_dir = bundle_root.path().join("angrymiao-voice-control");
        std::fs::create_dir_all(bundle_dir.join("docs")).expect("docs dir should exist");
        std::fs::write(
            bundle_dir.join("manifest.json"),
            r#"{
  "id": "angrymiao-voice-control",
  "version": "1.0.0",
  "name": "Angrymiao Voice Control",
  "description": "Voice-command skill bundle",
  "prompt": { "file": "SKILL.md" },
  "platforms": ["darwin", "win32"],
  "runtimes": []
}"#,
        )
        .expect("manifest should exist");
        std::fs::write(bundle_dir.join("SKILL.md"), "# Angrymiao Voice Control")
            .expect("skill should exist");
        std::fs::write(
            bundle_dir.join("docs/keyboard-hid-reference.md"),
            "KeyA => 11070004",
        )
        .expect("hid reference should exist");

        let assets = resolve_angrymiao_prompt_assets(
            Some(bundle_root.path()),
            &StoredVoiceSettings::default(),
        )
        .expect("bundle prompt should resolve")
        .expect("assets should exist");

        assert!(assets.prompt_template.contains("Angrymiao Voice Control"));
        assert!(assets.hid_reference.contains("KeyA => 11070004"));
    }

    #[test]
    fn returns_none_when_angrymiao_skill_is_disabled() {
        let mut settings = StoredVoiceSettings::default();
        settings.angrymiao_skill_enabled = false;

        let assets = resolve_angrymiao_prompt_assets(None, &settings)
            .expect("disabled skill should not fail");

        assert!(assets.is_none());
    }

    #[test]
    fn lists_installed_skill_bundles_and_parses_camel_case_manifest_fields() {
        let bundle_root = tempfile::tempdir().expect("temp dir should exist");
        let bundle_dir = bundle_root.path().join("angrymiao-voice-control");
        std::fs::create_dir_all(bundle_dir.join("docs")).expect("docs dir should exist");
        std::fs::write(
            bundle_dir.join("manifest.json"),
            r#"{
  "id": "angrymiao-voice-control",
  "version": "1.0.0",
  "name": "Angrymiao Voice Control",
  "description": "Voice-command skill bundle",
  "prompt": {
    "file": "SKILL.md",
    "examplesFile": "examples.md"
  },
  "platforms": ["darwin", "win32"],
  "runtimes": [
    {
      "id": "system-control",
      "transport": "mcp-stdio",
      "launcher": "node-script",
      "entry": "runtime/system-control-mcp/dist/index.js",
      "name": "system-control",
      "server": {
        "id": "angrymiao-system-control",
        "name": "system-control"
      },
      "platforms": ["darwin", "win32"],
      "env": [
        {
          "name": "KEYBOARD_DRIVER_PATH",
          "source": "settings-path",
          "settingPath": "voice.keyboardDriverPath",
          "defaultBundlePath": "runtime/system-control-mcp/src/utils/AIKeyBoardDriver.exe",
          "required": false
        }
      ]
    }
  ]
}"#,
        )
        .expect("manifest should exist");
        std::fs::write(bundle_dir.join("SKILL.md"), "# Angrymiao Voice Control")
            .expect("skill should exist");
        std::fs::write(bundle_dir.join("examples.md"), "Example prompt")
            .expect("examples should exist");
        std::fs::create_dir_all(bundle_dir.join("runtime/system-control-mcp/src/utils"))
            .expect("runtime dir should exist");
        std::fs::write(
            bundle_dir.join("runtime/system-control-mcp/src/utils/AIKeyBoardDriver.exe"),
            "driver",
        )
        .expect("driver should exist");
        std::fs::create_dir_all(bundle_dir.join("runtime/system-control-mcp/dist"))
            .expect("dist dir should exist");
        std::fs::write(
            bundle_dir.join("runtime/system-control-mcp/dist/index.js"),
            "console.log('ok')",
        )
        .expect("entry should exist");

        let bundles =
            list_installed_skill_bundles(Some(bundle_root.path()), &StoredVoiceSettings::default())
                .expect("skill bundles should list");

        assert_eq!(bundles.len(), 1);
        assert_eq!(bundles[0].id, "angrymiao-voice-control");
        assert_eq!(bundles[0].prompt_file, "SKILL.md");
        assert_eq!(
            bundles[0].prompt_examples_file.as_deref(),
            Some("examples.md")
        );
        assert_eq!(bundles[0].runtimes[0].id, "system-control");
        let resolved_driver = bundles[0].runtimes[0]
            .resolved_env
            .get("KEYBOARD_DRIVER_PATH")
            .expect("driver env should resolve");
        assert!(resolved_driver.ends_with("AIKeyBoardDriver.exe"));
    }

    #[test]
    fn reads_skill_bundle_text_file_inside_bundle_root() {
        let bundle_root = tempfile::tempdir().expect("temp dir should exist");
        let bundle_dir = bundle_root.path().join("sample-bundle");
        std::fs::create_dir_all(&bundle_dir).expect("bundle dir should exist");
        std::fs::write(
            bundle_dir.join("manifest.json"),
            r#"{
  "id": "sample-bundle",
  "version": "1.0.0",
  "name": "Sample Bundle",
  "description": "Bundle",
  "prompt": { "file": "SKILL.md" },
  "platforms": ["win32"],
  "runtimes": []
}"#,
        )
        .expect("manifest should exist");
        std::fs::write(bundle_dir.join("SKILL.md"), "hello bundle").expect("skill should exist");

        let text =
            read_skill_bundle_text_file(Some(bundle_root.path()), "sample-bundle", "SKILL.md")
                .expect("text file should read");

        assert_eq!(text, "hello bundle");
    }

    #[test]
    fn inspects_angrymiao_runtime_and_reports_bundle_driver_fallback() {
        let bundle_root = tempfile::tempdir().expect("temp dir should exist");
        let bundle_dir = bundle_root.path().join("angrymiao-voice-control");
        std::fs::create_dir_all(bundle_dir.join("runtime/system-control-mcp/src/utils"))
            .expect("driver dir should exist");
        std::fs::create_dir_all(bundle_dir.join("runtime/system-control-mcp/dist"))
            .expect("dist dir should exist");
        std::fs::write(
            bundle_dir.join("manifest.json"),
            r#"{
  "id": "angrymiao-voice-control",
  "version": "1.0.0",
  "name": "Angrymiao Voice Control",
  "description": "Voice-command skill bundle",
  "prompt": { "file": "SKILL.md" },
  "platforms": ["darwin", "win32"],
  "runtimes": [
    {
      "id": "system-control",
      "transport": "mcp-stdio",
      "launcher": "node-script",
      "entry": "runtime/system-control-mcp/dist/index.js",
      "server": {
        "id": "angrymiao-system-control",
        "name": "system-control"
      },
      "env": [
        {
          "name": "KEYBOARD_DRIVER_PATH",
          "source": "settings-path",
          "settingPath": "voice.keyboardDriverPath",
          "defaultBundlePath": "runtime/system-control-mcp/src/utils/AIKeyBoardDriver.exe",
          "required": false
        }
      ]
    }
  ]
}"#,
        )
        .expect("manifest should exist");
        std::fs::write(bundle_dir.join("SKILL.md"), "# Angrymiao Voice Control")
            .expect("skill should exist");
        std::fs::write(
            bundle_dir.join("runtime/system-control-mcp/dist/index.js"),
            "console.log('ok')",
        )
        .expect("runtime entry should exist");
        std::fs::write(
            bundle_dir.join("runtime/system-control-mcp/src/utils/AIKeyBoardDriver.exe"),
            "driver",
        )
        .expect("driver should exist");

        let mut settings = StoredVoiceSettings::default();
        settings.angrymiao_skill_enabled = true;
        let diagnostics = inspect_angrymiao_runtime(Some(bundle_root.path()), &settings);

        assert!(diagnostics.enabled_in_settings);
        assert!(diagnostics.bundle_installed);
        assert!(diagnostics.runtime_entry_exists);
        assert_eq!(
            diagnostics.server_id.as_deref(),
            Some("angrymiao-system-control")
        );
        assert_eq!(diagnostics.keyboard_driver_source, "bundle 默认路径");
        assert!(diagnostics.keyboard_driver_exists);
        assert!(diagnostics.error.is_none());
    }

    #[test]
    fn installs_skill_bundle_into_bundle_root() {
        let source_root = tempfile::tempdir().expect("temp dir should exist");
        let source_dir = source_root.path().join("custom-bundle-source");
        let bundle_root = tempfile::tempdir().expect("temp dir should exist");
        std::fs::create_dir_all(source_dir.join("runtime/custom"))
            .expect("runtime dir should exist");
        std::fs::write(
            source_dir.join("manifest.json"),
            r#"{
  "id": "custom-skill",
  "version": "1.0.0",
  "name": "Custom Skill",
  "description": "Custom bundle",
  "prompt": { "file": "SKILL.md" },
  "platforms": ["win32"],
  "runtimes": [
    {
      "id": "custom-runtime",
      "transport": "mcp-stdio",
      "launcher": "node-script",
      "entry": "runtime/custom/index.js",
      "server": {
        "id": "custom-server",
        "name": "custom-server"
      }
    }
  ]
}"#,
        )
        .expect("manifest should exist");
        std::fs::write(source_dir.join("SKILL.md"), "# Custom Skill").expect("skill should exist");
        std::fs::write(
            source_dir.join("runtime/custom/index.js"),
            "console.log('ok')",
        )
        .expect("runtime entry should exist");

        let item = install_skill_bundle_from_dir(
            Some(bundle_root.path()),
            &source_dir,
            &StoredVoiceSettings::default(),
        )
        .expect("install should succeed");

        assert_eq!(item.id, "custom-skill");
        assert!(bundle_root
            .path()
            .join("custom-skill/manifest.json")
            .exists());
    }
}
