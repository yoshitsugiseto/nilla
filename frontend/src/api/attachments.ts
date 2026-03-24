import type { Attachment } from '../types'
import client from './client'

export async function getAttachments(issueId: string): Promise<Attachment[]> {
  const res = await client.get<Attachment[]>(`/issues/${issueId}/attachments`)
  return res.data
}

export async function uploadAttachment(issueId: string, file: File): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<Attachment>(`/issues/${issueId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await client.delete(`/attachments/${attachmentId}`)
}
