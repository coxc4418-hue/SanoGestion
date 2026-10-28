#!/bin/bash
# Reinicia los emuladores limpios, crea 3 sedes de prueba y corre la prueba indicada (por defecto e2e-full.mjs)
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$ROOT/scripts/tests/emu.log"
for pid in $(netstat -ano | grep -E "127.0.0.1:(8080|9099|5055) .*LISTEN" | awk '{print $5}' | sort -u); do taskkill //PID $pid //F //T >/dev/null 2>&1; done
sleep 2
cd "$ROOT" && (firebase emulators:start --only auth,firestore,hosting --project sano-gestion > "$LOG" 2>&1 &)
for i in $(seq 1 90); do grep -q "All emulators ready" "$LOG" 2>/dev/null && break; sleep 1; done
rm -f "$ROOT/scripts/.accounts-emu.json"
cd "$ROOT/scripts" && node provision.mjs 3 --emu > /dev/null 2>&1
node "tests/${1:-e2e-full.mjs}"
CODE=$?
rm -f "$ROOT/CREDENCIALES_EMULADOR.txt"
exit $CODE
