import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { findCategory } from '../categories';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  propertyId: z.string().uuid(),
  categoryIds: z.array(z.string().min(1)).min(1),
  hours: z.number().positive().max(24),
  note: z.string().max(2000).optional(),
  evidenceReference: z.string().max(2000).optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
    (d) => d <= new Date().toISOString().slice(0, 10),
    { message: 'Entry date cannot be in the future' }
  ).optional(),
});

// Every entry is scoped to req.user.id, never the household — hours must never
// mix between spouses. This is the compliance-critical line in this file.
router.post('/', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { propertyId, categoryIds, hours, note, evidenceReference, entryDate } = parsed.data;

  const unknown = categoryIds.filter(id => !findCategory(id));
  if (unknown.length > 0) {
    return res.status(400).json({ error: `Unknown category id(s): ${unknown.join(', ')}` });
  }

  const property = await pool.query(
    'SELECT id FROM properties WHERE id = $1 AND household_id = $2',
    [propertyId, req.user!.householdId]
  );
  if (property.rows.length === 0) {
    return res.status(404).json({ error: 'Property not found for this household' });
  }

  const result = await pool.query(
    `INSERT INTO log_entries (user_id, property_id, category_ids, hours, note, evidence_reference, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE))
     RETURNING id, property_id, category_ids, hours, note, evidence_reference, entry_date`,
    [req.user!.id, propertyId, JSON.stringify(categoryIds), hours, note || null, evidenceReference || null, entryDate || null]
  );
  res.status(201).json(result.rows[0]);
}));

router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const result = await pool.query(
    `SELECT le.id, le.property_id, p.name AS property_name, le.category_ids, le.hours,
            le.note, le.evidence_reference, le.entry_date
     FROM log_entries le
     JOIN properties p ON p.id = le.property_id
     WHERE le.user_id = $1
     ORDER BY le.entry_date DESC, le.created_at DESC
     LIMIT $2`,
    [req.user!.id, limit]
  );
  res.json(result.rows.map(r => ({
    ...r,
    categories: (r.category_ids as string[]).map(findCategory).filter(Boolean),
  })));
}));

// Computed dashboard numbers — the two threshold tests plus pace, all derived
// server-side so the frontend never has to re-implement the math.
router.get('/dashboard', asyncHandler(async (req: AuthedRequest, res) => {
  const year = new Date().getFullYear();

  const totals = await pool.query(
    `SELECT COALESCE(SUM(hours), 0) AS total_hours
     FROM log_entries
     WHERE user_id = $1 AND EXTRACT(YEAR FROM entry_date) = $2`,
    [req.user!.id, year]
  );
  const totalHours = Number(totals.rows[0].total_hours);

  const userRow = await pool.query('SELECT annual_base_hours FROM users WHERE id = $1', [req.user!.id]);
  const annualBase = userRow.rows[0].annual_base_hours;

  const pctThreshold = Math.min(100, (totalHours / 750) * 100);
  const pctTimeshare = Math.min(100, (totalHours / annualBase) * 100);

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const expectedPace = (750 / 365) * dayOfYear;
  const paceDiff = Math.round(totalHours - expectedPace);

  res.json({
    year,
    totalHours,
    annualBaseHours: annualBase,
    pctThreshold: Math.round(pctThreshold),
    pctTimeshare: Math.round(pctTimeshare),
    paceDiff,
  });
}));

export default router;
