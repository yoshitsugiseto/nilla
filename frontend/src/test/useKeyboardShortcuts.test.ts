import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

function fireKeyOnElement(
  element: HTMLElement,
  key: string,
  options: Partial<KeyboardEventInit> = {}
) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('fires callback when registered key is pressed', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    fireKey('b')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('does not fire callback for unregistered keys', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    fireKey('x')

    expect(handler).not.toHaveBeenCalled()
  })

  test('supports multiple shortcut keys', () => {
    const handlerB = vi.fn()
    const handlerD = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handlerB, d: handlerD }))

    fireKey('b')
    fireKey('d')

    expect(handlerB).toHaveBeenCalledTimes(1)
    expect(handlerD).toHaveBeenCalledTimes(1)
  })

  test('does not fire when focus is on an INPUT element', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireKeyOnElement(input, 'b')

    expect(handler).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  test('does not fire when focus is on a TEXTAREA element', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    fireKeyOnElement(textarea, 'b')

    expect(handler).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  test('does not fire when focus is on a SELECT element', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    const select = document.createElement('select')
    document.body.appendChild(select)
    select.focus()

    fireKeyOnElement(select, 'b')

    expect(handler).not.toHaveBeenCalled()
    document.body.removeChild(select)
  })

  test('does not fire when focus is on a contentEditable element', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    div.focus()

    fireKeyOnElement(div, 'b')

    expect(handler).not.toHaveBeenCalled()
    document.body.removeChild(div)
  })

  test('does not fire when metaKey is held', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    fireKey('b', { metaKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  test('does not fire when ctrlKey is held', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    fireKey('b', { ctrlKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  test('does not fire when altKey is held', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts({ b: handler }))

    fireKey('b', { altKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  test('removes listener on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useKeyboardShortcuts({ b: handler }))

    unmount()
    fireKey('b')

    expect(handler).not.toHaveBeenCalled()
  })
})
