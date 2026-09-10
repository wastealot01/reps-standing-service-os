import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.use(requireAuth);

const updateSchema = z.object({ annualBaseHours: z.number().int().positive().max(8760) });

router.patch('/', asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await pool.query('UPDATE users SET annual_base_hours = $1 WHERE id = $2', [
    parsed.data.annualBaseHours,
    req.user!.id,
  ]);
  res.json({ annualBaseHours: parsed.data.annualBaseHours });
}));

export default router;
