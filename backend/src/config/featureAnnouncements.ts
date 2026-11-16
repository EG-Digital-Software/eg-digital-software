/**
 * "New feature" announcements pushed to the mobile app.
 *
 * Keep this list in step with FEATURE_UPDATES in frontend/src/lib/featureUpdates.ts
 * (the web's "What's new" box): when a feature is added there, add the same id,
 * name and date here. After the next deploy every phone with the app gets one
 * push: New feature "<name>" added — by admin. Each id is pushed only once.
 */
export interface FeatureAnnouncement {
  /** Same stable id as the web entry — never reuse or change it. */
  id: string;
  name: string;
  /** Release date (YYYY-MM-DD). */
  addedAt: string;
}

export const FEATURE_ANNOUNCEMENTS: FeatureAnnouncement[] = [
  { id: 'access-point-pin', name: 'Access Point PIN lock', addedAt: '2026-11-09' },
  { id: 'social-media-dashboard', name: 'Social Media Dashboard', addedAt: '2026-11-12' },
  { id: 'content-calendar', name: 'Content Calendar', addedAt: '2026-11-13' },
  { id: 'seo-dashboard', name: 'SEO Dashboard', addedAt: '2026-11-13' },
  { id: 'local-listing', name: 'Local Listing', addedAt: '2026-11-13' },
  { id: 'azure-performance', name: 'Azure Performance', addedAt: '2026-11-13' },
  { id: 'assign-team', name: 'Assign Team Name', addedAt: '2026-11-15' },
  { id: 'minimise-task-chat', name: 'Minimise Task Chat', addedAt: '2026-11-16' },
  { id: 'tiktok-connection', name: 'TikTok connection', addedAt: '2026-11-16' },
  { id: 'linkedin-youtube-connection', name: 'LinkedIn and YouTube connection', addedAt: '2026-11-16' },
  { id: 'google-ads-connection', name: 'Google Ads connection', addedAt: '2026-11-16' },
];
