import rateLimit from 'express-rate-limit';

// Generous ceiling: the app polls task chat/approvals for near-live updates, so
// a normal session makes far more calls than a static page would. Keyed by IP,
// so an office behind one NAT shares it — hence the high limit. The auth limiter
// below stays strict to protect against brute-force.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
});
