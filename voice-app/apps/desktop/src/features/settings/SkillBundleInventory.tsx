import { useEffect, useState } from 'react'
import {
  installSkillBundle,
  listSkillBundles,
  readSkillBundleText,
  type SkillBundleInventoryItem,
} from '../../lib/tauri'

type LoadStatus = 'loading' | 'idle' | 'error'

export function SkillBundleInventory() {
  const [bundles, setBundles] = useState<SkillBundleInventoryItem[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null)
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({})
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  const [installPath, setInstallPath] = useState('')
  const [installMessage, setInstallMessage] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    void loadBundles()
  }, [])

  async function loadBundles() {
    setStatus('loading')
    setMessage(null)

    try {
      const nextBundles = await listSkillBundles()
      setBundles(nextBundles)
      setStatus('idle')
    } catch (cause) {
      const nextMessage =
        cause instanceof Error ? cause.message : '读取 Skill Bundle 列表失败。'
      setBundles([])
      setStatus('error')
      setMessage(nextMessage)
    }
  }

  async function togglePromptPreview(bundle: SkillBundleInventoryItem) {
    if (expandedBundleId === bundle.id) {
      setExpandedBundleId(null)
      setPreviewError(null)
      return
    }

    setExpandedBundleId(bundle.id)
    setPreviewError(null)

    if (previewCache[bundle.id]) {
      return
    }

    try {
      setPreviewLoadingId(bundle.id)
      const text = await readSkillBundleText(bundle.id, bundle.prompt_file)
      setPreviewCache((current) => ({ ...current, [bundle.id]: text }))
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : '读取 Skill Bundle 文本失败。')
    } finally {
      setPreviewLoadingId(null)
    }
  }

  async function handleInstallBundle() {
    const trimmedPath = installPath.trim()
    if (!trimmedPath) {
      setInstallError('请先输入待安装 Skill Bundle 的本地目录路径。')
      setInstallMessage(null)
      return
    }

    try {
      setInstalling(true)
      setInstallError(null)
      setInstallMessage(null)
      const installed = await installSkillBundle(trimmedPath)
      setInstallPath('')
      setInstallMessage(`已安装 Skill Bundle：${installed.name}。`)
      await loadBundles()
    } catch (cause) {
      setInstallError(cause instanceof Error ? cause.message : '安装 Skill Bundle 失败。')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <section className="skill-bundle-panel">
      <div className="shortcut-settings-header">
        <h3>已安装 Skill Bundles</h3>
        <div className="settings-inline-actions">
          <button type="button" onClick={() => void loadBundles()}>
            刷新列表
          </button>
        </div>
      </div>

      <div className="settings-field settings-field-wide">
        <span>安装本地 Skill Bundle</span>
        <div className="settings-inline-form">
          <input
            aria-label="Skill Bundle 目录路径"
            placeholder="输入待安装 bundle 的本地目录路径"
            value={installPath}
            onChange={(event) => setInstallPath(event.target.value)}
          />
          <button
            aria-label="安装 Bundle"
            type="button"
            disabled={installing}
            onClick={() => void handleInstallBundle()}
          >
            {installing ? '安装中...' : '安装 Bundle'}
          </button>
        </div>
      </div>
      {installMessage ? (
        <p className="settings-feedback" role="status">
          {installMessage}
        </p>
      ) : null}
      {installError ? (
        <p className="runtime-error" role="alert">
          {installError}
        </p>
      ) : null}

      {status === 'loading' ? <p className="settings-hint">正在读取 Skill Bundle...</p> : null}
      {status === 'error' && message ? (
        <p className="runtime-error" role="alert">
          {message}
        </p>
      ) : null}
      {status === 'idle' && bundles.length === 0 ? (
        <p className="settings-hint">当前未发现可用的本地 Skill Bundle。</p>
      ) : null}

      {bundles.length > 0 ? (
        <div className="skill-bundle-list">
          {bundles.map((bundle) => (
            <article key={bundle.id} className="skill-bundle-card">
              <div className="skill-bundle-card-header">
                <div>
                  <h4>{bundle.name}</h4>
                  <p>{bundle.description}</p>
                </div>
                <div className="skill-bundle-badges">
                  {bundle.is_builtin ? <span>内置</span> : null}
                  <span>
                    {bundle.supported_on_current_platform ? '当前平台可用' : '当前平台不支持'}
                  </span>
                </div>
              </div>

              <div className="skill-bundle-meta">
                <div>
                  <span>Bundle ID</span>
                  <strong>{bundle.id}</strong>
                </div>
                <div>
                  <span>版本</span>
                  <strong>{bundle.version}</strong>
                </div>
                <div>
                  <span>平台</span>
                  <strong>{bundle.platforms.join(', ') || '全部'}</strong>
                </div>
                <div>
                  <span>提示词</span>
                  <strong>{bundle.prompt_file}</strong>
                </div>
              </div>

              {bundle.prompt_examples_file ? (
                <p className="settings-hint">
                  示例文件：{bundle.prompt_examples_file}
                </p>
              ) : null}

              <div className="skill-bundle-runtime-list">
                {bundle.runtimes.map((runtime) => (
                  <div key={`${bundle.id}-${runtime.id}`} className="skill-bundle-runtime">
                    <div>
                      <strong>{runtime.name}</strong>
                      <span>
                        {runtime.transport} / {runtime.launcher}
                      </span>
                    </div>
                    <p>
                      server: {runtime.server_name} ({runtime.server_id})
                    </p>
                    {runtime.missing_required_env.length > 0 ? (
                      <p className="shortcut-warning">
                        缺少环境变量：{runtime.missing_required_env.join('、')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="settings-inline-actions">
                <button type="button" onClick={() => void togglePromptPreview(bundle)}>
                  {expandedBundleId === bundle.id ? '收起 SKILL.md' : '查看 SKILL.md'}
                </button>
              </div>

              {expandedBundleId === bundle.id ? (
                <div className="skill-bundle-preview">
                  {previewLoadingId === bundle.id ? (
                    <p className="settings-hint">正在读取提示词...</p>
                  ) : null}
                  {previewError ? (
                    <p className="runtime-error" role="alert">
                      {previewError}
                    </p>
                  ) : null}
                  {previewCache[bundle.id] ? <pre>{previewCache[bundle.id]}</pre> : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
