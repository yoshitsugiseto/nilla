import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ProjectRoleBadge } from '../components/common/ProjectRoleBadge'

describe('ProjectRoleBadge', () => {
  test('maps legacy workspace roles to project role labels safely', () => {
    const { rerender } = render(<ProjectRoleBadge role="owner" />)

    expect(screen.getByText('Project Admin')).toBeInTheDocument()

    rerender(<ProjectRoleBadge role="member" />)
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })

  test('ignores unknown roles without crashing', () => {
    render(<ProjectRoleBadge role="unexpected-role" />)

    expect(screen.queryByText('Project Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Editor')).not.toBeInTheDocument()
    expect(screen.queryByText('閲覧専用')).not.toBeInTheDocument()
  })
})
