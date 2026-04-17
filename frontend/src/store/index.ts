import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { IssueSearchFilters, SearchPreset, Sprint } from '../types'

interface AppState {
  activeProjectId: string | null
  activeSprint: Sprint | null
  activeWorkspaceId: string | null
  pendingOpenIssueId: string | null
  pendingOpenIssueTitle: string | null
  // @deprecated Local search presets are kept for backward compatibility.
  // The server-side API (api/searchPresets.ts) is the source of truth for
  // shared presets. These local presets should be migrated to a per-user
  // server-side endpoint and then removed from the store.
  searchPresets: SearchPreset[]
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
  /** @deprecated Use server-side search presets API instead. */
  saveSearchPreset: (projectId: string, name: string, query: string, filters: IssueSearchFilters) => void
  /** @deprecated Use server-side search presets API instead. */
  renameSearchPreset: (id: string, name: string) => void
  /** @deprecated Use server-side search presets API instead. */
  deleteSearchPreset: (id: string) => void
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
      searchPresets: [],
      boardFilters: {},
      setActiveProject: (id) => set({ activeProjectId: id, activeSprint: null }),
      setActiveSprint: (sprint) => set({ activeSprint: sprint }),
      setActiveWorkspace: (id) => set({ activeWorkspaceId: id, activeProjectId: null, activeSprint: null }),
      setPendingOpenIssueId: (id) => set({ pendingOpenIssueId: id }),
      setPendingOpenIssueTitle: (title) => set({ pendingOpenIssueTitle: title }),
      saveSearchPreset: (projectId, name, query, filters) =>
        set((state) => {
          const now = new Date().toISOString()
          const existing = state.searchPresets.find(
            (preset) =>
              preset.project_id === projectId &&
              preset.query === query &&
              JSON.stringify(preset.filters) === JSON.stringify(filters)
          )

          if (existing) {
            return {
              searchPresets: state.searchPresets.map((preset) =>
                preset.id === existing.id
                  ? { ...preset, name, updated_at: now }
                  : preset
              ),
            }
          }

          return {
            searchPresets: [
              {
                id: crypto.randomUUID(),
                project_id: projectId,
                name,
                query,
                filters,
                created_at: now,
                updated_at: now,
              },
              ...state.searchPresets,
            ].slice(0, 20),
          }
        }),
      renameSearchPreset: (id, name) =>
        set((state) => ({
          searchPresets: state.searchPresets.map((preset) =>
            preset.id === id
              ? { ...preset, name, updated_at: new Date().toISOString() }
              : preset
          ),
        })),
      deleteSearchPreset: (id) =>
        set((state) => ({
          searchPresets: state.searchPresets.filter((preset) => preset.id !== id),
        })),
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
        searchPresets: state.searchPresets,
        boardFilters: state.boardFilters,
      }),
    }
  )
)
