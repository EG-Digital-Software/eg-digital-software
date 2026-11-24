import { api } from './client';
import type { ApiEnvelope } from '@/types';

export type DisplayAs = 'COMPANY' | 'PERSON' | 'PRIVATE';
export type ReviewStatus = 'NEW' | 'PUBLISHED' | 'HIDDEN';
export type TestimonialUse = 'WEBSITE' | 'PROPOSALS' | 'SOCIAL' | 'CASE_STUDY';
export type TestimonialStatus = 'APPROVED' | 'WITH_CUSTOMER' | 'WITHDRAWN';
export type ReviewSite = 'google' | 'facebook' | 'clutch' | 'trustpilot';
export type ReviewLinks = Record<ReviewSite, string | null>;

export interface ClientReview {
  id: string;
  taskId: string;
  taskTitle: string;
  taskNumber: string;
  rating: number;
  tags: string[];
  comment: string | null;
  displayAs: DisplayAs;
  displayName: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Testimonial {
  id: string;
  customerId: string;
  clientId?: string;
  taskId: string | null;
  problem: string | null;
  change: string | null;
  recommend: string | null;
  quote: string;
  pendingQuote: string | null;
  personName: string;
  jobTitle: string | null;
  companyName: string;
  photoUrl: string | null;
  videoUrl: string | null;
  videoSeconds: number | null;
  uses: TestimonialUse[];
  service: string | null;
  status: TestimonialStatus;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFeedback {
  company: { name: string; tradingAs: string | null; label: string };
  me: { firstName: string; lastName: string };
  displayOptions: { value: DisplayAs; label: string }[];
  accountManager: { name: string; firstName: string; email: string; phone: string | null } | null;
  tags: string[];
  ready: { taskId: string; taskNumber: string; title: string; completedAt: string }[];
  reviews: ClientReview[];
  testimonials: Testimonial[];
  reviewLinks: ReviewLinks;
}

export interface ReviewInput {
  rating: number;
  tags: string[];
  comment?: string | null;
  displayAs: DisplayAs;
}

export interface TestimonialInput {
  problem?: string | null;
  change?: string | null;
  recommend?: string | null;
  personName: string;
  jobTitle?: string | null;
  companyName: string;
  photoUrl?: string | null;
  videoUrl?: string | null;
  videoSeconds?: number | null;
  uses: TestimonialUse[];
  taskId?: string | null;
  honest: true;
}

export interface FeedbackCompany {
  id: string;
  clientId: string;
  name: string;
}

export interface AdminReview {
  id: string;
  customer: FeedbackCompany;
  taskId: string;
  taskTitle: string;
  taskNumber: string;
  completedAt: string | null;
  clientName: string;
  rating: number;
  tags: string[];
  comment: string | null;
  displayAs: DisplayAs;
  displayName: string | null;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReviews {
  stats: { total: number; average: number | null; low: number; published: number; pending: number };
  reviews: AdminReview[];
  pending: { taskId: string; taskNumber: string; title: string; completedAt: string; customer: FeedbackCompany }[];
  customers: FeedbackCompany[];
}

const d = <T>(p: Promise<{ data: ApiEnvelope<T> }>) => p.then((r) => r.data.data);

export const feedbackApi = {
  client: () => d(api.get<ApiEnvelope<ClientFeedback>>('/feedback/client')),
  createReview: (taskId: string, body: ReviewInput) =>
    d(api.post<ApiEnvelope<ClientReview>>('/feedback/client/reviews', { taskId, ...body })),
  updateReview: (id: string, body: ReviewInput) => d(api.patch<ApiEnvelope<ClientReview>>(`/feedback/client/reviews/${id}`, body)),
  uploadTestimonialFile: (file: Blob, fileName: string, kind: 'photo' | 'video', onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file, fileName);
    return d(
      api.post<ApiEnvelope<{ url: string }>>('/feedback/client/testimonials/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => onProgress?.(Math.round(((e.loaded ?? 0) / (e.total || file.size || 1)) * 100)),
      })
    );
  },
  createTestimonial: (body: TestimonialInput) => d(api.post<ApiEnvelope<Testimonial>>('/feedback/client/testimonials', body)),
  setTestimonialUses: (id: string, uses: TestimonialUse[]) =>
    d(api.patch<ApiEnvelope<Testimonial>>(`/feedback/client/testimonials/${id}/uses`, { uses })),
  withdrawTestimonial: (id: string) => d(api.post<ApiEnvelope<Testimonial>>(`/feedback/client/testimonials/${id}/withdraw`)),
  decideEdit: (id: string, accept: boolean) =>
    d(api.post<ApiEnvelope<Testimonial>>(`/feedback/client/testimonials/${id}/decide`, { accept })),

  adminReviews: (customerId?: string) =>
    d(api.get<ApiEnvelope<AdminReviews>>('/feedback/admin/reviews', { params: customerId ? { customerId } : {} })),
  setReviewStatus: (id: string, status: ReviewStatus) => d(api.patch(`/feedback/admin/reviews/${id}`, { status })),
  adminTestimonials: () => d(api.get<ApiEnvelope<Testimonial[]>>('/feedback/admin/testimonials')),
  updateTestimonial: (id: string, body: { service?: string | null; featured?: boolean; pendingQuote?: string | null }) =>
    d(api.patch<ApiEnvelope<Testimonial>>(`/feedback/admin/testimonials/${id}`, body)),
  requestTestimonial: (customerId: string) =>
    d(api.post<ApiEnvelope<{ sent: number }>>('/feedback/admin/testimonials/request', { customerId })),
  reviewLinks: () => d(api.get<ApiEnvelope<ReviewLinks>>('/feedback/admin/review-links')),
  saveReviewLinks: (body: Partial<ReviewLinks>) => d(api.put<ApiEnvelope<ReviewLinks>>('/feedback/admin/review-links', body)),
};

export const USE_LABELS: Record<TestimonialUse, string> = {
  WEBSITE: 'Our website (elomagroup.org)',
  PROPOSALS: 'Proposals and quotes to other businesses',
  SOCIAL: 'Our LinkedIn and Facebook pages',
  CASE_STUDY: 'A longer case study (we’ll check with you first)',
};
export const USE_SHORT: Record<TestimonialUse, string> = {
  WEBSITE: 'Website',
  PROPOSALS: 'Proposals',
  SOCIAL: 'Social',
  CASE_STUDY: 'Case study',
};
export const REVIEW_SITES: { id: ReviewSite; name: string; letter: string; color: string; note: string }[] = [
  { id: 'google', name: 'Google', letter: 'G', color: '#1A56DB', note: 'Opens the Google review box' },
  { id: 'facebook', name: 'Facebook', letter: 'f', color: '#1E40AF', note: 'Opens our Facebook Reviews tab' },
  { id: 'clutch', name: 'Clutch', letter: 'C', color: '#C2410C', note: 'Verified business review form' },
  { id: 'trustpilot', name: 'Trustpilot', letter: 'T', color: '#146C43', note: 'Opens our Trustpilot page' },
];
