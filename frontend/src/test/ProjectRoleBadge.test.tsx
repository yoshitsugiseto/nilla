import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'

describe('ProjectRoleBadge', () => {
  test('maps legacy workspace roles to project role labels safely', () => {
    const { rerender } = render(<ProjectRoleBadge role="owner" />)

    expect(screen.getByText('管理者')).toBeInTheDocument()

    rerender(<ProjectRoleBadge role="member" />)
    expect(screen.getByText('編集可')).toBeInTheDocument()
  })

  test('ignores unknown roles without crashing', () => {
    render(<ProjectRoleBadge role="unexpected-role" />)

    expect(screen.queryByText('管理者')).not.toBeInTheDocument()
    expect(screen.queryByText('編集可')).not.toBeInTheDocument()
    expect(screen.queryByText('閲覧専用')).not.toBeInTheDocument()
  })
})
