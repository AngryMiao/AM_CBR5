import { app } from 'electron'

export default class Locale {
  locale: string = 'en'

  constructor() {
    try {
      this.locale = app.getLocale()
    } catch (e) {
      console.log(e)
    }
  }

  isCN(): boolean {
    return this.locale.startsWith('zh')
  }

  t(key: TranslationKey): string {
    return translations[key][this.isCN() ? 'zh' : 'en']
  }
}

type TranslationKey = keyof typeof translations

const translations = {
  'Show/Hide': {
    en: 'Show/Hide',
    zh: '显示/隐藏',
  },
  Exit: {
    en: 'Exit',
    zh: '退出',
  },
  Copy: {
    en: 'Copy',
    zh: '复制',
  },
  Cut: {
    en: 'Cut',
    zh: '剪切',
  },
  Paste: {
    en: 'Paste',
    zh: '粘贴',
  },
  PasteAsPlainText: {
    en: 'Paste as Plain Text',
    zh: '粘贴为文本',
  },
  ReplaceWith: {
    en: 'Replace with',
    zh: '替换成',
  },
  ResetZoom: {
    en: 'Reset Zoom',
    zh: '重置缩放',
  },
  ZoomIn: {
    en: 'Zoom In',
    zh: '放大',
  },
  ZoomOut: {
    en: 'Zoom Out',
    zh: '缩小',
  },
}
