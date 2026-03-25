import type { MessagePicture, Toast } from '@shared/types'
import type { RefObject } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'
import { v4 as uuidv4 } from 'uuid'
import { createStore, useStore } from 'zustand'
import { combine, persist } from 'zustand/middleware'
import platform from '@/platform'
import { safeStorage } from './safeStorage'

// 不能使用immer middleware，会导致RefObject出问题
export const uiStore = createStore(
  persist(
    combine(
      {
        toasts: [] as Toast[],
        quote: '',
        realTheme: localStorage.getItem('initial-theme') === 'dark' ? 'dark' : ('light' as 'light' | 'dark'),
        messageListElement: null as RefObject<HTMLDivElement> | null,
        messageScrolling: null as RefObject<VirtuosoHandle> | null,
        messageScrollingAtTop: false,
        messageScrollingAtBottom: false,
        showSidebar: platform.type !== 'mobile',
        openSearchDialog: false,
        searchDialogGlobalOnly: false,
        openAboutDialog: false,
        newSessionState: {} as Record<string, never>,
        pictureShow: null as {
          picture: MessagePicture
          extraButtons?: {
            onClick: () => void
            icon: React.ReactNode
          }[]
          onSave?: () => void
        } | null,
        widthFull: false,
        showCopilotsInNewSession: false,
        sidebarWidth: null as number | null,
      },
      (set, get) => ({
        addToast: (content: string, duration?: number) => {
          const newToast = { id: `toast:${uuidv4()}`, content, duration }
          set((state) => ({
            ...state,
            toasts: [...state.toasts, newToast],
          }))
        },
        removeToast: (id: string) => {
          set((state) => ({
            ...state,
            toasts: state.toasts.filter((toast) => toast.id !== id),
          }))
        },

        setQuote: (quote: string) => {
          set({ quote })
        },

        setShowSidebar: (showSidebar: boolean) => {
          console.log('setShowSidebar:', showSidebar)
          set({ showSidebar })
        },

        setOpenSearchDialog: (openSearchDialog: boolean, globalOnly = false) => {
          set({ openSearchDialog, searchDialogGlobalOnly: globalOnly })
        },

        setOpenAboutDialog: (openAboutDialog: boolean) => {
          set({ openAboutDialog })
        },

        setPictureShow: (pictureShow: ReturnType<typeof get>['pictureShow']) => {
          set({ pictureShow })
        },

        setWidthFull: (widthFull: boolean) => {
          set({ widthFull })
        },

        setMessageListElement: (messageListElement: RefObject<HTMLDivElement> | null) => {
          set({ messageListElement })
        },

        setMessageScrolling: (messageScrolling: RefObject<VirtuosoHandle> | null) => {
          set({ messageScrolling })
        },

        setMessageScrollingAtTop: (messageScrollingAtTop: boolean) => {
          set({ messageScrollingAtTop })
        },

        setMessageScrollingAtBottom: (messageScrollingAtBottom: boolean) => {
          set({ messageScrollingAtBottom })
        },

        setNewSessionState: (
          newSessionState:
            | ReturnType<typeof get>['newSessionState']
            | ((prev: ReturnType<typeof get>['newSessionState']) => ReturnType<typeof get>['newSessionState'])
        ) => {
          set({
            newSessionState:
              typeof newSessionState === 'function' ? newSessionState(get().newSessionState) : newSessionState,
          })
        },

        setShowCopilotsInNewSession: (showCopilotsInNewSession: boolean) => {
          set({ showCopilotsInNewSession })
        },

        setSidebarWidth: (sidebarWidth: number | null) => {
          set({ sidebarWidth })
        },
      })
    ),
    {
      name: 'ui-store',
      version: 0,
      partialize: (state) => ({
        widthFull: state.widthFull,
        showCopilotsInNewSession: state.showCopilotsInNewSession,
        sidebarWidth: state.sidebarWidth,
      }),
      storage: safeStorage,
    }
  )
)

export function useUIStore<U>(selector: Parameters<typeof useStore<typeof uiStore, U>>[1]) {
  return useStore<typeof uiStore, U>(uiStore, selector)
}
