import { useState, useRef } from 'react'
import { Modal } from './components/common/Modal'
import { IssueDetail } from './components/Issue/IssueDetail'
import { IssueForm } from './components/Issue/IssueForm'
import { BoardPage } from './pages/BoardPage'
import { BacklogPage } from './pages/BacklogPage'
import { SprintPage } from './pages/SprintPage'
import { SprintHistoryPage } from './pages/SprintHistoryPage'
import { DashboardPage } from './pages/DashboardPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { Sidebar, NewWorkspaceForm, NewProjectForm } from './components/Layout'
import type { Page } from './components/Layout'
import { useAppStore } from './store'
import { useWebSocket } from './hooks/useWebSocket'

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [creatingIssue, setCreatingIssue] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [pendingOpenIssueTitle, setPendingOpenIssueTitle] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { activeProjectId, activeWorkspaceId, setActiveWorkspace, pendingOpenIssueId, setPendingOpenIssueId } = useAppStore()
  useWebSocket()

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
        setSearching={setSearching}
        setCreatingProject={setCreatingProject}
        setCreatingWorkspace={setCreatingWorkspace}
        setCreatingIssue={setCreatingIssue}
        setShowShortcuts={setShowShortcuts}
        searchInputRef={searchInputRef}
      />

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

      {creatingIssue && activeProjectId && (
        <Modal title="New Issue" onClose={() => setCreatingIssue(false)}>
          <IssueForm projectId={activeProjectId} onClose={() => setCreatingIssue(false)} />
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
