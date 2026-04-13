import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ControlSkillMarkdownSettings } from './ControlSkillMarkdownSettings'

function TestHarness() {
  const [value, setValue] = useState('')

  return <ControlSkillMarkdownSettings value={value} onChange={setValue} />
}

describe('ControlSkillMarkdownSettings', () => {
  it('restores a complete default control skill example', () => {
    render(<TestHarness />)

    fireEvent.click(screen.getByRole('button', { name: '恢复默认示例' }))

    const editor = screen.getByLabelText('控制 Skill 指令') as HTMLTextAreaElement
    expect(editor.value).toContain('刷新页面时用 F5')
    expect(editor.value).toContain('复制时用 Ctrl+C')
    expect(editor.value).toContain('粘贴时用 Ctrl+V')
    expect(editor.value).toContain('剪切时用 Ctrl+X')
    expect(editor.value).toContain('撤销时用 Ctrl+Z')
    expect(editor.value).toContain('重做时用 Ctrl+Y')
    expect(editor.value).toContain('全选时用 Ctrl+A')
    expect(editor.value).toContain('保存时用 Ctrl+S')
    expect(editor.value).toContain('切换窗口时用 Alt+Tab')
    expect(editor.value).toContain('取消时用 Escape')
    expect(editor.value).toContain('如果涉及危险操作，先征求确认。')
    expect(editor.value).toContain('打开网页时优先使用 Edge。')
  })
})
