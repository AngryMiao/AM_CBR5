import type { FC } from 'react'
import type { VoiceCapsulePhase } from './VoiceCapsule'

interface StatusIconProps {
  phase: VoiceCapsulePhase
  className?: string
}

export const StatusIcon: FC<StatusIconProps> = ({ phase, className = '' }) => {
  const iconProps = getIconProps(phase)

  return (
    <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${iconProps.animation} ${className}`}>
      <svg
        viewBox="0 0 24 24"
        className="w-full h-full"
        fill="none"
        stroke={iconProps.color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {iconProps.path}
      </svg>
    </div>
  )
}

interface IconProps {
  color: string
  animation: string
  path: React.ReactNode
}

function getIconProps(phase: VoiceCapsulePhase): IconProps {
  switch (phase) {
    // 🎤 聆听中 - 麦克风
    case 'listening':
      return {
        color: '#34C759',
        animation: 'animate-mic-pulse',
        path: (
          <>
            <path d="M12 19v3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <rect x="9" y="2" width="6" height="11" rx="3" />
          </>
        ),
      }

    // 📝 转写中 - 文档文字
    case 'transcription':
      return {
        color: '#34C759',
        animation: 'animate-text-pulse',
        path: (
          <>
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </>
        ),
      }

    // ⚙️ 执行中 - Lucide Cog 齿轮旋转
    case 'executing':
      return {
        color: '#0071E3',
        animation: 'animate-cog-spin',
        path: (
          // Lucide Cog - 齿轮图标
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 20a8 8 0 0 0 0-16 8 8 0 0 0 0 16" />
            <path d="M12 2v2" />
            <path d="M12 22v-2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="m2 12 2 0" />
            <path d="m20 12 2 0" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </>
        ),
      }

    // ⚠️ 错误
    case 'error':
      return {
        color: '#FF3B30',
        animation: 'animate-error-shake',
        path: (
          <>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </>
        ),
      }

    default:
      return {
        color: '#8E8E93',
        animation: '',
        path: <circle cx="12" cy="12" r="10" />,
      }
  }
}
