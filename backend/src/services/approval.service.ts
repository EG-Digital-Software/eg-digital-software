import { ApiError } from '../utils/ApiError.js';
import { publicUser } from './auth.service.js';
import { sendAccountApproved, sendAccountRejected } from './email/templates.js';
import { notify } from './notification.service.js';
import * as accounts from './accounts.js';

const ROLE_HOME: Record<string, string> = {
  CLIENT: '/client/dashboard',
  SUPPLIER: '/supplier/dashboard',
  EMPLOYEE: '/employee/dashboard',
};

const strip = (u: accounts.Account) => {
  const { passwordHash: _pw, ...rest } = u;
  void _pw;
  return rest;
};

export async function listPending() {
  const users = await accounts.listPendingAll();
  return users.map(strip);
}

/**
 * Registration requests with history. Approvals used to show only PENDING rows,
 * so once a request was actioned it disappeared — there was no record of who
 * was approved or rejected, and no way to correct a mistake.
 */
export async function listRequests(params: {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  role?: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE';
  search?: string;
  skip: number;
  take: number;
}) {
  const { items, total, counts } = await accounts.listRegistrations({
    status: params.status,
    role: params.role,
    search: params.search,
  });
  return {
    items: items.slice(params.skip, params.skip + params.take).map(strip),
    total,
    counts,
  };
}

export async function pendingCount() {
  return accounts.pendingCountAll();
}

export async function approve(userId: string, approverId: string) {
  const account = await accounts.findSignupById(userId);
  if (!account) throw ApiError.notFound('Request not found');
  // A rejection can be reversed — rejecting by mistake used to be permanent.
  if (account.approvalStatus === 'APPROVED') {
    throw ApiError.badRequest('This account is already approved');
  }
  const updated = await accounts.updateAccount(account.role, userId, {
    approvalStatus: 'APPROVED',
    isActive: true,
    approvedById: approverId,
  });
  sendAccountApproved({ email: updated.email, firstName: updated.firstName, role: updated.role });
  notify({
    userId: updated.id,
    userType: updated.role,
    type: 'account',
    title: 'Account approved',
    body: 'Your account has been approved — welcome to EG Digital!',
    link: ROLE_HOME[updated.role] ?? '/',
  });
  return publicUser(updated);
}

/**
 * Rejects a pending request, or revokes an already-approved account. Revoking
 * deactivates the login immediately; there was previously no way to withdraw
 * access once granted.
 */
export async function reject(userId: string, approverId: string) {
  const account = await accounts.findSignupById(userId);
  if (!account) throw ApiError.notFound('Request not found');
  if (account.approvalStatus === 'REJECTED') {
    throw ApiError.badRequest('This request is already rejected');
  }
  const updated = await accounts.updateAccount(account.role, userId, {
    approvalStatus: 'REJECTED',
    isActive: false,
    approvedById: approverId,
  });
  sendAccountRejected({ email: updated.email, firstName: updated.firstName, role: updated.role });
  return publicUser(updated);
}
