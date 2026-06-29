# TruckGPS Static Dashboard - API Reference

## Quick Start

```bash
# 1. Install dependencies (Node.js 18+)
node --version

# 2. Fetch today's data
node fetch-metrics.js

# 3. Open index.html in browser (via HTTP server)
python3 -m http.server 8080
# Then visit: http://localhost:8080
```

---

## Why You Need an HTTP Server

**The Problem:** Modern browsers block `fetch()` requests when opening HTML files directly (via `file://` protocol). This is a security feature.

**The Solution:** Serve files over HTTP:

```bash
# Python 3
python3 -m http.server 8080

# Node.js
npx http-server -p 8080

# Python 2
python -m SimpleHTTPServer 8080
```

Then open `http://localhost:8080` in your browser.

---

## API Configuration

The GPS API is pre-configured with these credentials:

| Setting | Value |
|---------|-------|
| **Base URL** | `http://13.245.46.90/webservice` |
| **Username** | `info@farmworks.com` |
| **Password** | `Farmworks@12` |

These are hardcoded in `fetch-metrics.js` and `fetch-metrics-batch.js`.

Set via environment variables to override:

```bash
export GPS_PASSWORD="your-password"
export GPS_BASE_URL="http://..."
export GPS_USERNAME="user@example.com"
```

---

## Fetch Scripts

### Single Day: `fetch-metrics.js`

```bash
# Fetch yesterday (default)
node fetch-metrics.js

# Fetch specific date
node fetch-metrics.js 2026-06-25

# Preview without saving
node fetch-metrics.js --dry-run
```

### Batch: `fetch-metrics-batch.js`

```bash
# Fetch a date range
node fetch-metrics-batch.js 2026-06-11 2026-06-25
```

This skips dates/trucks already in `metrics.csv`.

---

## Data Files

| File | Format | Description |
|------|--------|-------------|
| `trucks.csv` | `truckId,plateNumber,externalId,bodaName,status` | Vehicle definitions |
| `metrics.csv` | `date,truck_id,distance_km` | Daily distances |

### trucks.csv

```csv
truckId,plateNumber,externalId,bodaName,status
Canter-KCG-149N,Canter KCG 149N,Canter KCG 149N,Nairobi East Boda,active
```

- `truckId` — unique ID (URL-safe, no spaces)
- `plateNumber` — display name
- `externalId` — name used by GPS API (may include spaces)
- `bodaName` — boda assignment
- `status` — active/inactive

### metrics.csv

```csv
date,truck_id,distance_km
2026-06-25,Canter-KCG-149N,168.05
```

---

## Vehicles (14 total)

| truckId | plateNumber | externalId |
|---------|-------------|------------|
| Canter-KCG-149N | Canter KCG 149N | Canter KCG 149N |
| FH-KBP-764X | FH KBP 764X | FH KBP 764X |
| FRR-KDA-021R | FRR KDA 021R | FRR KDA 021R |
| FRR-KDL-166P | FRR KDL 166P | FRR KDL 166P |
| FUSO-KCU-662N | FUSO KCU 662N | FUSO KCU 662N |
| Fuso-KDR-832J | Fuso KDR 832J | Fuso KDR 832J |
| Hilux-KCS-029Q | Hilux KCS 029Q | Hilux KCS 029Q |
| Hino-KDJ-423S | Hino KDJ 423S | Hino KDJ 423S |
| Isuzu-KDW-498R | Isuzu KDW 498R | Isuzu KDW 498R |
| NKR-KDA-089J | NKR KDA 089J | NKR KDA 089J |
| Probox-KDG-749M | Probox KDG 749M | Probox KDG 749M |
| Probox-KDL-730Y | Probox KDL 730Y | Probox KDL 730Y |
| Tata-KDE-169F | Tata KDE 169F | Tata KDE 169F |
| Tvs-KMGL-282K | Tvs KMGL 282K | Tvs KMGL 282K |

---

## Deduplication Logic

The fetch script uses **per-truck, per-day deduplication**.

