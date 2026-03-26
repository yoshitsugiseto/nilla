import { useEffect, useState } from 'react'

const TIME_UPDATE_INTERVAL_MS = 60_000

export function useCurrentTime(): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setNowMs(Date.now())

    update()
    const timer = window.setInterval(update, TIME_UPDATE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [])

  return nowMs
}
