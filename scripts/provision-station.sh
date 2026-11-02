#!/bin/sh
# Provision a water-temperature station on an oscore-server instance:
#   1. mint the device + a fresh OSCORE context (POST /api/provision),
#   2. attach the "water-temp" device profile,
#   3. tag it into the public station view (name, position, depth),
# then print the shell command that loads the material on the device.
#
# Usage:
#   OSCORE_URL=http://localhost:8090 OSCORE_EMAIL=you@example.com OSCORE_PASSWORD=... \
#     ./scripts/provision-station.sh <hw_id> <name> <lat> <lng> [depth_m] [tn|ntn]
#
# OSCORE_TOKEN (a superuser auth token) can be used instead of email/password.
# Re-running for an existing hw_id ROTATES its OSCORE keys: the device must then
# be re-provisioned too.
#
# Requires curl and jq.
set -eu

if [ $# -lt 4 ]; then
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

HW_ID=$1
NAME=$2
LAT=$3
LNG=$4
DEPTH=${5:-}
TRANSPORT=${6:-tn}
URL=${OSCORE_URL:-http://localhost:8090}
URL=${URL%/}

command -v jq >/dev/null || { echo "provision-station: jq is required" >&2; exit 1; }

api() { # api <method> <path> [json-body]
  if [ $# -ge 3 ]; then
    curl -fsS -X "$1" "$URL$2" -H "Authorization: $TOKEN" -H 'Content-Type: application/json' -d "$3"
  else
    curl -fsS -X "$1" "$URL$2" -H "Authorization: $TOKEN"
  fi
}

TOKEN=${OSCORE_TOKEN:-}
if [ -z "$TOKEN" ]; then
  : "${OSCORE_EMAIL:?set OSCORE_EMAIL and OSCORE_PASSWORD, or OSCORE_TOKEN}"
  : "${OSCORE_PASSWORD:?set OSCORE_PASSWORD}"
  TOKEN=$(curl -fsS -X POST "$URL/api/collections/_superusers/auth-with-password" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg i "$OSCORE_EMAIL" --arg p "$OSCORE_PASSWORD" '{identity:$i,password:$p}')" | jq -r .token)
fi

# 1. Device + OSCORE material.
MATERIAL=$(api POST /api/provision "$(jq -nc --arg h "$HW_ID" --arg t "$TRANSPORT" '{hw_id:$h,transport:$t}')")

# 2. The water-temp profile (seeded by pb_migrations on first start).
PROFILE_ID=$(api GET "/api/collections/device_profiles/records?filter=$(jq -rn --arg f "name='water-temp'" '$f|@uri')&perPage=1" | jq -r '.items[0].id // empty')
[ -n "$PROFILE_ID" ] || { echo "provision-station: no 'water-temp' device profile; is pb_migrations mounted?" >&2; exit 1; }

# 3. Attach profile + station tags.
DEVICE_ID=$(api GET "/api/collections/devices/records?filter=$(jq -rn --arg f "hw_id='$HW_ID'" '$f|@uri')&perPage=1" | jq -r '.items[0].id')
TAGS=$(jq -nc --arg n "$NAME" --arg lat "$LAT" --arg lng "$LNG" --arg d "$DEPTH" \
  '{station_type:"water_temp", name:$n, lat:($lat|tonumber), lng:($lng|tonumber)}
   + (if $d == "" then {} else {depth:($d|tonumber)} end)')
api PATCH "/api/collections/devices/records/$DEVICE_ID" \
  "$(jq -nc --arg p "$PROFILE_ID" --argjson t "$TAGS" '{profile:$p, tags:$t}')" >/dev/null

echo "Provisioned station '$NAME' ($HW_ID, device $DEVICE_ID)."
echo
echo "Load it on the device's shell, then reboot it:"
echo "$MATERIAL" | jq -r '"  oscore provision \(.master_secret) \(.master_salt) \(.recipient_id) \(.sender_id)"'
echo
echo "This prints the master secret: clear your terminal scrollback afterwards."
