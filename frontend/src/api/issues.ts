import client from './client'
import type { Issue, CreateIssue, UpdateIssue, Comment, ActivityLog } from '../types'

export interface IssueFilters {
  sprint_id?: string
  status?: string
  type?: string
  priority?: string
  assignee_id?: string
  q?: string
  limit?: number
  offset?: number
}

export const getIssues = (projectId: string, filters?: IssueFilters) =>
  client.get<Issue[]>(`/projects/${projectId}/issues`, { params: filters }).then(r => r.data)

export interface PagedIssues {
  items: Issue[]
  total: number
}

export const getIssuesPaged = (projectId: string, filters: IssueFilters): Promise<PagedIssues> =>
  client
    .get<Issue[]>(`/projects/${projectId}/issues`, { params: filters })
    .then(r => ({
      items: r.data,
      total: parseInt(r.headers['x-total-count'] ?? '0', 10),
    }))

export const getIssue = (id: string) => client.get<Issue>(`/issues/${id}`).then(r => r.data)

export const createIssue = (projectId: string, data: CreateIssue) =>
  client.post<Issue>(`/projects/${projectId}/issues`, data).then(r => r.data)

export const updateIssue = (id: string, data: UpdateIssue) =>
  client.put<Issue>(`/issues/${id}`, data).then(r => r.data)

export const deleteIssue = (id: string) => client.delete(`/issues/${id}`).then(r => r.data)

export const updateIssueStatus = (id: string, status: string) =>
  client.patch<Issue>(`/issues/${id}/status`, { status }).then(r => r.data)

export const updateIssueSprint = (id: string, sprint_id: string | null) =>
  client.patch<Issue>(`/issues/${id}/sprint`, { sprint_id }).then(r => r.data)

export const getIssueChildren = (id: string) => client.get<Issue[]>(`/issues/${id}/children`).then(r => r.data)

export const reorderIssues = (projectId: string, ids: string[]) =>
  client.put(`/projects/${projectId}/issues/reorder`, { ids }).then(r => r.data)

export const getComments = (id: string) => client.get<Comment[]>(`/issues/${id}/comments`).then(r => r.data)
export const createComment = (id: string, body: string) =>
  client.post<Comment>(`/issues/${id}/comments`, { body }).then(r => r.data)

export const getActivity = (id: string) => client.get<ActivityLog[]>(`/issues/${id}/activity`).then(r => r.data)
