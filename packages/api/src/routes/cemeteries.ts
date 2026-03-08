import { Router } from 'express';
import { db } from '../db/index';
import { cemeteries, plots, deceasedPersons } from '../db/schema';
import { eq, sql, count } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import {
  detectCemetery,
  createCemeteryFromOsm,
  listCemeteries,
} from '../services/cemeteryDetectionService';
import type { OsmCemeteryMatch } from '@scythe/shared';

const router = Router();

// Cemetery auto-detection endpoint
router.get('/api/cemeteries/detect', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      throw new AppError(400, 'lat and lon query parameters are required and must be numbers');
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new AppError(400, 'lat must be -90..90, lon must be -180..180');
    }

    const result = await detectCemetery(lat, lon);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Create cemetery from OSM detection
router.post('/api/cemeteries/from-osm', requireAuth, async (req, res, next) => {
  try {
    const { osmMatch, lat, lon } = req.body as {
      osmMatch: OsmCemeteryMatch;
      lat: number;
      lon: number;
    };

    if (!osmMatch || typeof lat !== 'number' || typeof lon !== 'number') {
      throw new AppError(400, 'osmMatch, lat, and lon are required');
    }

    const cemetery = await createCemeteryFromOsm(osmMatch, lat, lon);
    res.status(201).json(cemetery);
  } catch (err) {
    next(err);
  }
});

// List all cemeteries with optional plot counts for directory
router.get('/api/cemeteries', async (req, res, next) => {
  try {
    const includeStats = req.query.stats === 'true';

    if (!includeStats) {
      const result = await listCemeteries();
      return res.json(result);
    }

    // Directory mode: include city, state, centerLat/Lon, and plot count
    const results = await db
      .select({
        id: cemeteries.id,
        name: cemeteries.name,
        slug: cemeteries.slug,
        city: cemeteries.city,
        state: cemeteries.state,
        centerLat: cemeteries.centerLat,
        centerLon: cemeteries.centerLon,
        isPubliclySearchable: cemeteries.isPubliclySearchable,
        plotCount: count(plots.id),
      })
      .from(cemeteries)
      .leftJoin(plots, eq(plots.cemeteryId, cemeteries.id))
      .where(eq(cemeteries.isPubliclySearchable, true))
      .groupBy(cemeteries.id)
      .orderBy(cemeteries.name);

    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get('/api/cemeteries/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cemetery = await db
      .select()
      .from(cemeteries)
      .where(eq(cemeteries.slug, slug!))
      .limit(1);

    if (cemetery.length === 0) {
      throw new AppError(404, 'Cemetery not found');
    }

    res.json(cemetery[0]);
  } catch (err) {
    next(err);
  }
});

// Get all pinned plots for a cemetery (map data)
router.get('/api/cemeteries/:slug/plots', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const [cemetery] = await db
      .select()
      .from(cemeteries)
      .where(eq(cemeteries.slug, slug!))
      .limit(1);

    if (!cemetery) {
      throw new AppError(404, 'Cemetery not found');
    }

    const allPlots = await db
      .select({
        id: plots.id,
        plotNumber: plots.plotNumber,
        section: plots.section,
        lon: plots.lon,
        lat: plots.lat,
        status: plots.status,
      })
      .from(plots)
      .where(eq(plots.cemeteryId, cemetery.id));

    // For each plot, fetch the primary person's name
    const plotsWithNames = await Promise.all(
      allPlots.map(async (plot) => {
        const [person] = await db
          .select({
            firstName: deceasedPersons.firstName,
            lastName: deceasedPersons.lastName,
          })
          .from(deceasedPersons)
          .where(eq(deceasedPersons.plotId, plot.id))
          .limit(1);

        return {
          ...plot,
          personName: person ? `${person.firstName} ${person.lastName}` : null,
        };
      }),
    );

    res.json(plotsWithNames);
  } catch (err) {
    next(err);
  }
});

export { router as cemeteriesRouter };
