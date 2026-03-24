import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trello, List, Zap, Plus, FolderOpen, LayoutDashboard, Search, LogOut, Settings, Bell, X } from 'lucide-react'
import { useToast } from './components/common/Toast'
import { extractErrorMessage } from './api/client'
import client from './api/client'
import { useAuthStore } from './store/auth'
import { BoardPage } from './pages/BoardPage'
import { BacklogPage } from './pages/BacklogPage'
import { SprintPage } from './pages/SprintPage'
import { SprintHistoryPage } from './pages/SprintHistoryPage'
import { DashboardPage } from './pages/DashboardPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { Modal } from './components/common/Modal'
import { IssueDetail } from './components/Issue/IssueDetail'
import { getProjects, getProject, createProject } from './api/projects'
import { getIssue } from './api/issues'
import { getWorkspaces, createWorkspace } from './api/workspaces'
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from './api/notifications'
import { useAppStore } from './store'
import { useWebSocket } from './hooks/useWebSocket'

type Page = 'dashboard' | 'board' | 'backlog' | 'sprints' | 'sprint-history' | 'settings'

function NewWorkspaceForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const showToast = useToast()

  const mutation = useMutation({
    mutationFn: () => createWorkspace(name),
    onSuccess: (ws) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onCreated(ws.id)
    },
    onError: () => showToast('ワークスペースの作成に失敗しました', 'error'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Name *</label>
        <input required value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="My Team" autoFocus />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
        <button type="submit" disabled={mutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? 'Creating...' : 'Create Workspace'}
        </button>
      </div>
    </form>
  )
}

function NewProjectForm({ onClose, workspaceId }: { onClose: () => void; workspaceId: string }) {
  const qc = useQueryClient()
  const { setActiveProject } = useAppStore()
  const [form, setForm] = useState({ name: '', key: '', description: '' })
  const showToast = useToast()

  const mutation = useMutation({
    mutationFn: () => createProject({ ...form, workspace_id: workspaceId }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setActiveProject(proj.id)
      onClose()
    },
    onError: (err) => showToast(extractErrorMessage(err, 'プロジェクトの作成に失敗しました'), 'error'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
        <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="My Project" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Key * (例: PROJ)</label>
        <input required value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase() }))}
          maxLength={8}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase"
          placeholder="PROJ" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
        <button type="submit" disabled={mutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </form>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [pendingOpenIssueTitle, setPendingOpenIssueTitle] = useState<string | null>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const { activeProjectId, setActiveProject, activeWorkspaceId, setActiveWorkspace, pendingOpenIssueId, setPendingOpenIssueId } = useAppStore()
  const { user, clearAuth } = useAuthStore()
  const qc = useQueryClient()
  useWebSocket()

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
        // issue が取得できない場合は何もしない
      }
    }
  }

  const handleLogout = async () => {
    await client.post('/auth/logout').catch(() => {})
    clearAuth()
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
      setSearching(searchInput.length > 0)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: getWorkspaces,
  })

  // Set the first workspace as active if none is selected
  useEffect(() => {
    if (workspaces.length > 0 && !activeWorkspaceId) {
      setActiveWorkspace(workspaces[0].id)
    }
  }, [workspaces, activeWorkspaceId, setActiveWorkspace])

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', activeWorkspaceId],
    queryFn: () => getProjects(activeWorkspaceId),
  })

  // Auto-select first project when workspace changes or projects load
  useEffect(() => {
    if (projects.length > 0 && !projects.find(p => p.id === activeProjectId)) {
      setActiveProject(projects[0].id)
    }
  }, [projects, activeProjectId, setActiveProject])

  const activeProject = projects.find(p => p.id === activeProjectId)

  const navItems: { id: Page; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { id: 'board', icon: <Trello size={16} />, label: 'Board' },
    { id: 'backlog', icon: <List size={16} />, label: 'Backlog' },
    { id: 'sprints', icon: <Zap size={16} />, label: 'Sprints' },
    { id: 'settings', icon: <Settings size={16} />, label: 'Settings' },
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-blue-600 tracking-tight">Nilla</h1>
          <p className="text-xs text-gray-400">Sprint Manager</p>
        </div>

        {/* Workspace selector */}
        <div className="px-3 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Workspace</span>
            <button onClick={() => setCreatingWorkspace(true)} aria-label="ワークスペースを作成" className="text-gray-400 hover:text-blue-600">
              <Plus size={14} />
            </button>
          </div>
          {workspaces.length > 0 && (
            <select
              value={activeWorkspaceId ?? ''}
              onChange={e => setActiveWorkspace(e.target.value || null)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Project selector */}
        <div className="px-3 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Projects</span>
            <button onClick={() => setCreatingProject(true)} aria-label="プロジェクトを作成" className="text-gray-400 hover:text-blue-600">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveProject(p.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
                  p.id === activeProjectId
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FolderOpen size={14} />
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{p.key}</span>
              </button>
            ))}
            {projects.length === 0 && (
              <p className="text-xs text-gray-400 px-2 py-1">No projects yet</p>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setSearchInput('')
                  setSearchQuery('')
                  setSearching(false)
                }
              }}
              aria-label="イシューを検索"
              placeholder="イシューを検索..."
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="px-3 py-3 flex-1 overflow-y-auto">
          {activeProject && (
            <p className="text-xs text-gray-400 px-2 mb-2 truncate">{activeProject.name}</p>
          )}
          <div className="space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setPage(item.id); setSearching(false); setSearchQuery(''); setSearchInput('') }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                  page === item.id && !searching
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </nav>
        {/* Notifications */}
        {user && (
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
        )}

        {/* User info */}
        <div className="px-3 py-3 border-t border-gray-200">
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {user.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{user.name}</p>
                </div>
              </>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">未ログイン</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              aria-label="ログアウト"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {searching
          ? <SearchPage query={searchQuery} />
          : <>
              {page === 'dashboard' && <DashboardPage />}
              {page === 'board' && <BoardPage />}
              {page === 'backlog' && <BacklogPage />}
              {page === 'sprints' && <SprintPage onNavigate={p => setPage(p as Page)} />}
              {page === 'sprint-history' && <SprintHistoryPage onNavigate={p => setPage(p as Page)} />}
              {page === 'settings' && <SettingsPage />}
            </>
        }
      </main>

      {creatingProject && activeWorkspaceId && (
        <Modal title="New Project" onClose={() => setCreatingProject(false)}>
          <NewProjectForm onClose={() => setCreatingProject(false)} workspaceId={activeWorkspaceId} />
        </Modal>
      )}

      {creatingWorkspace && (
        <Modal title="New Workspace" onClose={() => setCreatingWorkspace(false)}>
          <NewWorkspaceForm onClose={() => setCreatingWorkspace(false)} onCreated={id => { setActiveWorkspace(id); setCreatingWorkspace(false) }} />
        </Modal>
      )}

      {pendingOpenIssueId && activeProjectId && (
        <Modal title={pendingOpenIssueTitle ?? 'Issue Detail'} onClose={() => { setPendingOpenIssueId(null); setPendingOpenIssueTitle(null) }} size="lg">
          <IssueDetail
            issueId={pendingOpenIssueId}
            projectId={activeProjectId}
            onClose={() => { setPendingOpenIssueId(null); setPendingOpenIssueTitle(null) }}
          />
        </Modal>
      )}
    </div>
  )
}
