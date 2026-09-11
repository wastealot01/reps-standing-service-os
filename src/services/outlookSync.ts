import { pool } from '../db/pool';
import { getAccessToken } from '../routes/outlook';
import { suggestCategoriesForText } from '../categories';

interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

async function fetchRecentEvents(accessToken: string): Promise<GraphEvent[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: now.toISOString(),
    $orderby: 'start/dateTime desc',
    $top: '50',
  });
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error('Outlook sync: Graph calendarView failed', await res.text());
    return [];
  }
  const data = await res.json() as { value: GraphEvent[] };
  return data.value;
}

// Syncs one connected Microsoft account (one row in ms_connections).
async function syncOneConnection(connectionId: string, userId: string): Promise<number> {
  const accessToken = await getAccessToken(connectionId);
  if (!accessToken) return 0;

  const events = await fetchRecentEvents(accessToken);
  let created = 0;

  for (const event of events) {
    if (!event.subject) continue;
    const suggestedIds = suggestCategoriesForText(event.subject);
    const result = await pool.query(
      `INSERT INTO outlook_suggestions (user_id, ms_connection_id, ms_event_id, subject, event_start, event_end, suggested_category_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ms_connection_id, ms_event_id) DO NOTHING
       RETURNING id`,
      [userId, connectionId, event.id, event.subject, event.start.dateTime, event.end.dateTime, JSON.stringify(suggestedIds)]
    );
    if (result.rows.length > 0) created += 1;
  }
  return created;
}

export async function syncAllConnectedUsers(): Promise<void> {
  try {
    // requireMsConfig would throw here if Azure isn't set up yet — treat that
    // as "nothing to do" rather than a crash, since MS_CLIENT_ID etc. are
    // optional until the app registration step is done.
    if (!process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET) return;

    const connections = await pool.query('SELECT id, user_id, ms_email FROM ms_connections');
    for (const conn of connections.rows) {
      try {
        const created = await syncOneConnection(conn.id, conn.user_id);
        if (created > 0) {
          console.log(`Outlook sync: ${created} new suggestion(s) for ${conn.ms_email || conn.id}`);
        }
      } catch (err) {
        // One connection failing (expired grant, revoked access, etc.)
        // should never block the rest.
        console.error(`Outlook sync failed for connection ${conn.id}`, err);
      }
    }
  } catch (err) {
    console.error('Outlook sync run failed', err);
  }
}
