import client from './client'
import type { ProjectLabel } from '../types'

export const getLabels = (projectId: string) =>
  client.get<ProjectLabel[]>(`/projects/${projectId}/labels`).then(r => r.data)

export const createLabel = (projectId: string, name: string, color?: string) =>
  client.post<ProjectLabel>(`/projects/${projectId}/labels`, { name, color }).then(r => r.data)

export const updateLabel = (labelId: string, data: { name?: string; color?: string }) =>
  client.put<ProjectLabel>(`/labels/${labelId}`, data).then(r => r.data)

export const deleteLabel = (labelId: string) =>
  client.delete(`/labels/${labelId}`).then(r => r.data)
