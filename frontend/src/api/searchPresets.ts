import client from './client'
import type { IssueSearchFilters, SearchPreset } from '../types'

interface SearchPresetPayload {
  name: string
  query: string
  filters: IssueSearchFilters
}

export const getSearchPresets = (projectId: string) =>
  client.get<SearchPreset[]>(`/projects/${projectId}/search-presets`).then(r => r.data)

export const createSearchPreset = (projectId: string, data: SearchPresetPayload) =>
  client.post<SearchPreset>(`/projects/${projectId}/search-presets`, data).then(r => r.data)

export const updateSearchPreset = (
  presetId: string,
  data: Partial<SearchPresetPayload>,
) => client.put<SearchPreset>(`/search-presets/${presetId}`, data).then(r => r.data)

export const deleteSearchPreset = (presetId: string) =>
  client.delete(`/search-presets/${presetId}`).then(r => r.data)
