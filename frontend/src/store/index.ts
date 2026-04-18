import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Sprint } from '../types'

interface AppState {
  activeProjectId: string | null
  activeSprint: Sprint | null
  activeWorkspaceId: string | null
  pendingOpenIssueId: string | null
  pendingOpenIssueTitle: string | null
  boardFilters: {
    assignee_id?: string
    priority?: string
    type?: string
  }
  setActiveProject: (id: string | null) => void
  setActiveSprint: (sprint: Sprint | null) => void
  setActiveWorkspace: (id: string | null) => void
  setPendingOpenIssueId: (id: string | null) => void
  setPendingOpenIssueTitle: (title: string | null) => void
  setBoardFilter: (key: string, value: string | undefined) => void
  clearBoardFilters: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeSprint: null,
      activeWorkspaceId: null,
      pendingOpenIssueId: null,
      pendingOpenIssueTitle: null,
      boardFilters: {},
      setActiveProject: (id) => set({ activeProjectId: id, activeSprint: null }),
      setActiveSprint: (sprint) => set({ activeSprint: sprint }),
      setActiveWorkspace: (id) => set({ activeWorkspaceId: id, activeProjectId: null, activeSprint: null }),
      setPendingOpenIssueId: (id) => set({ pendingOpenIssueId: id }),
      setPendingOpenIssueTitle: (title) => set({ pendingOpenIssueTitle: title }),
      setBoardFilter: (key, value) =>
        set((s) => ({ boardFilters: { ...s.boardFilters, [key]: value } })),
      clearBoardFilters: () => set({ boardFilters: {} }),
    }),
    {
      name: 'nilla-app-state',
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
        // activeSprint is intentionally excluded from persistence.
        // Sprint status can change server-side, so persisting a stale
        // snapshot in localStorage would cause incorrect UI state on reload.
        activeWorkspaceId: state.activeWorkspaceId,
        boardFilters: state.boardFilters,
      }),
    }
  )
)
