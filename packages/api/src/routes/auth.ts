import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { loginSchema, registerSchema } from '@scythe/shared';
import { db } from '../db/index';
import { users, cemeteries } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { signToken } from '../middleware/auth';

const router = Router();

// Register: create cemetery + admin user in one step
router.post('/api/auth/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i: { path: Array<string | number>; message: string }) => `${i.path.join('.')}: ${i.message}`);
      throw new AppError(400, `Validation error: ${messages.join(', ')}`);
    }

    const data = parsed.data;

    // Generate slug from cemetery name
    const slug = data.cemeteryName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) {
      throw new AppError(400, 'Cemetery name must contain at least one alphanumeric character');
    }

    // Check slug uniqueness
    const existing = await db
      .select({ id: cemeteries.id })
      .from(cemeteries)
      .where(eq(cemeteries.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(409, `A cemetery with the URL "${slug}" already exists. Choose a different name.`);
    }

    // Check email uniqueness
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new AppError(409, 'An account with this email already exists');
    }

    // Create cemetery
    const [cemetery] = await db
      .insert(cemeteries)
      .values({
        name: data.cemeteryName,
        slug,
        address: data.cemeteryAddress,
        city: data.cemeteryCity,
        state: data.cemeteryState,
        zip: data.cemeteryZip,
        isPubliclySearchable: true,
      })
      .returning();

    if (!cemetery) {
      throw new AppError(500, 'Failed to create cemetery');
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(data.password, 10);

    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        name: data.name,
        role: 'admin',
        cemeteryId: cemetery.id,
        passwordHash,
      })
      .returning();

    if (!user) {
      throw new AppError(500, 'Failed to create user');
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      cemeteryId: user.cemeteryId,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        cemeteryId: user.cemeteryId,
      },
      cemetery: {
        id: cemetery.id,
        name: cemetery.name,
        slug: cemetery.slug,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'Invalid email or password format');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password');
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      cemeteryId: user.cemeteryId,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        cemeteryId: user.cemeteryId,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/auth/me', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'Not authenticated');
    }

    const jwt = await import('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET ?? 'scythe-dev-secret-change-me';
    const payload = jwt.default.verify(header.slice(7), JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
      cemeteryId: string;
    };

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);

    if (!user) {
      throw new AppError(401, 'User not found');
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      cemeteryId: user.cemeteryId,
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
