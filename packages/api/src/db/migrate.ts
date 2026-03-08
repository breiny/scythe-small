import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://scythe:scythe@localhost:5432/scythe';
const sql = postgres(connectionString);

async function migrate() {
  console.log('Running migrations...');

  await sql`CREATE EXTENSION IF NOT EXISTS postgis`;

  // Enums
  await sql`DO $$ BEGIN
    CREATE TYPE plot_status AS ENUM ('unpinned', 'pinned', 'occupied', 'available');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`;

  await sql`DO $$ BEGIN
    CREATE TYPE gps_source AS ENUM ('exif', 'manual', 'csv', 'geocoded');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`;

  await sql`DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'groundskeeper');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`;

  await sql`DO $$ BEGIN
    CREATE TYPE import_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`;

  // Cemeteries
  await sql`CREATE TABLE IF NOT EXISTS cemeteries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    zip VARCHAR(20) NOT NULL,
    center_lon DOUBLE PRECISION,
    center_lat DOUBLE PRECISION,
    contact_email VARCHAR(200),
    contact_phone VARCHAR(20),
    hours_description TEXT,
    is_publicly_searchable BOOLEAN NOT NULL DEFAULT true,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  // Users (before plots/photos since they reference users)
  await sql`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(200) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'groundskeeper',
    cemetery_id UUID NOT NULL REFERENCES cemeteries(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS users_cemetery_id_idx ON users(cemetery_id)`;

  // Plots
  await sql`CREATE TABLE IF NOT EXISTS plots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cemetery_id UUID NOT NULL REFERENCES cemeteries(id) ON DELETE CASCADE,
    plot_number VARCHAR(50),
    section VARCHAR(100),
    lon DOUBLE PRECISION,
    lat DOUBLE PRECISION,
    gps_accuracy_meters DOUBLE PRECISION,
    gps_source gps_source,
    status plot_status NOT NULL DEFAULT 'unpinned',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS plots_cemetery_id_idx ON plots(cemetery_id)`;

  // Deceased persons
  await sql`CREATE TABLE IF NOT EXISTS deceased_persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cemetery_id UUID NOT NULL REFERENCES cemeteries(id) ON DELETE CASCADE,
    plot_id UUID REFERENCES plots(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    maiden_name VARCHAR(100),
    date_of_birth TIMESTAMP,
    date_of_death TIMESTAMP,
    inscription TEXT,
    is_publicly_visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS deceased_persons_cemetery_id_idx ON deceased_persons(cemetery_id)`;
  await sql`CREATE INDEX IF NOT EXISTS deceased_persons_plot_id_idx ON deceased_persons(plot_id)`;
  await sql`CREATE INDEX IF NOT EXISTS deceased_persons_name_idx ON deceased_persons(last_name, first_name)`;

  // Headstone photos
  await sql`CREATE TABLE IF NOT EXISTS headstone_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    cemetery_id UUID NOT NULL REFERENCES cemeteries(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT,
    ocr_raw_text TEXT,
    ocr_confidence DOUBLE PRECISION,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    captured_at TIMESTAMPTZ,
    exif_lat DOUBLE PRECISION,
    exif_lon DOUBLE PRECISION,
    exif_accuracy DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS headstone_photos_plot_id_idx ON headstone_photos(plot_id)`;
  await sql`CREATE INDEX IF NOT EXISTS headstone_photos_cemetery_id_idx ON headstone_photos(cemetery_id)`;

  // CSV import jobs
  await sql`CREATE TABLE IF NOT EXISTS csv_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cemetery_id UUID NOT NULL REFERENCES cemeteries(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    status import_job_status NOT NULL DEFAULT 'pending',
    total_rows INTEGER NOT NULL DEFAULT 0,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS csv_import_jobs_cemetery_id_idx ON csv_import_jobs(cemetery_id)`;

  // Add osm_id and boundary columns to cemeteries (idempotent)
  await sql`ALTER TABLE cemeteries ADD COLUMN IF NOT EXISTS osm_id VARCHAR(50)`;
  await sql`ALTER TABLE cemeteries ADD COLUMN IF NOT EXISTS boundary TEXT`;

  console.log('Migrations complete!');
  await sql.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