**How it works:**
1. Loads existing metrics from `metrics.csv`
2. Builds a Set of `(date, truck_id)` pairs already fetched
3. Only fetches trucks that don't exist for that date
4. Appends only new entries to `metrics.csv`

**Example:**
```bash
$ node fetch-metrics.js 2026-06-26
Fetching metrics for: 2026-06-26
Skipping 14 already-fetched trucks: Canter KCG 149N, FH KBP 764X...
All trucks already fetched for 2026-06-26. Nothing to do.
```

If you add a new truck to `trucks.csv`:
```bash
$ node fetch-metrics.js 2026-06-26
Fetching metrics for: 2026-06-26
Skipping 14 already-fetched trucks: Canter KCG 149N, FH KBP 764X...
Fetching logs for NEW-TRUCK-001...
  -> 123.45 km
Appended metrics to metrics.csv
```

---

## API Endpoints

The GPS API has two endpoints used by the fetch scripts:

### 1. Generate Token

```http
POST http://13.245.46.90/webservice?token=generateAccessToken
Content-Type: text/plain

{"username":"info@farmworks.com","password":"Farmworks@12"}
```

Response:
```json
{"result":1,"data":{"token":"..."},"message":""}
```

### 2. Get Vehicle Track Logs

```http
POST http://13.245.46.90/webservice?token=getVehicleTrackLogs
Content-Type: text/plain
auth-code: <token-from-step-1>

{"vehicle_no":"Canter KCG 149N","start_date":"2026-06-25 00:00:00","end_date":"2026-06-25 23:59:00"}
```

Response:
```json
{"result":1,"data":[{"timestamp":"25-06-2026 08:30:00 AM","latitude":"-1.2345","longitude":"36.7890"},...]}
```

---

## Automating Daily Fetches

### macOS LaunchAgent

Create `~/Library/LaunchAgents/com.farmworks.fetchmetrics.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.farmworks.fetchmetrics</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/static-site/fetch-metrics.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>15</integer>
    </dict>
    <key>WorkingDirectory</key>
    <string>/path/to/static-site</string>
    <key>StandardOutPath</key>
    <string>/tmp/fetch-metrics.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/fetch-metrics-error.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.farmworks.fetchmetrics.plist
```

### GitHub Actions (if hosting on GitHub Pages)

Create `.github/workflows/daily-fetch.yml`:

```yaml
name: Daily Metrics Fetch

on:
  schedule:
    - cron: '15 2 * * *'  # 2:15 AM UTC daily
  workflow_dispatch:

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Fetch metrics
        env:
          GPS_PASSWORD: ${{ secrets.GPS_PASSWORD }}
        run: |
          cd static-site
          node fetch-metrics.js

      - name: Commit and push
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add static-site/metrics.csv
          git diff --staged --quiet || git commit -m "Update metrics $(date +%Y-%m-%d)"
          git push
```

Then add your GPS password as a GitHub secret:
1. Go to **Settings > Secrets and variables > Actions**
2. Click **New repository secret**
3. Name: `GPS_PASSWORD`
4. Value: your actual GPS password

---

## Deploying to GitHub Pages

1. Push the `static-site/` folder to a GitHub repository
2. Go to **Settings > Pages**
3. Source: Deploy from a branch
4. Branch: `main` / Folder: `/static-site` (or root)
5. Your dashboard will be at `https://yourusername.github.io/repo-name/`

**Note:** On GitHub Pages, `fetch('trucks.csv')` works normally over HTTPS. The `file://` protocol issue only happens when opening HTML directly.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard blank when double-clicking HTML | Browsers block `fetch()` on `file://` — use `python3 -m http.server` |
| "Failed to load trucks.csv" | Make sure CSVs are in the same folder as index.html |
| "Token request failed" | Check `GPS_PASSWORD` environment variable |
| "Logs request failed" | Verify truck `externalId` matches GPS API name |
| No data showing | Check that `metrics.csv` has entries for the selected date |
| Script won't run | Ensure Node.js 18+ is installed (`node --version`) |
| "All trucks already fetched" | Deduplication is working — data already exists for that date |
