import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { db } from '../db/index';
import { headstonePhotos } from '../db/schema';
import {
  THUMBNAIL_MAX_DIMENSION,
  THUMBNAIL_JPEG_QUALITY,
} from '@scythe/shared';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const ORIGINALS_DIR = path.join(UPLOADS_DIR, 'originals');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

// Hardcoded test user — must match seeded user in seed.ts
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

async function ensureUploadDirs(): Promise<void> {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
}

interface SavePhotoParams {
  filePath: string;
  originalName: string;
  cemeteryId: string;
  plotId: string;
  exifLat: number | null;
  exifLon: number | null;
  exifAccuracy: number | null;
  capturedAt: string | null;
}

export async function savePhoto(params: SavePhotoParams) {
  await ensureUploadDirs();

  const ext = path.extname(params.originalName).toLowerCase() || '.jpg';
  const isHeic = ext === '.heic' || ext === '.heif';
  const fileId = crypto.randomUUID();
  const originalFilename = isHeic ? `${fileId}.jpg` : `${fileId}${ext}`;
  const thumbnailFilename = `${fileId}_thumb.jpg`;

  const originalPath = path.join(ORIGINALS_DIR, originalFilename);
  const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

  if (isHeic) {
    // Convert HEIC/HEIF to JPEG (Textract only accepts JPEG/PNG/PDF)
    await sharp(params.filePath).jpeg({ quality: 95 }).toFile(originalPath);
    await fs.unlink(params.filePath).catch(() => {});
  } else {
    // Move uploaded file to originals dir
    await fs.rename(params.filePath, originalPath);
  }

  // Generate thumbnail
  await sharp(originalPath)
    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
      fit: 'inside',
    })
    .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
    .toFile(thumbnailPath);

  const photoUrl = `/uploads/originals/${originalFilename}`;
  const thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;

  const [record] = await db
    .insert(headstonePhotos)
    .values({
      plotId: params.plotId,
      cemeteryId: params.cemeteryId,
      photoUrl,
      thumbnailUrl,
      uploadedBy: TEST_USER_ID,
      exifLat: params.exifLat,
      exifLon: params.exifLon,
      exifAccuracy: params.exifAccuracy,
      capturedAt: params.capturedAt ? new Date(params.capturedAt) : null,
    })
    .returning();

  return record;
}

// Save a photo for OCR processing — no plotId required yet.
// Returns the saved file paths and metadata for later association with a plot.
interface SavePhotoForOcrParams {
  filePath: string;
  originalName: string;
  cemeteryId: string;
  exifLat: number | null;
  exifLon: number | null;
  exifAccuracy: number | null;
  capturedAt: string | null;
}

export async function savePhotoForOcr(params: SavePhotoForOcrParams) {
  await ensureUploadDirs();

  const ext = path.extname(params.originalName).toLowerCase() || '.jpg';
  const isHeic = ext === '.heic' || ext === '.heif';
  const fileId = crypto.randomUUID();
  const originalFilename = isHeic ? `${fileId}.jpg` : `${fileId}${ext}`;
  const thumbnailFilename = `${fileId}_thumb.jpg`;

  const originalPath = path.join(ORIGINALS_DIR, originalFilename);
  const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

  if (isHeic) {
    await sharp(params.filePath).jpeg({ quality: 95 }).toFile(originalPath);
    await fs.unlink(params.filePath).catch(() => {});
  } else {
    await fs.rename(params.filePath, originalPath);
  }

  await sharp(originalPath)
    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: 'inside' })
    .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
    .toFile(thumbnailPath);

  return {
    fileId,
    photoUrl: `/uploads/originals/${originalFilename}`,
    thumbnailUrl: `/uploads/thumbnails/${thumbnailFilename}`,
    originalPath,
    exifLat: params.exifLat,
    exifLon: params.exifLon,
    exifAccuracy: params.exifAccuracy,
    capturedAt: params.capturedAt,
    cemeteryId: params.cemeteryId,
  };
}

// Read a photo file as a buffer (for OCR processing)
export async function readPhotoBuffer(photoUrl: string): Promise<Buffer> {
  const filePath = path.join(path.resolve(process.cwd()), photoUrl);
  return fs.readFile(filePath);
}
