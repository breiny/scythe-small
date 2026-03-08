import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  cemeterySlug: z.string().optional(),
  birthYearMin: z.coerce.number().int().optional(),
  birthYearMax: z.coerce.number().int().optional(),
  deathYearMin: z.coerce.number().int().optional(),
  deathYearMax: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createPlotSchema = z.object({
  cemeteryId: z.string().uuid(),
  plotNumber: z.string().max(50).optional(),
  section: z.string().max(100).optional(),
  lon: z.number().min(-180).max(180).optional(),
  lat: z.number().min(-90).max(90).optional(),
  gpsAccuracyMeters: z.number().min(0).optional(),
  gpsSource: z.enum(['exif', 'manual', 'csv', 'geocoded']).optional(),
  status: z.enum(['unpinned', 'pinned', 'occupied', 'available']).default('unpinned'),
});

export const createDeceasedPersonSchema = z.object({
  cemeteryId: z.string().uuid(),
  plotId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  maidenName: z.string().max(100).optional(),
  dateOfBirth: z.string().optional(),
  dateOfDeath: z.string().optional(),
  inscription: z.string().max(2000).optional(),
  isPubliclyVisible: z.boolean().default(true),
});

export const createCemeterySchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(50),
  zip: z.string().min(1).max(20),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
  hoursDescription: z.string().max(500).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  cemeteryName: z.string().min(1).max(200),
  cemeteryAddress: z.string().min(1).max(500),
  cemeteryCity: z.string().min(1).max(100),
  cemeteryState: z.string().min(1).max(50),
  cemeteryZip: z.string().min(1).max(20),
});

export const exifDataSchema = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  accuracy: z.number().min(0).nullable(),
  capturedAt: z.string().nullable(),
  deviceMake: z.string().nullable(),
  deviceModel: z.string().nullable(),
});

export const photoUploadMetadataSchema = z.object({
  cemeteryId: z.string().uuid(),
  plotId: z.string().uuid(),
  exifLat: z.number().min(-90).max(90).nullable(),
  exifLon: z.number().min(-180).max(180).nullable(),
  exifAccuracy: z.number().min(0).nullable(),
  capturedAt: z.string().nullable(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type CreatePlot = z.infer<typeof createPlotSchema>;
export type CreateDeceasedPerson = z.infer<typeof createDeceasedPersonSchema>;
export type CreateCemetery = z.infer<typeof createCemeterySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ExifData = z.infer<typeof exifDataSchema>;
export type PhotoUploadMetadata = z.infer<typeof photoUploadMetadataSchema>;

// Manual pin drop: create plot + deceased person in one call
export const manualPinDropSchema = z.object({
  cemeteryId: z.string().uuid(),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  gpsAccuracyMeters: z.number().min(0),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().optional(),
  dateOfDeath: z.string().optional(),
  section: z.string().max(100).optional(),
  plotNumber: z.string().max(50).optional(),
});

export type ManualPinDrop = z.infer<typeof manualPinDropSchema>;

// CSV import row validation
export const csvImportRowSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().optional(),
  dateOfDeath: z.string().optional(),
  section: z.string().optional(),
  plotNumber: z.string().optional(),
});

export type CsvImportRow = z.infer<typeof csvImportRowSchema>;

// OCR schemas
export const ocrFieldConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const ocrParsedPersonSchema = z.object({
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  maidenName: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  dateOfDeath: z.string().nullable(),
  inscription: z.string().nullable(),
  confidence: z.object({
    firstName: ocrFieldConfidenceSchema,
    lastName: ocrFieldConfidenceSchema,
    dateOfBirth: ocrFieldConfidenceSchema,
    dateOfDeath: ocrFieldConfidenceSchema,
    inscription: ocrFieldConfidenceSchema,
  }),
});

export const ocrResultSchema = z.object({
  rawText: z.string(),
  persons: z.array(ocrParsedPersonSchema),
  overallConfidence: z.number().min(0).max(1),
  photoId: z.string(),
});

export const ocrConfirmSchema = z.object({
  cemeteryId: z.string().uuid(),
  photoId: z.string().uuid(),
  section: z.string().max(100).optional(),
  plotNumber: z.string().max(50).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  gpsAccuracyMeters: z.number().min(0).optional(),
  gpsSource: z.enum(['exif', 'manual', 'csv', 'geocoded']).optional(),
  persons: z.array(
    z.object({
      firstName: z.string().min(1).max(100),
      middleName: z.string().max(100).optional(),
      lastName: z.string().min(1).max(100),
      maidenName: z.string().max(100).optional(),
      dateOfBirth: z.string().optional(),
      dateOfDeath: z.string().optional(),
      inscription: z.string().max(2000).optional(),
    }),
  ),
});

export type OcrConfirm = z.infer<typeof ocrConfirmSchema>;

// Public contribution schema
export const publicSubmitSchema = z.object({
  photoId: z.string().uuid(),
  cemeteryId: z.string().uuid().optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  gpsAccuracyMeters: z.number().min(0).optional(),
  persons: z
    .array(
      z.object({
        firstName: z.string().min(1).max(100),
        middleName: z.string().max(100).optional(),
        lastName: z.string().min(1).max(100),
        maidenName: z.string().max(100).optional(),
        dateOfBirth: z.string().optional(),
        dateOfDeath: z.string().optional(),
        inscription: z.string().max(2000).optional(),
      }),
    )
    .min(1),
  submittedBy: z.string().max(200).optional(),
});

export type PublicSubmit = z.infer<typeof publicSubmitSchema>;
