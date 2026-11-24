import { Router, type Request } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ok } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';
import { findById } from '../services/accounts.js';
import { resolveCustomerId } from '../services/client.service.js';
import * as vault from '../services/vault.service.js';

/**
 * Password vault — one API for the Admin, Team and Client portals; the service
 * scopes every call to what the signed-in user may see. Everything except
 * unlock needs a live unlock key (sent as x-vault-key).
 */
const router = Router();
router.use(authenticate, authorize(Role.SUPER_ADMIN, Role.EMPLOYEE, Role.CLIENT));

// An admin viewing a client's portal uses their own admin vault instead.
router.use((req, _res, next) => {
  if (req.user?.imp) return next(ApiError.forbidden('The vault is not available while viewing a portal as an admin'));
  next();
});

async function actorOf(req: Request): Promise<vault.Actor> {
  const { sub, role, email } = req.user!;
  const acc = await findById(role, sub);
  if (!acc || !acc.isActive) throw ApiError.unauthorized();
  const name = `${acc.firstName ?? ''} ${acc.lastName ?? ''}`.trim() || email;
  return {
    id: sub,
    type: role,
    name,
    customerId: role === Role.CLIENT ? await resolveCustomerId(sub) : null,
  };
}

/** Resolve the actor and require a live unlock. */
async function unlocked(req: Request) {
  const actor = await actorOf(req);
  vault.assertUnlocked(actor, req.headers[vault.VAULT_KEY_HEADER]);
  return actor;
}

const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const entryBase = {
  customerId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Service name is required').max(120),
  url: opt(500),
  username: opt(200),
  password: z.string().min(1).max(500).optional(),
  folder: z.enum([...vault.FOLDERS, ...vault.RETIRED_FOLDERS]),
  notes: opt(4000),
  twoFactor: z.enum(vault.TWO_FACTOR).optional(),
  access: z.enum(vault.ACCESS).optional(),
  accessEmployeeIds: z.array(z.string().uuid()).max(200).optional(),
  accessRoleIds: z.array(z.string().uuid()).max(100).optional(),
};
const createSchema = z.object({ ...entryBase, password: z.string().min(1, 'Password is required').max(500) });
const updateSchema = z.object(entryBase).partial();
const pinSchema = z.object({ pin: z.string().trim().min(1).max(12) });
const checkSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254) });
const revealSchema = z.object({ kind: z.enum(['REVEALED', 'COPIED']).default('REVEALED') });

router.post(
  '/unlock',
  validate({ body: pinSchema }),
  asyncHandler(async (req, res) => ok(res, await vault.unlock(await actorOf(req), req.body.pin)))
);
router.post('/touch', asyncHandler(async (req, res) => ok(res, vault.touch(await unlocked(req)))));

router.get('/entries', asyncHandler(async (req, res) => ok(res, await vault.list(await unlocked(req)))));
router.get('/meta', asyncHandler(async (req, res) => ok(res, await vault.meta(await unlocked(req)))));
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const entryId = typeof req.query.entryId === 'string' && req.query.entryId ? req.query.entryId : undefined;
    return ok(res, await vault.logs(await unlocked(req), entryId));
  })
);
router.post(
  '/entries',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => ok(res, await vault.create(await unlocked(req), req.body), 'Login saved', 201))
);
router.patch(
  '/entries/:id',
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => ok(res, await vault.update(await unlocked(req), req.params.id, req.body), 'Login updated'))
);
// Have-I-Been-Pwned style check: the email's breaches + saved passwords found in leaks.
router.post(
  '/security-check',
  validate({ body: checkSchema }),
  asyncHandler(async (req, res) => ok(res, await vault.securityCheck(await unlocked(req), req.body.email)))
);
router.post(
  '/entries/:id/reveal',
  validate({ body: revealSchema }),
  asyncHandler(async (req, res) => ok(res, await vault.reveal(await unlocked(req), req.params.id, req.body.kind)))
);
router.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => ok(res, await vault.remove(await unlocked(req), req.params.id), 'Login deleted'))
);

export default router;
