import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from '../App'
import { startMicrophoneCapture, stopMicrophoneCapture } from '../lib/tauri'
import { setRuntimeSnapshotForTest } from '../test/setup'

async function openMainPanel(name: '首页' | '历史记录' | '设置' | '日志') {
  fireEvent.click(await screen.findByRole('button', { name }))

  const targetPanel =
    name === '首页'
      ? 'runtime'
      : name === '历史记录'
        ? 'history'
        : name === '设置'
          ? 'settings'
          : 'logs'

  await waitFor(() => {
    expect(getPanel(targetPanel)).toBeInTheDocument()
  })

  return within(getPanel(targetPanel))
}

async function openSettingsSection(name: '通用' | '快捷键' | '语音' | '模型' | 'MCP') {
  const section = within(getPanel('settings'))
  const tabLabel =
    name === '语音' ? 'ASR' : name === '模型' ? '模型' : name
  fireEvent.click(await section.findByRole('tab', { name: tabLabel }))

  await waitFor(() => {
    expect(section.getByRole('tab', { name: tabLabel })).toHaveAttribute('aria-selected', 'true')
  })

  return section
}

function getPanel(panel: 'runtime' | 'history' | 'settings' | 'logs') {
  const element = document.querySelector(`[data-panel="${panel}"]`)
  expect(element).not.toBeNull()
  return element as HTMLElement
}

async function selectRadixOption(label: string, optionText: string) {
  fireEvent.click(await screen.findByLabelText(label))
  fireEvent.click(await screen.findByRole('option', { name: optionText }))
}

