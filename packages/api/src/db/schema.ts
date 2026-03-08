import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  doublePrecision,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

// Enums
export const plotStatusEnum = pgEnum('plot_status', [
  'unpinned',
  'pinned',
  'occupied',
  'available',
]);

export const gpsSourceEnum = pgEnum('gps_source', [
  'exif',
  'manual',
  'csv',
  'geocoded',
]);

export const userRoleEnum = pgEnum('user_role', ['admin', 'groundskeeper']);

export const importJobStatusEnum = pgEnum('import_job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'verified',
  'unverified',
  'rejected',
]);

export const submissionSourceEnum = pgEnum('submission_source', [
  'admin',
  'groundskeeper',
  'csv_import',
  'public',
]);

// Cemetery
export const cemeteries = pgTable('cemeteries', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  address: varchar('address', { length: 500 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 50 }).notNull(),
  zip: varchar('zip', { length: 20 }).notNull(),
  centerLon: doublePrecision('center_lon'),
  centerLat: doublePrecision('center_lat'),
  contactEmail: varchar('contact_email', { length: 200 }),
  contactPhone: varchar('contact_phone', { length: 20 }),
  hoursDescription: text('hours_description'),
  isPubliclySearchable: boolean('is_publicly_searchable').notNull().default(true),
  logoUrl: text('logo_url'),
  osmId: varchar('osm_id', { length: 50 }),
  boundary: text('boundary'), // GeoJSON polygon string, nullable
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Plot
export const plots = pgTable(
  'plots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cemeteryId: uuid('cemetery_id')
      .notNull()
      .references(() => cemeteries.id, { onDelete: 'cascade' }),
    plotNumber: varchar('plot_number', { length: 50 }),
    section: varchar('section', { length: 100 }),
    lon: doublePrecision('lon'),
    lat: doublePrecision('lat'),
    gpsAccuracyMeters: doublePrecision('gps_accuracy_meters'),
    gpsSource: gpsSourceEnum('gps_source'),
    status: plotStatusEnum('status').notNull().default('unpinned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('plots_cemetery_id_idx').on(table.cemeteryId),
  ],
);

// DeceasedPerson
export const deceasedPersons = pgTable(
  'deceased_persons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cemeteryId: uuid('cemetery_id')
      .notNull()
      .references(() => cemeteries.id, { onDelete: 'cascade' }),
    plotId: uuid('plot_id').references(() => plots.id, { onDelete: 'set null' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    middleName: varchar('middle_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    maidenName: varchar('maiden_name', { length: 100 }),
    dateOfBirth: timestamp('date_of_birth', { mode: 'date' }),
    dateOfDeath: timestamp('date_of_death', { mode: 'date' }),
    inscription: text('inscription'),
    isPubliclyVisible: boolean('is_publicly_visible').notNull().default(true),
    verificationStatus: verificationStatusEnum('verification_status')
      .notNull()
      .default('verified'),
    submittedBy: varchar('submitted_by', { length: 200 }),
    submissionSource: submissionSourceEnum('submission_source')
      .notNull()
      .default('admin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('deceased_persons_cemetery_id_idx').on(table.cemeteryId),
    index('deceased_persons_plot_id_idx').on(table.plotId),
    index('deceased_persons_name_idx').on(table.lastName, table.firstName),
  ],
);

// HeadstonePhoto
export const headstonePhotos = pgTable(
  'headstone_photos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'cascade' }),
    cemeteryId: uuid('cemetery_id')
      .notNull()
      .references(() => cemeteries.id, { onDelete: 'cascade' }),
    photoUrl: text('photo_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    ocrRawText: text('ocr_raw_text'),
    ocrConfidence: doublePrecision('ocr_confidence'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    exifLat: doublePrecision('exif_lat'),
    exifLon: doublePrecision('exif_lon'),
    exifAccuracy: doublePrecision('exif_accuracy'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('headstone_photos_plot_id_idx').on(table.plotId),
    index('headstone_photos_cemetery_id_idx').on(table.cemeteryId),
  ],
);

// User
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 200 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    role: userRoleEnum('role').notNull().default('groundskeeper'),
    cemeteryId: uuid('cemetery_id')
      .notNull()
      .references(() => cemeteries.id, { onDelete: 'cascade' }),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('users_cemetery_id_idx').on(table.cemeteryId),
  ],
);

// CsvImportJob
export const csvImportJobs = pgTable(
  'csv_import_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cemeteryId: uuid('cemetery_id')
      .notNull()
      .references(() => cemeteries.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    status: importJobStatusEnum('status').notNull().default('pending'),
    totalRows: integer('total_rows').notNull().default(0),
    processedRows: integer('processed_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('csv_import_jobs_cemetery_id_idx').on(table.cemeteryId),
  ],
);
