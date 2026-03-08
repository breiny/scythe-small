import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { photoUploadMetadataSchema } from '@scythe/shared';
import { savePhoto } from '../services/photoService';
import { AppError } from '../middleware/errorHandler';

const upload = multer({
  dest: path.resolve(process.cwd(), 'uploads', 'tmp'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();

router.post(
  '/api/photos/upload',
  upload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'No photo file provided');
      }

      const rawMetadata = req.body.metadata;
      if (!rawMetadata) {
        throw new AppError(400, 'Missing metadata field');
      }

      const parsed = photoUploadMetadataSchema.safeParse(
        JSON.parse(rawMetadata as string),
      );
      if (!parsed.success) {
        throw new AppError(400, `Invalid metadata: ${parsed.error.message}`);
      }

      const metadata = parsed.data;

      const record = await savePhoto({
        filePath: req.file.path,
        originalName: req.file.originalname,
        cemeteryId: metadata.cemeteryId,
        plotId: metadata.plotId,
        exifLat: metadata.exifLat,
        exifLon: metadata.exifLon,
        exifAccuracy: metadata.exifAccuracy,
        capturedAt: metadata.capturedAt,
      });

      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  },
);

export { router as photosRouter };
