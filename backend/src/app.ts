import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import routes from './routes/index.js';

/**
 * Browsers never send a trailing slash on the Origin header, so a CORS_ORIGIN
 * configured as "https://site.net/" matches nothing and blocks every request
 * while the API still looks healthy. Normalise instead of failing silently.
 */
const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'production' }));

  // Serve locally uploaded files in development. helmet()'s default
  // Cross-Origin-Resource-Policy: same-origin blocks the frontend (a different
  // origin in dev) from embedding these images, so relax it to cross-origin for
  // public media only.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.resolve(process.cwd(), 'uploads'))
  );

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
