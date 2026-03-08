import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { publicSubmitSchema, UNAFFILIATED_CEMETERY_SLUG } from '@scythe/shared';
import { createVisionProcessor } from '../services/ocrService';
import {
  savePhotoForOcr,
  readPhotoBuffer,
  TEST_USER_ID,
} from '../services/photoService';
import { AppError } from '../middleware/errorHandler';
import { db } from '../db/index';
import { plots, deceasedPersons, headstonePhotos, cemeteries } from '../db/schema';
import {
  detectCemetery,
  createCemeteryFromOsm,
} from '../services/cemeteryDetectionService';
import { eq } from 'drizzle-orm';
import type { OsmCemeteryMatch } from '@scythe/shared';

const upload = multer({
  dest: path.resolve(process.cwd(), 'uploads', 'tmp'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for public
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();
let visionProcessor: ReturnType<typeof createVisionProcessor>;
function getVisionProcessor() {
  if (!visionProcessor) {
    visionProcessor = createVisionProcessor();
  }
  return visionProcessor;
}

// Rate limiter: 20 submissions per IP per hour
const publicSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory store for pending public OCR results
const pendingContributions = new Map<
  string,
  {
    photoUrl: string;
    thumbnailUrl: string;
    exifLat: number;
    exifLon: number;
    exifAccuracy: number | null;
    capturedAt: string | null;
    detectedCemeteryId: string | null;
    osmMatch: OsmCemeteryMatch | null;
  }
>();

// POST /api/contribute/process — Upload photo, run OCR, detect cemetery
router.post(
  '/api/contribute/process',
  upload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'No photo file provided');
      }

      const exifLat = req.body.exifLat ? parseFloat(req.body.exifLat) : null;
      const exifLon = req.body.exifLon ? parseFloat(req.body.exifLon) : null;
      const exifAccuracy = req.body.exifAccuracy
        ? parseFloat(req.body.exifAccuracy)
        : null;
      const capturedAt = (req.body.capturedAt as string) || null;

      if (exifLat == null || exifLon == null) {
        throw new AppError(
          400,
          'GPS coordinates are required. Please ensure location services are enabled for your camera.',
        );
      }

      // Use a placeholder cemeteryId for photo saving — we resolve the real one at submit time
      const placeholderCemeteryId = '00000000-0000-0000-0000-000000000000';

      // 1. Save photo (with HEIC conversion)
      const savedPhoto = await savePhotoForOcr({
        filePath: req.file.path,
        originalName: req.file.originalname,
        cemeteryId: placeholderCemeteryId,
        exifLat,
        exifLon,
        exifAccuracy,
        capturedAt,
      });

      // 2. Read the saved image for OCR
      const imageBuffer = await readPhotoBuffer(savedPhoto.photoUrl);

      // 3. Run Vision OCR (image → Claude Vision → structured data)
      const parsed = await getVisionProcessor().processImage(imageBuffer);

      // 4. Detect cemetery from GPS
      const detection = await detectCemetery(exifLat, exifLon);

      const detectedCemeteryId = detection.match?.cemetery.id ?? null;
      const osmMatch = detection.osmMatch ?? null;

      // 5. Store pending result
      pendingContributions.set(savedPhoto.fileId, {
        photoUrl: savedPhoto.photoUrl,
        thumbnailUrl: savedPhoto.thumbnailUrl,
        exifLat,
        exifLon,
        exifAccuracy,
        capturedAt,
        detectedCemeteryId,
        osmMatch,
      });

      res.status(200).json({
        photoId: savedPhoto.fileId,
        thumbnailUrl: savedPhoto.thumbnailUrl,
        photoUrl: savedPhoto.photoUrl,
        rawText: parsed.rawText,
        persons: parsed.persons,
        overallConfidence: parsed.overallConfidence,
        gps: {
          lat: exifLat,
          lon: exifLon,
          accuracy: exifAccuracy,
        },
        detectedCemetery: detection.match?.cemetery ?? null,
        osmMatch,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/contribute/submit — Create plot + persons + photo from reviewed data
router.post(
  '/api/contribute/submit',
  publicSubmitLimiter,
  async (req, res, next) => {
    try {
      const parsed = publicSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, `Validation error: ${parsed.error.message}`);
      }

      const data = parsed.data;
      const pending = pendingContributions.get(data.photoId);
      if (!pending) {
        throw new AppError(
          404,
          'Submission data not found or expired. Please re-process the photo.',
        );
      }

      // Resolve cemetery ID
      let cemeteryId: string;

      if (data.cemeteryId) {
        // User/frontend explicitly provided a cemetery
        cemeteryId = data.cemeteryId;
      } else if (pending.detectedCemeteryId) {
        // Scythe DB match from detection
        cemeteryId = pending.detectedCemeteryId;
      } else if (pending.osmMatch) {
        // Auto-create from OSM
        const newCemetery = await createCemeteryFromOsm(
          pending.osmMatch,
          pending.exifLat,
          pending.exifLon,
        );
        cemeteryId = newCemetery.id;
      } else {
        // No cemetery detected — use sentinel
        const [sentinel] = await db
          .select({ id: cemeteries.id })
          .from(cemeteries)
          .where(eq(cemeteries.slug, UNAFFILIATED_CEMETERY_SLUG))
          .limit(1);

        if (!sentinel) {
          throw new AppError(
            500,
            'Sentinel cemetery not found. Please run database seed.',
          );
        }
        cemeteryId = sentinel.id;
      }

      // 1. Create plot
      const [plot] = await db
        .insert(plots)
        .values({
          cemeteryId,
          lon: data.lon,
          lat: data.lat,
          gpsAccuracyMeters: data.gpsAccuracyMeters ?? null,
          gpsSource: 'exif',
          status: 'pinned',
        })
        .returning();

      // 2. Create deceased person(s)
      const createdPersons = [];
      for (const person of data.persons) {
        const [created] = await db
          .insert(deceasedPersons)
          .values({
            cemeteryId,
            plotId: plot!.id,
            firstName: person.firstName,
            middleName: person.middleName ?? null,
            lastName: person.lastName,
            maidenName: person.maidenName ?? null,
            dateOfBirth: person.dateOfBirth ? new Date(person.dateOfBirth) : null,
            dateOfDeath: person.dateOfDeath ? new Date(person.dateOfDeath) : null,
            inscription: person.inscription ?? null,
            verificationStatus: 'unverified',
            submissionSource: 'public',
            submittedBy: data.submittedBy || 'Anonymous Visitor',
          })
          .returning();
        createdPersons.push(created);
      }

      // 3. Create headstone photo record
      const [photo] = await db
        .insert(headstonePhotos)
        .values({
          plotId: plot!.id,
          cemeteryId,
          photoUrl: pending.photoUrl,
          thumbnailUrl: pending.thumbnailUrl,
          uploadedBy: TEST_USER_ID,
          exifLat: pending.exifLat,
          exifLon: pending.exifLon,
          exifAccuracy: pending.exifAccuracy,
          capturedAt: pending.capturedAt ? new Date(pending.capturedAt) : null,
        })
        .returning();

      // Clean up pending
      pendingContributions.delete(data.photoId);

      res.status(201).json({
        plot,
        persons: createdPersons,
        photo,
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as contributeRouter };
