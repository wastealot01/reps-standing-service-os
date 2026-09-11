import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { encrypt, decrypt } from '../services/crypto';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

export function getMsTokenUrl(): string {
  const tenant = process.env.MS_TENANT_ID || 'common';
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}
function getMsAuthorizeUrl(): string {
  const tenant = process.env.MS_TENANT_ID || 'common';
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
}
export const MS_SCOPES = 'offline_access Calendars.Read';

export function requireMsConfig() {
  if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET || !process.env.MS_REDIRECT_URI || !process.env.MS_TENANT_ID) {
    throw new Error('Microsoft OAuth is not configured (MS_CLIENT_ID / MS_CLIENT_SECRET / MS_REDIRECT_URI / MS_TENANT_ID)');
  }
}

// Step 1: redirect the signed-in user to Microsoft's login/consent screen.
// This route deliberately does NOT use the requireAuth middleware: it's reached
// by a plain browser navigation (the user clicking "Connect Outlook"), which
// cannot carry our usual Authorization header. The frontend instead passes the
// user's existing JWT as a one-time query parameter here, which we verify
// manually before folding the user's id into the OAuth "state" value.
// Each call here starts a brand new connection — there's no slot to overwrite,
// so this is how a second, third, etc. account gets added.
router.get('/connect', (req, res) => {
  try {
    requireMsConfig();
  } catch (err) {
    return res.status(503).send(
      'Outlook connection is not set up yet for this app. An administrator needs to register ' +
      'it in Azure and add the credentials before this button will work — see the README for steps.'
    );
  }
  try {
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
      // Forces Microsoft's account picker every time, rather than silently
      // reusing whichever account is already signed in — otherwise there'd
      // be no way to actually pick a *different* account to connect.
      prompt: 'select_account',
    });
    res.redirect(`${getMsAuthorizeUrl()}?${params.toString()}`);
  } catch (err) {
    res.status(401).send('Your session has expired — please log in again and retry connecting Outlook.');
  }
});

// Step 2: Microsoft redirects back here with a code. Exchange it for tokens,
// look up which Microsoft account this actually is (so we can label it in
// the UI), and store it as a new connection row.
router.get('/callback', async (req, res) => {
  try {
    requireMsConfig();
    const { code, state, error, error_description } = req.query as {
      code?: string; state?: string; error?: string; error_description?: string;
    };
    if (error) {
      console.error('Microsoft returned an OAuth error', error, error_description);
      return res.status(400).send(
        `Microsoft declined the connection: ${error}${error_description ? ' — ' + error_description : ''}`
      );
    }
    if (!code || !state) return res.status(400).send('Missing code or state from Microsoft.');

    const payload = jwt.verify(state, process.env.JWT_SECRET as string) as { sub: string };

    const tokenRes = await fetch(getMsTokenUrl(), {
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
    const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string };
    if (!tokens.refresh_token || !tokens.access_token) {
      return res.status(502).send('Microsoft did not return the expected tokens.');
    }

    // Look up which account this actually is, so the UI can show
    // "personal@outlook.com" rather than an anonymous "Connected".
    let msEmail: string | null = null;
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { mail?: string; userPrincipalName?: string };
        msEmail = me.mail || me.userPrincipalName || null;
      }
    } catch (err) {
      console.error('Could not fetch account email from Graph', err);
    }

    // If this exact account is already connected for this user, update its
    // token rather than creating a duplicate row.
    const existing = msEmail
      ? await pool.query('SELECT id FROM ms_connections WHERE user_id = $1 AND ms_email = $2', [payload.sub, msEmail])
      : { rows: [] as { id: string }[] };

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE ms_connections SET refresh_token_encrypted = $1, connected_at = now() WHERE id = $2',
        [encrypt(tokens.refresh_token), existing.rows[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO ms_connections (user_id, ms_email, refresh_token_encrypted) VALUES ($1, $2, $3)',
        [payload.sub, msEmail, encrypt(tokens.refresh_token)]
      );
    }

    res.redirect('/?outlook=connected');
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong connecting Outlook.');
  }
});

