import { getDefaultStore } from 'jotai'
import { useEffect } from 'react'
import { navigateToSettings } from '@/modals/Settings'
import { uiStore } from '@/stores/uiStore'
import { getOS } from '../packages/navigator'
import platform from '../platform'
import { currentSessionIdAtom } from '../stores/atoms'
import { clear as clearSession } from '../stores/sessionActions'
import * as dom from './dom'
import { useIsSmallScreen } from './useScreenChange'

export default function useShortcut() {
  const isSmallScreen = useIsSmallScreen()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keyboardShortcut(e)
    }
    const focusMessageInput = () => {
      // 大屏幕下，窗口显示时自动聚焦输入框
      if (!isSmallScreen) {
        dom.focusMessageInput()
      }
    }
    const cancelOnFocus = platform.onWindowFocused(focusMessageInput)
    const cancelOnShow = platform.onWindowShow(focusMessageInput)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelOnFocus()
      cancelOnShow()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSmallScreen])

  function keyboardShortcut(e: KeyboardEvent) {
    // 这里不用 e.key 是因为 alt、 option、shift 都会改变 e.key 的值
    const ctrlOrCmd = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const altOrOption = e.altKey

    const ctrlKey = getOS() === 'Mac' ? e.metaKey : e.ctrlKey

    if (e.key === 'i' && ctrlKey) {
      dom.focusMessageInput()
      return
    }
    if (e.key === 'e' && ctrlKey) {
      dom.focusMessageInput()
      // Toggle session-level web browsing mode using cached display value
      const sessionId = getDefaultStore().get(currentSessionIdAtom) || 'new'
      uiStore.getState().toggleSessionWebBrowsing(sessionId)
      return
    }

    // 清空当前单例语音会话。
    if (e.key === 'r' && ctrlKey) {
      e.preventDefault()
      const sid = getDefaultStore().get(currentSessionIdAtom)
      if (sid) {
        void clearSession(sid)
      }
      return
    }

    if (e.key === 'k' && ctrlKey) {
      const openSearchDialog = uiStore.getState().openSearchDialog
      if (openSearchDialog) {
        uiStore.setState({ openSearchDialog: false })
      } else {
        uiStore.setState({ openSearchDialog: true })
      }
    }
    if (e.key === ',' && ctrlKey) {
      e.preventDefault()
      navigateToSettings()
      return
    }
  }
}
