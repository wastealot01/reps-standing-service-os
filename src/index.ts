import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';

import authRoutes from './routes/auth';
import propertiesRoutes from './routes/properties';
import entriesRoutes from './routes/entries';
import settingsRoutes from './routes/settings';
import exportRoutes from './routes/export';
import outlookRoutes from './routes/outlook';
import { syncAllConnectedUsers } from './services/outlookSync';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth', authLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/outlook', outlookRoutes);

// Serve the PWA frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`REPS Standing listening on port ${port}`));

// Background Outlook calendar sync — pulls new events for every connected
// user and turns them into pending suggestions, never auto-logged entries.
// A few minutes after boot (let the app finish starting first), then every
// 3 hours. A failed run never crashes the process, see syncAllConnectedUsers.
const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;
setTimeout(() => syncAllConnectedUsers(), 60 * 1000);
setInterval(() => syncAllConnectedUsers(), SYNC_INTERVAL_MS);
