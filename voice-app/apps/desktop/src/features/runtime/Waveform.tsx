import type { FC } from 'react'

interface WaveformProps {
  active: boolean
  bars?: number[]
  className?: string
}

const DEFAULT_BARS = Array.from({ length: 8 }, () => 0)
const MIN_BAR_HEIGHT_PX = 3
const MAX_BAR_HEIGHT_PX = 20
const MIN_BAR_OPACITY = 0.35
const MAX_BAR_OPACITY = 1
const MIN_SILHOUETTE_WEIGHT = 0.58

export const Waveform: FC<WaveformProps> = ({ active, bars, className = '' }) => {
  if (!active) {
    // 非活跃状态 - 不显示波形
    return null
  }

  const resolvedBars = shapeBarsForDisplay(resolveBars(bars))

  return (
    <div
      className={`inline-flex items-center gap-[2px] h-5 ${className}`}
      aria-hidden="true"
    >
      {resolvedBars.map((level, i) => (
        <span
          key={i}
          className="voice-bar"
          style={{
            height: `${toBarHeight(level)}px`,
            opacity: toBarOpacity(level),
            animation: 'none',
            transformOrigin: 'center center',
          }}
        />
      ))}
    </div>
  )
}

function resolveBars(bars?: number[]) {
  if (!bars || bars.length === 0) {
    return DEFAULT_BARS
  }

  const normalizedBars = bars.slice(0, DEFAULT_BARS.length).map((value) => {
    if (!Number.isFinite(value)) {
      return 0
    }

    return Math.max(0, Math.min(100, value))
  })

  if (normalizedBars.length === DEFAULT_BARS.length) {
    return normalizedBars
  }

  return [
    ...normalizedBars,
    ...DEFAULT_BARS.slice(normalizedBars.length),
  ]
}

function toBarHeight(level: number) {
  const clampedLevel = Math.max(0, Math.min(100, level))

  return MIN_BAR_HEIGHT_PX + ((MAX_BAR_HEIGHT_PX - MIN_BAR_HEIGHT_PX) * clampedLevel) / 100
}

function toBarOpacity(level: number) {
  const clampedLevel = Math.max(0, Math.min(100, level))

  return MIN_BAR_OPACITY + ((MAX_BAR_OPACITY - MIN_BAR_OPACITY) * clampedLevel) / 100
}

function shapeBarsForDisplay(bars: number[]) {
  if (bars.length <= 2) {
    return bars
  }

  const maxLevel = Math.max(...bars)
  const minLevel = Math.min(...bars)

  if (maxLevel <= 0) {
    return bars
  }

  const flatness = 1 - (maxLevel - minLevel) / maxLevel
  const loudness = maxLevel / 100
  const silhouetteBlend = clamp01((flatness * loudness - 0.35) / 0.65)

  if (silhouetteBlend <= 0) {
    return bars
  }

  return bars.map((level, index) => {
    const silhouetteLevel = level * getSilhouetteWeight(index, bars.length)

    return mix(level, silhouetteLevel, silhouetteBlend)
  })
}

function getSilhouetteWeight(index: number, count: number) {
  if (count <= 2) {
    return 1
  }

  const mirroredIndex = Math.min(index, count - 1 - index)
  const centerIndex = Math.max(1, Math.floor((count - 1) / 2))

  return MIN_SILHOUETTE_WEIGHT
    + ((1 - MIN_SILHOUETTE_WEIGHT) * mirroredIndex) / centerIndex
}

function mix(source: number, target: number, blend: number) {
  return source + (target - source) * blend
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
