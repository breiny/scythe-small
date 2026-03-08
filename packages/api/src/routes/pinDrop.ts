import { Router } from 'express';
import { manualPinDropSchema } from '@scythe/shared';
import { db } from '../db/index';
import { plots, deceasedPersons, headstonePhotos } from '../db/schema';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { randomUUID } from 'crypto';

const router = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
const originalsDir = path.join(uploadsDir, 'originals');
const thumbnailsDir = path.join(uploadsDir, 'thumbnails');

for (const dir of [originalsDir, thumbnailsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Create plot + deceased person in one call, with optional photo
router.post('/api/pin-drop', requireAuth, upload.single('photo'), async (req, res, next) => {
  try {
    const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const parsed = manualPinDropSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i: { message: string }) => i.message).join(', ')}`);
    }

    const data = parsed.data;

    // Create the plot with GPS coordinates
    const [plot] = await db
      .insert(plots)
      .values({
        cemeteryId: data.cemeteryId,
        plotNumber: data.plotNumber ?? null,
        section: data.section ?? null,
        lon: data.lon,
        lat: data.lat,
        gpsAccuracyMeters: data.gpsAccuracyMeters,
        gpsSource: 'manual',
        status: 'pinned',
      })
      .returning();

    if (!plot) {
      throw new AppError(500, 'Failed to create plot');
    }

    // Create the deceased person record
    const [person] = await db
      .insert(deceasedPersons)
      .values({
        cemeteryId: data.cemeteryId,
        plotId: plot.id,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        dateOfDeath: data.dateOfDeath ? new Date(data.dateOfDeath) : null,
        isPubliclyVisible: true,
      })
      .returning();

    // Handle optional photo
    let photo = null;
    if (req.file) {
      const fileId = randomUUID();
      const ext = '.jpg';
      const originalPath = path.join(originalsDir, `${fileId}${ext}`);
      const thumbnailPath = path.join(thumbnailsDir, `${fileId}_thumb${ext}`);

      // Save original
      await sharp(req.file.buffer).jpeg({ quality: 90 }).toFile(originalPath);

      // Generate thumbnail
      await sharp(req.file.buffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      [photo] = await db
        .insert(headstonePhotos)
        .values({
          plotId: plot.id,
          cemeteryId: data.cemeteryId,
          photoUrl: `/uploads/originals/${fileId}${ext}`,
          thumbnailUrl: `/uploads/thumbnails/${fileId}_thumb${ext}`,
          uploadedBy: req.user!.id,
        })
        .returning();
    }

    res.status(201).json({ plot, person, photo });
  } catch (err) {
    next(err);
  }
});

export { router as pinDropRouter };
