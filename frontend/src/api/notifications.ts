import { api } from './client';
import type { ApiEnvelope } from '@/types';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

export const notificationApi = {
  list: async () =>
    (await api.get<ApiEnvelope<{ items: AppNotification[]; unread: number }>>('/notifications'))
      .data.data,
  count: async () =>
    (await api.get<ApiEnvelope<{ unread: number }>>('/notifications/count')).data.data.unread,
  markRead: async (id: string) => (await api.post(`/notifications/${id}/read`)).data,
  markAllRead: async () => (await api.post('/notifications/read-all')).data,
};
