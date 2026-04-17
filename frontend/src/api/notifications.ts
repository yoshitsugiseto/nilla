import type { Notification } from '../types'
import client from './client'

export interface NotificationPaginationParams {
  limit?: number
  offset?: number
}

export async function getNotifications(
  params?: NotificationPaginationParams,
): Promise<Notification[]> {
  const res = await client.get<Notification[]>('/notifications', { params })
  return res.data
}

export async function markNotificationRead(id: string): Promise<void> {
  await client.patch(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await client.post('/notifications/read-all')
}

export async function deleteNotification(id: string): Promise<void> {
  await client.delete(`/notifications/${id}`)
}
