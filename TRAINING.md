# Scythe Training & Manual Testing Guide

## Quick Start

### Prerequisites
- Docker Desktop running
- Node.js 22+
- A terminal

### Setup (first time)
```bash
npm install
docker-compose up -d          # Start PostgreSQL + PostGIS
npm run db:migrate             # Create tables
npm run db:seed                # Load test data
npm run dev                    # Start frontend (5173) + API (3001)
```

### Test Accounts (from seed data)

| Role | Email | Password |
|------|-------|----------|
| Groundskeeper | `groundskeeper@springfieldmemorial.example.com` | `password123` |
| Admin | `admin@springfieldmemorial.example.com` | `password123` |

### Seed Data
- **Cemetery:** Springfield Memorial Cemetery (slug: `springfield-memorial`)
  - Address: 1200 Oak Hill Road, Springfield, IL 62704
  - Center: 39.7817, -89.6501
- **Plots:** A-101 (pinned, Section A) and B-204 (unpinned, Section B)
- **People:** John William Smith (1923-1998), Mary Elizabeth Smith (1925-2005), Robert Davis (1945-2020)

---

## Manual Test Flows

### 1. Public Search & Wayfinding

**Goal:** A visitor finds a grave and navigates to it.

1. Open `http://localhost:5173/`
2. Verify the homepage shows a search bar, "Browse All Cemeteries" link, and nav bar with Search + Directory
3. Type "Smith" and press Search
4. Verify results show John William Smith and Mary Elizabeth Smith with cemetery name and dates
5. Click a result card to open the plot detail page
6. Verify the plot detail page shows name, dates, inscription, GPS coordinates, and cemetery info
7. Click "Navigate to Grave" (if plot is GPS-pinned)
8. Verify the wayfinding page shows a map with the plot marker and live GPS tracking
9. Press the back button, return to search results

**Pass criteria:** Search returns results, plot detail loads, wayfinding map renders with plot marker.

---

### 2. Cemetery Directory

**Goal:** A visitor browses all cemeteries on the platform.

1. Open `http://localhost:5173/directory`
2. Verify Springfield Memorial Cemetery appears as a card with name, city/state, and burial count
3. Type "Springfield" in the filter bar — verify the card stays visible
4. Type "Nonexistent" — verify "No cemeteries match your filter" appears
5. Clear the filter
6. Click the "Nearest" sort button — verify a browser location permission prompt appears (allow or deny)
7. Click the Springfield Memorial card
8. Verify it navigates to `/springfield-memorial` (the cemetery profile page)

**Pass criteria:** Directory loads with seed data, filter works, sort toggle works, cards link to profile.

---

### 3. Cemetery Profile + QR Code

**Goal:** A cemetery admin generates a printable QR code for the entrance gate.

1. Open `http://localhost:5173/springfield-memorial`
2. Verify cemetery name, address, contact info, and stats are displayed
3. Verify the map shows at least one plot marker (Plot A-101)
4. Click "Print QR Code" button (top right)
5. Verify a modal appears with: Scythe logo text, QR code image, cemetery name, "Scan to search for a grave"
6. Click "Print" — verify a new browser window opens with a clean print layout
7. Close the print preview, click "Close" on the modal
8. (Optional) Scan the QR code with a phone — verify it opens the cemetery profile URL

**Pass criteria:** QR modal renders, QR code encodes the correct URL (`{origin}/springfield-memorial`), print view opens.

---

### 4. Groundskeeper Login

**Goal:** A groundskeeper logs in to access capture features.

1. Open `http://localhost:5173/login`
2. Enter email: `groundskeeper@springfieldmemorial.example.com`, password: `password123`
3. Click Login
4. Verify redirect to homepage or dashboard (token stored in localStorage)
5. Open browser DevTools > Application > Local Storage — verify `scythe_token` exists

**Pass criteria:** Login succeeds, token is stored, authenticated routes become accessible.

---

### 5. Photo Capture with OCR

**Goal:** A groundskeeper photographs a headstone and the system extracts burial data.

1. Log in as the groundskeeper (see test 4)
2. Navigate to `http://localhost:5173/springfield-memorial/capture`
3. Verify the header shows "Capture" with "Springfield Memorial Cemetery" subtitle
4. Click the photo capture area and select a headstone photo (or any JPEG with EXIF GPS data)
5. Verify the "GPS Location Detected" banner appears (if photo has EXIF GPS)
6. Verify the GPS accuracy badge shows (green/yellow/red)
7. Optionally fill in Section and Plot Number fields
8. Click "Process with OCR"
9. Verify the spinner appears ("Processing headstone...")
10. Verify redirect to the OCR review page with: thumbnail, parsed name/date fields, confidence badges
11. Edit any fields if needed
12. Click "Confirm & Save"
13. Verify success message and plot is created

**Without OCR (manual save):**
- After step 7, click "Review & Save (Manual)" instead
- Verify the review screen shows photo previews, GPS info, and section/plot fields
- Click "Confirm & Save"

**Pass criteria:** Photo capture works, OCR processes (or mock returns data), review page is editable, save creates a plot.

**Note:** In development mode (`NODE_ENV=development`), OCR uses mock extractors and parsers unless AWS credentials / Anthropic API key are configured.

---

### 6. Cemetery Auto-Detection (Capture without slug)

**Goal:** A groundskeeper captures a photo without pre-selecting a cemetery, and the system auto-detects it.

