#!/usr/bin/env node
/**
 * fetch-metrics.js
 *
 * Fetches daily GPS track logs for each truck from the upstream API,
 * computes distance driven (km), and appends results to metrics.csv.
 *
 * Usage:
 *   node fetch-metrics.js                    # fetch yesterday
 *   node fetch-metrics.js 2026-06-25           # fetch specific date
 *   node fetch-metrics.js 2026-06-25 --dry-run # preview only
 */

const fs = require("fs");
const path = require("path");

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

function loadMetrics() {
  if (!fs.existsSync(METRICS_CSV)) {
    return [];
  }
  const text = fs.readFileSync(METRICS_CSV, "utf-8");
  return parseCSV(text);
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

// ── MAIN ──────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dateArg = args.find((a) => !a.startsWith("--"));

  const targetDate =
    dateArg || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  console.log(`Fetching metrics for: ${targetDate}`);
  if (dryRun) console.log("[DRY RUN — no changes written]");

  const trucks = loadTrucks();
  if (trucks.length === 0) {
    console.error("No trucks found in trucks.csv");
    process.exit(1);
  }

  // Check which trucks already have metrics for this date
  const existingMetrics = loadMetrics();
  const existingForDate = new Set(
    existingMetrics
      .filter((m) => m.date === targetDate)
      .map((m) => m.truck_id)
  );

  const trucksToFetch = trucks.filter((t) => !existingForDate.has(t.truckId));
  const skippedTrucks = trucks.filter((t) => existingForDate.has(t.truckId));

  if (skippedTrucks.length > 0) {
    console.log(
      `Skipping ${skippedTrucks.length} already-fetched trucks: ${skippedTrucks
        .map((t) => t.plateNumber)
        .join(", ")}`
    );
  }

  if (trucksToFetch.length === 0) {
    console.log(`All trucks already fetched for ${targetDate}. Nothing to do.`);
    process.exit(0);
  }

  console.log(`Authenticating with GPS API...`);
  const token = await generateToken();

  const distances = {};
  for (const truck of trucksToFetch) {
    const vehicleName = truck.externalId || truck.plateNumber;
    console.log(`  Fetching logs for ${vehicleName}...`);
    const logs = await fetchTruckLogs(token, vehicleName, targetDate);
    const distanceKm = computeDistanceKm(logs);
    distances[truck.truckId] = distanceKm;
    console.log(`    -> ${distanceKm} km`);
  }

  if (!dryRun) {
    appendMetrics(targetDate, distances);
    console.log(`\nAppended metrics to ${METRICS_CSV}`);
  } else {
    console.log("\n[DRY RUN] Would append:");
    for (const [truckId, distanceKm] of Object.entries(distances)) {
      console.log(`  ${truckId},${targetDate},${distanceKm}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
