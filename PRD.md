# Product Requirements Document (PRD): Scythe MVP

**Version:** 3.2
**Last Updated:** 2026-03-06
**Status:** In Progress
**Stack:** React (Vite) / Node.js + Express / PostgreSQL + PostGIS / AWS (S3, Lambda, CloudFront, RDS)

---

## 1. Executive Summary

**Scythe** is a mobile-first web application that helps people find the graves of their loved ones using GPS wayfinding, and helps cemetery staff digitize their burial records by simply photographing headstones. The app uses OCR to extract names and dates from headstone photos, and EXIF metadata to capture GPS coordinates — turning a smartphone camera into a one-tap digitization tool.

This MVP targets two user experiences: **a public visitor who needs to find a grave**, and **a groundskeeper who needs to get burial data into the system fast**.

---

## 2. Vision & Market Thesis

There are ~145,000 cemeteries in the US. The vast majority have no digital presence for visitors. Families arrive and wander. Genealogists cross-reference paper records with FindAGrave. Existing cemetery management software (HMIS, PlotBox, CemSites) focuses on back-office administration and requires expensive enterprise sales cycles.

**Scythe's wedge is the visitor experience, not the back office.**

The strategy:
1. **Land** — Offer free cemetery profiles with searchable burial records. Any cemetery can claim a profile, upload a CSV, and have a public search page in minutes.
2. **Expand** — Upsell GPS-pinned plots with wayfinding, OCR-powered data entry, headstone photos, and branded public pages.
3. **Monetize** — Freemium B2B2C model with bottom-up adoption (no RFP, no city council approval needed).

---

## 3. Target Audience & User Personas

| Persona | Role | Auth | Primary Goal |
|---|---|---|---|
| **The Visitor** | Public user | Unauthenticated | Search for a loved one's grave and get walking directions to it |
| **The Genealogist** | Researcher | Unauthenticated | Find burial records, view headstone photos, link to family history |
| **The Groundskeeper** | Field staff | Authenticated | Digitize burial locations by photographing headstones or dropping GPS pins |
| **The Cemetery Admin** | Office manager | Authenticated | Claim cemetery profile, upload CSV records, manage staff access |

---

## 4. Core Functional Requirements

### 4.1 Public Grave Search & Wayfinding

**The core public experience. No login required.**

- **Search:** Text search by name across all cemeteries on the platform. Filters for first name, last name, birth/death year range, and cemetery.
- **Results:** Cards showing name, dates, cemetery name, section/plot number, and headstone thumbnail (if available).
- **Plot Detail Page:** Deep-linked page (`/{cemeterySlug}/plot/{plotId}`) showing full burial record, headstone photo(s), GPS coordinates, and cemetery info.
- **GPS Wayfinding:** "Navigate to Grave" button on plot detail page. Opens a full-screen map (Leaflet + OSM) showing:
  - The plot's pinned location
  - The user's live GPS position (via `navigator.geolocation.watchPosition`)
  - Distance and bearing to the plot, updated in real-time
  - A simple compass-style directional indicator (not turn-by-turn, just "walk this way")
- **Cemetery Directory:** Browse page listing all cemeteries on the platform. Each cemetery has a public profile page with map overview, search within cemetery, and contact info.
- **QR Code Support:** Each cemetery profile page has a printable QR code. Cemeteries can post this at their entrance so visitors can scan and search on-site.

**Status: Complete.** Search, results, plot detail, wayfinding (with live GPS, compass, distance/bearing), and cemetery profile pages are all implemented. Cemetery directory page (`/directory`) with search/filter, A-Z and nearest-to-me sorting is implemented. QR code generation (via `qrcode.react`) with a printer-friendly view is implemented on each cemetery profile page. Navigation bar with Search and Directory links is consistent across all public pages.

### 4.2 Groundskeeper: Photo-First Data Entry

**The primary data ingestion workflow. Requires authentication.**

#### 4.2.1 Headstone Photo Capture + OCR

