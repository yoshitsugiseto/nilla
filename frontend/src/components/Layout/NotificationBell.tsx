import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, X } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../../api/notifications'
import { getIssue } from '../../api/issues'
import { getProject } from '../../api/projects'
import { useAuthStore } from '../../store/auth'
import { useAppStore } from '../../store'

export function NotificationBell() {
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const { user } = useAuthStore()
  const {
    setActiveProject,
    setActiveWorkspace,
    setPendingOpenIssueId,
    setPendingOpenIssueTitle,
  } = useAppStore()
  const qc = useQueryClient()

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: !!user,
    refetchInterval: 60000,
  })

  const unreadCount = notifications.filter(n => !n.read).length

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const deleteNotifMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
      setNotifOpen(false)
    }
  }, [])

  useEffect(() => {
    if (notifOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen, handleClickOutside])

  const handleNotifClick = async (n: { id: string; read: boolean; issue_id: string | null }) => {
    if (!n.read) markReadMutation.mutate(n.id)
    if (n.issue_id) {
      setNotifOpen(false)
      try {
        const issue = await getIssue(n.issue_id)
        const project = await getProject(issue.project_id)
        if (project.workspace_id) setActiveWorkspace(project.workspace_id)
        setActiveProject(issue.project_id)
        setPendingOpenIssueTitle(issue.title)
        setPendingOpenIssueId(n.issue_id)
      } catch {
        // issue cannot be fetched — do nothing
      }
    }
  }

  if (!user) return null

  return (
    <div ref={notifRef} className="px-3 py-2 border-t border-gray-200 relative">
      <button
        onClick={() => setNotifOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <div className="relative">
          <Bell size={14} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <span className="text-xs">通知</span>
      </button>
      {notifOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-700">通知</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                すべて既読
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">通知なし</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-1 px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${n.read ? 'opacity-60' : ''}`}
                >
                  <button
                    onClick={() => handleNotifClick(n)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-xs text-gray-700 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(n.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {!n.read && <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full mt-1" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNotifMutation.mutate(n.id) }}
                    className="shrink-0 text-gray-300 hover:text-red-400 transition-colors p-0.5"
                    aria-label="通知を削除"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
