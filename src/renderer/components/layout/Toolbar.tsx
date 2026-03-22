import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon, Flex } from '@mantine/core'
import {
  IconCode,
  IconDeviceFloppy,
  IconDots,
  IconSettings,
} from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsLargeScreen, useIsSmallScreen } from '@/hooks/useScreenChange'
import { navigateToSettings } from '@/modals/Settings'
import platform from '@/platform'
import { getSession } from '@/stores/chatStore'
import { clear as clearSession } from '@/stores/sessionActions'
import { useUIStore } from '@/stores/uiStore'
import ActionMenu from '../ActionMenu'
import Broom from '../icons/Broom'
import LayoutExpand from '../icons/LayoutExpand'
import LayoutShrink from '../icons/LayoutShrink'
import UpdateAvailableButton from '../UpdateAvailableButton'

/**
 * 顶部标题工具栏（右侧）
 * @returns
 */
export default function Toolbar({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const isSmallScreen = useIsSmallScreen()
  const isLargeScreen = useIsLargeScreen()

  const [showUpdateNotification, setShowUpdateNotification] = useState(false)
  const widthFull = useUIStore((s) => s.widthFull)
  const setWidthFull = useUIStore((s) => s.setWidthFull)

  useEffect(() => {
    const offUpdateDownloaded = platform.onUpdateDownloaded(() => {
      setShowUpdateNotification(true)
    })
    return () => {
      offUpdateDownloaded()
    }
  }, [])

  const handleExportAndSave = () => {
    NiceModal.show('export-chat')
  }
  const handleSessionClean = () => {
    void clearSession(sessionId)
  }

  const handleViewSessionJson = useCallback(async () => {
    const session = await getSession(sessionId)
    if (session) {
      await NiceModal.show('json-viewer', { title: t('Session Raw JSON'), data: session })
    }
  }, [sessionId, t])

  return !isSmallScreen ? (
    <Flex align="center" gap="md" className="controls">
      {showUpdateNotification && <UpdateAvailableButton />}

      {isLargeScreen && (
        <ActionIcon variant="subtle" size={28} color="chatbox-secondary" onClick={() => setWidthFull(!widthFull)}>
          {widthFull ? <LayoutExpand strokeWidth={1.8} /> : <LayoutShrink strokeWidth={1.8} />}
        </ActionIcon>
      )}

      <ActionIcon variant="subtle" size={28} color="chatbox-secondary" onClick={() => navigateToSettings()}>
        <IconSettings strokeWidth={1.8} />
      </ActionIcon>

      <ActionMenu
        position="bottom-end"
        items={[
          {
            text: t('Export Chat'),
            icon: IconDeviceFloppy,
            onClick: handleExportAndSave,
          },
          ...(process.env.NODE_ENV === 'development'
            ? [
                {
                  text: t('View Session JSON'),
                  icon: IconCode,
                  onClick: handleViewSessionJson,
                },
              ]
            : []),
          {
            divider: true,
          },
          {
            doubleCheck: {
              color: 'chatbox-error',
            },
            text: t('Clear All Messages'),
            icon: Broom,
            color: 'chatbox-primary',
            onClick: handleSessionClean,
          },
        ]}
      >
        <ActionIcon variant="subtle" size={28} color="chatbox-secondary">
          <IconDots strokeWidth={1.8} />
        </ActionIcon>
      </ActionMenu>
    </Flex>
  ) : (
    <Flex align="center" gap="xs">
      <ActionIcon variant="subtle" size={24} color="chatbox-secondary" onClick={() => navigateToSettings()}>
        <IconSettings strokeWidth={1.8} />
      </ActionIcon>
      <ActionMenu
        position="bottom-end"
        items={[
          {
            text: t('Export Chat'),
            icon: IconDeviceFloppy,
            onClick: handleExportAndSave,
          },
          ...(process.env.NODE_ENV === 'development'
            ? [
                {
                  text: t('View Session JSON'),
                  icon: IconCode,
                  onClick: handleViewSessionJson,
                },
              ]
            : []),
          {
            divider: true,
          },
          {
            doubleCheck: {
              color: 'chatbox-error',
            },
            text: t('Clear All Messages'),
            icon: Broom,
            color: 'chatbox-primary',
            onClick: handleSessionClean,
          },
        ]}
      >
        <ActionIcon variant="subtle" size={24} color="chatbox-secondary">
          <IconDots strokeWidth={1.8} />
        </ActionIcon>
      </ActionMenu>
    </Flex>
  )
}