- **Camera Capture:** Mobile-optimized photo capture using `<input type="file" accept="image/*" capture="environment">`. Support for up to 3 photos per headstone (front, detail, wide shot).
- **EXIF GPS Extraction:** On photo upload, client-side JavaScript extracts GPS coordinates (latitude, longitude) and accuracy from the image's EXIF metadata using a library like `exif-js` or `exifr`.
  - If EXIF GPS is present: auto-populate the plot's location. Display the extracted coordinates with a confidence indicator.
  - If EXIF GPS is absent: fall back to manual pin drop (see 4.2.2) or prompt user to enable camera location services.
- **Cemetery Auto-Detection:** After EXIF GPS extraction and before OCR processing, the system automatically identifies which cemetery the groundskeeper is at using the detection strategy described in Section 4.5. This eliminates the need to manually select or pre-register a cemetery before capturing headstones.
- **OCR Processing:** Photo is sent to a cloud OCR service (AWS Textract or Google Cloud Vision) for text extraction.
  - **Post-processing:** Raw OCR text is sent through an LLM (Claude API via AWS Bedrock or direct) to parse into structured fields:
    - First name, middle name, last name
    - Birth date (or birth year)
    - Death date (or death year)
    - Inscription / epitaph (optional)
  - **Confidence scoring:** Each extracted field gets a confidence indicator (high/medium/low) based on OCR confidence values.
- **Review & Confirm UI:** After OCR processing, present a card showing:
  - The headstone photo (thumbnail)
  - Extracted GPS coordinates on a mini-map
  - Parsed name and date fields (editable)
  - Confidence indicators per field
  - "Confirm & Save" / "Edit" / "Discard" actions
- **Batch Mode:** Groundskeeper can queue multiple headstone photos in sequence. Each enters the review queue. Process photos in background while the user continues shooting.

#### 4.2.2 Manual Pin Drop (Fallback)

- **GPS Pin Drop:** For burials without headstones, or when OCR fails, provide a manual entry mode:
  - Full-screen Leaflet map with live GPS tracking
  - "Drop Pin" button enabled only when GPS accuracy < 5 meters (consistent with original Scythe behavior)
  - Accuracy indicator (green/yellow/red circle)
  - Manual form entry for name, dates, section, plot number
- **Photo attachment:** Optional photo upload for plots entered via manual pin drop (no OCR processing, just storage).

#### 4.2.3 Offline Support

- **Offline Queue:** When network is unavailable, photos and form data are saved to IndexedDB.
- **Background Sync:** When connectivity returns, queued entries upload automatically. Manual "Sync Now" button as fallback.
- **Offline-first photo capture:** Camera capture, EXIF extraction, and form entry all work offline. OCR processing is deferred until sync.

**Status: Mostly complete.** Photo capture (up to 3 photos, mobile-optimized) and EXIF GPS extraction (via exifr) are implemented. Manual pin drop with GPS accuracy gating (<5m) and color-coded accuracy badge are implemented. OCR processing (Textract + Claude LLM parsing) and review/confirm UI are implemented with mock/dev mode support. HEIC→JPEG conversion is implemented. Cemetery auto-detection (PostGIS radius match → Overpass API → manual entry) is implemented with mock mode for local dev, including client-side caching (fires once per session, cache invalidated when GPS moves 500m+). The capture page now works without a pre-selected cemetery slug (`/capture` route) — detection triggers automatically after EXIF GPS extraction. Batch mode and offline support (IndexedDB queue, background sync) are not yet implemented.

### 4.3 Cemetery Onboarding (Admin)

**Minimal admin experience for getting a cemetery on the platform.**

