import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ensureAngrymiaoSession } from '@/packages/voice/angrymiao-session'
import { switchCurrentSession } from '@/stores/sessionActions'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  useEffect(() => {
    void ensureAngrymiaoSession({ purgeOthers: true }).then((session) => {
      switchCurrentSession(session.id)
    })
  }, [])

  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--chatbox-tint-secondary)]">
      Loading Angrymiao...
    </div>
  )
}
