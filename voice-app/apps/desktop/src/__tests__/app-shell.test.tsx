import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from '../App'
import { startMicrophoneCapture, stopMicrophoneCapture } from '../lib/tauri'
import { setRuntimeSnapshotForTest } from '../test/setup'

async function openMainPanel(name: '首页' | '历史记录' | '设置' | '日志') {
  fireEvent.click(await screen.findByRole('button', { name }))
}

async function openSettingsSection(name: '通用' | '快捷键' | '语音' | '模型' | 'MCP') {
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('App shell', () => {
  it('renders the main menu and shows only the runtime panel by default', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '历史记录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '日志' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '首页' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '历史记录' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '设置' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '日志' })).toBeNull()
  })

  it('renders the redesigned runtime home hero by default', () => {
    render(<App />)

    expect(screen.getByText('自然说话，直接完成识别与执行')).toBeInTheDocument()
  })

  it('switches the main content area through the menu', async () => {
    render(<App />)

    await openMainPanel('设置')
    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '首页' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '历史记录' })).toBeNull()

    await openMainPanel('历史记录')
    expect(await screen.findByRole('heading', { name: '历史记录' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '设置' })).toBeNull()

    await openMainPanel('日志')
    expect(await screen.findByRole('heading', { name: '日志' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '历史记录' })).toBeNull()
  })

  it('does not render or request an unused app mode', async () => {
    render(<App />)

    expect(screen.queryByText('background-agent')).toBeNull()
    await waitFor(() => {
      expect(invoke).not.toHaveBeenCalledWith('get_app_mode')
    })
  })

  it('loads the chinese runtime phase from tauri runtime', async () => {
    render(<App />)

    expect((await screen.findAllByText('待命中')).length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_runtime_snapshot')
    })
  })

  it('loads and renders platform diagnostics and mcp runtime diagnostics in the runtime section', async () => {
    render(<App />)

    const runtimeSection = screen.getByRole('heading', { name: '首页' }).closest('section')

    expect(runtimeSection).not.toBeNull()

    const section = within(runtimeSection as HTMLElement)
    expect(await section.findByText('当前平台')).toBeInTheDocument()
    expect(section.getByText('Windows')).toBeInTheDocument()
    expect(section.getByText('麦克风')).toBeInTheDocument()
    expect(section.getAllByText('可用').length).toBeGreaterThan(0)
    expect(
      section.getByText('如无法录音，请检查系统设置中的麦克风权限。'),
    ).toBeInTheDocument()
    expect(section.getByText('麦克风权限')).toBeInTheDocument()
    expect(section.getByText('待验证')).toBeInTheDocument()
    expect(section.getByText('开机自启动')).toBeInTheDocument()
    expect(section.getByText('未开启')).toBeInTheDocument()
    expect(section.getByText('Deep Link')).toBeInTheDocument()
    expect(section.getByText('voice-app:// 已注册')).toBeInTheDocument()
    expect(section.getByText('MCP 服务')).toBeInTheDocument()
    expect(section.getByText('1/1')).toBeInTheDocument()
    expect(section.getByText('AngryMiao Runtime')).toBeInTheDocument()
    expect(section.getAllByText('未启用').length).toBeGreaterThan(0)
    expect(section.getByText('MCP Runtime')).toBeInTheDocument()
    expect(section.getByText('已配置 1 个 server，当前活跃 1 个。')).toBeInTheDocument()
    expect(section.getByText(/内置 skill bundle/)).toBeInTheDocument()
    expect(section.getByText('mcp__system-control__type_text')).toBeInTheDocument()
    expect(section.getByText(/bundle 默认路径/)).toBeInTheDocument()
    expect(section.getByText(/AIKeyBoardDriver\.exe/)).toBeInTheDocument()

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_platform_diagnostics')
      expect(invoke).toHaveBeenCalledWith('get_runtime_diagnostics')
    })
  })

  it('captures a microphone task and renders streaming to completed snapshots', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '开始录音' }))
    expect((await screen.findAllByText('正在聆听')).length).toBeGreaterThan(0)
    expect(await screen.findByText('实时片段')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '结束录音' }))

    expect((await screen.findAllByText('正在识别')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('正在生成')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('正在输出')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('最终识别结果')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('已将文本输出到当前输入位置。')).length).toBeGreaterThan(
      0,
    )
  })

  it('renders overlay chrome instead of the main shell in the overlay window', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(() => ({ label: 'overlay' } as never))

    const { container } = render(<App />)

    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('按住语音快捷键开始输入')).toBeNull()
    expect(screen.queryByText('实时识别')).toBeNull()
    expect(screen.queryByText('LISTEN')).toBeNull()
    expect(container.querySelector('.typeless-overlay-handle-right')).toBeNull()
    expect(container.querySelectorAll('.typeless-overlay-wave-bar')).toHaveLength(5)
    expect(screen.queryByText('历史记录')).toBeNull()
    expect(screen.queryByText('设置')).toBeNull()
  })

  it('uses a pen icon for transcription mode in the overlay window', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(() => ({ label: 'overlay' } as never))
    setRuntimeSnapshotForTest({
      phase: '正在聆听',
      transcript: '这是转录中的实时文本',
      result: '',
      detail: '正在接收语音输入。',
      input_mode: 'transcription',
      result_window_mode: 'hidden',
    })

    const { container } = render(<App />)

    expect(await screen.findByText('这是转录中的实时文本')).toBeInTheDocument()
    expect(container.querySelector('.typeless-overlay-handle-left')?.textContent).toBe('✎')
  })

  it('keeps the default listening icon for agent mode in the overlay window', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(() => ({ label: 'overlay' } as never))
    setRuntimeSnapshotForTest({
      phase: '正在聆听',
      transcript: '',
      result: '',
      detail: '正在接收语音输入。',
      input_mode: 'agent',
      result_window_mode: 'auto',
    })

    const { container } = render(<App />)

    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(container.querySelector('.typeless-overlay-handle-left')?.textContent).toBe('●')
  })

  it('renders result chrome instead of the main shell in the result window', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(
      () => ({ label: 'result', hide: vi.fn() }) as never,
    )

    render(<App />)

    expect(await screen.findByText('识别内容')).toBeInTheDocument()
    expect(screen.queryByText('等待下一次语音任务。')).toBeNull()
    expect(screen.queryByText('待命中')).toBeNull()
    expect(screen.queryByText('结果会自动写入历史记录，供后续预览和重试。')).toBeNull()
    expect(screen.getByText('识别内容')).toBeInTheDocument()
    expect(screen.getByText('执行结果')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭结果窗口' })).toBeInTheDocument()
    expect(screen.queryByText('首页')).toBeNull()
  })

  it('hides the result window when the close button is clicked', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(
      () => ({ label: 'result', close: vi.fn(), hide: vi.fn() }) as never,
    )

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '关闭结果窗口' }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('dismiss_runtime_result')
    })
  })

  it('renders editable settings fields from the runtime', async () => {
    render(<App />)
    await openMainPanel('设置')

    const settingsSection = screen.getByRole('heading', { name: '设置' }).closest('section')

    expect(settingsSection).not.toBeNull()

    const section = within(settingsSection as HTMLElement)
    expect(await screen.findByRole('button', { name: '通用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '快捷键' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '语音' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '模型' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MCP' })).toBeInTheDocument()
    expect(section.getByText('开机自启动')).toBeInTheDocument()
    expect(section.queryByLabelText('豆包 App ID')).toBeNull()

    await openSettingsSection('快捷键')
    expect(await section.findByDisplayValue('RightAlt')).toBeInTheDocument()
    expect(section.getByRole('button', { name: '录制默认热键' })).toBeInTheDocument()
    expect(section.queryByLabelText('工作模式')).toBeNull()

    await openSettingsSection('语音')
    expect(await section.findByLabelText('豆包 App ID')).toBeInTheDocument()
    expect(section.getByLabelText('默认麦克风')).toBeInTheDocument()
    expect(section.getByRole('button', { name: '刷新设备列表' })).toBeInTheDocument()
    expect(section.getByLabelText('转录静音自动结束（ms）')).toBeInTheDocument()
    expect(section.queryByLabelText('音频位深')).toBeNull()

    await openSettingsSection('模型')
    expect(await section.findByLabelText('LLM API Key')).toHaveAttribute('type', 'password')

    await openSettingsSection('MCP')
    expect(await section.findByLabelText('启用 AngryMiao 系统控制')).toBeInTheDocument()
    expect(section.getByLabelText('键盘驱动路径')).toBeInTheDocument()
    expect(section.getByText('键盘控制')).toBeInTheDocument()
    expect(section.getByRole('button', { name: '添加快捷键' })).toBeInTheDocument()
    expect(section.getByText('已安装 Skill Bundles')).toBeInTheDocument()
    expect(section.getByText('Angrymiao Voice Control')).toBeInTheDocument()
    expect(section.getByText('system-control')).toBeInTheDocument()
    expect(await section.findByLabelText('MCP 服务 JSON')).toBeInTheDocument()
    expect(section.queryByRole('button', { name: '从 .env 重新导入' })).toBeNull()
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_editable_settings')
    })
  })

  it('installs a skill bundle from a local directory path and refreshes the list', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('MCP')

    fireEvent.change(await screen.findByLabelText('Skill Bundle 目录路径'), {
      target: { value: 'D:/bundles/custom-skill' },
    })
    fireEvent.click(screen.getByRole('button', { name: '安装 Bundle' }))

    expect(await screen.findByText('已安装 Skill Bundle：Custom Skill。')).toBeInTheDocument()
    expect(screen.getByText('Custom Skill')).toBeInTheDocument()

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'install_skill_bundle',
        expect.objectContaining({
          bundleSourceDir: 'D:/bundles/custom-skill',
        }),
      )
    })
  })

  it('records the default hotkey and saves it in exact voice-hotkey format', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('快捷键')

    fireEvent.click(await screen.findByRole('button', { name: '录制默认热键' }))
    expect(screen.getByDisplayValue('请按住默认热键...')).toHaveFocus()
    fireEvent.keyDown(window, { code: 'AltRight', key: 'Alt' })
    fireEvent.keyUp(window, { code: 'AltRight', key: 'Alt' })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'save_editable_settings',
        expect.objectContaining({
          input: expect.objectContaining({
            default_hotkey: 'RightAlt',
          }),
        }),
      )
    })
  })

  it('saves edited settings without clearing unchanged secrets', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('模型')

    fireEvent.change(await screen.findByLabelText('LLM 模型'), {
      target: { value: 'gpt-4.1-mini' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'save_editable_settings',
        expect.objectContaining({
          input: expect.objectContaining({
            llm_model: 'gpt-4.1-mini',
            angrymiao_skill_enabled: false,
            keyboard_driver_path: '',
            keyboard_shortcuts: expect.any(Array),
            mcp_servers_json: expect.any(String),
            llm_api_key: expect.objectContaining({ action: 'unchanged' }),
            doubao_asr_access_token: expect.objectContaining({
              action: 'unchanged',
            }),
          }),
        }),
      )
    })
  })

  it('saves the selected microphone preference from voice settings', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('语音')

    fireEvent.change(await screen.findByLabelText('默认麦克风'), {
      target: { value: 'usb-mic' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'save_editable_settings',
        expect.objectContaining({
          input: expect.objectContaining({
            microphone_device_id: 'usb-mic',
          }),
        }),
      )
    })
  })

  it('reloads persisted settings after a failed save rolls back on the backend', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('快捷键')

    const invokeMock = vi.mocked(invoke)
    const originalImplementation = invokeMock.getMockImplementation()
    expect(originalImplementation).toBeDefined()

    const getEditableSettingsCallsBeforeFailure = invokeMock.mock.calls.filter(
      ([command]) => command === 'get_editable_settings',
    ).length

    try {
      invokeMock.mockImplementation(async (command, payload) => {
        if (command === 'save_editable_settings') {
          throw new Error('注册全局热键失败: 热键已被占用')
        }

        return originalImplementation?.(command, payload)
      })

      fireEvent.click(await screen.findByRole('button', { name: '录制默认热键' }))
      fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
      fireEvent.keyDown(window, { code: 'ShiftLeft', key: 'Shift' })
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

      expect(
        await screen.findByText('注册全局热键失败: 热键已被占用'),
      ).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByDisplayValue('RightAlt')).toBeInTheDocument()
      })

      await waitFor(() => {
        const getEditableSettingsCallsAfterFailure = invokeMock.mock.calls.filter(
          ([command]) => command === 'get_editable_settings',
        ).length
        expect(getEditableSettingsCallsAfterFailure).toBeGreaterThan(
          getEditableSettingsCallsBeforeFailure,
        )
      })
    } finally {
      invokeMock.mockImplementation(originalImplementation!)
    }
  })

  it('shows string error details from the backend instead of generic save failure text', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('快捷键')

    const invokeMock = vi.mocked(invoke)
    const originalImplementation = invokeMock.getMockImplementation()
    expect(originalImplementation).toBeDefined()

    try {
      invokeMock.mockImplementation(async (command, payload) => {
        if (command === 'save_editable_settings') {
          throw '当前热键为单独修饰键，仅原生键盘 Hook 支持；请改用组合键或恢复原生 Hook。'
        }

        return originalImplementation?.(command, payload)
      })

      fireEvent.click(await screen.findByRole('button', { name: '录制默认热键' }))
      fireEvent.keyDown(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.keyUp(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

      expect(
        await screen.findByText(
          '当前热键为单独修饰键，仅原生键盘 Hook 支持；请改用组合键或恢复原生 Hook。',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText('设置操作失败。')).toBeNull()
    } finally {
      invokeMock.mockImplementation(originalImplementation!)
    }
  })

  it('shows save warnings when runtime hotkey reload cannot take effect immediately', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('快捷键')

    const invokeMock = vi.mocked(invoke)
    const originalImplementation = invokeMock.getMockImplementation()
    expect(originalImplementation).toBeDefined()

    try {
      invokeMock.mockImplementation(async (command, payload) => {
        if (command === 'save_editable_settings') {
          return {
            settings: {
              ...(await originalImplementation?.('get_editable_settings')),
              default_hotkey: 'LeftAlt',
            },
            warnings: [
              '热键已保存，但当前系统无法立即启用：单独修饰键仅原生键盘 Hook 支持。',
            ],
          }
        }

        return originalImplementation?.(command, payload)
      })

      fireEvent.click(await screen.findByRole('button', { name: '录制默认热键' }))
      fireEvent.keyDown(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.keyUp(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

      expect(
        await screen.findByText(
          '设置已保存，但以下项目未即时生效：热键已保存，但当前系统无法立即启用：单独修饰键仅原生键盘 Hook 支持。',
        ),
      ).toBeInTheDocument()
    } finally {
      invokeMock.mockImplementation(originalImplementation!)
    }
  })

  it('shows setup warning when required credentials are missing but does not block saving', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('模型')

    const llmSection = (await screen.findByText('OpenAI-compatible LLM')).closest(
      'fieldset',
    )

    expect(llmSection).not.toBeNull()

    fireEvent.click(
      within(llmSection as HTMLElement).getByRole('button', { name: '清空密钥' }),
    )

    expect(
      await screen.findByText('当前语音任务还不能运行，请补齐：LLM API Key。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).not.toBeDisabled()
  })

  it('adds a custom keyboard shortcut and includes it in the saved settings', async () => {
    render(<App />)
    await openMainPanel('设置')
    await openSettingsSection('MCP')

    fireEvent.click(await screen.findByRole('button', { name: '添加快捷键' }))
    fireEvent.change(await screen.findByLabelText('触发词（逗号分隔）'), {
      target: { value: '截图' },
    })

    fireEvent.click(screen.getByRole('button', { name: '录制' }))
    expect(screen.getByDisplayValue('请按下快捷键...')).toHaveFocus()
    fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
    fireEvent.keyDown(window, { code: 'KeyK', key: 'k' })
    fireEvent.keyUp(window, { code: 'KeyK', key: 'k' })

    fireEvent.click(screen.getByRole('button', { name: '确认添加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'save_editable_settings',
        expect.objectContaining({
          input: expect.objectContaining({
            keyboard_shortcuts: expect.arrayContaining([
              expect.objectContaining({
                trigger_words: ['截图'],
                recorded_keys: ['ControlLeft', 'KeyK'],
              }),
            ]),
          }),
        }),
      )
    })
  })

  it('shows field validation errors and blocks saving invalid settings', async () => {
    render(<App />)
    await openMainPanel('设置')

    await openSettingsSection('快捷键')
    fireEvent.click(await screen.findByRole('button', { name: '录制默认热键' }))
    fireEvent.keyDown(window, { code: 'Backspace', key: 'Backspace' })

    await openSettingsSection('语音')
    fireEvent.change(await screen.findByLabelText('转录静音自动结束（ms）'), {
      target: { value: '200' },
    })

    await openSettingsSection('MCP')
    fireEvent.change(await screen.findByLabelText('MCP 服务 JSON'), {
      target: { value: '[{"id":"","name":"Broken"}]' },
    })
    vi.mocked(invoke).mockClear()

    expect(await screen.findByText('MCP 服务 JSON 格式无效。')).toBeInTheDocument()

    await openSettingsSection('快捷键')
    expect(await screen.findByText('默认热键不能为空。')).toBeInTheDocument()

    await openSettingsSection('语音')
    expect(
      await screen.findByText('转录静音自动结束需为 0 或 500 到 5000 毫秒。'),
    ).toBeInTheDocument()

    await openSettingsSection('MCP')
    expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled()

    await waitFor(() => {
      expect(invoke).not.toHaveBeenCalledWith(
        'save_editable_settings',
        expect.anything(),
      )
    })
  })

  it('renders the final transcript and result in the result window', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(
      () => ({ label: 'result', hide: vi.fn() }) as never,
    )

    render(<App />)

    await act(async () => {
      await startMicrophoneCapture()
      await stopMicrophoneCapture()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(await screen.findByText('执行结果')).toBeInTheDocument()
    expect(await screen.findByText('识别内容')).toBeInTheDocument()
    expect(await screen.findByText('最终识别结果')).toBeInTheDocument()
    expect(await screen.findByText('已将文本输出到当前输入位置。')).toBeInTheDocument()
  })

  it('renders history detail, chinese status, and completed time after a task finishes', async () => {
    render(<App />)

    await act(async () => {
      await startMicrophoneCapture()
      await stopMicrophoneCapture()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await openMainPanel('历史记录')

    const historySection = screen.getByRole('heading', { name: '历史记录' }).closest('section')

    expect(historySection).not.toBeNull()

    const section = within(historySection as HTMLElement)
    expect((await section.findAllByText('已完成')).length).toBeGreaterThan(0)
    expect(await section.findByText('完成时间')).toBeInTheDocument()
    expect(section.getByText('2026-04-05 14:12:00')).toBeInTheDocument()
    expect(section.getByText('详情')).toBeInTheDocument()
    expect(section.getByText('本地工具执行已完成。')).toBeInTheDocument()
  })

  it('filters, previews, and retries history records', async () => {
    render(<App />)

    await act(async () => {
      await startMicrophoneCapture()
      await stopMicrophoneCapture()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await openMainPanel('历史记录')

    fireEvent.change(await screen.findByLabelText('搜索历史记录'), {
      target: { value: '最终识别结果' },
    })

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'query_history_records',
        expect.objectContaining({ keyword: '最终识别结果', status: undefined }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    expect(await screen.findByText('已预览任务 #1。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重新生成' }))
    expect(await screen.findByText('已开始重试任务 #1。')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '预览' }).length).toBeGreaterThan(1)
    })
  })

  it('filters, exports, and clears runtime logs', async () => {
    render(<App />)
    await openMainPanel('日志')

    fireEvent.change(await screen.findByLabelText('日志级别'), {
      target: { value: 'info' },
    })
    fireEvent.change(screen.getByLabelText('筛选日志'), {
      target: { value: '语音运行时' },
    })

    expect(await screen.findByText('语音运行时已就绪。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '导出日志' }))
    expect(
      await screen.findByText(
        '运行日志已导出到 C:/voice-app/runtime-logs-2026-04-06.log。',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清空日志' }))
    expect(await screen.findByText('运行日志已清空。')).toBeInTheDocument()
  })

  it('keeps the overlay visible while waiting for llm generation to finish', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(() => ({ label: 'overlay' } as never))

    render(<App />)

    await act(async () => {
      await startMicrophoneCapture()
      await stopMicrophoneCapture()
    })

    await waitFor(() => {
      const overlay = screen.getByRole('status')
      expect(overlay.getAttribute('aria-label')).toMatch(/正在生成|已完成/)
    })
  })
})