- **Claim a Cemetery:** Sign-up flow: enter cemetery name, address, contact info → get a cemetery profile page and admin dashboard.
- **Implicit Creation via Auto-Detection:** Cemeteries can also be created implicitly during the capture flow (see Section 4.5). When a groundskeeper takes a photo at an unregistered cemetery, the system detects the cemetery via GPS + OpenStreetMap and offers one-tap creation. This bypasses the formal registration flow entirely and is the preferred onboarding path for field-first adoption.
- **CSV Import:** Upload a CSV of burial records (first name, last name, DOB, DOD, section, plot number). Column mapping UI with validation preview. No GPS coordinates required at import (plots are "unpinned" until a groundskeeper photographs or pins them).
- **Staff Management:** Invite groundskeepers by email. Two roles only: Admin and Groundskeeper.
- **Cemetery Profile Settings:** Edit public-facing info (name, address, phone, hours, description). Toggle public searchability. Upload a cemetery photo / logo.
- **Address Geocoding:** On cemetery creation, geocode the address to set the cemetery's center point on the map (Nominatim or AWS Location Service).

**Status: Mostly complete.** Cemetery registration (claim a cemetery with name, address, contact info) and CSV import (multi-step: upload → column mapping → validation → preview → execute) are implemented. Implicit creation via auto-detection is implemented — when a groundskeeper captures a photo at an unregistered cemetery, the system detects it via GPS + Overpass API and offers one-tap creation (`POST /api/cemeteries/from-osm`), creating the cemetery with name, address, centerPoint, osmId, and boundary from OSM data. Staff management (invite by email), cemetery profile settings editing, and address geocoding are not yet implemented.

### 4.4 Headstone Photo Storage

- **Cloud Storage:** AWS S3 for all photos.
- **Processing Pipeline:** On upload, generate:
  - Thumbnail (400px max dimension, JPEG quality 80) for search results and cards
  - Full-size watermarked version (cemetery name overlay) for detail pages
- **Storage Path:** `photos/{cemeteryId}/{plotId}/{guid}.jpg` and `{guid}_thumb.jpg`
- **CDN Delivery:** CloudFront distribution in front of S3 for fast photo loading on public pages.

**Status: Partially complete.** Thumbnail generation (Sharp, 400px max, JPEG q80) is implemented with local file storage. Photos are stored locally in `/uploads` — S3 upload, watermarking, and CloudFront CDN delivery are not yet implemented.

### 4.5 Cemetery Auto-Detection

**Zero-friction cemetery identification during the capture flow.**

When a groundskeeper captures a headstone photo, the system automatically determines which cemetery the plot belongs to using a layered detection strategy:

1. **Match existing Scythe cemetery (first priority):** Query PostGIS to find the nearest cemetery within 500 meters of the photo's EXIF GPS coordinates using `ST_DWithin`. If a match is found, auto-select it in the capture UI with a "Detected: [Cemetery Name]" label that the user can override.

2. **Query OpenStreetMap via Overpass API (second priority):** If no existing Scythe cemetery matches, query the Overpass API to check if the coordinates fall within an OSM `landuse=cemetery` polygon. If found, suggest creating a new cemetery with the name, address, and boundary pre-filled from OSM data. The UX should be: *"It looks like you're at [Cemetery Name], [Address]. Would you like to create this cemetery and start adding records?"* — one tap to confirm and the cemetery is created with centerPoint set from the GPS coordinates and details pulled from OSM.

3. **Manual entry fallback (last resort):** If neither match produces results, prompt the user to enter the cemetery name and address manually, with the GPS coordinates pre-filled as the center point.

This enables a zero-friction onboarding flow where a groundskeeper can walk into any cemetery, snap a photo, and have the cemetery created automatically — no separate registration step, no admin dashboard, no address typing.

**Status: Complete.** All three detection layers are implemented. PostGIS `ST_DWithin` spatial query for Scythe cemetery matching within 500m. Overpass API integration with `is_in` query for OSM `landuse=cemetery` polygon detection. Manual entry fallback with dropdown of existing cemeteries and inline creation form. Mock mode enabled automatically in development (`NODE_ENV=development` or `CEMETERY_DETECT_MOCK=true`) returns a fake OSM cemetery for testing. Client-side detection caching fires once per capture session and invalidates when GPS moves 500m+ (haversine distance). Detection wired into capture flow via `CemeteryDetection` component with three UI states: green badge (Scythe match), blue creation card (OSM match), orange manual prompt (no match). Schema updated with `osm_id` and `boundary` columns on the `cemeteries` table.

