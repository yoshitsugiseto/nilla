import client from './client'
import type { Workspace, WorkspaceMember, User } from '../types'

export const getWorkspaces = () => client.get<Workspace[]>('/workspaces').then(r => r.data)
export const createWorkspace = (name: string) => client.post<Workspace>('/workspaces', { name }).then(r => r.data)
export const updateWorkspace = (id: string, name: string) => client.put<Workspace>(`/workspaces/${id}`, { name }).then(r => r.data)
export const getWorkspaceMembers = (workspaceId: string) => client.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`).then(r => r.data)
export const addWorkspaceMember = (workspaceId: string, userId: string, role?: string) =>
  client.post<WorkspaceMember>(`/workspaces/${workspaceId}/members`, { user_id: userId, role }).then(r => r.data)
export const updateMemberRole = (workspaceId: string, userId: string, role: string) =>
  client.patch<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}`, { role }).then(r => r.data)
export const removeWorkspaceMember = (workspaceId: string, userId: string) =>
  client.delete(`/workspaces/${workspaceId}/members/${userId}`)
export const getProjectMembers = (projectId: string) => client.get<WorkspaceMember[]>(`/projects/${projectId}/members`).then(r => r.data)
export const getUsers = () => client.get<User[]>('/users').then(r => r.data)
