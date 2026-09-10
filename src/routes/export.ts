import { Router } from 'express';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { findCategory } from '../categories';

const router = Router();
router.use(requireAuth);

function csvEscape(value: string | null | undefined): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

router.get('/csv', async (req: AuthedRequest, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();

  const result = await pool.query(
    `SELECT le.entry_date, p.name AS property_name, le.category_ids, le.hours, le.note, le.evidence_reference
     FROM log_entries le
     JOIN properties p ON p.id = le.property_id
     WHERE le.user_id = $1 AND EXTRACT(YEAR FROM le.entry_date) = $2
     ORDER BY le.entry_date ASC`,
    [req.user!.id, year]
  );

  let csv = 'Date,Property,Activity,Statutory Category,Hours,Note,Evidence Reference\n';
  let total = 0;
  for (const row of result.rows) {
    const cats = (row.category_ids as string[]).map(findCategory).filter(Boolean);
    const names = cats.map(c => c!.name).join('; ');
    const statutes = cats.map(c => c!.statute).join('; ');
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
  csv += `\nTotal Hours,,,,${total},,\n`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="REPS-Standing-${year}.csv"`);
  res.send(csv);
});

export default router;
