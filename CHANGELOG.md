# TruckGPS Fetch Scripts - Changelog

## Per-Truck Deduplication (Latest)

**Changed:** `fetch-metrics.js` now checks for existing metrics **per truck, per day** instead of per day only.

### Before
- If *any* truck existed for a date, the script skipped the **entire day**
- Adding a new truck to `trucks.csv` meant manually deleting the day's data or re-fetching everything

### After
- Checks each truck individually against `metrics.csv`
- Only fetches trucks that don't already have data for that date
- Shows which trucks were skipped and which were fetched

### Example Output

```bash
$ node fetch-metrics.js 2026-06-26
Fetching metrics for: 2026-06-26
Skipping 14 already-fetched trucks: Canter KCG 149N, FH KBP 764X...
All trucks already fetched for 2026-06-26. Nothing to do.
```

If you add a new truck and run again:

```bash
$ node fetch-metrics.js 2026-06-26
Fetching metrics for: 2026-06-26
Skipping 14 already-fetched trucks: Canter KCG 149N, FH KBP 764X...
Fetching logs for NEW-TRUCK-001...
  -> 123.45 km
Appended metrics to metrics.csv
```

### Use Cases

1. **Adding new trucks**: Add truck to `trucks.csv`, run script — only the new truck gets fetched
2. **Retrying failed fetches**: Delete a specific truck's line from `metrics.csv`, re-run — only that truck gets re-fetched
3. **Partial day coverage**: If some trucks failed due to API errors, re-run fetches just the missing ones

---

## Batch Fetch Script

**Added:** `fetch-metrics-batch.js` for fetching date ranges.

```bash
# Fetch a date range
node fetch-metrics-batch.js 2026-06-11 2026-06-25
```

Features:
- Skips dates/trucks already in `metrics.csv`
- Shows progress per day
- Appends only new data

---

## CSV Format

### metrics.csv

```csv
date,truck_id,distance_km
2026-06-26,Canter-KCG-149N,168.05
```

The `truck_id` column matches `truckId` from `trucks.csv`.

---

## API Configuration

| Setting | Value |
|---------|-------|
| Base URL | `http://13.245.46.90/webservice` |
| Username | `info@farmworks.com` |
| Password | `Farmworks@12` |

Set via environment variables to override:

```bash
export GPS_PASSWORD="your-password"
export GPS_BASE_URL="http://..."
export GPS_USERNAME="user@example.com"
```

---

## Files

| File | Purpose |
|------|---------|
| `fetch-metrics.js` | Single-day fetch with per-truck deduplication |
| `fetch-metrics-batch.js` | Date-range fetch with skip-existing logic |
| `trucks.csv` | Vehicle definitions |
| `metrics.csv` | Daily distance records |
| `API_REFERENCE.md` | Full API documentation |
