import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'
import type { Issue, Sprint } from '../types'

type WsEvent = {
  type: string
  project_id?: string
  issue_id?: string
  user_id?: string
  workspace_id?: string
  sprint_id?: string
  issue?: Issue
  sprint?: Sprint
}

type IssueCache = Issue[] | { items: Issue[]; total: number } | undefined
type SprintCache = Sprint[] | undefined

function replaceIssueInCache(cache: IssueCache, issue: Issue): IssueCache {
  if (!cache) return cache
  if (Array.isArray(cache)) {
    return cache.map((item) => (item.id === issue.id ? issue : item))
  }
  return {
    ...cache,
    items: cache.items.map((item) => (item.id === issue.id ? issue : item)),
  }
}

function removeIssueFromCache(cache: IssueCache, issueId: string): IssueCache {
  if (!cache) return cache
  if (Array.isArray(cache)) {
    return cache.filter((item) => item.id !== issueId)
  }
  return {
    ...cache,
    items: cache.items.filter((item) => item.id !== issueId),
    total: Math.max(0, cache.total - (cache.items.some((item) => item.id === issueId) ? 1 : 0)),
  }
}

function replaceSprintInCache(cache: SprintCache, sprint: Sprint): SprintCache {
  if (!cache) return cache
  return cache.map((item) => (item.id === sprint.id ? sprint : item))
}

function handleEvent(
  event: WsEvent,
  qc: ReturnType<typeof useQueryClient>,
  currentUserId?: string,
  activeWorkspaceId?: string | null,
) {
  const { type, project_id, issue_id, user_id, workspace_id, issue, sprint } = event

  // Filter events by workspace scope: ignore events from other workspaces.
  // Notifications and events without workspace_id are always processed.
  if (workspace_id && activeWorkspaceId && workspace_id !== activeWorkspaceId) {
    return
  }

  switch (type) {
    case 'issue.created':
      if (project_id) {
        qc.invalidateQueries({ queryKey: ['issues', project_id] })
      }
      if (issue) {
        qc.setQueryData(['issue', issue.id], issue)
      }
      break

    case 'issue.updated':
      if (issue && project_id) {
        qc.setQueryData(['issue', issue.id], issue)
        qc.setQueriesData({ queryKey: ['issues', project_id] }, (current: IssueCache) =>
          replaceIssueInCache(current, issue)
        )
      } else if (project_id) {
        qc.invalidateQueries({ queryKey: ['issues', project_id] })
      }
      break

    case 'issue.deleted':
      if (project_id && issue_id) {
        qc.setQueriesData({ queryKey: ['issues', project_id] }, (current: IssueCache) =>
          removeIssueFromCache(current, issue_id)
        )
        qc.removeQueries({ queryKey: ['issue', issue_id] })
      } else if (project_id) {
        qc.invalidateQueries({ queryKey: ['issues', project_id] })
      }
      break

    case 'issue.reordered':
      if (project_id) {
        qc.invalidateQueries({ queryKey: ['issues', project_id] })
      }
      break

    case 'comment.created':
      if (issue_id) {
        qc.invalidateQueries({ queryKey: ['comments', issue_id] })
        qc.invalidateQueries({ queryKey: ['activity', issue_id] })
      }
      break

    case 'sprint.updated':
      if (project_id && sprint) {
        qc.setQueriesData({ queryKey: ['sprints', project_id] }, (current: SprintCache) =>
          replaceSprintInCache(current, sprint)
        )
      } else if (project_id) {
        qc.invalidateQueries({ queryKey: ['sprints', project_id] })
      }
      if (project_id) qc.invalidateQueries({ queryKey: ['issues', project_id] })
      break

    case 'notification.new':
      if (user_id && user_id === currentUserId) {
        qc.invalidateQueries({ queryKey: ['notifications'] })
      }
      break

    case 'attachment.created':
      if (issue_id) {
        qc.invalidateQueries({ queryKey: ['attachments', issue_id] })
      }
      break
  }
}

export function useWebSocket() {
  const { accessToken, user } = useAuthStore()
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const qc = useQueryClient()

  useEffect(() => {
    if (!accessToken) return

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    const connect = async () => {
      if (unmounted) return

      // Obtain a one-time ticket before opening the WebSocket connection
      // so the JWT never appears in the URL.
      let ticket: string
      try {
        const res = await axios.post('/api/auth/ws-ticket', null, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        ticket = res.data.ticket as string
      } catch {
        console.debug('[WS] failed to obtain ticket')
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, 3000)
        }
        return
      }

      if (unmounted) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const params = new URLSearchParams({ ticket })
      if (activeWorkspaceId) {
        params.set('workspace_id', activeWorkspaceId)
      }
      ws = new WebSocket(`${protocol}//${window.location.host}/api/ws?${params.toString()}`)

      ws.onopen = () => {
        console.debug('[WS] connected')
      }

      ws.onmessage = (e) => {
        try {
          const msg: WsEvent = JSON.parse(e.data)
          handleEvent(msg, qc, user?.id, activeWorkspaceId)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = (e) => {
        console.debug('[WS] closed', e.code)
        ws = null
        // 1008: Policy Violation (unauthorized) — don't retry
        if (!unmounted && e.code !== 1008 && e.code !== 1000) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()

    return () => {
      unmounted = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [accessToken, qc, user?.id, activeWorkspaceId])
}
