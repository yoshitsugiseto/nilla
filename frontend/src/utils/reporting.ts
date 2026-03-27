import type { Issue, Sprint } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

interface ThroughputSnapshot {
  issueCount: number
  pointCount: number
}

export interface ActiveSprintSnapshot {
  doneIssues: number
  totalIssues: number
  donePoints: number
  totalPoints: number
  remainingIssues: number
  remainingPoints: number
  overdueCount: number
  unassignedCount: number
  reviewCount: number
  avgCycleDays: number | null
}

function safeDayDiff(startIso: string, endIso: string) {
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null
  }
  return Math.max(1, Math.ceil((endMs - startMs) / DAY_MS))
}

function doneIssuesWithinWindow(issues: Issue[], nowMs: number, windowDays: number) {
  const cutoffMs = nowMs - windowDays * DAY_MS
  return issues.filter(issue => {
    if (issue.status !== 'done') return false
    const updatedMs = new Date(issue.updated_at).getTime()
    return Number.isFinite(updatedMs) && updatedMs >= cutoffMs
  })
}

export function buildThroughputSnapshot(
  issues: Issue[],
  nowMs: number | null,
  windowDays: number,
): ThroughputSnapshot {
  if (nowMs == null) {
    return { issueCount: 0, pointCount: 0 }
  }

  const completed = doneIssuesWithinWindow(issues, nowMs, windowDays)
  return {
    issueCount: completed.length,
    pointCount: completed.reduce((sum, issue) => sum + (issue.points ?? 0), 0),
  }
}

export function buildAverageCycleSnapshot(
  issues: Issue[],
  nowMs: number | null,
  windowDays: number,
): number | null {
  if (nowMs == null) return null

  const completed = doneIssuesWithinWindow(issues, nowMs, windowDays)
  const durations = completed
    .map(issue => safeDayDiff(issue.created_at, issue.updated_at))
    .filter((value): value is number => value != null)

  if (durations.length === 0) return null
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
}

export function buildOpenRiskSnapshot(issues: Issue[], nowMs: number | null) {
  const openIssues = issues.filter(issue => issue.status !== 'done')
  return {
    overdueCount: openIssues.filter(issue => {
      if (!issue.due_date || nowMs == null) return false
      return new Date(`${issue.due_date}T23:59:59`).getTime() < nowMs
    }).length,
    unassignedCount: openIssues.filter(issue => !issue.assignee_id).length,
    reviewCount: openIssues.filter(issue => issue.status === 'in_review').length,
  }
}

export function buildActiveSprintSnapshot(
  sprint: Sprint | undefined,
  issues: Issue[],
  nowMs: number | null,
): ActiveSprintSnapshot | null {
  if (!sprint) return null

  const sprintIssues = issues.filter(issue => issue.sprint_id === sprint.id && !issue.parent_id)
  const doneIssues = sprintIssues.filter(issue => issue.status === 'done')
  const openIssues = sprintIssues.filter(issue => issue.status !== 'done')

  return {
    doneIssues: doneIssues.length,
    totalIssues: sprintIssues.length,
    donePoints: doneIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0),
    totalPoints: sprintIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0),
    remainingIssues: openIssues.length,
    remainingPoints: openIssues.reduce((sum, issue) => sum + (issue.points ?? 0), 0),
    overdueCount: openIssues.filter(issue => {
      if (!issue.due_date || nowMs == null) return false
      return new Date(`${issue.due_date}T23:59:59`).getTime() < nowMs
    }).length,
    unassignedCount: openIssues.filter(issue => !issue.assignee_id).length,
    reviewCount: openIssues.filter(issue => issue.status === 'in_review').length,
    avgCycleDays: doneIssues.length > 0
      ? (() => {
          const durations = doneIssues
            .map(issue => safeDayDiff(issue.created_at, issue.updated_at))
            .filter((value): value is number => value != null)
          if (durations.length === 0) return null
          return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        })()
      : null,
  }
}
