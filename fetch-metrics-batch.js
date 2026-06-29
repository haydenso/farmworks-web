#!/usr/bin/env node
/**
 * fetch-metrics-batch.js
 *
 * Fetches GPS track logs for a range of dates.
 * Usage:
 *   node fetch-metrics-batch.js 2026-06-10 2026-06-25
 */

const fs = require("fs");

// ── CONFIG ──────────────────────────────────────────────────────────
const GPS_BASE_URL = process.env.GPS_BASE_URL || "http://13.245.46.90/webservice";
const GPS_USERNAME = process.env.GPS_USERNAME || "info@farmworks.com";
const GPS_PASSWORD = process.env.GPS_PASSWORD || "Farmworks@12";

const TRUCKS_CSV = process.env.TRUCKS_CSV || "trucks.csv";
const METRICS_CSV = process.env.METRICS_CSV || "metrics.csv";

// ── HELPERS ────────────────────────────────────────────────────────
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseApiTimestamp(ts) {
  const match = ts.match(
    /^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2}):(\d{2})\s(AM|PM)$/
  );
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min, ss, period] = match;
  let hour24 = Number(hh);
  if (period === "AM") {
    hour24 = hour24 === 12 ? 0 : hour24;
  } else {
    hour24 = hour24 === 12 ? 12 : hour24 + 12;
  }
  const date = new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour24, Number(min), Number(ss))
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeDistanceKm(logs) {
  const points = logs
    .map((item) => {
      const timestamp = item.timestamp ? parseApiTimestamp(item.timestamp) : null;
      const lat = Number(item.latitude);
      const lon = Number(item.longitude);
      if (!timestamp || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { t: timestamp.getTime(), lat, lon };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) return 0;

  let distanceMeters = 0;
  for (let i = 1; i < points.length; i++) {
    distanceMeters += haversineMeters(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return Number((distanceMeters / 1000).toFixed(2));
}

// ── CSV ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ? values[i].trim() : "";
    });
    return row;
  });
}

function loadTrucks() {
  const text = fs.readFileSync(TRUCKS_CSV, "utf-8");
  return parseCSV(text);
}

function loadExistingMetrics() {
  if (!fs.existsSync(METRICS_CSV)) {
    return new Set();
  }
  const text = fs.readFileSync(METRICS_CSV, "utf-8");
  const lines = text.trim().split("\n");
  const existing = new Set();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length >= 3) {
      // date,truck_id,distance_km format
      existing.add(`${parts[1].trim()}_${parts[0].trim()}`);
    }
  }
  return existing;
}

function appendMetrics(date, distances) {
  const lines = [];
  for (const [truckId, distanceKm] of Object.entries(distances)) {
    lines.push(`${date},${truckId},${distanceKm}`);
  }
  fs.appendFileSync(METRICS_CSV, lines.join("\n") + "\n", "utf-8");
}

// ── API ────────────────────────────────────────────────────────────
async function generateToken() {
  const url = `${GPS_BASE_URL.replace(/\/$/, "")}?token=generateAccessToken`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({
      username: GPS_USERNAME,
      password: GPS_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }

  const payload = await response.json();
  const token = payload?.data?.token;
  if (payload?.result !== 1 || !token) {
    throw new Error("Token payload did not include a valid token");
  }
  return token;
}

async function fetchTruckLogs(authToken, vehicleName, dateIso) {
  const url = `${GPS_BASE_URL.replace(/\/$/, "")}?token=getVehicleTrackLogs`;
  const startDate = `${dateIso} 00:00:00`;
  const endDate = `${dateIso} 23:59:00`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "auth-code": authToken,
    },
    body: JSON.stringify({
      vehicle_no: vehicleName,
      start_date: startDate,
      end_date: endDate,
    }),
  });

  if (!response.ok) {
    throw new Error(`Logs request failed for ${vehicleName}: ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.result !== 1) {
    return [];
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

// ── DATE UTILS ─────────────────────────────────────────────────────
function getDatesInRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().slice(0, 10));
  }
  return dates;
}

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: node fetch-metrics-batch.js <start-date> <end-date>");
    console.error("Example: node fetch-metrics-batch.js 2026-06-10 2026-06-25");
    process.exit(1);
  }

  const startDate = args[0];
  const endDate = args[1];
  const dates = getDatesInRange(startDate, endDate);
  
  console.log(`Fetching metrics for ${dates.length} days: ${startDate} to ${endDate}`);

  const trucks = loadTrucks();
  if (trucks.length === 0) {
    console.error("No trucks found in trucks.csv");
    process.exit(1);
  }

  const existingMetrics = loadExistingMetrics();
  console.log(`Found ${existingMetrics.size} existing metric entries`);

  console.log(`Authenticating with GPS API...`);
  const token = await generateToken();

  let totalAdded = 0;
  let totalSkipped = 0;

  for (const date of dates) {
    const dayDistances = {};
    let dayAdded = 0;

    for (const truck of trucks) {
      const vehicleName = truck.externalId || truck.plateNumber;
      const key = `${truck.truckId}_${date}`;
      
      if (existingMetrics.has(key)) {
        console.log(`  [SKIP] ${date} ${vehicleName} - already exists`);
        totalSkipped++;
        continue;
      }

      try {
        const logs = await fetchTruckLogs(token, vehicleName, date);
        const distanceKm = computeDistanceKm(logs);
        dayDistances[truck.truckId] = distanceKm;
        console.log(`  [FETCH] ${date} ${vehicleName} -> ${distanceKm} km`);
        dayAdded++;
      } catch (err) {
        console.error(`  [ERROR] ${date} ${vehicleName}: ${err.message}`);
      }
    }

    if (dayAdded > 0) {
      appendMetrics(date, dayDistances);
      totalAdded += dayAdded;
      console.log(`  Appended ${dayAdded} metrics for ${date}`);
    }
  }

  console.log(`\nDone! Added ${totalAdded} entries, skipped ${totalSkipped} existing entries.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
