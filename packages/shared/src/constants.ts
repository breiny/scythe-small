export const PLOT_STATUS = {
  UNPINNED: 'unpinned',
  PINNED: 'pinned',
  OCCUPIED: 'occupied',
  AVAILABLE: 'available',
} as const;

export const GPS_SOURCE = {
  EXIF: 'exif',
  MANUAL: 'manual',
  CSV: 'csv',
  GEOCODED: 'geocoded',
} as const;

export const USER_ROLE = {
  ADMIN: 'admin',
  GROUNDSKEEPER: 'groundskeeper',
} as const;

export const IMPORT_JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const VERIFICATION_STATUS = {
  VERIFIED: 'verified',
  UNVERIFIED: 'unverified',
  REJECTED: 'rejected',
} as const;

export const SUBMISSION_SOURCE = {
  ADMIN: 'admin',
  GROUNDSKEEPER: 'groundskeeper',
  CSV_IMPORT: 'csv_import',
  PUBLIC: 'public',
} as const;

export const UNAFFILIATED_CEMETERY_SLUG = 'unaffiliated-submissions';

export const PUBLIC_SUBMIT_RATE_LIMIT = 20;

export const GPS_ACCURACY_THRESHOLD_METERS = 5;
export const THUMBNAIL_MAX_DIMENSION = 400;
export const THUMBNAIL_JPEG_QUALITY = 80;
export const MAX_PHOTOS_PER_HEADSTONE = 3;
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
