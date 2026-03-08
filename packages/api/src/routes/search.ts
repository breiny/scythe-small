import { Router } from 'express';
import { db } from '../db/index';
import {
  deceasedPersons,
  plots,
  cemeteries,
  headstonePhotos,
} from '../db/schema';
import { eq, ne, ilike, or, and, sql, count } from 'drizzle-orm';
import { searchQuerySchema } from '@scythe/shared';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.get('/api/search', async (req, res, next) => {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Invalid search parameters');
    }

    const { q, page, limit, cemeterySlug } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(deceasedPersons.isPubliclyVisible, true),
      ne(deceasedPersons.verificationStatus, 'rejected'),
      or(
        ilike(deceasedPersons.firstName, `%${q}%`),
        ilike(deceasedPersons.lastName, `%${q}%`),
      ),
    ];

    if (cemeterySlug) {
      conditions.push(eq(cemeteries.slug, cemeterySlug));
    }

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(deceasedPersons)
      .innerJoin(cemeteries, eq(deceasedPersons.cemeteryId, cemeteries.id))
      .where(and(...conditions));

    const total = countResult?.total ?? 0;

    // Get results with plot and cemetery data
    const results = await db
      .select({
        person: deceasedPersons,
        plot: plots,
        cemetery: {
          id: cemeteries.id,
          name: cemeteries.name,
          slug: cemeteries.slug,
          city: cemeteries.city,
          state: cemeteries.state,
        },
      })
      .from(deceasedPersons)
      .leftJoin(plots, eq(deceasedPersons.plotId, plots.id))
      .innerJoin(cemeteries, eq(deceasedPersons.cemeteryId, cemeteries.id))
      .where(and(...conditions))
      .orderBy(deceasedPersons.lastName, deceasedPersons.firstName)
      .limit(limit)
      .offset(offset);

    // Fetch first thumbnail for each plot that has one
    const plotIds = results
      .map((r) => r.plot?.id)
      .filter((id): id is string => id != null);

    let photoMap: Record<string, string> = {};
    if (plotIds.length > 0) {
      const photos = await db
        .select({
          plotId: headstonePhotos.plotId,
          thumbnailUrl: headstonePhotos.thumbnailUrl,
        })
        .from(headstonePhotos)
        .where(
          sql`${headstonePhotos.plotId} IN ${plotIds}`,
        );

      for (const photo of photos) {
        if (photo.thumbnailUrl && !photoMap[photo.plotId]) {
          photoMap[photo.plotId] = photo.thumbnailUrl;
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
});

export { router as searchRouter };
