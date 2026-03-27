import { describe, expect, test } from 'vitest'
import { buildAverageCycleSnapshot } from '../utils/reporting'
import type { ActivityLog, Issue } from '../types'

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    project_id: 'project-1',
    sprint_id: null,
    parent_id: null,
    epic_id: null,
    epic_title: null,
    number: 1,
    title: 'Done issue',
    description: null,
    type: 'task',
    status: 'done',
    priority: 'medium',
    points: 3,
    assignee_id: null,
    assignee_name: null,
    assignee_avatar_url: null,
    labels: [],
    position: 0,
    due_date: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-10T00:00:00Z',
    ...overrides,
  }
}

function makeStatusLog(
  id: string,
  newValue: string,
  createdAt: string,
  oldValue: string | null = null,
): ActivityLog {
  return {
    id,
    issue_id: 'issue-1',
    field: 'status',
    old_value: oldValue,
    new_value: newValue,
    created_at: createdAt,
  }
}

describe('reporting', () => {
  test('uses the latest active transition before the final done state for cycle time', () => {
    const issue = makeIssue()
    const activityByIssueId = {
      'issue-1': [
        makeStatusLog('1', 'in_progress', '2026-03-02T00:00:00Z', 'todo'),
        makeStatusLog('2', 'done', '2026-03-04T00:00:00Z', 'in_progress'),
        makeStatusLog('3', 'todo', '2026-03-05T00:00:00Z', 'done'),
        makeStatusLog('4', 'in_review', '2026-03-08T00:00:00Z', 'in_progress'),
        makeStatusLog('5', 'done', '2026-03-10T00:00:00Z', 'in_review'),
      ],
    }

    const result = buildAverageCycleSnapshot([issue], Date.parse('2026-03-15T00:00:00Z'), 30, activityByIssueId)

    expect(result).toBe(2)
  })
})
