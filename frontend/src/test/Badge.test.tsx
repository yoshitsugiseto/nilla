import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, PriorityBadge, TypeIcon } from '../components/common/Badge'

describe('StatusBadge', () => {
  test('renders 未着手 for todo status', () => {
    render(<StatusBadge status="todo" />)
    expect(screen.getByText('未着手')).toBeInTheDocument()
  })

  test('renders 進行中 for in_progress status', () => {
    render(<StatusBadge status="in_progress" />)
    expect(screen.getByText('進行中')).toBeInTheDocument()
  })

  test('renders レビュー待ち for in_review status', () => {
    render(<StatusBadge status="in_review" />)
    expect(screen.getByText('レビュー待ち')).toBeInTheDocument()
  })

  test('renders 完了 for done status', () => {
    render(<StatusBadge status="done" />)
    expect(screen.getByText('完了')).toBeInTheDocument()
  })
})

describe('PriorityBadge', () => {
  test('renders 最優先', () => {
    render(<PriorityBadge priority="critical" />)
    expect(screen.getByText('最優先')).toBeInTheDocument()
  })

  test('renders 高', () => {
    render(<PriorityBadge priority="high" />)
    expect(screen.getByText('高')).toBeInTheDocument()
  })

  test('renders 中', () => {
    render(<PriorityBadge priority="medium" />)
    expect(screen.getByText('中')).toBeInTheDocument()
  })

  test('renders 低', () => {
    render(<PriorityBadge priority="low" />)
    expect(screen.getByText('低')).toBeInTheDocument()
  })
})

describe('TypeIcon', () => {
  test('renders ストーリー with title attribute', () => {
    render(<TypeIcon type="story" />)
    expect(screen.getByTitle('ストーリー')).toBeInTheDocument()
  })

  test('renders タスク with title attribute', () => {
    render(<TypeIcon type="task" />)
    expect(screen.getByTitle('タスク')).toBeInTheDocument()
  })

  test('renders バグ with title attribute', () => {
    render(<TypeIcon type="bug" />)
    expect(screen.getByTitle('バグ')).toBeInTheDocument()
  })

  test('renders 調査 with title attribute', () => {
    render(<TypeIcon type="spike" />)
    expect(screen.getByTitle('調査')).toBeInTheDocument()
  })
})
