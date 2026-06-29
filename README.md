# TruckGPS Static Dashboard

A simple static HTML dashboard that reads truck distance data from CSV files. No backend, no database, no Cloudflare Workers needed.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Files](#files)
4. [Viewing the Dashboard](#viewing-the-dashboard)
5. [Fetching Data](#fetching-data)
6. [Deduplication Logic](#deduplication-logic)
7. [CSV Format](#csv-format)
8. [API Configuration](#api-configuration)
9. [Automating Daily Fetches](#automating-daily-fetches)
10. [Deploying to GitHub Pages](#deploying-to-github-pages)
11. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Navigate to the static-site folder
cd static-site

# 2. Start a local HTTP server
python3 -m http.server 8080 &

# 3. Open dashboard in browser
# http://localhost:8080

# 4. Fetch yesterday's data
node fetch-metrics.js
```

---

## How It Works

1. **`trucks.csv`** — defines your trucks (id, plate number, status)
2. **`metrics.csv`** — stores daily distance data for each truck
3. **`index.html`** — the dashboard that reads both CSVs and displays data with day/week views

**Why an HTTP server?** Modern browsers block `fetch()` requests to local files (`file://` protocol) for security reasons. You need an HTTP server for the dashboard to load CSV files.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Static dashboard (open via HTTP server) |
| `trucks.csv` | Truck definitions |
| `metrics.csv` | Daily distance records |
| `fetch-metrics.js` | Single-day fetch with per-truck deduplication |
| `fetch-metrics-batch.js` | Date-range fetch with skip-existing logic |
| `README.md` | This file |
| `API_REFERENCE.md` | Full API documentation |
| `CHANGELOG.md` | Change log |

---

## Viewing the Dashboard

### Option 1: Python HTTP Server (Recommended)

```bash
# Start server
cd static-site
python3 -m http.server 8080

# Open browser to: http://localhost:8080

# Stop server (Ctrl+C in terminal)
```

### Option 2: Background Server

```bash
# Start in background
cd static-site
python3 -m http.server 8080 &

# Stop later
lsof -ti:8080 | xargs kill -9
```

### Option 3: Node.js HTTP Server

```bash
npx http-server -p 8080
```

---

## Fetching Data

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

## Deduplication Logic

### Per-Truck, Per-Day Deduplication

The fetch script checks for existing metrics **per truck, per day** instead of per day only.

**Before:** If *any* truck existed for a date, skip the **entire day**.

**Now:** Checks each truck individually and only fetches missing trucks.

### Example Scenarios

**1. All trucks already fetched:**
```bash
$ node fetch-metrics.js 2026-06-26
Fetching metrics for: 2026-06-26
Skipping 14 already-fetched trucks: Canter KCG 149N, FH KBP 764X...
All trucks already fetched for 2026-06-26. Nothing to do.
```

**2. Add new truck, re-run:**
```bash
$ node fetch-metrics.js 2026-06-26
Fetching metrics for: 2026-06-26
Skipping 14 already-fetched trucks: Canter KCG 149N, FH KBP 764X...
Fetching logs for NEW-TRUCK-001...
  -> 123.45 km
Appended metrics to metrics.csv
```

**3. Retry a failed truck:**
- Delete that truck's line from `metrics.csv`
- Re-run script
- Only that truck gets re-fetched

### Use Cases

1. **Adding new trucks**: Add truck to `trucks.csv`, run script — only the new truck gets fetched
2. **Retrying failed fetches**: Delete a specific truck's line from `metrics.csv`, re-run — only that truck gets re-fetched
3. **Partial day coverage**: If some trucks failed due to API errors, re-run fetches just the missing ones

---

## CSV Format

### trucks.csv

```csv
truckId,plateNumber,externalId,status
Canter-KCG-149N,Canter KCG 149N,Canter KCG 149N,active
```

- `truckId` — unique ID (URL-safe, no spaces)
- `plateNumber` — display name
- `externalId` — name used by GPS API (may include spaces)
- `status` — active/inactive

### metrics.csv

```csv
date,truck_id,distance_km
2026-06-25,Canter-KCG-149N,168.05
```

---

## API Configuration

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

### Vehicles (14 total)

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

## Automating Daily Fetches

### Option 1: Cron (Linux/Mac)

Add to your crontab (`crontab -e`):

```bash
# Run daily at 2:15 AM
15 2 * * * cd /path/to/static-site && /usr/bin/node fetch-metrics.js >> fetch-metrics.log 2>&1
```

### Option 2: GitHub Actions (if hosting on GitHub Pages)

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

### Option 3: macOS LaunchAgent (if running on your Mac)

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
| "Failed to load trucks.csv" | Start an HTTP server (see [Viewing the Dashboard](#viewing-the-dashboard)) |
| Dashboard blank when double-clicking HTML | Browsers block `fetch()` on `file://` protocol — use `python3 -m http.server` |
| "Token request failed" | Check `GPS_PASSWORD` environment variable |
| "Logs request failed" | Verify truck `externalId` matches GPS API name |
| No data showing | Check that `metrics.csv` has entries for the selected date |
| Script won't run | Ensure Node.js 18+ is installed (`node --version`) |
| "All trucks already fetched" | Deduplication is working — data already exists for that date |
