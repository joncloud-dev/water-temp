/// <reference path="../pb_data/types.d.ts" />
/// <reference path="../types/iot.d.ts" />
//
// Shared projection helpers for the water-temperature station endpoints.
//
// PocketBase executes each routerAdd handler in its own isolated JS runtime, so
// a handler cannot see anything defined at the top level of the hook file. Shared
// code therefore lives in a plain module that every handler require()s. This file
// is deliberately not named *.pb.js so it is not auto-loaded on its own.

const STATION_TAG = "station_type";
const STATION_VALUE = "water_temp";
const K_WATER = "15";
const K_AIR = "11";
const K_HUM = "12";
const K_PRESS = "13";
const K_VITALS = "21";

function isStation(tags) {
  return !!tags && tags[STATION_TAG] === STATION_VALUE;
}

function projectStation(app, dev, tags) {
  const name = (tags.name && String(tags.name).trim()) || dev.getString("hw_id");
  let lat = num(tags.lat);
  let lng = num(tags.lng);
  if (lat === null || lng === null) {
    const fix = latestFix(app, dev.id);
    if (fix) {
      lat = fix.lat;
      lng = fix.lng;
    }
  }
  const st = { id: dev.id, name, lat, lng, depth: num(tags.depth) };
  const latest = latestWaterTemp(app, dev.id);
  if (latest) {
    st.water_temp = latest.temp;
    st.last_t = latest.t;
  }
  return st;
}

function latestWaterTemp(app, deviceID) {
  const rows = app.findRecordsByFilter("telemetry", "device = {:d}", "-ts", 20, 0, { d: deviceID });
  for (const row of rows) {
    const data = jsonField(row, "data");
    const wt = data ? num(data[K_WATER]) : null;
    if (wt !== null) {
      return { temp: wt, t: tsMillis(row) };
    }
  }
  return null;
}

function latestFix(app, deviceID) {
  try {
    const rows = app.findRecordsByFilter(
      "location_fixes",
      "device = {:d} && (lat != 0 || lon != 0)",
      "-ts",
      1,
      0,
      { d: deviceID }
    );
    if (rows.length > 0) return { lat: rows[0].getFloat("lat"), lng: rows[0].getFloat("lon") };
  } catch (_) {}
  return null;
}

function rsrp(data) {
  const direct = num(data.rsrp);
  if (direct !== null) return direct;
  const vitals = data[K_VITALS];
  if (vitals && typeof vitals === "object") return num(vitals.rsrp);
  return null;
}

function tsMillis(rec) {
  return Date.parse(rec.getString("ts").replace(" ", "T").replace("Z", "") + "Z");
}

function jsonField(rec, field) {
  try {
    const s = rec.getString(field);
    if (!s) return null;
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  STATION_TAG,
  STATION_VALUE,
  K_WATER,
  K_AIR,
  K_HUM,
  K_PRESS,
  isStation,
  projectStation,
  jsonField,
  num,
  rsrp,
  tsMillis,
};
