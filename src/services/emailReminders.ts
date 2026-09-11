import { pool } from '../db/pool';

// ISO 8601 week key, e.g. "2026-W37" — used so a reminder only ever sends
// once per calendar week, regardless of how often the check runs.
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return; // Not configured yet — skip quietly.
  const from = process.env.EMAIL_FROM || 'REPS Standing <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error('Resend send failed', await res.text());
  }
}

function paceMessage(totalHours: number, paceDiff: number): string {
  if (totalHours === 0) {
    return "You haven't logged any hours yet this year. Even a quick entry keeps your record contemporaneous.";
  }
  return paceDiff >= 0
    ? `You're ${paceDiff} hours ahead of pace toward 750 for the year.`
    : `You're ${Math.abs(paceDiff)} hours behind pace toward 750 for the year — worth catching up this week.`;
}

async function buildAndSendFor(user: { id: string; email: string; annual_base_hours: number }) {
  const year = new Date().getFullYear();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekResult = await pool.query(
    `SELECT COALESCE(SUM(hours), 0) AS week_hours
     FROM log_entries
     WHERE user_id = $1 AND entry_date >= $2`,
    [user.id, weekAgo.toISOString().slice(0, 10)]
  );
  const weekHours = Number(weekResult.rows[0].week_hours);

  const yearResult = await pool.query(
    `SELECT COALESCE(SUM(hours), 0) AS total_hours
     FROM log_entries
     WHERE user_id = $1 AND EXTRACT(YEAR FROM entry_date) = $2`,
    [user.id, year]
  );
  const totalHours = Number(yearResult.rows[0].total_hours);

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const expectedPace = (750 / 365) * dayOfYear;
  const paceDiff = Math.round(totalHours - expectedPace);

  const html = `
    <div style="font-family:Arial,sans-serif; max-width:480px; margin:0 auto;">
      <h2 style="margin-bottom:4px;">Your REPS Standing weekly summary</h2>
      <p style="color:#555; margin-top:0;">${weekHours} hours logged this past week &middot; ${totalHours} / 750 hours for ${year}</p>
      <p>${paceMessage(totalHours, paceDiff)}</p>
      <p style="margin-top:24px;">
        <a href="https://${process.env.MS_REDIRECT_URI ? new URL(process.env.MS_REDIRECT_URI).host : 'reps.xsitecapital.com'}"
           style="background:#D8AA6E; color:#0E171F; padding:10px 20px; border-radius:100px; text-decoration:none; font-weight:bold;">
          Log this week's activity
        </a>
      </p>
      <p style="color:#999; font-size:11px; margin-top:32px;">
        This is an automated summary, not tax advice. Consult a qualified CPA or tax attorney
        about your Real Estate Professional Status.
      </p>
    </div>
  `;

  await sendEmail(user.email, 'Your REPS Standing weekly summary', html);
}

export async function maybeSendWeeklyReminders(): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return; // Not set up yet — nothing to do.

    const now = new Date();
    // Fridays only (UTC) — a deliberate, once-a-week cadence rather than
    // spamming daily. Adjust here if a different day is ever wanted.
    if (now.getUTCDay() !== 5) return;

    const periodKey = isoWeekKey(now);
    const claim = await pool.query(
      `INSERT INTO reminder_runs (reminder_type, period_key) VALUES ('weekly_digest', $1)
       ON CONFLICT (reminder_type, period_key) DO NOTHING
       RETURNING id`,
      [periodKey]
    );
    if (claim.rows.length === 0) return; // Already sent this week.

    const users = await pool.query('SELECT id, email, annual_base_hours FROM users');
    for (const user of users.rows) {
      try {
        await buildAndSendFor(user);
      } catch (err) {
        console.error(`Weekly reminder failed for user ${user.id}`, err);
      }
    }
    console.log(`Weekly reminders sent for ${periodKey} to ${users.rows.length} user(s)`);
  } catch (err) {
    console.error('Weekly reminder run failed', err);
  }
}