---

## 5. Data Model

### 5.1 Core Entities

| Entity | Key Fields | Notes |
|---|---|---|
| **Cemetery** | name, slug, address, city, state, zip, centerPoint (GPS), contactEmail, contactPhone, hoursDescription, isPubliclySearchable, logoUrl, osmId, boundary (polygon) | Slug used for public URLs. osmId links to OpenStreetMap source. Boundary stores cemetery polygon from OSM if available. |
| **Plot** | cemeteryId, plotNumber, section, location (GPS), gpsAccuracyMeters, gpsSource (exif / manual / csv), status | Spatial index on location |
| **DeceasedPerson** | cemeteryId, plotId, firstName, middleName, lastName, maidenName, dateOfBirth, dateOfDeath, inscription, isPubliclyVisible | Linked to plot |
| **HeadstonePhoto** | plotId, cemeteryId, photoUrl, thumbnailUrl, ocrRawText, ocrConfidence, uploadedBy, capturedAt, exifLat, exifLon, exifAccuracy | Stores original EXIF data |
| **User** | email, name, role (admin/groundskeeper), cemeteryId | Scoped to one cemetery |
| **CsvImportJob** | cemeteryId, fileName, status, totalRows, processedRows, errorRows, uploadedBy | Track async import jobs |

### 5.2 Enums

- **PlotStatus:** unpinned, pinned, occupied, available
- **GpsSource:** exif, manual, csv, geocoded
- **UserRole:** admin, groundskeeper
- **ImportJobStatus:** pending, processing, completed, failed

### 5.3 Key Differences from Original Scythe

| Original Scythe | MVP |
|---|---|
| Multi-tenant org hierarchy (Organization → Cemetery) | Flat: each cemetery is independent |
| 5 RBAC roles | 2 roles: admin, groundskeeper |
| 14 entities | 6 entities |
| Perpetual care, payments, accounts | Removed entirely |
| External genealogy import (FindAGrave, FamilySearch, BillionGraves) | Removed — CSV import only |
| Staged record review workflow | Removed |
| Headstone condition tracking entity | Removed — photo-only |
| Interment as separate entity | Removed — deceased person linked directly to plot |

---

## 6. Tech Stack

### 6.1 Frontend

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **React 19** (Vite) | Fast iteration, massive ecosystem, best mobile UX tooling |
| Styling | **Tailwind CSS** | Rapid prototyping, consistent mobile UI |
| Maps | **Leaflet + React Leaflet** | Free, OSM tiles, proven in original Scythe |
| PWA | **Vite PWA plugin** (Workbox) | Service worker generation, offline caching |
| EXIF parsing | **exifr** | Lightweight, handles GPS extraction from JPEG/HEIC |
| Offline storage | **IndexedDB** (via idb) | Photo blobs + form data queuing |
| State management | **React Query (TanStack Query)** | Server state caching, offline mutation queuing, background sync |
| Routing | **React Router v7** | Standard SPA routing |

### 6.2 Backend

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | **Node.js 22 LTS** | JavaScript full-stack, fast development |
| Framework | **Express** or **Hono** | Minimal, fast, well-understood |
| ORM | **Drizzle ORM** | Type-safe, lightweight, great PostgreSQL + PostGIS support |
| Database | **PostgreSQL 17 + PostGIS** | Spatial queries, proven in original Scythe |
| Auth | **AWS Cognito** (or Lucia Auth) | JWT-based, managed user pools |
| OCR | **AWS Textract** | Managed OCR service, pay-per-page, no GPU needed |
| LLM parsing | **AWS Bedrock (Claude)** or **Anthropic API** | Parse raw OCR text → structured fields |
| Image processing | **Sharp** (Node.js) | Thumbnails, watermarking, fast native bindings |
| File storage | **AWS S3** | Photo storage, same as original plan |
| Geocoding | **Nominatim** (self-hosted or public) | Free address → GPS conversion |

