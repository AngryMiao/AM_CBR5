import { useEffect } from 'react'
import platform from '../platform'
import * as dom from './dom'
import { useIsSmallScreen } from './useScreenChange'

export default function useShortcut() {
  const isSmallScreen = useIsSmallScreen()

  useEffect(() => {
    const focusMessageInput = () => {
      if (!isSmallScreen) {
        dom.focusMessageInput()
      }
    }

    const cancelOnFocus = platform.onWindowFocused(focusMessageInput)
    const cancelOnShow = platform.onWindowShow(focusMessageInput)

    return () => {
      cancelOnFocus()
      cancelOnShow()
    }
  }, [isSmallScreen])
}
