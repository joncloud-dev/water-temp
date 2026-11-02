/// <reference path="../pb_data/types.d.ts" />
/// <reference path="../types/iot.d.ts" />
//
// Seeds the water-temperature device profile as a JS migration, so the product
// is reproducible from source control without hand-editing the admin UI. This
// runs on the closed binary via the jsvm migrations dir — no Go changes.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("device_profiles");
    const rec = new Record(col);
    rec.set("name", "water-temp");
    rec.set("platform", "nordic-nrf91");
    rec.set("metrics", [
      { key: "11", name: "air_temp", label: "Air temperature", unit: "\u00b0C" },
      { key: "12", name: "humidity", label: "Humidity", unit: "%" },
      { key: "13", name: "pressure", label: "Pressure", unit: "hPa" },
      { key: "15", name: "water_temp", label: "Water temperature", unit: "\u00b0C" },
    ]);
    rec.set("public_view", { slug: "stations", tag: "station_type", value: "water_temp" });
    app.save(rec);
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter("device_profiles", "name = 'water-temp'");
      app.delete(rec);
    } catch (_) {}
  }
);
