import { useRef } from 'react'
import {
  startCurrentWindowDragging,
  toggleCurrentWindowMaximize,
} from '../../lib/tauri'

const DRAG_START_THRESHOLD_PX = 4

type PointerState = {
  startX: number
  startY: number
}

export function useManualTitlebarDrag() {
  const dragStateRef = useRef<PointerState | null>(null)

  const resetDragState = () => {
    dragStateRef.current = null
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    const dragState = dragStateRef.current
    if (!dragState) {
      return
    }

    const dragDistance = Math.hypot(
      event.clientX - dragState.startX,
      event.clientY - dragState.startY,
    )
    if (dragDistance < DRAG_START_THRESHOLD_PX) {
      return
    }

    resetDragState()
    event.preventDefault()
    void startCurrentWindowDragging()
  }

  const handleMouseUp = () => {
    if (dragStateRef.current) {
      resetDragState()
    }
  }

  const handleDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    resetDragState()
    void toggleCurrentWindowMaximize()
  }

  return {
    onDoubleClick: handleDoubleClick,
    onMouseDown: handleMouseDown,
    onMouseLeave: handleMouseUp,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  }
}
