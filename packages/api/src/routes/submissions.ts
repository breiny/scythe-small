import { Router } from 'express';
import { db } from '../db/index';
import {
  deceasedPersons,
  plots,
  headstonePhotos,
  cemeteries,
} from '../db/schema';
import { eq, and, or, count } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { UNAFFILIATED_CEMETERY_SLUG } from '@scythe/shared';

const router = Router();

// GET /api/admin/submissions — List unverified records for admin's cemetery
router.get(
  '/api/admin/submissions',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      // Get sentinel cemetery ID for including unaffiliated submissions
      const [sentinel] = await db
        .select({ id: cemeteries.id })
        .from(cemeteries)
        .where(eq(cemeteries.slug, UNAFFILIATED_CEMETERY_SLUG))
        .limit(1);

      const cemeteryCondition = sentinel
        ? or(
            eq(deceasedPersons.cemeteryId, req.user!.cemeteryId),
            eq(deceasedPersons.cemeteryId, sentinel.id),
          )
        : eq(deceasedPersons.cemeteryId, req.user!.cemeteryId);

      const conditions = and(
        eq(deceasedPersons.verificationStatus, 'unverified'),
        cemeteryCondition,
      );

      // Count
      const [countResult] = await db
        .select({ total: count() })
        .from(deceasedPersons)
        .where(conditions);

      const total = countResult?.total ?? 0;

      // Fetch with joins
      const results = await db
        .select({
          person: deceasedPersons,
          plot: plots,
          cemetery: {
            id: cemeteries.id,
            name: cemeteries.name,
            slug: cemeteries.slug,
          },
        })
        .from(deceasedPersons)
        .leftJoin(plots, eq(deceasedPersons.plotId, plots.id))
        .innerJoin(cemeteries, eq(deceasedPersons.cemeteryId, cemeteries.id))
        .where(conditions)
        .orderBy(deceasedPersons.createdAt)
        .limit(limit)
        .offset(offset);

      // Fetch thumbnails for each plot
      const plotIds = results
        .map((r) => r.plot?.id)
        .filter((id): id is string => id != null);

      let photoMap: Record<string, string> = {};
      if (plotIds.length > 0) {
        for (const plotId of plotIds) {
          const [photo] = await db
            .select({ thumbnailUrl: headstonePhotos.thumbnailUrl })
            .from(headstonePhotos)
            .where(eq(headstonePhotos.plotId, plotId))
            .limit(1);
          if (photo?.thumbnailUrl) {
            photoMap[plotId] = photo.thumbnailUrl;
          }
        }
      }

      const enrichedResults = results.map((r) => ({
        ...r,
        thumbnailUrl: r.plot ? (photoMap[r.plot.id] ?? null) : null,
      }));

      res.json({
        results: enrichedResults,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/submissions/count — Pending count for nav badge
router.get(
  '/api/admin/submissions/count',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const [sentinel] = await db
        .select({ id: cemeteries.id })
        .from(cemeteries)
        .where(eq(cemeteries.slug, UNAFFILIATED_CEMETERY_SLUG))
        .limit(1);

      const cemeteryCondition = sentinel
        ? or(
            eq(deceasedPersons.cemeteryId, req.user!.cemeteryId),
            eq(deceasedPersons.cemeteryId, sentinel.id),
          )
        : eq(deceasedPersons.cemeteryId, req.user!.cemeteryId);

      const [result] = await db
        .select({ count: count() })
        .from(deceasedPersons)
        .where(
          and(
            eq(deceasedPersons.verificationStatus, 'unverified'),
            cemeteryCondition,
          ),
        );

      res.json({ count: result?.count ?? 0 });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/admin/submissions/:personId/approve
router.patch(
  '/api/admin/submissions/:personId/approve',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { personId } = req.params;

      const [updated] = await db
        .update(deceasedPersons)
        .set({ verificationStatus: 'verified', updatedAt: new Date() })
        .where(eq(deceasedPersons.id, personId as string))
        .returning();

      if (!updated) {
        throw new AppError(404, 'Record not found');
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/admin/submissions/:personId/reject
router.patch(
  '/api/admin/submissions/:personId/reject',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { personId } = req.params;

      const [updated] = await db
        .update(deceasedPersons)
        .set({ verificationStatus: 'rejected', updatedAt: new Date() })
        .where(eq(deceasedPersons.id, personId as string))
        .returning();

      if (!updated) {
        throw new AppError(404, 'Record not found');
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/admin/submissions/:personId/edit-approve — Update fields and approve
router.patch(
  '/api/admin/submissions/:personId/edit-approve',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { personId } = req.params;
      const { firstName, lastName, middleName, maidenName, dateOfBirth, dateOfDeath, inscription } =
        req.body as Record<string, string | undefined>;

      const updateData: Record<string, unknown> = {
        verificationStatus: 'verified' as const,
        updatedAt: new Date(),
      };

      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (middleName !== undefined) updateData.middleName = middleName || null;
      if (maidenName !== undefined) updateData.maidenName = maidenName || null;
      if (dateOfBirth !== undefined)
        updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
      if (dateOfDeath !== undefined)
        updateData.dateOfDeath = dateOfDeath ? new Date(dateOfDeath) : null;
      if (inscription !== undefined) updateData.inscription = inscription || null;

      const [updated] = await db
        .update(deceasedPersons)
        .set(updateData)
        .where(eq(deceasedPersons.id, personId as string))
        .returning();

      if (!updated) {
        throw new AppError(404, 'Record not found');
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

export { router as submissionsRouter };
