import { prisma } from '../config/prisma.js';

/**
 * Backing store for the red change-dots. It is a dumb per-user key→signature
 * map: the client computes a section's signature from the data it already has
 * (count + latest updatedAt, etc.) and asks whether it differs from what the
 * user last acknowledged. The server never interprets the signature.
 */

/** All acknowledged signatures for a viewer, as { sectionKey: seenSig }. */
export async function getSeen(userId: string): Promise<Record<string, string>> {
  const rows = await prisma.sectionSeen.findMany({
    where: { userId },
    select: { sectionKey: true, seenSig: true },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.sectionKey] = r.seenSig;
  return map;
}

/** Acknowledge one or more sections at their current signature. */
export async function markSeen(
  userId: string,
  entries: { key: string; sig: string }[]
): Promise<void> {
  const clean = entries
    .filter((e) => e && typeof e.key === 'string' && e.key.length > 0 && e.key.length <= 200)
    .map((e) => ({ key: e.key, sig: String(e.sig ?? '').slice(0, 200) }));
  if (clean.length === 0) return;
  await prisma.$transaction(
    clean.map((e) =>
      prisma.sectionSeen.upsert({
        where: { userId_sectionKey: { userId, sectionKey: e.key } },
        create: { userId, sectionKey: e.key, seenSig: e.sig },
        update: { seenSig: e.sig },
      })
    )
  );
}
