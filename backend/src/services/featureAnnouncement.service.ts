import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { FEATURE_ANNOUNCEMENTS } from '../config/featureAnnouncements.js';
import { pushToAllDevices } from './push.service.js';

/** Setting row holding the ids already pushed (a JSON string array). */
const PUSHED_KEY = 'featureAnnouncements.pushed';
/** Same window as the web's "What's new": older entries are never pushed. */
const SHOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Push each new feature announcement once to every phone with the app.
 * Runs at start-up (i.e. after each deploy). The first run ever only records
 * the entries that already exist, so phones aren't flooded with old news.
 */
export async function runFeatureAnnouncements(): Promise<void> {
  const row = await prisma.setting.findUnique({ where: { key: PUSHED_KEY } });
  const ids = FEATURE_ANNOUNCEMENTS.map((f) => f.id);

  if (!row) {
    await prisma.setting.upsert({ where: { key: PUSHED_KEY }, create: { key: PUSHED_KEY, value: ids }, update: {} });
    logger.info({ count: ids.length }, 'Feature announcements: recorded existing entries (nothing pushed)');
    return;
  }

  const pushed = new Set(Array.isArray(row.value) ? (row.value as unknown[]).map(String) : []);
  const cutoff = Date.now() - SHOW_DAYS * DAY_MS;
  const fresh = FEATURE_ANNOUNCEMENTS.filter((f) => !pushed.has(f.id));
  if (!fresh.length) return;

  // Claim the ids first (only if the row is unchanged), so a second instance
  // starting at the same time can't push them again.
  const { count } = await prisma.setting.updateMany({
    where: { key: PUSHED_KEY, updatedAt: row.updatedAt },
    data: { value: [...pushed, ...fresh.map((f) => f.id)] },
  });
  if (count !== 1) return;

  for (const f of fresh) {
    if (new Date(f.addedAt).getTime() < cutoff) continue;
    pushToAllDevices({
      title: 'New feature',
      body: `New feature "${f.name}" added — by admin`,
      data: { type: 'FEATURE_UPDATE', featureId: f.id },
    });
    logger.info({ id: f.id }, 'Feature announcement pushed');
  }
}
