# Scythe — Cemetery Management Platform

A web app for cemetery groundskeepers to capture, catalog, and search burial records with GPS mapping, headstone OCR, and photo management.

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **Docker** and **Docker Compose** (for PostgreSQL + PostGIS)
- **npm** 9+ (comes with Node.js)

## Quick Start

```bash
# 1. Start PostgreSQL + PostGIS
docker compose up -d

# 2. Install dependencies
npm install

# 3. Set up environment variables (defaults work out of the box)
cp .env.example .env

# 4. Run database migrations
npm run db:migrate

# 5. Seed test data (2 cemeteries, 25 plots, photos, test users)
npm run db:seed

# 6. Start dev servers (API + frontend)
npm run dev
```

Open **http://localhost:5173** in your browser.

## Test Credentials

| Role          | Email                                           | Password      |
| ------------- | ----------------------------------------------- | ------------- |
| Admin         | `admin@springfieldmemorial.example.com`         | `password123` |
| Groundskeeper | `groundskeeper@springfieldmemorial.example.com` | `password123` |

Login at **http://localhost:5173/login**

## Seed Data

After running `npm run db:seed`, you'll have:

- **Springfield Memorial Cemetery** (`/springfield-memorial`) — 20 plots with GPS coordinates, 10 headstone photos, full contact info
- **Riverside Gardens of Rest** (`/riverside-gardens`) — 5 unpinned plots (simulating CSV import, no GPS data)
- Search for "Smith", "Williams", "Fischer", etc. to test search results

The seed is idempotent — safe to run multiple times.

## Available Scripts

| Script           | Description                                    |
| ---------------- | ---------------------------------------------- |
| `npm run dev`    | Start API + frontend concurrently              |
| `npm run dev:api`| Start Express API only (port 3001)             |
| `npm run dev:web`| Start Vite frontend only (port 5173)           |
| `npm run build`  | Build all packages for production              |
| `npm run db:migrate` | Run database migrations                   |
| `npm run db:seed`    | Seed database with test data              |
| `npm run db:studio`  | Open Drizzle Studio (DB GUI)              |
| `npm test`       | Run tests (Vitest)                             |

## Architecture

```
scythe/
├── packages/
│   ├── web/          # React 19 + Vite + Tailwind CSS + Leaflet
│   ├── api/          # Express + Drizzle ORM + Sharp
│   └── shared/       # Zod schemas + TypeScript types
├── docker-compose.yml  # PostgreSQL 17 + PostGIS
└── .env                # Local dev environment variables
```

- **Frontend** runs on port 5173 and proxies `/api` requests to the backend
- **Backend** runs on port 3001 with Express
- **Database** is PostgreSQL 17 with PostGIS extension, running in Docker
- **OCR** uses mock extractors/parsers in dev mode (no AWS credentials needed)
- **Photos** are stored locally in `packages/api/uploads/`

## Feature Walkthrough

### Public (no login required)
- **Home** (`/`) — Search form and directory link
- **Search** (`/search?q=Smith`) — Full-text search across all cemeteries
- **Directory** (`/directory`) — Browse all cemeteries, A-Z or nearest sorting
- **Cemetery Profile** (`/springfield-memorial`) — Map overview, search within cemetery, QR code
- **Plot Detail** (`/springfield-memorial/plot/{id}`) — Photos, person info, GPS map, "Navigate to Grave"
- **Wayfinding** (`/springfield-memorial/plot/{id}/navigate`) — GPS navigation (requires mobile with GPS)

### Authenticated (login required)
- **Photo Capture** (`/capture`) — Batch capture headstone photos with background OCR
- **Manual Pin Drop** (`/pin`) — GPS-based plot recording with accuracy gating
- **CSV Import** (`/dashboard/import`) — Bulk import burial records from CSV
- **Cemetery Registration** (`/register`) — Create a new cemetery + admin account

## Known Limitations

- **No S3** — Photos are stored on local disk, not S3. No CloudFront CDN.
- **No real OCR** — Mock OCR extractor/parser used in dev mode. Set AWS credentials for real Textract + Claude parsing.
- **GPS features need mobile** — Pin drop accuracy gating and wayfinding require a device with GPS. On desktop, GPS is emulated/unavailable.
- **No offline/PWA** — Service worker and IndexedDB offline queue are not yet implemented.
- **No email/Cognito** — Auth is JWT-only with local password hashing. No email verification or password reset.
