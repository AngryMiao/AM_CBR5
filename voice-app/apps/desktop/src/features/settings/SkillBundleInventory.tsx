import { useEffect, useState } from 'react'
import {
  installSkillBundle,
  listSkillBundles,
  readSkillBundleText,
  pickFolder,
  type SkillBundleInventoryItem,
} from '../../lib/tauri'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  FolderOpen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'

type SkillBundleInventoryProps = {
  skillEnabled: boolean
  onSkillEnabledChange: (value: boolean) => void
  disabled?: boolean
}

export function SkillBundleInventory({
  skillEnabled,
  onSkillEnabledChange,
  disabled = false,
}: SkillBundleInventoryProps) {
  const [bundles, setBundles] = useState<SkillBundleInventoryItem[]>([])
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
    try {
      const nextBundles = await listSkillBundles()
      setBundles(nextBundles)
    } catch {
      setBundles([])
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
      setPreviewError(cause instanceof Error ? cause.message : '读取技能包文本失败。')
    } finally {
      setPreviewLoadingId(null)
    }
  }

  async function handleInstallBundle() {
    const trimmedPath = installPath.trim()
    if (!trimmedPath) {
      setInstallError('请先输入待安装技能包的本地目录路径。')
      setInstallMessage(null)
      return
    }

    try {
      setInstalling(true)
      setInstallError(null)
      setInstallMessage(null)
      const installed = await installSkillBundle(trimmedPath)
      setInstallPath('')
      setInstallMessage(`已安装技能包：${installed.name}。`)
      await loadBundles()
    } catch (cause) {
      setInstallError(cause instanceof Error ? cause.message : '安装技能包失败。')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <>
      {/* Skill Bundle Cards */}
      <div className="skill-bundle-list">
        {bundles.map((bundle) => (
          <article key={bundle.id} className="skill-bundle-card">
            {/* Header with toggle */}
            <div className="skill-bundle-card-header">
              <div className="skill-bundle-card-info">
                <div className="skill-bundle-enable-row">
                  <Switch
                    aria-label={`启用 ${bundle.name}`}
                    checked={skillEnabled}
                    disabled={disabled}
                    onCheckedChange={onSkillEnabledChange}
                  />
                  <h4 className="skill-bundle-card-name">{bundle.name}</h4>
                </div>
                <p className="skill-bundle-card-desc">{bundle.description}</p>
              </div>
              <div className="skill-bundle-card-badges">
                {bundle.is_builtin ? (
                  <Badge variant="secondary" className="skill-bundle-badge">
                    内置
                  </Badge>
                ) : null}
                <Badge
                  variant={bundle.supported_on_current_platform && skillEnabled ? 'default' : 'outline'}
                  className={`skill-bundle-badge ${bundle.supported_on_current_platform && skillEnabled ? 'skill-bundle-badge-success' : 'skill-bundle-badge-warning'}`}
                >
                  {bundle.supported_on_current_platform && skillEnabled ? (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  )}
                  {skillEnabled ? '已启用' : '未启用'}
                </Badge>
              </div>
            </div>

            {/* Meta info */}
            <div className="skill-bundle-card-meta">
              <div className="skill-bundle-meta-item">
                <span className="skill-bundle-meta-label">版本</span>
                <span className="skill-bundle-meta-value">{bundle.version}</span>
              </div>
              <div className="skill-bundle-meta-item">
                <span className="skill-bundle-meta-label">支持平台</span>
                <span className="skill-bundle-meta-value">{bundle.platforms.join(', ') || '全部'}</span>
              </div>
            </div>

            {/* Preview Toggle */}
            <button
              className="skill-bundle-preview-toggle"
              type="button"
              onClick={() => void togglePromptPreview(bundle)}
            >
              {expandedBundleId === bundle.id ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span>{expandedBundleId === bundle.id ? '收起技能说明' : '查看技能说明'}</span>
            </button>

            {/* Preview Content */}
            {expandedBundleId === bundle.id ? (
              <div className="skill-bundle-preview">
                {previewLoadingId === bundle.id ? (
                  <div className="settings-loading-state">
                    <div className="settings-loading-spinner" />
                    <span>正在读取提示词...</span>
                  </div>
                ) : null}
                {previewError ? (
                  <div className="settings-error-state">
                    <AlertCircle className="h-4 w-4" />
                    <span>{previewError}</span>
                  </div>
                ) : null}
                {previewCache[bundle.id] ? (
                  <pre className="skill-bundle-preview-content">{previewCache[bundle.id]}</pre>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {/* Install new skill bundle */}
      <div className="settings-input-card">
        <span className="settings-input-title">安装新技能包</span>
        <div className="settings-path-input-row">
          <Input
            aria-label="技能包目录路径"
            className="settings-path-input"
            placeholder="输入技能包的本地目录路径"
            value={installPath}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setInstallPath(event.target.value)}
          />
          <Button
            variant="outline"
            type="button"
            className="settings-path-btn"
            onClick={() => {
              void pickFolder('选择技能包目录').then((path) => {
                if (path) {
                  setInstallPath(path)
                }
              })
            }}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            className="settings-install-btn"
            disabled={installing || !installPath.trim()}
            onClick={() => void handleInstallBundle()}
          >
            {installing ? '安装中...' : '安装'}
          </Button>
        </div>
        {installMessage ? (
          <p className="settings-feedback-success">{installMessage}</p>
        ) : null}
        {installError ? (
          <p className="settings-feedback-error">{installError}</p>
        ) : null}
      </div>
    </>
  )
}
