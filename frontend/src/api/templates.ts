import client from './client'
import type { IssueTemplate } from '../types'

export interface CreateTemplatePayload {
  name: string
  description?: string
  type?: string
  priority?: string
  labels?: string[]
  points?: number
}

export const getTemplates = (projectId: string) =>
  client.get<IssueTemplate[]>(`/projects/${projectId}/templates`).then(r => r.data)

export const createTemplate = (projectId: string, data: CreateTemplatePayload) =>
  client.post<IssueTemplate>(`/projects/${projectId}/templates`, data).then(r => r.data)

export const updateTemplate = (templateId: string, data: Partial<CreateTemplatePayload>) =>
  client.put<IssueTemplate>(`/templates/${templateId}`, data).then(r => r.data)

export const deleteTemplate = (templateId: string) =>
  client.delete(`/templates/${templateId}`).then(r => r.data)
