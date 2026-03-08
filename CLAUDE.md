# Scythe Project Guidelines

## Build & Run Commands
- **Install:** `npm install` (root monorepo)
- **Dev (full stack):** `npm run dev` (runs frontend + API concurrently)
- **Frontend only:** `npm run dev:web` (Vite dev server with HMR)
- **API only:** `npm run dev:api` (Express with nodemon)
- **Database:**
  - Start: `docker-compose up -d` (PostgreSQL 17 + PostGIS)
  - Migrate: `npm run db:migrate` (Drizzle push)
  - Seed: `npm run db:seed`
  - Studio: `npm run db:studio` (Drizzle Studio GUI)
- **Tests:** `npm test` (Vitest)
- **Lint:** `npm run lint` (ESLint + Prettier)
- **Build:** `npm run build` (Vite production build + API bundle)
- **Docker (full):** `docker-compose -f docker-compose.full.yml up`

## Project Structure
```
scythe/
├── packages/
│   ├── web/            # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/        # Utilities, API client, EXIF helpers
│   │   │   ├── stores/     # React Query config, offline queue
│   │   │   └── sw/         # Service worker (Workbox)
│   │   └── public/
│   ├── api/            # Express/Hono backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/  # Auth, error handling, rate limiting
│   │   │   ├── db/         # Drizzle schema, migrations
│   │   │   └── lib/        # OCR, LLM, S3, image processing
│   │   └── tests/
│   └── shared/         # Shared types, constants, validation schemas
├── docker-compose.yml
└── package.json        # Workspace root
```

## Coding Standards

### General
- **TypeScript everywhere.** Strict mode enabled. No `any` types — use `unknown` and narrow.
- **Naming:** camelCase for variables/functions, PascalCase for components/types/interfaces, SCREAMING_SNAKE for constants.
- **Imports:** Use path aliases (`@web/`, `@api/`, `@shared/`) — no deep relative imports (`../../../`).
- **No default exports** except for React pages/components (required by React Router/lazy loading).
- **Validation:** Use Zod schemas for all API request/response validation. Shared schemas live in `packages/shared/`.

### Frontend (React)
- **React 19** with functional components only. No class components.
- **State:** React Query (TanStack Query) for server state. `useState`/`useReducer` for local UI state only. No global state library unless complexity demands it.
- **Styling:** Tailwind CSS utility classes. No CSS modules, no styled-components. Keep component-specific styles co-located.
- **Forms:** Controlled components with Zod validation. No form libraries unless complexity demands it.
- **Mobile-first:** All layouts must be designed mobile-first. Test at 375px width minimum.
- **Accessibility:** Semantic HTML, ARIA labels on interactive elements, keyboard navigation support.

### Backend (Node.js)
- **Express** (or Hono) with typed route handlers.
- **Drizzle ORM** for all database access. No raw SQL except for complex spatial queries that Drizzle can't express.
- **Service layer pattern:** Routes → Services → Database. Routes handle HTTP concerns (parsing, status codes). Services contain business logic. No business logic in route handlers.
- **Error handling:** Custom `AppError` class with status codes. Global error handler middleware. Never leak stack traces in production.
- **Environment config:** All secrets and config via environment variables. Use `dotenv` for local dev. Never commit `.env` files.

