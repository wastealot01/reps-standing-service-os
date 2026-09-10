import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req: AuthedRequest, res) => {
  const result = await pool.query(
    'SELECT id, name FROM properties WHERE household_id = $1 AND archived = false ORDER BY created_at ASC',
    [req.user!.householdId]
  );
  res.json(result.rows);
}));

const createSchema = z.object({ name: z.string().trim().min(1).max(200) });

router.post('/', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await pool.query(
    'INSERT INTO properties (household_id, name) VALUES ($1, $2) RETURNING id, name',
    [req.user!.householdId, parsed.data.name]
  );
  res.status(201).json(result.rows[0]);
}));

router.delete('/:id', asyncHandler(async (req: AuthedRequest, res) => {
  await pool.query(
    'UPDATE properties SET archived = true WHERE id = $1 AND household_id = $2',
    [req.params.id, req.user!.householdId]
  );
  res.status(204).send();
}));

export default router;
