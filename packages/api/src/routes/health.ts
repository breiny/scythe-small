import { Router } from 'express';
import { db } from '../db/index';
import { sql } from 'drizzle-orm';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

export { router as healthRouter };
