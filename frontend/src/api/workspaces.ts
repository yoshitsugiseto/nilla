import client from './client'
import type {
  ProjectMember,
  ProjectRole,
  Workspace,
  WorkspaceAutomationLog,
  WorkspaceAutomationSettings,
  WorkspaceMember,
  User,
} from '../types'

export const getWorkspaces = () => client.get<Workspace[]>('/workspaces').then(r => r.data)
export const getWorkspace = (id: string) => client.get<Workspace>(`/workspaces/${id}`).then(r => r.data)
export const createWorkspace = (name: string) => client.post<Workspace>('/workspaces', { name }).then(r => r.data)
export const updateWorkspace = (id: string, name: string) => client.put<Workspace>(`/workspaces/${id}`, { name }).then(r => r.data)
export const getWorkspaceAutomationSettings = (workspaceId: string) =>
  client.get<WorkspaceAutomationSettings>(`/workspaces/${workspaceId}/automation`).then(r => r.data)
export const getWorkspaceAutomationLogs = (
  workspaceId: string,
  params?: { limit?: number; offset?: number }
) => client.get<WorkspaceAutomationLog[]>(`/workspaces/${workspaceId}/automation/logs`, { params }).then(r => r.data)
export const updateWorkspaceAutomationSettings = (
  workspaceId: string,
  data: Partial<WorkspaceAutomationSettings>
) => client.patch<WorkspaceAutomationSettings>(`/workspaces/${workspaceId}/automation`, data).then(r => r.data)
export const getWorkspaceMembers = (workspaceId: string) => client.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`).then(r => r.data)
export const addWorkspaceMember = (workspaceId: string, userId: string, role?: string) =>
  client.post<WorkspaceMember>(`/workspaces/${workspaceId}/members`, { user_id: userId, role }).then(r => r.data)
export const updateMemberRole = (workspaceId: string, userId: string, role: string) =>
  client.patch<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}`, { role }).then(r => r.data)
export const removeWorkspaceMember = (workspaceId: string, userId: string) =>
  client.delete(`/workspaces/${workspaceId}/members/${userId}`)
export const getProjectMembers = (projectId: string) => client.get<ProjectMember[]>(`/projects/${projectId}/members`).then(r => r.data)
export const updateProjectMemberRole = (projectId: string, userId: string, role: ProjectRole) =>
  client.patch<ProjectMember>(`/projects/${projectId}/members/${userId}`, { role }).then(r => r.data)
export const clearProjectMemberRole = (projectId: string, userId: string) =>
  client.delete(`/projects/${projectId}/members/${userId}`).then(r => r.data)
export const getUsers = () => client.get<User[]>('/users').then(r => r.data)
