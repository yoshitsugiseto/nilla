import { useEffect, useRef } from 'react'

type ShortcutMap = Record<string, () => void>

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  // ref経由で最新のshortcutsを参照（stale closure防止）
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

      const fn = shortcutsRef.current[e.key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