1. Log in as the groundskeeper
2. Navigate to `http://localhost:5173/capture` (no cemetery slug in URL)
3. Capture a photo with EXIF GPS data
4. Verify the "Detecting cemetery..." spinner appears briefly
5. **If GPS is near Springfield Memorial** (within 500m of 39.7817, -89.6501):
   - Verify a green "Detected: Springfield Memorial Cemetery" badge appears
   - Verify the "Change" link allows switching to a different cemetery
6. **If GPS is not near any Scythe cemetery** (mock mode is on in dev):
   - Verify a blue card appears: "It looks like you're at Springfield Memorial Cemetery, 123 Oak Street, Springfield, IL"
   - Click "Create & Continue"
   - Verify the cemetery is created and selected
7. **If no GPS data:**
   - Verify an orange "Cemetery not detected" prompt appears
   - Click "Select Cemetery" to see a dropdown of existing cemeteries
   - Or click "Create New" to enter name/address manually
8. Once a cemetery is selected, verify the OCR and manual save buttons become enabled
9. Complete the capture flow as in test 5

**Pass criteria:** Detection fires once, correct UI state shown, cemetery can be selected/created, capture completes.

---

### 7. Manual Pin Drop

**Goal:** A groundskeeper pins a grave location without OCR.

1. Log in as the groundskeeper
2. Navigate to `http://localhost:5173/pin`
3. Verify the Leaflet map loads with live GPS tracking
4. Verify the "Drop Pin" button is disabled until GPS accuracy < 5 meters
5. (In Chrome DevTools, you can override geolocation: Sensors > Geolocation > Custom location, set accuracy to 2.0)
6. Once accuracy is good, click "Drop Pin"
7. Fill in name, dates, section, plot number
8. Optionally attach a photo
9. Click Save
10. Verify success

**Pass criteria:** GPS accuracy gating works (button disabled > 5m, enabled < 5m), pin drop creates a plot.

---

### 8. CSV Import

**Goal:** An admin bulk-imports burial records from a CSV file.

1. Log in as the admin account
2. Navigate to `http://localhost:5173/dashboard/import`
3. Prepare a CSV file with columns: `First Name, Last Name, Date of Birth, Date of Death, Section, Plot Number`
4. Upload the CSV
5. Verify the column mapping step shows your CSV headers and lets you map them to Scythe fields
6. Click Next to see validation results
7. Verify the preview shows parsed records with any validation errors highlighted
8. Click "Import"
9. Verify the import completes with a success count

**Sample CSV:**
```csv
First Name,Last Name,Date of Birth,Date of Death,Section,Plot Number
Alice,Johnson,1930-03-12,2010-09-25,Section C,C-301
James,Wilson,1955-07-04,2022-01-15,Section C,C-302
```

**Pass criteria:** CSV parses, columns map correctly, validation catches errors, import creates records.

---

### 9. Registration (New Cemetery)

**Goal:** A new cemetery admin signs up and creates a cemetery profile.

1. Open `http://localhost:5173/register`
2. Fill in: name, email, password (8+ chars), cemetery name, address, city, state, zip
3. Click Register
4. Verify redirect with auth token set
5. Navigate to the cemetery slug URL (generated from cemetery name, e.g., `/my-cemetery`)
6. Verify the cemetery profile page loads with the info you entered

**Pass criteria:** Registration creates both user and cemetery, token is issued, cemetery profile is accessible.

---

### 10. Cross-Page Navigation

**Goal:** Verify nav links work consistently across all public pages.

1. Open `http://localhost:5173/`
2. Verify nav bar shows "Search" and "Directory" links
3. Click "Directory" — verify it goes to `/directory`
4. Click "Search" in the nav — verify it goes to `/search`
5. Click "Scythe" logo — verify it goes to `/`
6. Navigate to `/springfield-memorial` — verify nav bar has Search + Directory
7. Navigate to `/search?q=Smith` — verify nav bar has Search (highlighted) + Directory

**Pass criteria:** Nav is consistent, logo links home, active page is highlighted.

---

## API Quick Reference (for manual curl testing)

```bash
# Login and get a token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"groundskeeper@springfieldmemorial.example.com","password":"password123"}' \
  | jq -r '.token')

# Public: search
curl "http://localhost:3001/api/search?q=Smith"

# Public: cemetery profile
curl "http://localhost:3001/api/cemeteries/springfield-memorial"

# Public: cemetery directory (with stats)
curl "http://localhost:3001/api/cemeteries?stats=true"

# Auth: detect cemetery by GPS
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/cemeteries/detect?lat=39.7817&lon=-89.6501"

# Auth: list all cemeteries (dropdown)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/cemeteries"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `docker-compose up` fails | Make sure Docker Desktop is running. Check if port 5432 is already in use. |
| `npm run db:migrate` fails with connection error | Ensure PostgreSQL container is up: `docker-compose ps` |
| `npm run db:seed` fails with duplicate key | Database already has seed data. Drop and recreate: `docker-compose down -v && docker-compose up -d && npm run db:migrate && npm run db:seed` |
| OCR returns mock data | Expected in dev mode. Set `ANTHROPIC_API_KEY` or AWS credentials for real OCR. |
| Cemetery detection always returns OSM mock | Expected in dev mode (`NODE_ENV=development`). Set `CEMETERY_DETECT_MOCK=false` to use real Overpass API. |
| Photos not loading | Photos are stored locally in `packages/api/uploads/`. Ensure the API is running. |
| Login redirect loop | Clear `scythe_token` from localStorage and log in again. |
| PostGIS spatial queries fail | Ensure the PostGIS extension is enabled: `npm run db:migrate` runs `CREATE EXTENSION IF NOT EXISTS postgis`. |
