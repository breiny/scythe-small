import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { ocrConfirmSchema } from '@scythe/shared';
import { createVisionProcessor } from '../services/ocrService';
import {
  savePhotoForOcr,
  readPhotoBuffer,
  TEST_USER_ID,
} from '../services/photoService';
import { AppError } from '../middleware/errorHandler';
import { db } from '../db/index';
import { plots, deceasedPersons, headstonePhotos } from '../db/schema';

const upload = multer({
  dest: path.resolve(process.cwd(), 'uploads', 'tmp'),
  limits: { fileSize: 20 * 1024 * 1024 },
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

// In-memory store for OCR results pending confirmation (dev-friendly approach).
// In production, these would go into Redis or a DB table.
const pendingOcrResults = new Map<
  string,
  {
    photoUrl: string;
    thumbnailUrl: string;
    cemeteryId: string;
    exifLat: number | null;
    exifLon: number | null;
    exifAccuracy: number | null;
    capturedAt: string | null;
  }
>();

// POST /api/ocr/process — Upload photo, run OCR, return parsed results
router.post(
  '/api/ocr/process',
  upload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'No photo file provided');
      }

      const cemeteryId = req.body.cemeteryId as string;
      if (!cemeteryId) {
        throw new AppError(400, 'Missing cemeteryId');
      }

      const exifLat = req.body.exifLat ? parseFloat(req.body.exifLat) : null;
      const exifLon = req.body.exifLon ? parseFloat(req.body.exifLon) : null;
      const exifAccuracy = req.body.exifAccuracy
        ? parseFloat(req.body.exifAccuracy)
        : null;
      const capturedAt = (req.body.capturedAt as string) || null;

      // 1. Save photo (with HEIC conversion)
      const savedPhoto = await savePhotoForOcr({
        filePath: req.file.path,
        originalName: req.file.originalname,
        cemeteryId,
        exifLat,
        exifLon,
        exifAccuracy,
        capturedAt,
      });

      // 2. Read the saved (converted) image for OCR
      const imageBuffer = await readPhotoBuffer(savedPhoto.photoUrl);

      // 3. Run Vision OCR (image → Claude Vision → structured data)
      const parsed = await getVisionProcessor().processImage(imageBuffer);

      // 5. Store pending result keyed by fileId
      pendingOcrResults.set(savedPhoto.fileId, {
        photoUrl: savedPhoto.photoUrl,
        thumbnailUrl: savedPhoto.thumbnailUrl,
        cemeteryId: savedPhoto.cemeteryId,
        exifLat: savedPhoto.exifLat,
        exifLon: savedPhoto.exifLon,
        exifAccuracy: savedPhoto.exifAccuracy,
        capturedAt: savedPhoto.capturedAt,
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
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/ocr/confirm — Create plot + deceased person(s) + headstone photo from reviewed OCR data
router.post('/api/ocr/confirm', async (req, res, next) => {
  try {
    const parsed = ocrConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.message}`);
    }

    const data = parsed.data;
    const pending = pendingOcrResults.get(data.photoId);
    if (!pending) {
      throw new AppError(404, 'OCR result not found or expired. Please re-process the photo.');
    }

    // 1. Create plot
    const hasGps = data.lat != null && data.lon != null;
    const [plot] = await db
      .insert(plots)
      .values({
        cemeteryId: data.cemeteryId,
        plotNumber: data.plotNumber ?? null,
        section: data.section ?? null,
        lon: data.lon ?? null,
        lat: data.lat ?? null,
        gpsAccuracyMeters: data.gpsAccuracyMeters ?? null,
        gpsSource: data.gpsSource ?? (hasGps ? 'exif' : null),
        status: hasGps ? 'pinned' : 'unpinned',
      })
      .returning();

    // 2. Create deceased person(s)
    const createdPersons = [];
    for (const person of data.persons) {
      const [created] = await db
        .insert(deceasedPersons)
        .values({
          cemeteryId: data.cemeteryId,
          plotId: plot!.id,
          firstName: person.firstName,
          middleName: person.middleName ?? null,
          lastName: person.lastName,
          maidenName: person.maidenName ?? null,
          dateOfBirth: person.dateOfBirth ? new Date(person.dateOfBirth) : null,
          dateOfDeath: person.dateOfDeath ? new Date(person.dateOfDeath) : null,
          inscription: person.inscription ?? null,
        })
        .returning();
      createdPersons.push(created);
    }

    // 3. Create headstone photo record
    const [photo] = await db
      .insert(headstonePhotos)
      .values({
        plotId: plot!.id,
        cemeteryId: data.cemeteryId,
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
    pendingOcrResults.delete(data.photoId);

    res.status(201).json({
      plot: plot,
      persons: createdPersons,
      photo: photo,
    });
  } catch (err) {
    next(err);
  }
});

export { router as ocrRouter };
