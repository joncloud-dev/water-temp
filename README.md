# water-temp

A water-temperature monitoring product: cellular stations (nRF91, LTE-M /
NB-IoT) report water and air temperature, humidity and pressure. A public page
shows them on a map with charts.

The whole product is **extension files only**, running on the released
[oscore-server](https://github.com/joncloud-dev/oscore-server) image without
changes. There is no server source here and nothing to compile:

```
pb_migrations/1719000000_water_temp_profile.js   # seeds the "water-temp" device profile
pb_hooks/stations.pb.js                          # GET /api/stations[...] in JS
pb_hooks/stations_lib.js                         # shared projection helpers (require()d)
pb_public/index.html                             # the public station map + charts, served at /
profile.json                                     # the profile record, for reference
scripts/provision-station.sh                     # add a station in one command
docker-compose.yml                               # pinned server image + these folders mounted
types/iot.d.ts                                   # $iot declarations for editor autocomplete
```

## Run it

```sh
cp .env.example .env
# edit .env: set PB_OSCORE_KEK=$(openssl rand -hex 32) and pick OSCORE_SERVER_VERSION
docker compose up -d
docker compose exec oscore-server \
  oscore-server superuser upsert you@example.com 'a-strong-password' --dir=/pb_data
```

- Public station page: <http://localhost:8090/>
- Admin UI: <http://localhost:8090/_/>
- Stations connect over OSCORE to UDP `5683` on this host

The migration seeds the `water-temp` profile on first start.

**Keep `PB_OSCORE_KEK` and the `pb_data` volume safe.** The KEK wraps every
station's OSCORE master secret, and `pb_data` holds the replay and sequence state.
If you lose either one, every station has to be re-provisioned.

## Add a station

```sh
OSCORE_URL=http://localhost:8090 OSCORE_EMAIL=you@example.com OSCORE_PASSWORD='a-strong-password' \
  ./scripts/provision-station.sh pier-7 "Pier 7" 59.9075 10.7265 1.5
```

That mints the station's OSCORE context, attaches the `water-temp` profile and
tags it into the public view (`station_type=water_temp`, name, lat/lng, depth).
It then prints the `oscore provision …` command to run once on the station's
shell before rebooting it. The firmware must point at this host's public IP
(`CONFIG_OSCORE_SERVER_IP`).

## Metric keys

The station firmware sends these CBOR keys in its `POST /t` telemetry:

| CBOR key | metric      | unit |
|----------|-------------|------|
| `11`     | air_temp    | °C   |
| `12`     | humidity    | %    |
| `13`     | pressure    | hPa  |
| `15`     | water_temp  | °C   |

The keys are declared in the profile's `metrics` registry. To change them,
edit the profile (a new migration, or the admin UI). No code change is needed.

## Develop

Hook files reload when the server restarts (`docker compose restart`), or live
when you run the binary with `PB_HOOKS_WATCH=1`. To run without Docker, take the
`tar.gz` for your platform from the
[releases](https://github.com/joncloud-dev/oscore-server/releases):

```sh
PB_OSCORE_KEK=... PB_HOOKS_DIR=./pb_hooks PB_JS_MIGRATIONS_DIR=./pb_migrations \
PB_PUBLIC_DIR=./pb_public ./oscore-server serve --dir=./pb_data
```

The server then writes `pb_data/types.d.ts`, which the hook files reference for
PocketBase autocomplete.

The page reads `/api/stations` and `/api/stations/{id}/readings?hours=24`.
The server also serves the same data at `/api/public/stations`, straight from
the profile's `public_view`. A simpler product can use that and skip
`pb_hooks/` entirely.

## Upgrading the server

Change `OSCORE_SERVER_VERSION` in `.env`, then run
`docker compose pull && docker compose up -d`. Back up the `pb_data` volume
first. Server migrations run on start.

## License

MIT, see [LICENSE](LICENSE). The oscore-server binary and image it runs on are
free to use under their own
[Binary License](https://github.com/joncloud-dev/oscore-server/blob/main/LICENSE-BINARY.txt).