### 6.3 Infrastructure (AWS)

| Component | Service | Notes |
|---|---|---|
| Frontend hosting | **S3 + CloudFront** | Static site, CDN-delivered, cheap |
| API | **AWS Lambda + API Gateway** or **ECS Fargate** | Lambda for cost at low scale; Fargate if sustained traffic |
| Database | **Amazon RDS PostgreSQL** (with PostGIS) | Managed, auto-backups |
| Photo storage | **S3** | `scythe-photos` bucket |
| Photo CDN | **CloudFront** | Distribution in front of S3 |
| Auth | **AWS Cognito** | Managed user pool + JWT |
| OCR | **AWS Textract** | On-demand, no provisioning |
| LLM | **AWS Bedrock** | Claude for OCR post-processing |
| DNS | **Route 53** | Domain management |
| CI/CD | **GitHub Actions** | Build → Test → Deploy |

### 6.4 Local Development

| Tool | Purpose |
|---|---|
| Docker Compose | PostgreSQL 17 + PostGIS |
| Vite dev server | Frontend with HMR |
| Nodemon | API auto-reload |
| LocalStack (optional) | S3 + Cognito local emulation |

---

## 7. Page Map

### 7.1 Public Pages (No Auth)

| Route | Page | Description |
|---|---|---|
| `/` | Landing / Search | Hero search bar, "Find a grave" CTA |
| `/search` | Search Results | Name search with filters, paginated results |
| `/:cemeterySlug` | Cemetery Profile | Map overview, search within cemetery, contact info, QR code |
| `/:cemeterySlug/plot/:plotId` | Plot Detail | Burial record, headstone photo(s), "Navigate" button |
| `/:cemeterySlug/plot/:plotId/navigate` | Wayfinding | Full-screen map with live GPS tracking to plot |
| `/directory` | Cemetery Directory | Browse all cemeteries on platform |

### 7.2 Authenticated Pages

| Route | Page | Role |
|---|---|---|
| `/dashboard` | Cemetery Dashboard | Admin |
| `/dashboard/settings` | Cemetery Settings | Admin |
| `/dashboard/staff` | Staff Management | Admin |
| `/dashboard/import` | CSV Import | Admin |
| `/capture` | Photo Capture | Groundskeeper+ |
| `/capture/review` | OCR Review Queue | Groundskeeper+ |
| `/pin` | Manual Pin Drop | Groundskeeper+ |
| `/sync` | Offline Sync Status | Groundskeeper+ |

### 7.3 API Endpoints

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `GET /api/search` | GET | Public burial search | No |
| `GET /api/cemeteries/:slug` | GET | Cemetery public profile | No |
| `GET /api/cemeteries/:slug/plots` | GET | Plots for cemetery (map data) | No |
| `GET /api/plots/:id` | GET | Plot detail | No |
| `POST /api/auth/register` | POST | Cemetery registration | No |
| `POST /api/auth/login` | POST | Login | No |
| `POST /api/photos/upload` | POST | Upload headstone photo | Groundskeeper+ |
| `POST /api/photos/:id/ocr` | POST | Trigger OCR + LLM parsing | Groundskeeper+ |
| `POST /api/plots` | POST | Create plot (from OCR or manual) | Groundskeeper+ |
| `PUT /api/plots/:id` | PUT | Update plot record | Groundskeeper+ |
| `POST /api/plots/pin` | POST | Manual GPS pin drop | Groundskeeper+ |
| `POST /api/import/csv` | POST | Upload CSV for bulk import | Admin |
| `GET /api/import/:jobId/status` | GET | Import job progress | Admin |
| `POST /api/sync/plots` | POST | Offline sync upload | Groundskeeper+ |
| `GET /api/sync/pending` | GET | Check pending sync count | Groundskeeper+ |
| `PUT /api/cemeteries/:id/settings` | PUT | Update cemetery settings | Admin |
| `POST /api/staff/invite` | POST | Invite groundskeeper | Admin |
| `GET /api/cemeteries` | GET | List all cemeteries (dropdown); with `?stats=true` returns directory data with plot counts | No |
| `GET /api/cemeteries/detect?lat=...&lon=...` | GET | Detect cemetery by GPS coordinates (PostGIS radius match → Overpass API fallback) | Groundskeeper+ |
| `POST /api/cemeteries/from-osm` | POST | Create a new cemetery from an OSM detection match | Groundskeeper+ |

