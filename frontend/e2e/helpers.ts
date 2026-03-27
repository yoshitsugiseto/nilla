import type { Page } from '@playwright/test'

export const WORKSPACE = {
  id: 'ws-1',
  name: 'Test Workspace',
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
}

export const PROJECT = {
  id: 'proj-1',
  name: 'Test Project',
  key: 'TP',
  description: null,
  workspace_id: 'ws-1',
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
}

export const SPRINT = {
  id: 'sprint-1',
  project_id: 'proj-1',
  name: 'Sprint 1',
  goal: null,
  status: 'active',
  start_date: '2026-01-01',
  end_date: '2026-01-14',
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
}

export const TEST_USER = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  avatar_url: null,
  provider: 'demo',
}

export const PROJECT_MEMBER = {
  workspace_id: 'ws-1',
  project_id: 'proj-1',
  user_id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  avatar_url: null,
  role: 'admin',
  workspace_role: 'owner',
  inherited: true,
  joined_at: '2026-01-01T00:00:00',
}

export const SEARCH_ISSUE = {
  id: 'issue-1',
  project_id: 'proj-1',
  sprint_id: 'sprint-1',
  parent_id: null,
  epic_id: null,
  epic_title: null,
  number: 42,
  title: 'Login form validation',
  description: 'Search result issue description',
  type: 'bug',
  status: 'todo',
  priority: 'high',
  points: 3,
  assignee_id: 'user-1',
  assignee_name: 'Test User',
  assignee_avatar_url: null,
  labels: ['Frontend'],
  position: 0,
  due_date: null,
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
}

export const NEXT_SPRINT = {
  ...SPRINT,
  id: 'sprint-2',
  name: 'Sprint 2',
  status: 'planning',
}

export const WORKSPACE_AUTOMATION = {
  notify_on_assignee_change: true,
  notify_on_review_ready: true,
  notify_on_overdue_transition: true,
  sprint_carryover_mode: 'prompt',
}

export async function clearStorage(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('nilla-app-state')
  })
}

export async function mockAuth(page: Page) {
  await page.route('**/api/auth/refresh', route =>
    route.fulfill({ json: { access_token: 'test-token' } })
  )
  await page.route('**/api/auth/me', route => route.fulfill({ json: TEST_USER }))
  await page.route('**/api/auth/ws-ticket', route => route.fulfill({ json: { ticket: 'test-ticket' } }))
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 204 }))
  await page.routeWebSocket('**/api/ws**', () => { /* accept, no messages */ })
}

export async function mockEmptyApi(page: Page) {
  await mockAuth(page)
  await page.route('**/api/workspaces', route => route.fulfill({ json: [] }))
  await page.route(/\/api\/projects(\?.*)?$/, route => route.fulfill({ json: [] }))
  await page.route('**/api/notifications', route => route.fulfill({ json: [] }))
}

export async function mockProjectApi(page: Page) {
  await mockAuth(page)
  await page.route('**/api/workspaces', route => route.fulfill({ json: [WORKSPACE] }))
  await page.route('**/api/workspaces/ws-1/automation', route =>
    route.fulfill({ json: WORKSPACE_AUTOMATION })
  )
  await page.route(/\/api\/projects(\?.*)?$/, route => route.fulfill({ json: [PROJECT] }))
  await page.route('**/api/projects/proj-1/members', route => route.fulfill({ json: [PROJECT_MEMBER] }))
  await page.route('**/api/projects/proj-1/sprints', route => route.fulfill({ json: [SPRINT] }))
  await page.route('**/api/projects/proj-1/velocity', route => route.fulfill({ json: [] }))
  await page.route('**/api/projects/proj-1/issues**', route =>
    route.fulfill({ json: [], headers: { 'x-total-count': '0' } })
  )
  await page.route('**/api/sprints/sprint-1/burndown', route => route.fulfill({ json: [] }))
  await page.route('**/api/notifications', route => route.fulfill({ json: [] }))
}

export async function mockIssueDetailApi(page: Page, issue = SEARCH_ISSUE) {
  await page.route(`**/api/issues/${issue.id}`, route => route.fulfill({ json: issue }))
  await page.route(`**/api/issues/${issue.id}/comments`, route => route.fulfill({ json: [] }))
  await page.route(`**/api/issues/${issue.id}/children`, route => route.fulfill({ json: [] }))
  await page.route(`**/api/issues/${issue.id}/links`, route => route.fulfill({ json: [] }))
  await page.route('**/api/projects/proj-1/labels', route => route.fulfill({ json: [] }))
  await page.route(/\/api\/projects\/proj-1\/issues(\?.*)?$/, route =>
    route.fulfill({ json: [issue], headers: { 'x-total-count': '1' } })
  )
}

export async function mockSprintCompletionApi(page: Page) {
  const activeSprint = { ...SPRINT, status: 'active', name: 'Sprint Active' }
  const nextSprint = { ...NEXT_SPRINT }
  const issues = [
    {
      ...SEARCH_ISSUE,
      id: 'issue-1',
      title: 'Carry over issue',
      sprint_id: 'sprint-1',
      status: 'todo',
      points: 3,
      number: 11,
    },
    {
      ...SEARCH_ISSUE,
      id: 'issue-2',
      title: 'Done issue',
      sprint_id: 'sprint-1',
      status: 'done',
      points: 5,
      number: 12,
    },
  ]

  await page.route('**/api/projects/proj-1/sprints', route =>
    route.fulfill({ json: [activeSprint, nextSprint] })
  )
  await page.route('**/api/projects/proj-1/members', route =>
    route.fulfill({ json: [PROJECT_MEMBER] })
  )
  await page.route('**/api/projects/proj-1/issues**', route =>
    route.fulfill({ json: issues, headers: { 'x-total-count': String(issues.length) } })
  )
  await page.route('**/api/issues/issue-2/activity', route => route.fulfill({ json: [] }))
  await page.route('**/api/sprints/sprint-1/complete', route =>
    route.fulfill({ json: { ...activeSprint, status: 'completed' } })
  )
}

export function withProject(page: Page) {
  return page.addInitScript(() => {
    localStorage.setItem(
      'nilla-app-state',
      JSON.stringify({
        state: { activeProjectId: 'proj-1', activeWorkspaceId: 'ws-1', activeSprint: null, boardFilters: {} },
        version: 0,
      })
    )
  })
}

export function withActiveWorkspace(page: Page) {
  return page.addInitScript(() => {
    localStorage.setItem(
      'nilla-app-state',
      JSON.stringify({
        state: { activeProjectId: null, activeWorkspaceId: 'ws-1', activeSprint: null, boardFilters: {} },
        version: 0,
      })
    )
  })
}
