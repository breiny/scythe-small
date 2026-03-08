import 'dotenv/config';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { db } from './index';
import { cemeteries, plots, deceasedPersons, headstonePhotos, users } from './schema';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';

/**
 * Idempotent seed script for local development.
 *
 * Test credentials:
 *   Admin:        admin@springfieldmemorial.example.com / password123
 *   Groundskeeper: groundskeeper@springfieldmemorial.example.com / password123
 *
 * Run: npm run db:seed
 */

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://scythe:scythe@localhost:5432/scythe';

// --- Placeholder image generator ---
async function generatePlaceholderImage(
  text: string,
  outputDir: string,
  fileId: string,
): Promise<{ photoPath: string; thumbPath: string }> {
  const originalsDir = path.join(outputDir, 'originals');
  const thumbsDir = path.join(outputDir, 'thumbnails');
  fs.mkdirSync(originalsDir, { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });

  // Create a simple gray headstone-shaped placeholder with text
  const width = 600;
  const height = 800;
  const lines = text.split('\n');
  const textSvg = lines
    .map(
      (line, i) =>
        `<text x="300" y="${300 + i * 50}" font-size="36" fill="#333" text-anchor="middle" font-family="serif">${escapeXml(line)}</text>`,
    )
    .join('');

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#d4d0c8" rx="20"/>
    <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="#c8c4b8" rx="10"/>
    ${textSvg}
  </svg>`;

  const photoPath = path.join(originalsDir, `${fileId}.jpg`);
  const thumbPath = path.join(thumbsDir, `${fileId}_thumb.jpg`);

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toFile(photoPath);

  await sharp(Buffer.from(svg))
    .resize(400, 400, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);

  return { photoPath, thumbPath };
}

interface SeedPerson {
  firstName: string;
  middleName?: string;
  lastName: string;
  maidenName?: string;
  dateOfBirth?: string;
  dateOfDeath?: string;
  inscription?: string;
}

interface SeedPlot {
  plotNumber: string;
  section: string;
  lon?: number;
  lat?: number;
  persons: SeedPerson[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Seed data definitions ---

const CEMETERY_1 = {
  name: 'Springfield Memorial Cemetery',
  slug: 'springfield-memorial',
  address: '1200 Oak Hill Road',
  city: 'Springfield',
  state: 'IL',
  zip: '62704',
  centerLon: -89.6501,
  centerLat: 39.7817,
  contactEmail: 'info@springfieldmemorial.example.com',
  contactPhone: '(217) 555-0142',
  hoursDescription: 'Open daily, sunrise to sunset',
  isPubliclySearchable: true,
};

const CEMETERY_2 = {
  name: 'Riverside Gardens of Rest',
  slug: 'riverside-gardens',
  address: '450 River Road',
  city: 'Riverside',
  state: 'IL',
  zip: '60546',
  centerLon: -87.8230,
  centerLat: 41.8317,
  contactEmail: 'office@riversidegardens.example.com',
  contactPhone: '(708) 555-0198',
  hoursDescription: 'Mon-Sat 8am-6pm, Sun 10am-4pm',
  isPubliclySearchable: true,
};

// Springfield plots with GPS — realistic spread around the cemetery center
const SPRINGFIELD_PLOTS: SeedPlot[] = [
  // Section A — older burials
  { plotNumber: 'A-101', section: 'Section A', lon: -89.6505, lat: 39.7820, persons: [
    { firstName: 'John', middleName: 'William', lastName: 'Smith', dateOfBirth: '1923-04-15', dateOfDeath: '1998-11-02', inscription: 'Beloved Father and Husband' },
    { firstName: 'Mary', middleName: 'Elizabeth', lastName: 'Smith', maidenName: 'Johnson', dateOfBirth: '1925-08-22', dateOfDeath: '2005-03-17', inscription: 'Together Forever' },
  ]},
  { plotNumber: 'A-102', section: 'Section A', lon: -89.6504, lat: 39.7820, persons: [
    { firstName: 'Thomas', lastName: 'Williams', dateOfBirth: '1915-06-10', dateOfDeath: '1987-01-28', inscription: 'Rest in Peace' },
  ]},
  { plotNumber: 'A-103', section: 'Section A', lon: -89.6503, lat: 39.7820, persons: [
    { firstName: 'Dorothy', middleName: 'Mae', lastName: 'Williams', maidenName: 'Brown', dateOfBirth: '1918-09-03', dateOfDeath: '1995-05-14', inscription: 'In loving memory' },
  ]},
  { plotNumber: 'A-104', section: 'Section A', lon: -89.6502, lat: 39.7820, persons: [
    { firstName: 'George', lastName: 'Anderson', dateOfBirth: '1930-12-25', dateOfDeath: '2010-08-19', inscription: 'A life well lived' },
  ]},
  { plotNumber: 'A-105', section: 'Section A', lon: -89.6501, lat: 39.7820, persons: [
    { firstName: 'Helen', middleName: 'Rose', lastName: 'Anderson', maidenName: 'Clark', dateOfBirth: '1932-03-08', dateOfDeath: '2015-12-01' },
  ]},
  // Section B
  { plotNumber: 'B-201', section: 'Section B', lon: -89.6505, lat: 39.7818, persons: [
    { firstName: 'Robert', middleName: 'James', lastName: 'Davis', dateOfBirth: '1945-01-10', dateOfDeath: '2020-07-04', inscription: 'Veteran - US Army' },
  ]},
  { plotNumber: 'B-202', section: 'Section B', lon: -89.6504, lat: 39.7818, persons: [
    { firstName: 'Patricia', lastName: 'Martinez', dateOfBirth: '1940-07-22', dateOfDeath: '2018-11-30', inscription: 'Beloved Mother and Grandmother' },
  ]},
  { plotNumber: 'B-203', section: 'Section B', lon: -89.6503, lat: 39.7818, persons: [
    { firstName: 'James', middleName: 'Edward', lastName: 'Wilson', dateOfBirth: '1938-11-15', dateOfDeath: '2012-04-09' },
    { firstName: 'Linda', lastName: 'Wilson', maidenName: 'Taylor', dateOfBirth: '1941-02-28', dateOfDeath: '2019-09-23' },
  ]},
  { plotNumber: 'B-204', section: 'Section B', lon: -89.6502, lat: 39.7818, persons: [
    { firstName: 'Charles', lastName: 'Thompson', dateOfBirth: '1950-05-06', dateOfDeath: '2022-01-15', inscription: 'Gone fishing' },
  ]},
  { plotNumber: 'B-205', section: 'Section B', lon: -89.6501, lat: 39.7818, persons: [
    { firstName: 'Barbara', middleName: 'Ann', lastName: 'Moore', dateOfBirth: '1955-10-30', dateOfDeath: '2023-06-12' },
  ]},
  // Section C — newer burials
  { plotNumber: 'C-301', section: 'Section C', lon: -89.6505, lat: 39.7816, persons: [
    { firstName: 'Michael', lastName: 'Jackson', dateOfBirth: '1960-03-14', dateOfDeath: '2021-08-25', inscription: 'Forever in our hearts' },
  ]},
  { plotNumber: 'C-302', section: 'Section C', lon: -89.6504, lat: 39.7816, persons: [
    { firstName: 'Susan', middleName: 'Marie', lastName: 'White', dateOfBirth: '1958-12-07', dateOfDeath: '2020-03-01', inscription: 'A light in the darkness' },
  ]},
  { plotNumber: 'C-303', section: 'Section C', lon: -89.6503, lat: 39.7816, persons: [
    { firstName: 'Richard', lastName: 'Harris', dateOfBirth: '1948-08-19', dateOfDeath: '2019-05-22' },
  ]},
  { plotNumber: 'C-304', section: 'Section C', lon: -89.6502, lat: 39.7816, persons: [
    { firstName: 'Karen', lastName: 'Lewis', maidenName: 'Robinson', dateOfBirth: '1952-04-11', dateOfDeath: '2021-11-08', inscription: 'She walked in beauty' },
  ]},
  { plotNumber: 'C-305', section: 'Section C', lon: -89.6501, lat: 39.7816, persons: [
    { firstName: 'William', middleName: 'Henry', lastName: 'Walker', dateOfBirth: '1935-09-28', dateOfDeath: '2017-02-14', inscription: 'Semper Fi' },
  ]},
  // Section D — a few more with varied data
  { plotNumber: 'D-401', section: 'Section D', lon: -89.6505, lat: 39.7814, persons: [
    { firstName: 'Elizabeth', lastName: 'Young', dateOfBirth: '1942-06-17', dateOfDeath: '2016-10-31' },
  ]},
  { plotNumber: 'D-402', section: 'Section D', lon: -89.6504, lat: 39.7814, persons: [
    { firstName: 'Joseph', middleName: 'Patrick', lastName: 'King', dateOfBirth: '1928-01-20', dateOfDeath: '2008-07-04', inscription: 'WWII Veteran - Purple Heart' },
  ]},
  { plotNumber: 'D-403', section: 'Section D', lon: -89.6503, lat: 39.7814, persons: [
    { firstName: 'Margaret', lastName: 'Wright', maidenName: 'Hall', dateOfBirth: '1930-11-12', dateOfDeath: '2010-04-19', inscription: 'Teacher, Mother, Friend' },
  ]},
  { plotNumber: 'D-404', section: 'Section D', lon: -89.6502, lat: 39.7814, persons: [
    { firstName: 'Daniel', lastName: 'Scott', dateOfBirth: '1965-02-03', dateOfDeath: '2023-09-17' },
  ]},
  { plotNumber: 'D-405', section: 'Section D', lon: -89.6501, lat: 39.7814, persons: [
    { firstName: 'Nancy', middleName: 'Louise', lastName: 'Green', dateOfBirth: '1947-07-26', dateOfDeath: '2022-12-08', inscription: 'In Gods garden' },
  ]},
];

// Riverside plots — CSV-imported, no GPS data
const RIVERSIDE_PLOTS: SeedPlot[] = [
  { plotNumber: 'R-1', section: 'Garden A', persons: [
    { firstName: 'Albert', lastName: 'Fischer', dateOfBirth: '1920-05-08', dateOfDeath: '1992-03-15' },
  ]},
  { plotNumber: 'R-2', section: 'Garden A', persons: [
    { firstName: 'Edith', lastName: 'Mueller', maidenName: 'Weber', dateOfBirth: '1925-11-22', dateOfDeath: '2001-08-04' },
  ]},
  { plotNumber: 'R-3', section: 'Garden B', persons: [
    { firstName: 'Carl', middleName: 'Friedrich', lastName: 'Becker', dateOfBirth: '1935-03-17', dateOfDeath: '2010-12-25' },
  ]},
  { plotNumber: 'R-4', section: 'Garden B', persons: [
    { firstName: 'Ingrid', lastName: 'Schneider', dateOfBirth: '1942-09-30', dateOfDeath: '2018-06-11' },
  ]},
  { plotNumber: 'R-5', section: 'Garden C', persons: [
    { firstName: 'Walter', lastName: 'Zimmerman', dateOfBirth: '1938-01-14', dateOfDeath: '2015-10-02', inscription: 'Ruhe in Frieden' },
  ]},
];

async function seed() {
  console.log('Seeding database...');

  const uploadsDir = path.resolve(process.cwd(), 'uploads');

  // Check if seed data already exists (idempotent)
  const existingCemetery = await db
    .select({ id: cemeteries.id })
    .from(cemeteries)
    .where(eq(cemeteries.slug, CEMETERY_1.slug))
    .limit(1);

  if (existingCemetery.length > 0) {
    console.log('Seed data already exists. Clearing and re-seeding...');
    // Delete in order respecting foreign keys
    const sql = postgres(connectionString);
    await sql`DELETE FROM headstone_photos`;
    await sql`DELETE FROM deceased_persons`;
    await sql`DELETE FROM plots`;
    await sql`DELETE FROM csv_import_jobs`;
    await sql`DELETE FROM users`;
    await sql`DELETE FROM cemeteries`;
    await sql.end();
    console.log('Cleared existing data.');
  }

  // --- Create sentinel cemetery for unaffiliated public submissions ---
  await db.insert(cemeteries).values({
    name: 'Unaffiliated Public Submissions',
    slug: 'unaffiliated-submissions',
    address: 'N/A',
    city: 'N/A',
    state: 'N/A',
    zip: 'N/A',
    isPubliclySearchable: false,
  });
  console.log('Created sentinel cemetery for unaffiliated submissions');

  // --- Create cemeteries ---
  const [cem1] = await db.insert(cemeteries).values(CEMETERY_1).returning();
  const [cem2] = await db.insert(cemeteries).values(CEMETERY_2).returning();

  if (!cem1 || !cem2) throw new Error('Failed to create cemeteries');
  console.log(`Created cemeteries: ${cem1.name}, ${cem2.name}`);

  // --- Create users ---
  // Password: password123
  const hashedPassword = await bcrypt.hash('password123', 10);

  await db.insert(users).values([
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'groundskeeper@springfieldmemorial.example.com',
      name: 'Test Groundskeeper',
      role: 'groundskeeper',
      cemeteryId: cem1.id,
      passwordHash: hashedPassword,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'admin@springfieldmemorial.example.com',
      name: 'Test Admin',
      role: 'admin',
      cemeteryId: cem1.id,
      passwordHash: hashedPassword,
    },
  ]);
  console.log('Created users: groundskeeper + admin');

  // --- Create Springfield plots (with GPS, some with photos) ---
  let photoCount = 0;
  for (const plotDef of SPRINGFIELD_PLOTS) {
    const [plot] = await db
      .insert(plots)
      .values({
        cemeteryId: cem1.id,
        plotNumber: plotDef.plotNumber,
        section: plotDef.section,
        lon: plotDef.lon,
        lat: plotDef.lat,
        gpsAccuracyMeters: 2.0 + Math.random() * 2,
        gpsSource: 'manual',
        status: 'pinned',
      })
      .returning();

    if (!plot) throw new Error(`Failed to create plot ${plotDef.plotNumber}`);

    // Insert persons
    for (const personDef of plotDef.persons) {
      await db.insert(deceasedPersons).values({
        cemeteryId: cem1.id,
        plotId: plot.id,
        firstName: personDef.firstName,
        middleName: personDef.middleName ?? null,
        lastName: personDef.lastName,
        maidenName: personDef.maidenName ?? null,
        dateOfBirth: personDef.dateOfBirth ? new Date(personDef.dateOfBirth) : null,
        dateOfDeath: personDef.dateOfDeath ? new Date(personDef.dateOfDeath) : null,
        inscription: personDef.inscription ?? null,
        isPubliclyVisible: true,
      });
    }

    // Generate placeholder photo for ~half the plots (first 10)
    const plotIndex = SPRINGFIELD_PLOTS.indexOf(plotDef);
    if (plotIndex < 10) {
      const fileId = `seed-${plotDef.plotNumber.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const nameText = plotDef.persons
        .map((p) => `${p.firstName} ${p.lastName}`)
        .join('\n');
      const dateText = plotDef.persons
        .map((p) => {
          const b = p.dateOfBirth?.substring(0, 4) ?? '?';
          const d = p.dateOfDeath?.substring(0, 4) ?? '?';
          return `${b} - ${d}`;
        })
        .join('\n');

      try {
        await generatePlaceholderImage(
          `${nameText}\n${dateText}`,
          uploadsDir,
          fileId,
        );

        await db.insert(headstonePhotos).values({
          plotId: plot.id,
          cemeteryId: cem1.id,
          photoUrl: `/uploads/originals/${fileId}.jpg`,
          thumbnailUrl: `/uploads/thumbnails/${fileId}_thumb.jpg`,
          uploadedBy: '00000000-0000-0000-0000-000000000001',
          exifLat: plotDef.lat,
          exifLon: plotDef.lon,
          exifAccuracy: 2.5,
        });
        photoCount++;
      } catch (err) {
        console.warn(`Failed to generate photo for ${plotDef.plotNumber}:`, err);
      }
    }
  }
  console.log(`Created ${SPRINGFIELD_PLOTS.length} Springfield plots with ${photoCount} photos`);

  // --- Create Riverside plots (no GPS — simulating CSV import) ---
  for (const plotDef of RIVERSIDE_PLOTS) {
    const [plot] = await db
      .insert(plots)
      .values({
        cemeteryId: cem2.id,
        plotNumber: plotDef.plotNumber,
        section: plotDef.section,
        status: 'unpinned',
      })
      .returning();

    if (!plot) throw new Error(`Failed to create plot ${plotDef.plotNumber}`);

    for (const personDef of plotDef.persons) {
      await db.insert(deceasedPersons).values({
        cemeteryId: cem2.id,
        plotId: plot.id,
        firstName: personDef.firstName,
        middleName: personDef.middleName ?? null,
        lastName: personDef.lastName,
        maidenName: personDef.maidenName ?? null,
        dateOfBirth: personDef.dateOfBirth ? new Date(personDef.dateOfBirth) : null,
        dateOfDeath: personDef.dateOfDeath ? new Date(personDef.dateOfDeath) : null,
        inscription: personDef.inscription ?? null,
        isPubliclyVisible: true,
      });
    }
  }
  console.log(`Created ${RIVERSIDE_PLOTS.length} Riverside plots (no GPS, CSV-style)`);

  // --- Summary ---
  console.log('\n=== Seed Complete ===');
  console.log(`Cemeteries: ${CEMETERY_1.name}, ${CEMETERY_2.name}`);
  console.log(`Total plots: ${SPRINGFIELD_PLOTS.length + RIVERSIDE_PLOTS.length}`);
  console.log(`Total photos: ${photoCount}`);
  console.log('\nTest accounts (password: password123):');
  console.log('  Admin:         admin@springfieldmemorial.example.com');
  console.log('  Groundskeeper: groundskeeper@springfieldmemorial.example.com');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
