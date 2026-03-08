import type { PLOT_STATUS, GPS_SOURCE, USER_ROLE, IMPORT_JOB_STATUS, VERIFICATION_STATUS, SUBMISSION_SOURCE } from './constants';

export type PlotStatus = (typeof PLOT_STATUS)[keyof typeof PLOT_STATUS];
export type GpsSource = (typeof GPS_SOURCE)[keyof typeof GPS_SOURCE];
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type ImportJobStatus = (typeof IMPORT_JOB_STATUS)[keyof typeof IMPORT_JOB_STATUS];
export type VerificationStatus = (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];
export type SubmissionSource = (typeof SUBMISSION_SOURCE)[keyof typeof SUBMISSION_SOURCE];

export interface Cemetery {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  centerLon: number | null;
  centerLat: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  hoursDescription: string | null;
  isPubliclySearchable: boolean;
  logoUrl: string | null;
  osmId: string | null;
  boundary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Plot {
  id: string;
  cemeteryId: string;
  plotNumber: string | null;
  section: string | null;
  lon: number | null;
  lat: number | null;
  gpsAccuracyMeters: number | null;
  gpsSource: GpsSource | null;
  status: PlotStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeceasedPerson {
  id: string;
  cemeteryId: string;
  plotId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  maidenName: string | null;
  dateOfBirth: Date | null;
  dateOfDeath: Date | null;
  inscription: string | null;
  isPubliclyVisible: boolean;
  verificationStatus: VerificationStatus;
  submittedBy: string | null;
  submissionSource: SubmissionSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface HeadstonePhoto {
  id: string;
  plotId: string;
  cemeteryId: string;
  photoUrl: string;
  thumbnailUrl: string | null;
  ocrRawText: string | null;
  ocrConfidence: number | null;
  uploadedBy: string;
  capturedAt: Date | null;
  exifLat: number | null;
  exifLon: number | null;
  exifAccuracy: number | null;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  cemeteryId: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsvImportJob {
  id: string;
  cemeteryId: string;
  fileName: string;
  status: ImportJobStatus;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Cemetery detection types
export type CemeteryDetectionSource = 'scythe' | 'osm';

export interface CemeteryDetectionResult {
  source: CemeteryDetectionSource;
  cemetery: Cemetery;
  distanceMeters: number;
}

export interface OsmCemeteryMatch {
  source: 'osm';
  osmId: string;
  name: string;
  address: string | null;
  boundary: string | null; // GeoJSON polygon
}

export interface CemeteryDetectResponse {
  match: CemeteryDetectionResult | null;
  osmMatch: OsmCemeteryMatch | null;
}

// OCR types
export type OcrFieldConfidence = 'high' | 'medium' | 'low';

export interface OcrParsedPerson {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  maidenName: string | null;
  dateOfBirth: string | null;
  dateOfDeath: string | null;
  inscription: string | null;
  confidence: {
    firstName: OcrFieldConfidence;
    lastName: OcrFieldConfidence;
    dateOfBirth: OcrFieldConfidence;
    dateOfDeath: OcrFieldConfidence;
    inscription: OcrFieldConfidence;
  };
}

export interface OcrResult {
  rawText: string;
  persons: OcrParsedPerson[];
  overallConfidence: number;
  photoId: string;
}
