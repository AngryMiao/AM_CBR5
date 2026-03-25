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
    const ctrlOrCmd = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const altOrOption = e.altKey

    const ctrlKey = getOS() === 'Mac' ? e.metaKey : e.ctrlKey

    if (e.key === 'i' && ctrlKey) {
      dom.focusMessageInput()
      return
    }

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
