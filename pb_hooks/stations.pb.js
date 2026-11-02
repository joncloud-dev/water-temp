/// <reference path="../pb_data/types.d.ts" />
/// <reference path="../types/iot.d.ts" />
//
// Water-temperature station product, built entirely on the extension layer:
// this pb_hooks script adds the two public HTTP endpoints the static station
// page consumes, reading the locked collections server-side. Together with the
// water-temp device_profiles record (profile.json) and the static page in
// pb_public/, it reproduces the former hardcoded stationapi with ZERO changes to
// the closed Go binary — the acceptance test for "is the platform actually
// generic".
//
// The generic core also serves the same data at /api/public/stations (driven by
// the profile's public_view); this script shows how a product can instead shape
// its own bespoke endpoints in JS when it wants a custom response contract.
//
// Each handler runs in an isolated runtime, so the shared projection helpers are
// require()d inside the handler rather than referenced from this file's scope.

// GET /api/stations — every water-temperature station with its latest sample.
routerAdd("GET", "/api/stations", (e) => {
  const lib = require(`${__hooks}/stations_lib.js`);
  const out = [];
  for (const dev of e.app.findAllRecords("devices")) {
    const tags = lib.jsonField(dev, "tags");
    if (!lib.isStation(tags)) continue;
    out.push(lib.projectStation(e.app, dev, tags));
  }
  out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return e.json(200, { stations: out });
});

// GET /api/stations/{id}/readings?hours=24 — one station's water-temp series.
routerAdd("GET", "/api/stations/{id}/readings", (e) => {
  const lib = require(`${__hooks}/stations_lib.js`);
  const id = e.request.pathValue("id");
  let dev;
  try {
    dev = e.app.findRecordById("devices", id);
  } catch (_) {
    return e.notFoundError("station not found", null);
  }
  const tags = lib.jsonField(dev, "tags");
  if (!lib.isStation(tags)) {
    return e.notFoundError("station not found", null);
  }

  let hours = parseInt(e.request.url.query().get("hours"), 10);
  if (!Number.isFinite(hours) || hours <= 0) hours = 24;
  if (hours > 720) hours = 720;
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString().replace("T", " ");

  const rows = e.app.findRecordsByFilter(
    "telemetry",
    "device = {:d} && ts >= {:c}",
    "ts",
    5000,
    0,
    { d: id, c: cutoff }
  );

  const readings = [];
  for (const row of rows) {
    const data = lib.jsonField(row, "data");
    if (!data) continue;
    const wt = lib.num(data[lib.K_WATER]);
    if (wt === null) continue;
    readings.push({
      t: lib.tsMillis(row),
      water_temp: wt,
      air_temp: lib.num(data[lib.K_AIR]),
      humidity: lib.num(data[lib.K_HUM]),
      pressure: lib.num(data[lib.K_PRESS]),
      rsrp: lib.rsrp(data),
    });
  }
  return e.json(200, { station: lib.projectStation(e.app, dev, tags), readings });
});
