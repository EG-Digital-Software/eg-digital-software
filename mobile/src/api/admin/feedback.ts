import { api, request } from '../client';

/**
 * Admin Feedback API — the same endpoints the web admin Feedback page uses
 * (`frontend/src/api/feedback.ts`: feedbackApi.admin*).
 */

export type DisplayAs = 'COMPANY' | 'PERSON' | 'PRIVATE';
export type ReviewStatus = 'NEW' | 'PUBLISHED' | 'HIDDEN';
export type TestimonialUse = 'WEBSITE' | 'PROPOSALS' | 'SOCIAL' | 'CASE_STUDY';
export type TestimonialStatus = 'APPROVED' | 'WITH_CUSTOMER' | 'WITHDRAWN';
export type ReviewSite = 'google' | 'facebook' | 'clutch' | 'trustpilot';
export type ReviewLinks = Record<ReviewSite, string | null>;

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

export interface PendingReview {
  taskId: string;
  taskNumber: string;
  title: string;
  completedAt: string;
  customer: FeedbackCompany;
}

export interface AdminReviews {
  stats: { total: number; average: number | null; low: number; published: number; pending: number };
  reviews: AdminReview[];
  pending: PendingReview[];
  customers: FeedbackCompany[];
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

export interface TestimonialPatch {
  service?: string | null;
  featured?: boolean;
  pendingQuote?: string | null;
}

export const feedbackApi = {
  reviews: (customerId?: string) =>
    api.get<AdminReviews>(`/feedback/admin/reviews${customerId ? `?customerId=${encodeURIComponent(customerId)}` : ''}`),
  setReviewStatus: (id: string, status: ReviewStatus) => api.patch<unknown>(`/feedback/admin/reviews/${id}`, { status }),
  testimonials: () => api.get<Testimonial[]>('/feedback/admin/testimonials'),
  updateTestimonial: (id: string, body: TestimonialPatch) => api.patch<Testimonial>(`/feedback/admin/testimonials/${id}`, body),
  requestTestimonial: (customerId: string) => api.post<{ sent: number }>('/feedback/admin/testimonials/request', { customerId }),
  reviewLinks: () => api.get<ReviewLinks>('/feedback/admin/review-links'),
  saveReviewLinks: (body: Partial<ReviewLinks>) => request<ReviewLinks>('/feedback/admin/review-links', { method: 'PUT', body }),
};

/** Shared react-query keys. */
export const feedbackKeys = {
  all: ['admin-feedback'] as const,
  reviews: (customerId = '') => ['admin-feedback', 'reviews', customerId] as const,
  testimonials: ['admin-feedback', 'testimonials'] as const,
  links: ['admin-feedback', 'links'] as const,
};

export const USE_SHORT: Record<TestimonialUse, string> = {
  WEBSITE: 'Website',
  PROPOSALS: 'Proposals',
  SOCIAL: 'Social',
  CASE_STUDY: 'Case study',
};

export const USE_LABELS: Record<TestimonialUse, string> = {
  WEBSITE: 'Our website (elomagroup.org)',
  PROPOSALS: 'Proposals and quotes to other businesses',
  SOCIAL: 'Our LinkedIn and Facebook pages',
  CASE_STUDY: 'A longer case study',
};

export const REVIEW_SITES: { id: ReviewSite; name: string }[] = [
  { id: 'google', name: 'Google' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'clutch', name: 'Clutch' },
  { id: 'trustpilot', name: 'Trustpilot' },
];
