import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { encrypt, decrypt } from '../services/crypto';

const router = Router();

const MS_AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_SCOPES = 'offline_access Calendars.Read';

function requireMsConfig() {
  if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET || !process.env.MS_REDIRECT_URI) {
    throw new Error('Microsoft OAuth is not configured (MS_CLIENT_ID / MS_CLIENT_SECRET / MS_REDIRECT_URI)');
  }
}

// Step 1: redirect the signed-in user to Microsoft's login/consent screen.
// This route deliberately does NOT use the requireAuth middleware: it's reached
// by a plain browser navigation (the user clicking "Connect Outlook"), which
// cannot carry our usual Authorization header. The frontend instead passes the
// user's existing JWT as a one-time query parameter here, which we verify
// manually before folding the user's id into the OAuth "state" value.
router.get('/connect', (req, res) => {
  try {
    requireMsConfig();
    const token = req.query.token as string | undefined;
    if (!token) return res.status(401).send('Missing session token.');
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { sub: string };

    const state = jwt.sign({ sub: decoded.sub }, process.env.JWT_SECRET as string, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID as string,
      response_type: 'code',
      redirect_uri: process.env.MS_REDIRECT_URI as string,
      response_mode: 'query',
      scope: MS_SCOPES,
      state,
    });
    res.redirect(`${MS_AUTHORIZE_URL}?${params.toString()}`);
  } catch (err) {
    res.status(401).send('Your session has expired — please log in again and retry connecting Outlook.');
  }
});

// Step 2: Microsoft redirects back here with a code. Exchange it for tokens
// and store the refresh token encrypted, tied to the user from "state".
router.get('/callback', async (req, res) => {
  try {
    requireMsConfig();
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) return res.status(400).send('Missing code or state from Microsoft.');

    const payload = jwt.verify(state, process.env.JWT_SECRET as string) as { sub: string };

    const tokenRes = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID as string,
        client_secret: process.env.MS_CLIENT_SECRET as string,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.MS_REDIRECT_URI as string,
        scope: MS_SCOPES,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('Microsoft token exchange failed', body);
      return res.status(502).send('Could not connect to Outlook. Please try again.');
    }
    const tokens = await tokenRes.json() as { refresh_token?: string };
    if (!tokens.refresh_token) {
      return res.status(502).send('Microsoft did not return a refresh token.');
    }

    await pool.query(
      'UPDATE users SET ms_refresh_token_encrypted = $1, ms_connected_at = now() WHERE id = $2',
      [encrypt(tokens.refresh_token), payload.sub]
    );

    res.redirect('/?outlook=connected');
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong connecting Outlook.');
  }
});

router.get('/status', requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query('SELECT ms_connected_at FROM users WHERE id = $1', [req.user!.id]);
  const connectedAt = result.rows[0]?.ms_connected_at || null;
  res.json({ connected: !!connectedAt, connectedAt });
});

router.post('/disconnect', requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(
    'UPDATE users SET ms_refresh_token_encrypted = NULL, ms_connected_at = NULL WHERE id = $1',
    [req.user!.id]
  );
  res.status(204).send();
});

// Refreshes an access token from the stored encrypted refresh token.
async function getAccessToken(userId: string): Promise<string | null> {
  const result = await pool.query('SELECT ms_refresh_token_encrypted FROM users WHERE id = $1', [userId]);
  const encrypted = result.rows[0]?.ms_refresh_token_encrypted;
  if (!encrypted) return null;

  const refreshToken = decrypt(encrypted);
  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID as string,
      client_secret: process.env.MS_CLIENT_SECRET as string,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: MS_SCOPES,
    }),
  });
  if (!tokenRes.ok) return null;
  const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string };

  // Microsoft rotates refresh tokens on use — persist the new one.
  if (tokens.refresh_token) {
    await pool.query('UPDATE users SET ms_refresh_token_encrypted = $1 WHERE id = $2', [
      encrypt(tokens.refresh_token),
      userId,
    ]);
  }
  return tokens.access_token;
}

// Lists recent calendar events so the user can pick one to prefill a log entry,
// rather than retyping what a meeting was about.
router.get('/events', requireAuth, async (req: AuthedRequest, res) => {
  try {
    requireMsConfig();
    const accessToken = await getAccessToken(req.user!.id);
    if (!accessToken) return res.status(400).json({ error: 'Outlook is not connected' });

    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: now.toISOString(),
      $orderby: 'start/dateTime desc',
      $top: '25',
    });
    const graphRes = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!graphRes.ok) {
      const body = await graphRes.text();
      console.error('Graph calendarView failed', body);
      return res.status(502).json({ error: 'Could not read Outlook calendar' });
    }
    const data = await graphRes.json() as { value: Array<{ subject: string; start: { dateTime: string }; end: { dateTime: string } }> };
    res.json(data.value.map(e => ({
      subject: e.subject,
      start: e.start.dateTime,
      end: e.end.dateTime,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not read Outlook calendar' });
  }
});

export default router;
