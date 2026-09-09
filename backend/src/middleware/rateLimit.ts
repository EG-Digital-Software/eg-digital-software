import rateLimit from 'express-rate-limit';

// No general API rate limit — the app polls task chat/approvals for near-live
// updates and must never show "Too many requests" to a legitimate user, however
// heavy the traffic. Only the login/credential endpoints below keep a (generous)
// limiter as brute-force protection.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
});