describe('App shell', () => {
  it('renders the main menu and shows only the runtime panel by default', () => {
    render(<App />)

    expect(screen.getAllByText('AngryMiao').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '历史记录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '日志' })).toBeInTheDocument()
    expect(screen.queryByText('Navigation')).toBeNull()
    expect(screen.queryByText('Voice App')).toBeNull()
    expect(getPanel('runtime')).toBeInTheDocument()
    expect(document.querySelector('[data-panel="history"]')).toBeNull()
    expect(document.querySelector('[data-panel="settings"]')).toBeNull()
    expect(document.querySelector('[data-panel="logs"]')).toBeNull()
  })

  it('renders a custom titlebar with window controls in the main window', () => {
    render(<App />)

    expect(screen.getByLabelText('窗口拖拽区')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换窗口最大化' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭窗口' })).toBeInTheDocument()
  })

  it('forwards titlebar dragging and window control actions to the current tauri window', () => {
    const windowMock = {
      label: 'main',
      hide: vi.fn(),
      close: vi.fn(),
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      startDragging: vi.fn(),
    } as never
    vi.mocked(getCurrentWindow).mockImplementation(() => windowMock)

    render(<App />)

    fireEvent.mouseDown(screen.getByLabelText('窗口拖拽区'), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: '最小化窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '切换窗口最大化' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }))

    expect(windowMock.startDragging).toHaveBeenCalledTimes(1)
    expect(windowMock.minimize).toHaveBeenCalledTimes(1)
    expect(windowMock.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(windowMock.close).toHaveBeenCalledTimes(1)
  })

  it('renders the runtime control section without the removed marketing hero copy or recording buttons', async () => {
    render(<App />)
    const section = within(getPanel('runtime'))

    expect(screen.queryByText('自然说话，直接完成识别与执行')).toBeNull()
    expect(screen.queryByText('Speak to your desktop.')).toBeNull()
    expect(await section.findByRole('heading', { name: '运行控制' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始录音' })).toBeNull()
    expect(screen.queryByRole('button', { name: '结束录音' })).toBeNull()
    expect(await section.findByText('当前麦克风')).toBeInTheDocument()
  })

  it('switches the main content area through the menu', async () => {
    render(<App />)

    let section = await openMainPanel('设置')
    expect(await section.findByRole('tab', { name: '通用' })).toBeInTheDocument()

    section = await openMainPanel('历史记录')
    expect(await section.findByLabelText('搜索历史记录')).toBeInTheDocument()

    section = await openMainPanel('日志')
    expect(await section.findByLabelText('筛选日志')).toBeInTheDocument()
  })

  it('does not render or request an unused app mode', async () => {
    render(<App />)

    expect(screen.queryByText('background-agent')).toBeNull()
    await waitFor(() => {
      expect(invoke).not.toHaveBeenCalledWith('get_app_mode')
    })
  })

  it('loads the runtime snapshot without rendering a homepage phase badge', async () => {
    render(<App />)
    const section = within(getPanel('runtime'))

    expect(await section.findByRole('heading', { name: '运行控制' })).toBeInTheDocument()
    expect(screen.queryByText('待命中')).toBeNull()
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_runtime_snapshot')
    })
  })

  it('loads and renders platform diagnostics and mcp runtime diagnostics in the runtime section', async () => {
    render(<App />)

    const section = within(getPanel('runtime'))
    expect(await section.findByText('运行控制')).toBeInTheDocument()
    expect(section.queryByText('实时文本')).toBeNull()
    expect(section.getAllByText('实时摘要').length).toBeGreaterThan(0)
    expect(section.getByText('当前麦克风')).toBeInTheDocument()
    expect(section.getByText('内置麦克风')).toBeInTheDocument()
    expect((await section.findAllByText('当前平台')).length).toBeGreaterThan(0)
    expect(section.getAllByText('Windows').length).toBeGreaterThan(0)
    expect(section.queryByText('正在聆听')).toBeNull()
    expect(section.queryByRole('button', { name: '开始录音' })).toBeNull()
    expect(section.getAllByText('可用').length).toBeGreaterThan(0)
    expect(
      section.getByText('如无法录音，请检查系统设置中的麦克风权限。'),
    ).toBeInTheDocument()
    expect(section.getAllByText('麦克风权限').length).toBeGreaterThan(0)
    expect(section.getAllByText('待验证').length).toBeGreaterThan(0)
    expect(section.getAllByText('深链').length).toBeGreaterThan(0)
    expect(section.getAllByText('voice-app:// 已注册').length).toBeGreaterThan(0)
    expect(section.getAllByText('MCP 服务').length).toBeGreaterThan(0)
    expect(section.getAllByText('1/1').length).toBeGreaterThan(0)
    expect(section.getAllByText('AngryMiao 运行时').length).toBeGreaterThan(0)
    expect(section.getAllByText('未启用').length).toBeGreaterThan(0)
    expect(section.getByText('MCP 运行时')).toBeInTheDocument()
    expect(section.getByText('已配置 1 个服务，当前活跃 1 个。')).toBeInTheDocument()
    expect(section.getByText(/内置技能包/)).toBeInTheDocument()
    expect(section.getByText('mcp__system-control__type_text')).toBeInTheDocument()
    expect(section.getByText(/技能包默认路径/)).toBeInTheDocument()
    expect(section.getByText(/AIKeyBoardDriver\.exe/)).toBeInTheDocument()

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_platform_diagnostics')
      expect(invoke).toHaveBeenCalledWith('get_runtime_diagnostics')
    })
  })

  it('captures a microphone task and renders streaming to completed snapshots', async () => {
    render(<App />)
    const section = within(getPanel('runtime'))

    expect(await section.findByRole('heading', { name: '运行控制' })).toBeInTheDocument()
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_runtime_snapshot')
    })

    await act(async () => {
      await startMicrophoneCapture()
    })

    await waitFor(() => {
      expect(section.getByText('正在流式识别语音内容。')).toBeInTheDocument()
    })

    await act(async () => {
      await stopMicrophoneCapture()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(await section.findByText('本地工具执行已完成。')).toBeInTheDocument()
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
    const section = await openMainPanel('设置')
    expect(await section.findByRole('tab', { name: '通用' })).toBeInTheDocument()
    expect(section.getByRole('tab', { name: '快捷键' })).toBeInTheDocument()
    expect(section.getByRole('tab', { name: 'ASR' })).toBeInTheDocument()
    expect(section.getByRole('tab', { name: '模型' })).toBeInTheDocument()
    expect(section.getByRole('tab', { name: 'MCP' })).toBeInTheDocument()
    expect(section.getByRole('switch', { name: '开机自启动' })).toBeInTheDocument()

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
    const section = await openMainPanel('设置')
    await openSettingsSection('MCP')

    fireEvent.change(await section.findByLabelText('Skill Bundle 目录路径'), {
      target: { value: 'D:/bundles/custom-skill' },
    })
    fireEvent.click(section.getByRole('button', { name: '安装 Bundle' }))

    expect(await section.findByText('已安装 Skill Bundle：Custom Skill。')).toBeInTheDocument()
    expect(section.getByText('Custom Skill')).toBeInTheDocument()

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
    const section = await openMainPanel('设置')
    await openSettingsSection('快捷键')

    fireEvent.click(await section.findByRole('button', { name: '录制默认热键' }))
    expect(section.getByDisplayValue('请按住默认热键...')).toHaveFocus()
    fireEvent.keyDown(window, { code: 'AltRight', key: 'Alt' })
    fireEvent.keyUp(window, { code: 'AltRight', key: 'Alt' })
    fireEvent.click(section.getByRole('button', { name: '保存设置' }))

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
    const section = await openMainPanel('设置')
    await openSettingsSection('模型')

    fireEvent.change(await section.findByLabelText('LLM 模型'), {
      target: { value: 'gpt-4.1-mini' },
    })
    fireEvent.click(section.getByRole('button', { name: '保存设置' }))

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
    const section = await openMainPanel('设置')
    await openSettingsSection('语音')

    fireEvent.change(await section.findByLabelText('默认麦克风'), {
      target: { value: 'usb-mic' },
    })
    fireEvent.click(section.getByRole('button', { name: '保存设置' }))

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
    const section = await openMainPanel('设置')
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

      fireEvent.click(await section.findByRole('button', { name: '录制默认热键' }))
      fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
      fireEvent.keyDown(window, { code: 'ShiftLeft', key: 'Shift' })
      fireEvent.keyDown(window, { code: 'Space', key: ' ' })
      fireEvent.keyUp(window, { code: 'Space', key: ' ' })
      fireEvent.click(section.getByRole('button', { name: '保存设置' }))

      expect(
        await section.findByText('注册全局热键失败: 热键已被占用'),
      ).toBeInTheDocument()

      await waitFor(() => {
        expect(section.getByDisplayValue('RightAlt')).toBeInTheDocument()
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
    const section = await openMainPanel('设置')
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

      fireEvent.click(await section.findByRole('button', { name: '录制默认热键' }))
      fireEvent.keyDown(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.keyUp(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.click(section.getByRole('button', { name: '保存设置' }))

      expect(
        await section.findByText(
          '当前热键为单独修饰键，仅原生键盘 Hook 支持；请改用组合键或恢复原生 Hook。',
        ),
      ).toBeInTheDocument()
      expect(section.queryByText('设置操作失败。')).toBeNull()
    } finally {
      invokeMock.mockImplementation(originalImplementation!)
    }
  })

  it('shows save warnings when runtime hotkey reload cannot take effect immediately', async () => {
    render(<App />)
    const section = await openMainPanel('设置')
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

      fireEvent.click(await section.findByRole('button', { name: '录制默认热键' }))
      fireEvent.keyDown(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.keyUp(window, { code: 'AltLeft', key: 'Alt' })
      fireEvent.click(section.getByRole('button', { name: '保存设置' }))

      expect(
        await section.findByText(
          '设置已保存，但以下项目未即时生效：热键已保存，但当前系统无法立即启用：单独修饰键仅原生键盘 Hook 支持。',
        ),
      ).toBeInTheDocument()
    } finally {
      invokeMock.mockImplementation(originalImplementation!)
    }
  })

  it('shows setup warning when required credentials are missing but does not block saving', async () => {
    render(<App />)
    const section = await openMainPanel('设置')
    await openSettingsSection('模型')

    const clearButtons = await section.findAllByRole('button', { name: '清空密钥' })
    fireEvent.click(clearButtons[0])

    expect(
      await section.findByText('当前语音任务还不能运行，请补齐：LLM API Key。'),
    ).toBeInTheDocument()
    expect(section.getByRole('button', { name: '保存设置' })).not.toBeDisabled()
  })

  it('adds a custom keyboard shortcut and includes it in the saved settings', async () => {
    render(<App />)
    const section = await openMainPanel('设置')
    await openSettingsSection('MCP')

    fireEvent.click(await section.findByRole('button', { name: '添加快捷键' }))
    fireEvent.change(await section.findByLabelText('触发词（逗号分隔）'), {
      target: { value: '截图' },
    })

    fireEvent.click(section.getByRole('button', { name: '录制' }))
    expect(section.getByDisplayValue('请按下快捷键...')).toHaveFocus()
    fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
    fireEvent.keyDown(window, { code: 'KeyK', key: 'k' })
    fireEvent.keyUp(window, { code: 'KeyK', key: 'k' })

    fireEvent.click(section.getByRole('button', { name: '确认添加' }))
    fireEvent.click(section.getByRole('button', { name: '保存设置' }))

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
    const section = await openMainPanel('设置')

    await openSettingsSection('快捷键')
    fireEvent.click(await section.findByRole('button', { name: '录制默认热键' }))
    fireEvent.keyDown(window, { code: 'Backspace', key: 'Backspace' })

    await openSettingsSection('语音')
    fireEvent.change(await section.findByLabelText('转录静音自动结束（ms）'), {
      target: { value: '200' },
    })

    await openSettingsSection('MCP')
    fireEvent.change(await section.findByLabelText('MCP 服务 JSON'), {
      target: { value: '[{"id":"","name":"Broken"}]' },
    })
    vi.mocked(invoke).mockClear()

    expect(await section.findByText('MCP 服务 JSON 格式无效。')).toBeInTheDocument()

    await openSettingsSection('快捷键')
    expect(await section.findByText('默认热键不能为空。')).toBeInTheDocument()

    await openSettingsSection('语音')
    expect(
      await section.findByText('转录静音自动结束需为 0 或 500 到 5000 毫秒。'),
    ).toBeInTheDocument()

    await openSettingsSection('MCP')
    expect(section.getByRole('button', { name: '保存设置' })).toBeDisabled()

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

    const section = within(getPanel('history'))
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
    const section = await openMainPanel('历史记录')

    fireEvent.change(await section.findByLabelText('搜索历史记录'), {
      target: { value: '最终识别结果' },
    })

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'query_history_records',
        expect.objectContaining({ keyword: '最终识别结果', status: undefined }),
      )
    })

    fireEvent.click(section.getByRole('button', { name: '预览' }))
    expect(await section.findByText('已预览任务 #1。')).toBeInTheDocument()

    fireEvent.click(section.getByRole('button', { name: '重新生成' }))
    expect(await section.findByText('已开始重试任务 #1。')).toBeInTheDocument()
    await waitFor(() => {
      expect(section.getAllByRole('button', { name: '预览' }).length).toBeGreaterThan(1)
    })
  })

  it('filters, exports, and clears runtime logs', async () => {
    render(<App />)
    const section = await openMainPanel('日志')

    await selectRadixOption('日志级别', '信息')
    fireEvent.change(section.getByLabelText('筛选日志'), {
      target: { value: '语音运行时' },
    })

    expect(await section.findByText('语音运行时已就绪。')).toBeInTheDocument()

    fireEvent.click(section.getByRole('button', { name: '导出日志' }))
    expect(
      await section.findByText(
        '运行日志已导出到 C:/voice-app/runtime-logs-2026-04-06.log。',
      ),
    ).toBeInTheDocument()

    fireEvent.click(section.getByRole('button', { name: '清空日志' }))
    expect(await section.findByText('运行日志已清空。')).toBeInTheDocument()
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
