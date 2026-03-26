import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../components/common/Toast'
import { useToast } from '../components/common/useToast'

function ShowToastButton({ message, type }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const showToast = useToast()
  return <button onClick={() => showToast(message, type)}>Show</button>
}

describe('Toast', () => {
  test('shows toast message when triggered', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ShowToastButton message="Operation successful" type="success" />
      </ToastProvider>
    )
    await user.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Operation successful')).toBeInTheDocument()
  })

  test('dismisses toast when close button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ShowToastButton message="Dismiss me" type="info" />
      </ToastProvider>
    )
    await user.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '通知を閉じる' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('can show multiple toasts', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ShowToastButton message="First" type="success" />
        <ShowToastButton message="Second" type="error" />
      </ToastProvider>
    )
    const buttons = screen.getAllByRole('button', { name: 'Show' })
    await user.click(buttons[0])
    await user.click(buttons[1])
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  test('toast container has aria-live polite attribute', () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>
    )
    const container = screen.getByLabelText('通知')
    expect(container).toHaveAttribute('aria-live', 'polite')
  })
})
