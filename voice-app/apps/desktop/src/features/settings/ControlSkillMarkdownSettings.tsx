import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type ControlSkillMarkdownSettingsProps = {
  value: string
  onChange: (value: string) => void
}

const DEFAULT_CONTROL_SKILL_EXAMPLE = `# 我的控制技能

刷新页面时用 F5
复制时用 Ctrl+C
粘贴时用 Ctrl+V
剪切时用 Ctrl+X
撤销时用 Ctrl+Z
重做时用 Ctrl+Y
全选时用 Ctrl+A
保存时用 Ctrl+S
回车时用 Enter
删除时用 Backspace
Tab 时用 Tab
切换窗口时用 Alt+Tab
取消时用 Escape

按住 Shift 时持续按住 Shift，直到我说松开 Shift。
清除当前所有按键状态时，释放所有正在按住的键并恢复初始状态。

如果涉及危险操作，先征求确认。
打开网页时优先使用 Edge。`

function insertExample(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return DEFAULT_CONTROL_SKILL_EXAMPLE
  }

  return `${value.replace(/\s+$/, '')}\n\n${DEFAULT_CONTROL_SKILL_EXAMPLE}`
}

export function ControlSkillMarkdownSettings({
  value,
  onChange,
}: ControlSkillMarkdownSettingsProps) {
  return (
    <div className="settings-input-card settings-input-card-wide control-skill-card">
      <div className="control-skill-header">
        <div className="control-skill-copy">
          <span className="settings-input-title">控制 Skill 指令</span>
          <p className="control-skill-hint">
            这里的文本会进入运行时系统提示。可以写快捷键语义、浏览器偏好、
            确认规则等。
          </p>
        </div>
        <div className="control-skill-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(insertExample(value))}
          >
            插入示例
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(DEFAULT_CONTROL_SKILL_EXAMPLE)}
          >
            恢复默认示例
          </Button>
        </div>
      </div>

      <Textarea
        aria-label="控制 Skill 指令"
        className="settings-textarea-field control-skill-editor"
        placeholder={DEFAULT_CONTROL_SKILL_EXAMPLE}
        rows={12}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />

      <div className="control-skill-note" role="note">
        保存时不会解析或编译这段 Markdown；系统级高风险操作规则仍高于这里的自定义内容。
      </div>
    </div>
  )
}