### GIS & Mapping
- Use **PostGIS** for all spatial storage and queries.
- Always use **SRID 4326** (WGS84) for GPS coordinates.
- In PostGIS/Drizzle: **X = Longitude, Y = Latitude** (this is the standard, but it's easy to mix up).
- All new GPS captures must include `gpsAccuracyMeters` and `gpsSource` (exif / manual / csv / geocoded).
- Frontend maps use **Leaflet + React Leaflet** with OpenStreetMap tile layer.
- GPS pin drop must remain locked until accuracy < 5 meters.

### OCR & Image Processing
- **EXIF extraction** happens client-side using `exifr`. Extract GPS coordinates, timestamp, and device info before upload.
- **Photo upload** goes directly to S3 (presigned URL) — don't proxy large files through the API server.
- **Thumbnail + watermark** generation runs server-side via **Sharp** (triggered by S3 upload event or API call).
- **OCR:** AWS Textract for text extraction. Results stored on the `HeadstonePhoto` record.
- **LLM parsing:** Raw Textract output → Claude (via Bedrock or Anthropic API) → structured JSON. Use Haiku for cost efficiency.
- **Review UX:** OCR results are always presented as editable suggestions, never auto-committed. The groundskeeper confirms or corrects.

## Critical Constraints

- **No multi-tenancy complexity.** Each cemetery is independent. No `organizationId` global filters. Users belong to exactly one cemetery.
- **Deep linking:** All public-facing routes use the cemetery slug: `/:cemeterySlug/plot/:plotId`. Slugs must be unique, URL-safe, and immutable once set.
- **Offline-first for capture workflows.** Photo capture, EXIF extraction, and form entry must work offline. OCR processing is deferred until connectivity returns. Use IndexedDB (via `idb`) for offline queue.
- **GPS accuracy gating:** The manual "Drop Pin" button must remain disabled until GPS accuracy is under 5 meters. Display accuracy visually (green < 3m, yellow 3–5m, red > 5m).
- **EXIF GPS is the preferred source.** When a photo has valid EXIF GPS data, use it as the plot location. Only fall back to manual pin drop when EXIF is missing or inaccurate.
- **Photo processing pipeline order:** Upload original to S3 → Generate thumbnail (Sharp, 400px max, JPEG q80) → Generate watermarked full-size → Store both URLs on the record. Never serve unprocessed originals to the public.
- **Rate limiting:** Public search endpoint must be rate-limited per IP. Use `express-rate-limit` or API Gateway throttling.

## Testing & Quality

### Unit Tests
- Framework: **Vitest** (compatible with Vite, fast, native ESM).
- Follow **AAA pattern** (Arrange-Act-Assert).
- Mock external services (S3, Textract, Bedrock) — never call real AWS in tests.
- Co-locate test files: `myService.ts` → `myService.test.ts` in the same directory.

### Integration Tests
- Use **Testcontainers** for PostgreSQL + PostGIS.
- Seed consistent test data (equivalent to the Springfield dataset from original Scythe).
- Test spatial queries with known coordinates and expected distances.

### API Tests
- Use **Supertest** for HTTP-level endpoint testing.
- Test auth flows: unauthenticated access denied, groundskeeper can't access admin routes, etc.

### Frontend Tests
- **Vitest + React Testing Library** for component tests.
- Test the OCR review flow end-to-end: mock Textract response → verify parsed fields displayed → simulate user edits → verify save payload.

### Coverage Goals
- Services (API): 80% minimum
- Shared validation schemas: 90% minimum
- Overall: 70% minimum

### CI/CD
- **GitHub Actions** on push/PR:
  1. Install → Lint → Type-check → Unit tests → Integration tests → Build
  2. PostgreSQL + PostGIS service container for integration tests
  3. Deploy to AWS on merge to `main` (frontend to S3/CloudFront, API to Lambda/Fargate)

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://scythe:scythe@localhost:5432/scythe

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=          # Local dev only; use IAM roles in production
AWS_SECRET_ACCESS_KEY=      # Local dev only; use IAM roles in production
S3_BUCKET=scythe-photos
CLOUDFRONT_DOMAIN=          # Photo CDN domain

# Auth
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
JWT_SECRET=                 # For local dev without Cognito

# OCR + LLM
TEXTRACT_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
```

## Documentation Maintenance

**IMPORTANT: Keep these docs up to date after every feature change.**

### PRD.md
- After implementing a feature, update the relevant **Status** paragraph in the PRD section (e.g., Section 4.1, 4.2, 4.3, 4.5).
- Mark roadmap items as `✅` when complete, `⚠️` when partially done.
- Add new API endpoints to the Section 7.3 API table.
- Bump the **Version** number (minor increment, e.g., 3.2 → 3.3) and update **Last Updated** date.
- If a new entity or column is added to the schema, update the Section 5.1 data model table.

### TRAINING.md
- After adding a new user-facing feature, add a numbered manual test flow to TRAINING.md.
- After adding a new API endpoint, add a curl example to the API Quick Reference section.
- If seed data changes (new test users, cemeteries, plots), update the Seed Data section and test account table.
- If a new environment variable is added, update the Troubleshooting section if relevant.

### CLAUDE.md (this file)
- If build commands change (new scripts, new tools), update the Build & Run Commands section.
- If new packages or directories are added to the monorepo, update the Project Structure tree.
- If new coding conventions are adopted, add them to the relevant Coding Standards subsection.

## Deployment Checklist

- [ ] RDS PostgreSQL provisioned with PostGIS extension enabled
- [ ] S3 bucket created with CORS configured for direct upload
- [ ] CloudFront distribution pointing to S3 (photos) and S3 (frontend)
- [ ] Cognito user pool configured
- [ ] API deployed to Lambda/Fargate with IAM role granting S3, Textract, Bedrock access
- [ ] Environment variables set in production (no `.env` file)
- [ ] Rate limiting configured on API Gateway or Express middleware
- [ ] GitHub Actions deploy workflow configured for `main` branch
- [ ] DNS configured in Route 53
- [ ] SSL certificate provisioned via ACM
