import NiceModal from '@ebay/nice-modal-react'
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Loader,
  Menu,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useViewportSize } from '@mantine/hooks'
import { getModel } from '@shared/providers'
import { formatNumber } from '@shared/utils'
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconArrowBackUp,
  IconArrowUp,
  IconChevronRight,
  IconFilePencil,
  IconHammer,
  IconLink,
  IconPhoto,
  IconPlayerStopFilled,
  IconPlus,
  IconSettings,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useAtom, useAtomValue } from 'jotai'
import _, { pick } from 'lodash'
import type React from 'react'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createModelDependencies } from '@/adapters'
import useInputBoxHistory from '@/hooks/useInputBoxHistory'
import { useMessageInput } from '@/hooks/useMessageInput'
import { useProviders } from '@/hooks/useProviders'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { cn } from '@/lib/utils'
import {
  getContextMessageIds,
  isAutoCompactionEnabled,
  isCompactionInProgress,
  useContextTokens,
} from '@/packages/context-management'
import { trackingEvent } from '@/packages/event'
import { getModelContextWindowSync } from '@/packages/model-context'
import * as picUtils from '@/packages/pic_utils'
import platform from '@/platform'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import * as atoms from '@/stores/atoms'
import { compactionUIStateMapAtom } from '@/stores/atoms/compactionAtoms'
import * as chatStore from '@/stores/chatStore'
import { useSession, useSessionSettings } from '@/stores/chatStore'
import { settingsStore, useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { delay } from '@/utils'
import { featureFlags } from '@/utils/feature-flags'
import { trackEvent } from '@/utils/track'
import {
  type Message,
  ModelProviderEnum,
  type SessionType,
  type ShortcutSendValue,
} from '../../../shared/types'
import * as dom from '../../hooks/dom'
import * as sessionHelpers from '../../stores/sessionHelpers'
import * as toastActions from '../../stores/toastActions'
import { CompactionStatus } from '../chat/CompactionStatus'
import { CompressionModal } from '../common/CompressionModal'
import { ScalableIcon } from '../common/ScalableIcon'
import ProviderImageIcon from '../icons/ProviderImageIcon'
import ModelSelector from '../ModelSelector'
import MCPMenu from '../mcp/MCPMenu'
import { ImageMiniCard, LinkMiniCard } from './Attachments'
import { ImageUploadInput } from './ImageUploadInput'
import {
  cleanupLink,
  markLinkProcessing,
  onLinkProcessed,
  storeLinkPromise,
} from './preprocessState'
import TokenCountMenu from './TokenCountMenu'

export type InputBoxPayload = {
  constructedMessage: Message
  needGenerating?: boolean
  onUserMessageReady?: () => void
}

export type InputBoxRef = {
  setQuote: (quote: string) => void
}

export type InputBoxProps = {
  sessionId?: string
  sessionType?: SessionType
  generating?: boolean
  model?: {
    provider: string
    modelId: string
  }
  fullWidth?: boolean
  onSelectModel?(provider: string, model: string): void
  onSubmit?(payload: InputBoxPayload): Promise<void>
  onStopGenerating?(): boolean
  onStartNewThread?(): boolean
  onRollbackThread?(): boolean
  onClickSessionSettings?(): boolean | Promise<boolean>
}

const InputBox = forwardRef<InputBoxRef, InputBoxProps>(
  (
    {
      sessionId,
      sessionType = 'chat',
      generating = false,
      model,
      fullWidth = false,
      onSelectModel,
      onSubmit,
      onStopGenerating,
      onStartNewThread,
      onRollbackThread,
      onClickSessionSettings,
    },
    ref
  ) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const isSmallScreen = useIsSmallScreen()
    const toolbarIconSize = isSmallScreen ? 22 : 18
    const { height: viewportHeight } = useViewportSize()
    const shortcuts = useSettingsStore((state) => state.shortcuts)
    const widthFull = useUIStore((s) => s.widthFull) || fullWidth

    const currentSessionId = sessionId
    const isNewSession = currentSessionId === 'new'

    const { messageInput, setMessageInput, clearDraft } = useMessageInput('', { isNewSession })

    const [preConstructedMessage, setPreConstructedMessage] = useAtom(
      atoms.inputBoxPreConstructedMessageFamily(currentSessionId || 'new')
    )
    const pictureKeys = preConstructedMessage.pictureKeys || []

    const { session: currentSession } = useSession(sessionId || null)
    const { sessionSettings: currentSessionMergedSettings } = useSessionSettings(sessionId || null)

    const currentContextMessageIds = useMemo(() => {
      if (isNewSession) return null
      if (!currentSession?.messages.length) return null

      return getContextMessageIds(currentSession, currentSessionMergedSettings?.maxContextMessageCount)
    }, [isNewSession, currentSessionMergedSettings?.maxContextMessageCount, currentSession])

    const [showCompressionModal, setShowCompressionModal] = useState(false)

    const [links, setLinks] = useAtom(atoms.inputBoxLinksFamily(currentSessionId || 'new'))
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
      const constructedMessage = sessionHelpers.constructUserMessage(
        messageInput,
        pictureKeys,
        preConstructedMessage.preprocessedFiles,
        preConstructedMessage.preprocessedLinks
      )
      setPreConstructedMessage((prev) => ({
        ...prev,
        text: messageInput,
        pictureKeys,
        links,
        message: constructedMessage,
      }))
    }, [
      messageInput,
      pictureKeys,
      links,
      preConstructedMessage.preprocessedFiles,
      preConstructedMessage.preprocessedLinks,
      setPreConstructedMessage,
    ])

    const pictureInputRef = useRef<HTMLInputElement | null>(null)

    const isPreprocessing = useMemo(() => {
      const hasProcessingLinks = Object.values(preConstructedMessage.preprocessingStatus.links || {}).some(
        (status) => status === 'processing'
      )
      return hasProcessingLinks
    }, [preConstructedMessage.preprocessingStatus])

    const hasPreprocessErrors = useMemo(() => {
      const hasErrorLinks = Object.values(preConstructedMessage.preprocessingStatus.links || {}).some(
        (status) => status === 'error'
      )
      return hasErrorLinks
    }, [preConstructedMessage.preprocessingStatus])

    const disableSubmit = useMemo(
      () => !(messageInput.trim() || links?.length || pictureKeys?.length),
      [messageInput, links, pictureKeys]
    )

    const { providers } = useProviders()
    const modelSelectorDisplayText = useMemo(() => {
      if (!model) {
        return t('Select Model')
      }
      const providerInfo = providers.find((p) => p.id === model.provider)

      const modelInfo = (providerInfo?.models || providerInfo?.defaultSettings?.models)?.find(
        (m) => m.modelId === model.modelId
      )
      return `${modelInfo?.nickname || model.modelId}`
    }, [providers, model, t])

    const modelInfo = useMemo(() => {
      if (!model) return null
      const providerInfo = providers.find((p) => p.id === model.provider)
      return (providerInfo?.models || providerInfo?.defaultSettings?.models)?.find((m) => m.modelId === model.modelId)
    }, [providers, model])

    const { data: modelSupportToolUseForFile = false } = useQuery({
      queryKey: ['model-tool-capability', model?.provider, model?.modelId],
      queryFn: async () => {
        if (!model?.provider || !model?.modelId) {
          return false
        }

        try {
          const globalSettings = settingsStore.getState().getSettings()
          const configs = await platform.getConfig()
          const dependencies = await createModelDependencies()

          const settings = {
            provider: model.provider,
            modelId: model.modelId,
            ...currentSessionMergedSettings,
          }

          const modelInstance = getModel(settings, globalSettings, configs, dependencies)
          return modelInstance.isSupportToolUse('read-file')
        } catch (e) {
          console.debug('useModelToolCapability: failed to check capability', e)
          return false
        }
      },
      enabled: !!(model?.provider && model?.modelId),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })

    const { contextTokens, currentInputTokens, totalTokens, isCalculating, pendingTasks, messageCount } =
      useContextTokens({
        sessionId: currentSessionId || null,
        session: currentSession,
        settings: currentSessionMergedSettings || {},
        model,
        modelSupportToolUseForFile,
        constructedMessage: preConstructedMessage.message,
      })

    const globalSettings = useSettingsStore((state) => state)
    const [isCompacting, setIsCompacting] = useState(false)

    const compactionUIStateMap = useAtomValue(compactionUIStateMapAtom)
    const isCompactionRunning = useMemo(() => {
      if (!currentSessionId || isNewSession) return false
      return compactionUIStateMap[currentSessionId]?.status === 'running'
    }, [compactionUIStateMap, currentSessionId, isNewSession])

    const autoCompactionEnabled = useMemo(() => {
      if (!currentSession) return globalSettings.autoCompaction ?? true
      return isAutoCompactionEnabled(currentSession.settings, globalSettings)
    }, [currentSession, globalSettings])

    const contextWindowKnown = useMemo(() => {
      if (!model?.modelId) return false
      return !!modelInfo?.contextWindow || getModelContextWindowSync(model.modelId) !== null
    }, [model?.modelId, modelInfo?.contextWindow])

    const effectiveContextWindow = useMemo(() => {
      if (modelInfo?.contextWindow) return modelInfo.contextWindow
      if (model?.modelId) return getModelContextWindowSync(model.modelId)
      return null
    }, [modelInfo?.contextWindow, model?.modelId])

    const tokenPercentage = useMemo(() => {
      if (!effectiveContextWindow || effectiveContextWindow <= 0) return null
      return Math.round((totalTokens / effectiveContextWindow) * 100)
    }, [totalTokens, effectiveContextWindow])

    useEffect(() => {
      if (!currentSessionId || isNewSession) {
        setIsCompacting(false)
        return
      }
      const checkCompacting = () => {
        setIsCompacting(isCompactionInProgress(currentSessionId))
      }
      checkCompacting()
      const interval = setInterval(checkCompacting, 1000)
      return () => clearInterval(interval)
    }, [currentSessionId, isNewSession])

    const handleAutoCompactionChange = useCallback(
      async (enabled: boolean) => {
        if (!currentSessionId || isNewSession) return
        await chatStore.updateSession(currentSessionId, (session) => {
          if (!session) {
            throw new Error('Session not found')
          }
          return {
            ...session,
            settings: {
              ...session.settings,
              autoCompaction: enabled,
            },
          }
        })
      },
      [currentSessionId, isNewSession]
    )

    const [showSelectModelErrorTip, setShowSelectModelErrorTip] = useState(false)
    useEffect(() => {
      if (showSelectModelErrorTip) {
        const clickEventListener = () => {
          setShowSelectModelErrorTip(false)
          document.removeEventListener('click', clickEventListener)
        }
        document.addEventListener('click', clickEventListener)
        return () => {
          document.removeEventListener('click', clickEventListener)
        }
      }
    }, [showSelectModelErrorTip])

    const [showRollbackThreadButton, setShowRollbackThreadButton] = useState(false)
    useEffect(() => {
      if (showRollbackThreadButton) {
        const tid = setTimeout(() => {
          setShowRollbackThreadButton(false)
        }, 5000)
        return () => {
          clearTimeout(tid)
        }
      }
    }, [showRollbackThreadButton])

    const inputRef = useRef<HTMLTextAreaElement | null>(null)

    useImperativeHandle(
      ref,
      () => ({
        setQuote: (data) => {
          setMessageInput((prev) => `${prev}\n\n${data}`)
          dom.focusMessageInput()
          dom.setMessageInputCursorToEnd()
        },
      }),
      [setMessageInput]
    )

    const { addInputBoxHistory, getPreviousHistoryInput, getNextHistoryInput, resetHistoryIndex } = useInputBoxHistory()

    const closeSelectModelErrorTipCb = useRef<NodeJS.Timeout>()
    const handleSubmit = async (needGenerating = true) => {
      if (disableSubmit || generating || isSubmitting || isPreprocessing) {
        return
      }

      if (hasPreprocessErrors) {
        toastActions.add(t('Some files failed to parse. Please remove them and try again.'))
        return
      }

      if (!model) {
        await delay(100)
        if (closeSelectModelErrorTipCb.current) {
          clearTimeout(closeSelectModelErrorTipCb.current)
        }
        setShowSelectModelErrorTip(true)
        closeSelectModelErrorTipCb.current = setTimeout(() => setShowSelectModelErrorTip(false), 5000)
        return
      }

      setIsSubmitting(true)
      try {
        if (!preConstructedMessage.message) {
          console.error('No constructed message available')
          return
        }

        const messageTextForHistory =
          preConstructedMessage.message.contentParts.find((p) => p.type === 'text')?.text || ''

        const params = {
          constructedMessage: preConstructedMessage.message,
          needGenerating,
          onUserMessageReady: () => {
            clearDraft()
            setLinks([])
            setPreConstructedMessage({
              text: '',
              pictureKeys: [],
              attachments: [],
              links: [],
              preprocessedFiles: [],
              preprocessedLinks: [],
              preprocessingStatus: {
                files: {},
                links: {},
              },
              preprocessingPromises: {
                files: new Map(),
                links: new Map(),
              },
              message: undefined,
            })
            setShowRollbackThreadButton(false)
            if (platform.type !== 'mobile' && messageTextForHistory) {
              addInputBoxHistory(messageTextForHistory)
            }
          },
        }

        await onSubmit?.(params)

        trackingEvent('send_message', { event_category: 'user' })
      } catch (e) {
        console.error('Error submitting message:', e)
        toastActions.add((e as Error)?.message || t('An error occurred while sending the message.'))
      } finally {
        setIsSubmitting(false)
      }
    }

    const onMessageInput = useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const input = event.target.value
        setMessageInput(input)
        resetHistoryIndex()
      },
      [setMessageInput, resetHistoryIndex]
    )

    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isPressedHash: Record<ShortcutSendValue, boolean> = {
        '': false,
        Enter: event.keyCode === 13 && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey,
        'CommandOrControl+Enter': event.keyCode === 13 && (event.ctrlKey || event.metaKey) && !event.shiftKey,
        'Ctrl+Enter': event.keyCode === 13 && event.ctrlKey && !event.shiftKey,
        'Command+Enter': event.keyCode === 13 && event.metaKey,
        'Shift+Enter': event.keyCode === 13 && event.shiftKey,
        'Ctrl+Shift+Enter': event.keyCode === 13 && event.ctrlKey && event.shiftKey,
      }

      if (isPressedHash[shortcuts.inputBoxSendMessage]) {
        if (platform.type === 'mobile' && isSmallScreen && shortcuts.inputBoxSendMessage === 'Enter') {
          return
        }
        event.preventDefault()
        handleSubmit()
        return
      }

      if (isPressedHash[shortcuts.inputBoxSendMessageWithoutResponse]) {
        event.preventDefault()
        handleSubmit(false)
        return
      }

      if (
        (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
        inputRef.current &&
        inputRef.current === document.activeElement &&
        (messageInput.length === 0 || window.getSelection()?.toString() === messageInput)
      ) {
        event.preventDefault()
        if (event.key === 'ArrowUp') {
          const previousInput = getPreviousHistoryInput()
          if (previousInput !== undefined) {
            setMessageInput(previousInput)
            setTimeout(() => inputRef.current?.select(), 10)
          }
        } else if (event.key === 'ArrowDown') {
          const nextInput = getNextHistoryInput()
          if (nextInput !== undefined) {
            setMessageInput(nextInput)
            setTimeout(() => inputRef.current?.select(), 10)
          }
        }
      }
    }

    const startNewThread = () => {
      const res = onStartNewThread?.()
      if (res) {
        setShowRollbackThreadButton(true)
      }
    }

    const rollbackThread = () => {
      const res = onRollbackThread?.()
      if (res) {
        setShowRollbackThreadButton(false)
      }
    }

    const startLinkPreprocessing = (url: string) => {
      setPreConstructedMessage((prev) => markLinkProcessing(prev, url))

      const preprocessPromise = sessionHelpers
        .preprocessLink(url, { provider: model?.provider || '', modelId: model?.modelId || '' })
        .then((preprocessedLink) => {
          setPreConstructedMessage((prev) => onLinkProcessed(prev, url, preprocessedLink, 6))
        })
        .catch((error) => {
          setPreConstructedMessage((prev) =>
            onLinkProcessed(
              prev,
              url,
              {
                url,
                title: '',
                content: '',
                storageKey: '',
                error: (error as Error)?.message || 'Failed to preprocess the link.',
              },
              6
            )
          )
        })

      setPreConstructedMessage((prev) => storeLinkPromise(prev, url, preprocessPromise))
    }

    const insertLinks = (urls: string[]) => {
      let newLinks = [...(links || []), ...urls.map((u) => ({ url: u }))]
      newLinks = _.uniqBy(newLinks, 'url')
      newLinks = newLinks.slice(-6)
      setLinks(newLinks)

      for (let i = 0; i < Math.min(urls.length, 6); i++) {
        const url = urls[i]
        const linkIndex = newLinks.findIndex((l) => l.url === url)

        if (linkIndex < 6) {
          startLinkPreprocessing(url)
        }
      }
    }

    const onImageUploadClick = () => {
      pictureInputRef.current?.click()
    }

    const onImageInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) {
        return
      }
      const files = Array.from(event.target.files)
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          picUtils.getImageBase64AndResize(file).then(async (base64) => {
            const key = StorageKeyGenerator.picture('input-box')
            await storage.setBlob(key, base64)
            setPreConstructedMessage((prev) => ({
              ...prev,
              pictureKeys: [...(prev.pictureKeys || []), key].slice(-8),
            }))
          })
        }
      }
      event.target.value = ''
      dom.focusMessageInput()
    }

    const onImageDeleteClick = async (picKey: string) => {
      setPreConstructedMessage((prev) => ({
        ...prev,
        pictureKeys: (prev.pictureKeys || []).filter((k) => k !== picKey),
      }))
    }

    const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (sessionType === 'picture') {
        return
      }
      if (event.clipboardData?.items) {
        let hasText = false
        for (let i = 0; i < event.clipboardData.items.length; i++) {
          const item = event.clipboardData.items[i]
          if (item.kind === 'file') {
            const file = item.getAsFile()
            if (file && file.type.startsWith('image/')) {
              picUtils.getImageBase64AndResize(file).then(async (base64) => {
                const key = StorageKeyGenerator.picture('input-box')
                await storage.setBlob(key, base64)
                setPreConstructedMessage((prev) => ({
                  ...prev,
                  pictureKeys: [...(prev.pictureKeys || []), key].slice(-8),
                }))
              })
            }
            continue
          }
          hasText = true
          if (item.kind === 'string' && item.type === 'text/plain') {
            item.getAsString((text) => {
              const raw = text.trim()
              if (raw.startsWith('http://') || raw.startsWith('https://')) {
                const urls = raw
                  .split(/\s+/)
                  .map((url) => url.trim())
                  .filter((url) => url.startsWith('http://') || url.startsWith('https://'))
                insertLinks(urls)
              }
            })
          }
        }
        if (!hasText) {
          event.preventDefault()
        }
      }
    }

    const handleAttachLink = async () => {
      const links: string[] = await NiceModal.show('attach-link')
      if (links) {
        insertLinks(links)
      }
    }

    const quote = useUIStore((state) => state.quote)
    const setQuote = useUIStore((state) => state.setQuote)
    // biome-ignore lint/correctness/useExhaustiveDependencies: todo
    useEffect(() => {
      if (quote !== '') {
        setQuote('')
        setMessageInput((val) => {
          const newValue = !val
            ? quote
            : val + '\n'.repeat(Math.max(0, 2 - (val.match(/(\n)+$/)?.[0].length || 0))) + quote
          return newValue
        })
        dom.focusMessageInput()
        dom.setMessageInputCursorToEnd()
      }
    }, [quote])

    if (sessionType === 'picture') {
      return (
        <Box pt={0} pb={isSmallScreen ? 'md' : 'sm'} px="sm" id={dom.InputBoxID}>
          <Stack
            className={cn('rounded-2xl bg-chatbox-background-secondary', widthFull ? 'w-full' : 'max-w-4xl mx-auto')}
            gap="xs"
            p="md"
            align="center"
          >
            <Text size="sm" c="chatbox-tertiary" ta="center">
              {t('This image session is no longer active. Please use the new Image Creator for image generation.')}
            </Text>
            <Button variant="light" size="xs" onClick={() => navigate({ to: '/image-creator' })}>
              {t('Go to Image Creator')}
            </Button>
          </Stack>
        </Box>
      )
    }

    return (
      <Box pt={0} pb={isSmallScreen ? 'md' : 'sm'} px="sm" id={dom.InputBoxID}>
        <Stack className={cn(widthFull ? 'w-full' : 'max-w-4xl mx-auto')} gap="xs">
          {currentSessionId && <CompactionStatus sessionId={currentSessionId} />}
          <Stack
            className={cn(
              'rounded-md bg-chatbox-background-secondary justify-between px-3 py-2',
              !isSmallScreen && 'min-h-[92px]'
            )}
            style={{ border: '1px solid var(--chatbox-border-primary)' }}
            gap="xs"
          >
            {/* Input Row */}
            <Flex align="flex-end" gap={4}>
              <Textarea
                unstyled={true}
                classNames={{
                  root: 'flex-1',
                  wrapper: 'flex-1',
                  input:
                    'block w-full outline-none border-none px-2 py-1 resize-none bg-transparent text-chatbox-tint-primary',
                }}
                size="sm"
                id={dom.messageInputID}
                ref={inputRef}
                placeholder={t('Type your question here...') || ''}
                bg="transparent"
                autosize={true}
                minRows={2}
                maxRows={Math.max(4, Math.floor(viewportHeight / 100))}
                value={messageInput}
                autoFocus={!isSmallScreen}
                readOnly={isCompactionRunning}
                onChange={onMessageInput}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
              />

              {/* Send Button */}
              <ActionIcon
                disabled={(disableSubmit || isPreprocessing || isSubmitting || isCompactionRunning) && !generating}
                size={32}
                variant="filled"
                color={generating ? 'dark' : 'chatbox-brand'}
                radius="xl"
                onClick={generating ? onStopGenerating : () => handleSubmit()}
                className={cn(
                  'shrink-0 mb-1',
                  !generating &&
                    (disableSubmit || isPreprocessing || isSubmitting || isCompactionRunning) &&
                    'disabled:!opacity-100 !text-white'
                )}
                style={
                  !generating && (disableSubmit || isPreprocessing || isSubmitting || isCompactionRunning)
                    ? { backgroundColor: 'rgba(222, 226, 230, 1)' }
                    : undefined
                }
              >
                {generating ? (
                  <ScalableIcon icon={IconPlayerStopFilled} size={16} />
                ) : (
                  <ScalableIcon icon={IconArrowUp} size={16} />
                )}
              </ActionIcon>
            </Flex>

            {(!!pictureKeys.length || !!links.length) && (
              <Flex align="center" wrap="wrap" onClick={() => dom.focusMessageInput()}>
                {pictureKeys?.map((picKey) => (
                  <ImageMiniCard key={picKey} storageKey={picKey} onDelete={() => onImageDeleteClick(picKey)} />
                ))}
                {links?.map((link) => {
                  const linkKey = StorageKeyGenerator.linkUniqKey(link.url)
                  const status = preConstructedMessage.preprocessingStatus.links[linkKey]
                  const preprocessedLink = preConstructedMessage.preprocessedLinks.find(
                    (l) => StorageKeyGenerator.linkUniqKey(l.url) === linkKey
                  )
                  return (
                    <LinkMiniCard
                      key={linkKey}
                      url={link.url}
                      status={status}
                      errorMessage={preprocessedLink?.error}
                      onErrorClick={() => {
                        if (preprocessedLink?.error) {
                          void NiceModal.show('file-parse-error', {
                            errorCode: preprocessedLink.error,
                            fileName: link.url,
                          })
                        }
                      }}
                      onDelete={() => {
                        setLinks(links.filter((l) => l.url !== link.url))
                        setPreConstructedMessage((prev) => cleanupLink(prev, link.url))
                      }}
                    />
                  )
                })}
              </Flex>
            )}

            {/* Toolbar Row */}
            <Flex align="center" gap={0} className="shrink-0 w-full" justify="space-between">
              <ImageUploadInput ref={pictureInputRef} onChange={onImageInputChange} />

              {/* Left Group: Tool Buttons */}
              <Flex align="center" gap={0}>
                <Tooltip label={t('Attach Image')} position="top" withArrow disabled={isSmallScreen}>
                  <UnstyledButton
                    onClick={onImageUploadClick}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
                  >
                    <IconPhoto size={toolbarIconSize} strokeWidth={1.8} className="text-[var(--chatbox-tint-secondary)]" />
                  </UnstyledButton>
                </Tooltip>

                <Tooltip label={t('Attach Link')} position="top" withArrow disabled={isSmallScreen}>
                  <UnstyledButton
                    onClick={handleAttachLink}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
                  >
                    <IconLink size={toolbarIconSize} strokeWidth={1.8} className="text-[var(--chatbox-tint-secondary)]" />
                  </UnstyledButton>
                </Tooltip>

                {featureFlags.mcp && (
                  <MCPMenu>
                    {(enabledTools) => (
                      <UnstyledButton className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors">
                        <IconHammer
                          size={toolbarIconSize}
                          strokeWidth={1.8}
                          className={
                            enabledTools > 0
                              ? 'text-[var(--chatbox-tint-brand)]'
                              : 'text-[var(--chatbox-tint-secondary)]'
                          }
                        />
                        {enabledTools > 0 && (
                          <Text size="xs" className="text-[var(--chatbox-tint-brand)]">
                            {enabledTools}
                          </Text>
                        )}
                      </UnstyledButton>
                    )}
                  </MCPMenu>
                )}

                {!isSmallScreen &&
                  (showRollbackThreadButton && onRollbackThread ? (
                    <Tooltip label={t('Rollback Thread')} position="top" withArrow>
                      <UnstyledButton
                        onClick={rollbackThread}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
                      >
                        <IconArrowBackUp
                          size={toolbarIconSize}
                          strokeWidth={1.8}
                          className="text-[var(--chatbox-tint-secondary)]"
                        />
                      </UnstyledButton>
                    </Tooltip>
                  ) : onStartNewThread ? (
                    <Tooltip label={t('New Thread')} position="top" withArrow>
                      <UnstyledButton
                        onClick={startNewThread}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors"
                      >
                        <IconFilePencil
                          size={toolbarIconSize}
                          strokeWidth={1.8}
                          className="text-[var(--chatbox-tint-secondary)]"
                        />
                      </UnstyledButton>
                    </Tooltip>
                  ) : null)}

                {!isSmallScreen && (
                  <Tooltip label={t('Conversation Settings')} position="top" withArrow>
                    <UnstyledButton
                      onClick={onClickSessionSettings}
                      disabled={!onClickSessionSettings}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors disabled:opacity-50"
                    >
                      <IconAdjustmentsHorizontal
                        size={toolbarIconSize}
                        strokeWidth={1.8}
                        className="text-[var(--chatbox-tint-secondary)]"
                      />
                    </UnstyledButton>
                  </Tooltip>
                )}

                {isSmallScreen && (onStartNewThread || onClickSessionSettings) && (
                  <Menu
                    trigger="click"
                    openDelay={100}
                    closeDelay={100}
                    keepMounted
                    transitionProps={{
                      transition: 'pop',
                      duration: 200,
                    }}
                  >
                    <Menu.Target>
                      <UnstyledButton className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors">
                        <IconSettings
                          size={toolbarIconSize}
                          strokeWidth={1.8}
                          className="text-[var(--chatbox-tint-secondary)]"
                        />
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {onStartNewThread && (
                        <Menu.Item leftSection={<ScalableIcon icon={IconPlus} size={16} />} onClick={startNewThread}>
                          {t('New Thread')}
                        </Menu.Item>
                      )}
                      {onClickSessionSettings && (
                        <Menu.Item
                          leftSection={<ScalableIcon icon={IconAdjustmentsHorizontal} size={16} />}
                          onClick={onClickSessionSettings}
                        >
                          {t('Conversation Settings')}
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Flex>

              {/* Right Group: Token Count + Model Selector */}
              <Flex align="center" gap={0}>
                <TokenCountMenu
                  currentInputTokens={currentInputTokens}
                  contextTokens={contextTokens}
                  totalTokens={totalTokens}
                  isCalculating={isCalculating}
                  pendingTasks={pendingTasks}
                  totalContextMessages={messageCount}
                  contextWindow={effectiveContextWindow ?? undefined}
                  currentMessageCount={currentContextMessageIds?.length ?? 0}
                  maxContextMessageCount={currentSessionMergedSettings?.maxContextMessageCount}
                  onCompressClick={sessionId && !isNewSession ? () => setShowCompressionModal(true) : undefined}
                  autoCompactionEnabled={autoCompactionEnabled}
                  isCompacting={isCompacting}
                  contextWindowKnown={contextWindowKnown}
                  onAutoCompactionChange={sessionId && !isNewSession ? handleAutoCompactionChange : undefined}
                >
                  <Flex
                    align="center"
                    gap="2"
                    className={`text-xs cursor-pointer hover:text-chatbox-tint-secondary transition-colors px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] ${
                      tokenPercentage && tokenPercentage > 80 ? 'text-red-500' : 'text-chatbox-tint-tertiary'
                    }`}
                  >
                    <ScalableIcon icon={IconArrowUp} size={14} />
                    {isCalculating && <Loader size={10} />}
                    <Text span size="xs" className="whitespace-nowrap" c="inherit">
                      {isCalculating ? '~' : ''}
                      {formatNumber(totalTokens)}
                      {tokenPercentage !== null && tokenPercentage > 10 && ` (${tokenPercentage}%)`}
                    </Text>
                  </Flex>
                </TokenCountMenu>

                {/* Model Selector */}
                <Tooltip
                  label={
                    <Flex align="center" c="white" gap="xxs">
                      <ScalableIcon icon={IconAlertCircle} size={12} className="text-inherit" />
                      <Text span size="xxs" c="white">
                        {t('Please select a model')}
                      </Text>
                    </Flex>
                  }
                  color="dark"
                  opened={showSelectModelErrorTip}
                  withArrow
                >
                  <ModelSelector
                    onSelect={onSelectModel}
                    selectedProviderId={model?.provider}
                    selectedModelId={model?.modelId}
                    position="top-end"
                    transitionProps={{
                      transition: 'fade-up',
                      duration: 200,
                    }}
                  >
                    <UnstyledButton className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[var(--chatbox-background-tertiary)] transition-colors">
                      {!!model && <ProviderImageIcon size={18} provider={model.provider} />}
                      <Text
                        size="sm"
                        className={cn(
                          'text-[var(--chatbox-tint-secondary)] truncate',
                          isSmallScreen ? 'max-w-[100px]' : 'max-w-[160px]'
                        )}
                      >
                        {modelSelectorDisplayText}
                      </Text>
                      <IconChevronRight
                        size={14}
                        className="text-[var(--chatbox-tint-tertiary)] rotate-90 flex-shrink-0"
                      />
                    </UnstyledButton>
                  </ModelSelector>
                </Tooltip>
              </Flex>
            </Flex>
          </Stack>
        </Stack>
        {currentSession && (
          <CompressionModal
            opened={showCompressionModal}
            onClose={() => setShowCompressionModal(false)}
            session={currentSession}
          />
        )}
      </Box>
    )
  }
)

export default memo(InputBox)
