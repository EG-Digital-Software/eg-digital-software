import { api } from './client';
import type { ApiEnvelope } from '@/types';

export interface SeenState {
  /** sectionKey → last acknowledged signature. */
  seen: Record<string, string>;
  /** sidebar route → current server-computed signature. */
  tabs: Record<string, string>;
}

export const sectionSeenApi = {
  state: async () =>
    (await api.get<ApiEnvelope<SeenState>>('/section-seen')).data.data,
  mark: async (items: { key: string; sig: string }[]) =>
    (await api.post('/section-seen', { items })).data,
};
