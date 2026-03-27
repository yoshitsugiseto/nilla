import { lazy, Suspense, useRef, useState } from 'react'
import { Modal } from './components/common/Modal'
import { Sidebar } from './components/Layout'
import type { Page } from './components/Layout'
import { useAppStore } from './store'
import { useWebSocket } from './hooks/useWebSocket'
import { useProjectPermissions } from './hooks/useProjectPermissions'
import type { IssueSearchFilters } from './types'

const BoardPage = lazy(() => import('./pages/BoardPage').then((m) => ({ default: m.BoardPage })))
const BacklogPage = lazy(() => import('./pages/BacklogPage').then((m) => ({ default: m.BacklogPage })))
const SprintPage = lazy(() => import('./pages/SprintPage').then((m) => ({ default: m.SprintPage })))
const SprintHistoryPage = lazy(() => import('./pages/SprintHistoryPage').then((m) => ({ default: m.SprintHistoryPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NewWorkspaceForm = lazy(() => import('./components/Layout/NewWorkspaceForm').then((m) => ({ default: m.NewWorkspaceForm })))
const NewProjectForm = lazy(() => import('./components/Layout/NewProjectForm').then((m) => ({ default: m.NewProjectForm })))
const IssueForm = lazy(() => import('./components/Issue/IssueForm').then((m) => ({ default: m.IssueForm })))
const IssueDetail = lazy(() => import('./components/Issue/IssueDetail').then((m) => ({ default: m.IssueDetail })))

function ContentFallback() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
      読み込み中...
    </div>
  )
}

const EMPTY_SEARCH_FILTERS: IssueSearchFilters = {
  status: '',
  type: '',
  priority: '',
  assignee_id: '',
  sprint_id: '',
  due_state: '',
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [creatingIssue, setCreatingIssue] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilters, setSearchFilters] = useState<IssueSearchFilters>(EMPTY_SEARCH_FILTERS)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const {
    activeProjectId,
    activeWorkspaceId,
    setActiveWorkspace,
    pendingOpenIssueId,
    pendingOpenIssueTitle,
    setPendingOpenIssueId,
    setPendingOpenIssueTitle,
  } = useAppStore()
  const { canEditProject } = useProjectPermissions(activeProjectId)
  useWebSocket()
  const searching = searchQuery.length > 0 || Object.values(searchFilters).some(Boolean)

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    setSearchFilters(EMPTY_SEARCH_FILTERS)
  }

  const applySearchPreset = (query: string, filters: IssueSearchFilters) => {
    setSearchInput(query)
    setSearchQuery(query)
    setSearchFilters(filters)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        page={page}
        setPage={setPage}
        searching={searching}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        setSearchQuery={setSearchQuery}
        clearSearch={clearSearch}
        setCreatingProject={setCreatingProject}
        setCreatingWorkspace={setCreatingWorkspace}
        setCreatingIssue={setCreatingIssue}
        setShowShortcuts={setShowShortcuts}
        searchInputRef={searchInputRef}
      />

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        <Suspense fallback={<ContentFallback />}>
          {searching
            ? (
              <SearchPage
                query={searchQuery}
                filters={searchFilters}
                onApplyPreset={applySearchPreset}
                onFiltersChange={setSearchFilters}
              />
            )
            : <>
                {page === 'dashboard' && <DashboardPage onOpenSearch={applySearchPreset} />}
                {page === 'board' && <BoardPage />}
                {page === 'backlog' && <BacklogPage />}
                {page === 'sprints' && <SprintPage onNavigate={p => setPage(p as Page)} onOpenSearch={applySearchPreset} />}
                {page === 'sprint-history' && <SprintHistoryPage onNavigate={p => setPage(p as Page)} />}
                {page === 'settings' && <SettingsPage />}
              </>
          }
        </Suspense>
      </main>

      {creatingProject && activeWorkspaceId && (
        <Modal title="New Project" onClose={() => setCreatingProject(false)}>
          <Suspense fallback={<ContentFallback />}>
            <NewProjectForm onClose={() => setCreatingProject(false)} workspaceId={activeWorkspaceId} />
          </Suspense>
        </Modal>
      )}

      {creatingWorkspace && (
        <Modal title="New Workspace" onClose={() => setCreatingWorkspace(false)}>
          <Suspense fallback={<ContentFallback />}>
            <NewWorkspaceForm onClose={() => setCreatingWorkspace(false)} onCreated={id => { setActiveWorkspace(id); setCreatingWorkspace(false) }} />
          </Suspense>
        </Modal>
      )}

      {creatingIssue && activeProjectId && canEditProject && (
        <Modal title="New Issue" onClose={() => setCreatingIssue(false)}>
          <Suspense fallback={<ContentFallback />}>
            <IssueForm projectId={activeProjectId} onClose={() => setCreatingIssue(false)} />
          </Suspense>
        </Modal>
      )}

      {showShortcuts && (
        <Modal title="キーボードショートカット" onClose={() => setShowShortcuts(false)} size="sm">
          <div className="space-y-1 text-sm">
            {[
              { key: 'n', desc: '新規Issueを作成' },
              { key: '/', desc: '検索にフォーカス' },
              { key: 'b', desc: 'Backlogへ移動' },
              { key: 'd', desc: 'Board（Dashboard）へ移動' },
              { key: 's', desc: 'Sprintsへ移動' },
              { key: '?', desc: 'このヘルプを表示' },
              { key: 'Esc', desc: 'モーダルを閉じる / 検索をクリア' },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center gap-3 py-1.5">
                <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-700 min-w-8 text-center shrink-0">
                  {key}
                </kbd>
                <span className="text-gray-600">{desc}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {pendingOpenIssueId && activeProjectId && (
        <Modal title={pendingOpenIssueTitle ?? 'Issue Detail'} onClose={() => { setPendingOpenIssueId(null); setPendingOpenIssueTitle(null) }} size="lg">
          <Suspense fallback={<ContentFallback />}>
            <IssueDetail
              issueId={pendingOpenIssueId}
              projectId={activeProjectId}
              onClose={() => { setPendingOpenIssueId(null); setPendingOpenIssueTitle(null) }}
            />
          </Suspense>
        </Modal>
      )}
    </div>
  )
}
