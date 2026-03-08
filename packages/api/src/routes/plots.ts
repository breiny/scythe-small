import { Router } from 'express';
import { createPlotSchema } from '@scythe/shared';
import { db } from '../db/index';
import {
  plots,
  deceasedPersons,
  headstonePhotos,
  cemeteries,
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.post('/api/plots', async (req, res, next) => {
  try {
    const parsed = createPlotSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.message}`);
    }

    const [plot] = await db
      .insert(plots)
      .values({
        cemeteryId: parsed.data.cemeteryId,
        plotNumber: parsed.data.plotNumber ?? null,
        section: parsed.data.section ?? null,
        lon: parsed.data.lon ?? null,
        lat: parsed.data.lat ?? null,
        gpsAccuracyMeters: parsed.data.gpsAccuracyMeters ?? null,
        gpsSource: parsed.data.gpsSource ?? null,
        status: parsed.data.status,
      })
      .returning();

    res.status(201).json(plot);
  } catch (err) {
    next(err);
  }
});

// Plot detail: returns plot + cemetery + persons + photos
router.get('/api/plots/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const plotRows = await db
      .select()
      .from(plots)
      .where(eq(plots.id, id!))
      .limit(1);

    if (plotRows.length === 0) {
      throw new AppError(404, 'Plot not found');
    }

    const plot = plotRows[0]!;

    const [cemetery, persons, photos] = await Promise.all([
      db
        .select()
        .from(cemeteries)
        .where(eq(cemeteries.id, plot.cemeteryId))
        .limit(1),
      db
        .select()
        .from(deceasedPersons)
        .where(eq(deceasedPersons.plotId, plot.id)),
      db
        .select()
        .from(headstonePhotos)
        .where(eq(headstonePhotos.plotId, plot.id)),
    ]);

    res.json({
      plot,
      cemetery: cemetery[0] ?? null,
      persons,
      photos,
    });
  } catch (err) {
    next(err);
  }
});

export { router as plotsRouter };