---

## 8. OCR + LLM Processing Pipeline

### 8.1 Flow

```
Photo captured on phone
        │
        ▼
Client extracts EXIF GPS (exifr)
        │
        ▼
Cemetery auto-detection (PostGIS → Overpass API → manual)
  - If matched: auto-select cemetery
  - If OSM match: prompt one-tap cemetery creation
  - If no match: manual entry fallback
        │
        ▼
Photo uploaded to S3 (original)
        │
        ▼
Sharp generates thumbnail + watermarked version
        │
        ▼
AWS Textract OCR → raw text blocks with confidence scores
        │
        ▼
Claude (Bedrock) parses raw text → structured JSON
  {
    firstName: "John",
    middleName: "William",
    lastName: "Smith",
    dateOfBirth: "1923-04-15",
    dateOfDeath: "1998-11-02",
    inscription: "Beloved Father",
    confidence: { name: "high", dates: "medium", inscription: "low" }
  }
        │
        ▼
Return to client for review & confirmation
```

### 8.2 LLM Prompt Strategy

The Claude prompt for OCR post-processing should:
1. Receive the raw Textract output (text blocks with positions and confidence)
2. Be instructed to identify and extract: full name, birth date, death date, and any epitaph/inscription
3. Handle common OCR errors (0/O confusion, faded text, partial dates like "1923 - 19__")
4. Return structured JSON with per-field confidence ratings
5. Flag ambiguous results for human review rather than guessing

### 8.3 Cost Estimates

| Service | Cost | Volume Assumption |
|---|---|---|
| AWS Textract | ~$1.50 / 1,000 pages | 1 photo = 1 page |
| Claude (Bedrock) | ~$0.003 / request (Haiku) | Short prompt + response |
| S3 storage | ~$0.023 / GB / month | ~2 MB avg per headstone (full + thumb) |
| **Per headstone total** | **~$0.005** | Negligible at scale |

---

## 9. Monetization Model

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Cemetery profile, CSV import (up to 500 records), basic public search, 1 admin user |
| **Standard** | $49/mo | Unlimited records, GPS pinning, OCR photo capture, headstone photos, wayfinding, QR codes, up to 5 staff, branded public page |
| **Professional** | $149/mo | Everything in Standard + priority OCR processing, API access, analytics dashboard, unlimited staff, custom domain |

---

## 10. Success Metrics (KPIs)

1. **Time to Find:** Reduce grave-finding time from ~15 min to < 3 min using wayfinding.
2. **Digitization Speed:** A groundskeeper can capture and confirm 60+ headstones per hour using photo OCR (vs. ~15/hr with manual entry).
3. **Cemetery Adoption:** 100 cemeteries onboarded in first 6 months (free tier land grab).
4. **Conversion Rate:** 10% free → paid within 90 days.
5. **Data Growth:** 50,000 GPS-pinned plots within 12 months.

---

## 11. Phased Roadmap

### Phase 1 — Foundation (Weeks 1–4) — ✅ Mostly Complete
- ✅ Project scaffolding (Vite + React, Express API, PostgreSQL + PostGIS, Docker Compose)
- ✅ Database schema and migrations (Drizzle) — all 6 entities + indexes
- ✅ Cemetery registration and basic auth (JWT-based, not Cognito)
- ✅ CSV import with column mapping and validation
- ✅ Public search page (name search, results list, pagination, filters)
- ✅ Plot detail page with deep linking
- ⚠️ Photo upload pipeline — Sharp thumbnails work, but local storage only (no S3, no watermarking)
- ❌ Deploy: S3/CloudFront (frontend) + Lambda or Fargate (API) + RDS

