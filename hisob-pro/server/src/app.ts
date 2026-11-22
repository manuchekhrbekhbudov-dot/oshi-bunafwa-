import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { csrfGuard, requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import categoryRoutes from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';
import transferRoutes from './routes/transfers.js';
import debtRoutes from './routes/debts.js';
import reportRoutes from './routes/reports.js';
import rateRoutes from './routes/rates.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const allowedOrigins = [config.appUrl, `http://localhost:${config.port}`];

  app.use(helmet({ contentSecurityPolicy: config.isProd ? undefined : false }));
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'HISOB PRO', time: new Date().toISOString() }));

  const api = express.Router();
  api.use(csrfGuard(allowedOrigins));
  api.use('/auth', authRoutes);
  // Ҳамаи роҳҳои зерин танҳо барои истифодабарандаи воридшуда
  api.use('/accounts', requireAuth, accountRoutes);
  api.use('/categories', requireAuth, categoryRoutes);
  api.use('/transactions', requireAuth, transactionRoutes);
  api.use('/transfers', requireAuth, transferRoutes);
  api.use('/debts', requireAuth, debtRoutes);
  api.use('/reports', requireAuth, reportRoutes);
  api.use('/rates', requireAuth, rateRoutes);
  api.use(notFoundHandler);
  app.use('/api', api);

  // Дар production frontend-и сохташуда аз ҳамин сервер дода мешавад
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
