import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

function issueToken(user: { id: string; household_id: string; role: string }) {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
  return jwt.sign(
    { sub: user.id, householdId: user.household_id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn }
  );
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Creates a brand new household with this user as the primary account.
// Returns an invite code the primary can share with a spouse.
router.post('/signup', asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const inviteCode = generateInviteCode();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const household = await client.query(
      'INSERT INTO households (invite_code) VALUES ($1) RETURNING id',
      [inviteCode]
    );
    const householdId = household.rows[0].id;
    const user = await client.query(
      `INSERT INTO users (id, household_id, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'primary') RETURNING id, household_id, role`,
      [uuidv4(), householdId, email, passwordHash]
    );
    await client.query('COMMIT');
    const token = issueToken(user.rows[0]);
    res.status(201).json({ token, inviteCode, role: 'primary' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

const redeemSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteCode: z.string().min(4),
});

// Joins an existing household as the spouse account, using the primary's invite code.
router.post('/invite/redeem', asyncHandler(async (req, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, inviteCode } = parsed.data;

  const household = await pool.query('SELECT id FROM households WHERE invite_code = $1', [inviteCode.toUpperCase()]);
  if (household.rows.length === 0) {
    return res.status(404).json({ error: 'Invite code not found' });
  }
  const householdId = household.rows[0].id;

  const spouseExists = await pool.query(
    "SELECT 1 FROM users WHERE household_id = $1 AND role = 'spouse'",
    [householdId]
  );
  if (spouseExists.rows.length > 0) {
    return res.status(409).json({ error: 'This household already has a spouse account' });
  }

  const existingEmail = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existingEmail.rows.length > 0) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await pool.query(
    `INSERT INTO users (id, household_id, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'spouse') RETURNING id, household_id, role`,
    [uuidv4(), householdId, email, passwordHash]
  );
  const token = issueToken(user.rows[0]);
  res.status(201).json({ token, role: 'spouse' });
}));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const result = await pool.query(
    'SELECT id, household_id, role, password_hash FROM users WHERE email = $1',
    [email]
  );
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = issueToken(user);
  res.json({ token, role: user.role });
}));

export default router;