### Phase 2 — The Magic (Weeks 5–8) — ⚠️ Mostly Complete
- ✅ Headstone photo capture (mobile camera, up to 3 photos)
- ✅ EXIF GPS extraction (client-side, exifr)
- ✅ AWS Textract OCR integration (with swappable interface + mock/dev mode)
- ✅ Claude LLM post-processing for structured field extraction (Bedrock + Anthropic API + mock)
- ✅ OCR review/confirm UI (editable fields, per-field confidence badges, mini-map)
- ✅ HEIC→JPEG conversion (Sharp, for Textract compatibility)
- ✅ Manual pin drop fallback (Leaflet map, GPS accuracy gating)
- ✅ Cemetery auto-detection (PostGIS radius match → Overpass API → manual entry, with mock mode + client-side caching)
- ❌ Batch capture mode

### Phase 3 — Wayfinding (Weeks 9–10) — ✅ Complete
- ✅ GPS wayfinding page (live position tracking, distance/bearing to plot)
- ✅ Compass-style directional UI
- ✅ "Navigate to Grave" deep link from plot detail page
- ✅ Cemetery map overview (all pinned plots as markers)

### Phase 4 — Offline & Polish (Weeks 11–12) — ⚠️ Partially Complete
- ❌ PWA setup (Vite PWA plugin, service worker)
- ❌ IndexedDB offline queue for photo capture + pin drops
- ❌ Background sync on reconnect
- ❌ Offline map tile caching
- ✅ QR code generation for cemetery profiles (qrcode.react, printer-friendly modal with Print button)
- ✅ Cemetery directory / browse page (`/directory` with filter, A-Z / nearest sorting via browser geolocation)
- ✅ Consistent navigation bar across all public pages (Search + Directory links)

### Phase 5 — Growth & Monetization (Post-MVP) — ❌ Not Started
- ❌ Stripe integration for paid tiers
- ❌ Analytics dashboard for cemetery admins
- ❌ Cemetery branding (custom colors, logo on public pages)
- ❌ API access for paid tier
- ❌ Genealogy integrations (FindAGrave linking, FamilySearch)
- ❌ Full records management (the "bring back Scythe" upsell)

---

## 12. Open Questions

1. **OCR service choice:** AWS Textract vs. Google Cloud Vision? Textract fits the AWS stack, but Vision may have better accuracy on weathered stone. Worth benchmarking with 50 headstone photos. *(Partially resolved — Textract is integrated behind a swappable `OcrExtractor` interface, so switching to Vision later requires only a new implementation class.)*
2. ~~**Auth approach:** Full Cognito, or a lighter solution like Lucia Auth with PostgreSQL sessions for MVP speed?~~ **Resolved:** Using JWT-based auth with bcrypt password hashing (local PostgreSQL sessions). Can migrate to Cognito for production.
3. **Lambda vs. Fargate:** Lambda is cheaper at low scale but has cold starts. Fargate is simpler to reason about. Decision can be deferred — start with Fargate, move to Lambda if cost becomes an issue. *(Still open — not yet deployed.)*
4. ~~**HEIC support:** iPhone photos are often HEIC. Ensure the OCR pipeline handles HEIC→JPEG conversion (Sharp supports this).~~ **Resolved:** Sharp converts HEIC/HEIF→JPEG before Textract processing and thumbnail generation.
5. **Genealogy linking (future):** Should Scythe plots link to FindAGrave memorial IDs? This could be a powerful draw for genealogists but adds complexity.
6. **Cemetery auto-detection fallback:** Should we also support Google Places API as a fallback if Overpass API coverage has gaps in certain areas? Google Places has broader POI coverage (especially for smaller/rural cemeteries that may not be tagged in OSM), but adds API cost and a Google Cloud dependency. Could be a paid-tier feature.

---
