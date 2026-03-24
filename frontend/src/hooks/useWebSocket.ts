import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'

type WsEvent = {
  type: string
  project_id?: string
  issue_id?: string
  user_id?: string
}

function handleEvent(event: WsEvent, qc: ReturnType<typeof useQueryClient>, currentUserId?: string) {
  const { type, project_id, issue_id, user_id } = event

  switch (type) {
    case 'issue.created':
    case 'issue.updated':
    case 'issue.deleted':
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
      if (project_id) {
        qc.invalidateQueries({ queryKey: ['sprints', project_id] })
        qc.invalidateQueries({ queryKey: ['issues', project_id] })
      }
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
  const qc = useQueryClient()

  useEffect(() => {
    if (!accessToken) return

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    const connect = () => {
      if (unmounted) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}/api/ws?token=${accessToken}`)

      ws.onopen = () => {
        console.debug('[WS] connected')
      }

      ws.onmessage = (e) => {
        try {
          const msg: WsEvent = JSON.parse(e.data)
          handleEvent(msg, qc, user?.id)
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
  }, [accessToken, qc, user?.id])
}
