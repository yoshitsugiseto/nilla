import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, X, AtSign, MessageSquare, UserRoundPlus, Filter } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../../api/notifications'
import { getIssue } from '../../api/issues'
import { getProject } from '../../api/projects'
import { useAuthStore } from '../../store/auth'
import { useAppStore } from '../../store'

type NotificationFilter = 'all' | 'unread' | 'mention' | 'comment' | 'assigned'

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'unread', label: '未読' },
  { value: 'mention', label: 'メンション' },
  { value: 'comment', label: 'コメント' },
  { value: 'assigned', label: 'アサイン' },
]

function notificationMeta(type: string) {
  switch (type) {
    case 'mention':
      return {
        label: 'メンション',
        icon: <AtSign size={12} className="text-fuchsia-600" />,
        badgeClassName: 'bg-fuchsia-100 text-fuchsia-700',
      }
    case 'comment':
      return {
        label: 'コメント',
        icon: <MessageSquare size={12} className="text-blue-600" />,
        badgeClassName: 'bg-blue-100 text-blue-700',
      }
    case 'assigned':
      return {
        label: 'アサイン',
        icon: <UserRoundPlus size={12} className="text-emerald-600" />,
        badgeClassName: 'bg-emerald-100 text-emerald-700',
      }
    default:
      return {
        label: type,
        icon: <Bell size={12} className="text-gray-500" />,
        badgeClassName: 'bg-gray-100 text-gray-600',
      }
  }
}

function notificationPriority(type: string): number {
  switch (type) {
    case 'mention':
      return 0
    case 'assigned':
      return 1
    case 'comment':
      return 2
    default:
      return 3
  }
}

export function NotificationBell() {
  const [notifOpen, setNotifOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all')
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
  const visibleNotifications = notifications
    .filter((notification) => {
      if (activeFilter === 'all') return true
      if (activeFilter === 'unread') return !notification.read
      return notification.type === activeFilter
    })
    .slice()
    .sort((left, right) => {
      if (left.read !== right.read) return left.read ? 1 : -1
      const typeDelta = notificationPriority(left.type) - notificationPriority(right.type)
      if (typeDelta !== 0) return typeDelta
      return right.created_at.localeCompare(left.created_at)
    })

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
        <div className="absolute bottom-full left-0 mb-1 ml-3 w-[min(24rem,calc(100vw-2rem))] bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 flex flex-col">
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
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="mb-1.5 text-[10px] text-gray-400 flex items-center gap-1">
              <Filter size={11} /> 絞り込み
            </div>
            <div aria-label="通知フィルター" className="flex flex-wrap gap-1.5">
              {FILTERS.map(filter => (
                <button
                  key={filter.value}
                  onClick={() => setActiveFilter(filter.value)}
                  className={`px-2 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors ${
                    activeFilter === filter.value
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div aria-label="通知一覧" className="overflow-y-auto flex-1">
            {visibleNotifications.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">通知なし</p>
            ) : (
              visibleNotifications.map(n => {
                const meta = notificationMeta(n.type)
                return (
                <div
                  key={n.id}
                  className={`flex items-start gap-1 px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${n.read ? 'opacity-60' : ''}`}
                >
                  <button
                    onClick={() => handleNotifClick(n)}
                    className="flex-1 text-left min-w-0"
                    aria-label={`通知を開く: ${n.message}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${meta.badgeClassName}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                      {!n.read && <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(n.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNotifMutation.mutate(n.id) }}
                    className="shrink-0 text-gray-300 hover:text-red-400 transition-colors p-0.5"
                    aria-label="通知を削除"
                  >
                    <X size={12} />
                  </button>
                </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
