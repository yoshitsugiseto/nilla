import { useEffect, useEffectEvent } from 'react'

type ShortcutMap = Record<string, () => void>

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    // input/textarea/select にフォーカス中は無効
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) return
    // 修飾キー付きは無効
    if (e.metaKey || e.ctrlKey || e.altKey) return

    const fn = shortcuts[e.key]
    if (fn) {
      e.preventDefault()
      fn()
    }
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      handleKeyDown(e)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
