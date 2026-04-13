import type { FC } from 'react'

interface WaveformProps {
  active: boolean
  className?: string
}

// 波形条的高度比例（中心高，边缘低）
const HEIGHT_RATIOS = [0.3, 0.4, 0.6, 0.8, 1, 1, 1, 1, 0.8, 0.6, 0.4, 0.3]

// 动画延迟（创造波浪感）
const ANIMATION_DELAYS = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660]

export const Waveform: FC<WaveformProps> = ({ active, className = '' }) => {
  if (!active) {
    // 非活跃状态 - 不显示波形
    return null
  }

  return (
    <div
      className={`inline-flex items-center gap-[2px] h-5 ${className}`}
      aria-hidden="true"
    >
      {HEIGHT_RATIOS.map((_, i) => (
        <span
          key={i}
          className="voice-bar"
          style={{
            animationDelay: `${ANIMATION_DELAYS[i]}ms`,
            // 中心条动画更快，边缘条更慢
            animationDuration: i >= 4 && i <= 7 ? '0.6s' : '1s',
          }}
        />
      ))}
    </div>
  )
}