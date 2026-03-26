import { useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trello, List, Zap, Plus, FolderOpen, LayoutDashboard, Search, LogOut, Settings, Keyboard } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { useAppStore } from '../../store'
import { getWorkspaces } from '../../api/workspaces'
import { getProjects } from '../../api/projects'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useProjectPermissions } from '../../hooks/useProjectPermissions'
import client from '../../api/client'
import { NotificationBell } from './NotificationBell'

export type Page = 'dashboard' | 'board' | 'backlog' | 'sprints' | 'sprint-history' | 'settings'

interface SidebarProps {
  page: Page
  setPage: (page: Page) => void
  searching: boolean
  searchInput: string
  setSearchInput: (value: string) => void
  setSearchQuery: (value: string) => void
  clearSearch: () => void
  setCreatingProject: (value: boolean) => void
  setCreatingWorkspace: (value: boolean) => void
  setCreatingIssue: (value: boolean) => void
  setShowShortcuts: (value: boolean) => void
  searchInputRef: React.RefObject<HTMLInputElement | null>
}

export function Sidebar({
  page,
  setPage,
  searching,
  searchInput,
  setSearchInput,
  setSearchQuery,
  clearSearch,
  setCreatingProject,
  setCreatingWorkspace,
  setCreatingIssue,
  setShowShortcuts,
  searchInputRef,
}: SidebarProps) {
  const { activeProjectId, setActiveProject, activeWorkspaceId, setActiveWorkspace } = useAppStore()
  const { user, clearAuth } = useAuthStore()
  const { canEditProject } = useProjectPermissions(activeProjectId)

  useKeyboardShortcuts({
    'n': () => { if (activeProjectId && canEditProject) setCreatingIssue(true) },
    '/': () => { searchInputRef.current?.focus() },
    '?': () => setShowShortcuts(true),
    'b': () => { setPage('backlog'); clearSearch() },
    'd': () => { setPage('board'); clearSearch() },
    's': () => { setPage('sprints'); clearSearch() },
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput, setSearchQuery])

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

  const handleLogout = async () => {
    await client.post('/auth/logout').catch(() => {})
    clearAuth()
  }

  const navItems: { id: Page; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { id: 'board', icon: <Trello size={16} />, label: 'Board' },
    { id: 'backlog', icon: <List size={16} />, label: 'Backlog' },
    { id: 'sprints', icon: <Zap size={16} />, label: 'Sprints' },
    { id: 'settings', icon: <Settings size={16} />, label: 'Settings' },
  ]

  return (
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
            ref={searchInputRef}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                clearSearch()
                searchInputRef.current?.blur()
              }
            }}
            aria-label="イシューを検索"
            placeholder="イシューを検索... (/)"
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
              onClick={() => { setPage(item.id); clearSearch() }}
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

      {/* Keyboard shortcuts hint */}
      <div className="px-3 pb-1">
        <button
          onClick={() => setShowShortcuts(true)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-xs"
        >
          <Keyboard size={13} />
          ショートカット (?)
        </button>
      </div>

      {/* Notifications */}
      <NotificationBell />

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
  )
}
