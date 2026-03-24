import client from './client'
import type { Sprint, CreateSprint, BurndownPoint, VelocityPoint } from '../types'

export const getSprints = (projectId: string) => client.get<Sprint[]>(`/projects/${projectId}/sprints`).then(r => r.data)
export const getSprint = (id: string) => client.get<Sprint>(`/sprints/${id}`).then(r => r.data)
export const createSprint = (projectId: string, data: CreateSprint) => client.post<Sprint>(`/projects/${projectId}/sprints`, data).then(r => r.data)
export const updateSprint = (id: string, data: Partial<CreateSprint>) => client.put<Sprint>(`/sprints/${id}`, data).then(r => r.data)
export const startSprint = (id: string) => client.post<Sprint>(`/sprints/${id}/start`).then(r => r.data)
export const completeSprint = (id: string, next_sprint_id?: string | null) =>
  client.post<Sprint>(`/sprints/${id}/complete`, { next_sprint_id: next_sprint_id ?? null }).then(r => r.data)
export const getBurndown = (id: string) => client.get<BurndownPoint[]>(`/sprints/${id}/burndown`).then(r => r.data)
export const getVelocity = (projectId: string) => client.get<VelocityPoint[]>(`/projects/${projectId}/velocity`).then(r => r.data)
