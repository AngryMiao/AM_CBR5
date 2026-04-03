import iconv from 'iconv-lite'

const COMMON_CHINESE_CHARACTERS = new Set(
  Array.from(
    '的一是在不了有人和这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你我他她它们您吗呢吧呀啊么什当前检测到的操作系统环境执行快捷键文本输入前先按系统理解指令优先使用如果与用户说法冲突相信运行时帮复制打开输出执行思考识别完成错误'
  )
)

const ASCII_READABLE_PATTERN = /[a-zA-Z0-9\s.,:;!?'"()[\]{}<>_\-=/\\|%*@#$^&+~`]/
const CJK_PATTERN = /[\u4e00-\u9fff]/u
const MOJIBAKE_MARKER_PATTERN = /[€�鍝锛鎴鎰鎮璇鏈绯褰浠妫娴嬪埌]/g

function scoreReadableText(text: string) {
  let score = 0

  for (const char of text) {
    if (COMMON_CHINESE_CHARACTERS.has(char)) {
      score += 3
      continue
    }
    if (char === '�') {
      score -= 8
      continue
    }
    if (ASCII_READABLE_PATTERN.test(char)) {
      score += 0.1
      continue
    }
    if (CJK_PATTERN.test(char)) {
      score += 0.2
    }
  }

  score -= (text.match(MOJIBAKE_MARKER_PATTERN)?.length ?? 0) * 2
  return score
}

export function repairLikelyMojibake(text: string) {
  if (!text || !/[^\x00-\x7F]/.test(text)) {
    return text
  }

  let repaired: string
  try {
    repaired = iconv.decode(iconv.encode(text, 'gbk'), 'utf8')
  } catch {
    return text
  }

  if (!repaired || repaired === text) {
    return text
  }

  return scoreReadableText(repaired) > scoreReadableText(text) + 1 ? repaired : text
}
