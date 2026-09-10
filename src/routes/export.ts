import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { findCategory } from '../categories';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.use(requireAuth);

function csvEscape(value: string | number | null | undefined): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

// A header line is a single labeled cell spanning the row — always wrapped
// in quotes so any commas in the disclaimer text don't get misread as
// column breaks by Excel or Sheets.
function headerLine(value: string): string {
  return csvEscape(value) + '\n';
}

router.get('/csv', asyncHandler(async (req: AuthedRequest, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  const userRow = await pool.query('SELECT email, role FROM users WHERE id = $1', [req.user!.id]);
  const user = userRow.rows[0];
  const roleLabel = user.role === 'spouse' ? 'Spouse' : 'Primary';

  const result = await pool.query(
    `SELECT le.entry_date, p.name AS property_name, le.category_ids, le.hours, le.note, le.evidence_reference
     FROM log_entries le
     JOIN properties p ON p.id = le.property_id
     WHERE le.user_id = $1 AND EXTRACT(YEAR FROM le.entry_date) = $2
     ORDER BY le.entry_date ASC`,
    [req.user!.id, year]
  );

  const generatedAt = new Date().toISOString().slice(0, 10);

  let csv = '';
  csv += headerLine('REPS Standing — Real Estate Professional Status Hour Log');
  csv += headerLine('An XSITE Capital Investment property');
  csv += headerLine(`Prepared for: ${user.email} (${roleLabel})`);
  csv += headerLine(`Tax year: ${year}`);
  csv += headerLine(`Generated: ${generatedAt}`);
  csv += headerLine('');
  csv += headerLine(
    'This report reflects self-reported activity only. It does not constitute tax, legal, or ' +
    'financial advice and does not determine or guarantee eligibility for Real Estate Professional ' +
    'Status under IRC Section 469. Consult a qualified CPA or tax attorney before relying on this ' +
    'information for tax filing purposes.'
  );
  csv += headerLine('');
  csv += 'Date,Property,Activity,Statutory Category,Hours,Note,Evidence Reference\n';

  let total = 0;
  for (const row of result.rows) {
    const cats = (row.category_ids as string[]).map(findCategory).filter(Boolean);
    const names = cats.map(c => c!.name).join('; ');
    const statutes = [...new Set(cats.map(c => c!.statute))].join('; ');
    csv += [
      row.entry_date.toISOString().slice(0, 10),
      csvEscape(row.property_name),
      csvEscape(names),
      csvEscape(statutes),
      row.hours,
      csvEscape(row.note),
      csvEscape(row.evidence_reference),
    ].join(',') + '\n';
    total += Number(row.hours);
  }
  csv += '\n';
  csv += `${csvEscape('TOTAL HOURS')},,,,${total},,\n`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="REPS-Standing-${year}-${roleLabel.toLowerCase()}.csv"`);
  res.send(csv);
}));

export default router;