// Lists every connected account for this user.
router.get('/status', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const result = await pool.query(
    'SELECT id, ms_email, connected_at FROM ms_connections WHERE user_id = $1 ORDER BY connected_at ASC',
    [req.user!.id]
  );
  res.json({
    connected: result.rows.length > 0,
    connections: result.rows.map(r => ({ id: r.id, email: r.ms_email, connectedAt: r.connected_at })),
  });
}));

// Disconnects one specific account, not all of them.
router.post('/disconnect/:connectionId', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await pool.query(
    'DELETE FROM ms_connections WHERE id = $1 AND user_id = $2',
    [req.params.connectionId, req.user!.id]
  );
  res.status(204).send();
}));

// Refreshes an access token from one connection's stored encrypted refresh token.
export async function getAccessToken(connectionId: string): Promise<string | null> {
  const result = await pool.query('SELECT refresh_token_encrypted FROM ms_connections WHERE id = $1', [connectionId]);
  const encrypted = result.rows[0]?.refresh_token_encrypted;
  if (!encrypted) return null;

  const refreshToken = decrypt(encrypted);
  const tokenRes = await fetch(getMsTokenUrl(), {
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
    await pool.query('UPDATE ms_connections SET refresh_token_encrypted = $1 WHERE id = $2', [
      encrypt(tokens.refresh_token),
      connectionId,
    ]);
  }
  return tokens.access_token;
}

async function fetchEventsForConnection(connectionId: string, days: number) {
  const accessToken = await getAccessToken(connectionId);
  if (!accessToken) return [];

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: now.toISOString(),
    $orderby: 'start/dateTime desc',
    $top: '50',
  });
  const graphRes = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!graphRes.ok) {
    console.error('Graph calendarView failed', await graphRes.text());
    return [];
  }
  const data = await graphRes.json() as { value: Array<{ subject: string; start: { dateTime: string }; end: { dateTime: string } }> };
  return data.value;
}

// Lists recent calendar events across every connected account, so the user
// can pick one to prefill a log entry, rather than retyping what a meeting
// was about. Each event is tagged with which account it came from.
router.get('/events', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  requireMsConfig();
  const connections = await pool.query(
    'SELECT id, ms_email FROM ms_connections WHERE user_id = $1 ORDER BY connected_at ASC',
    [req.user!.id]
  );
  if (connections.rows.length === 0) return res.status(400).json({ error: 'Outlook is not connected' });

  const allEvents: Array<{ subject: string; start: string; end: string; account: string | null }> = [];
  for (const conn of connections.rows) {
    const events = await fetchEventsForConnection(conn.id, 14);
    for (const e of events) {
      allEvents.push({ subject: e.subject, start: e.start.dateTime, end: e.end.dateTime, account: conn.ms_email });
    }
  }
  allEvents.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  res.json(allEvents.slice(0, 50));
}));

// Suggestions pulled automatically in the background — see
// src/services/outlookSync.ts. Never auto-logged, always pending review.
router.get('/suggestions', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT os.id, os.subject, os.event_start, os.event_end, os.suggested_category_ids, mc.ms_email AS account
     FROM outlook_suggestions os
     LEFT JOIN ms_connections mc ON mc.id = os.ms_connection_id
     WHERE os.user_id = $1 AND os.status = 'pending'
     ORDER BY os.event_start DESC
     LIMIT 25`,
    [req.user!.id]
  );
  res.json(result.rows);
}));

router.post('/suggestions/:id/dismiss', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await pool.query(
    "UPDATE outlook_suggestions SET status = 'dismissed' WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user!.id]
  );
  res.status(204).send();
}));

// Marks a suggestion approved once the user has actually saved the real
// log entry from it — bookkeeping only, the entry itself is created via
// the normal POST /api/entries route so it goes through the same validation.
router.post('/suggestions/:id/approve', requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  await pool.query(
    "UPDATE outlook_suggestions SET status = 'approved' WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user!.id]
  );
  res.status(204).send();
}));

export default router;
