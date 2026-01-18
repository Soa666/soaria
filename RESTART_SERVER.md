# Server neu starten

## Option 1: Backend-Server einzeln neu starten

```bash
# 1. Zum Backend-Verzeichnis wechseln
cd /mnt/daten/Cursor/Spiel/backend

# 2. Den laufenden Server beenden (falls er läuft)
# Im Terminal Strg+C drücken, oder:
sudo kill 1643  # (PID kann sich ändern, prüfe mit: ps aux | grep "node.*server")

# 3. Server neu starten
npm run dev
# oder
node server.js
```

## Option 2: Beide Server (Backend + Frontend) zusammen starten

```bash
# Im Hauptverzeichnis
cd /mnt/daten/Cursor/Spiel

# Beide Server starten
npm run dev
```

## Option 3: Nur Backend mit Auto-Reload (empfohlen für Entwicklung)

```bash
cd /mnt/daten/Cursor/Spiel/backend
npm run dev
```

Dies startet den Server mit `--watch` Flag, der automatisch neu lädt, wenn Dateien geändert werden.

## Aktueller Server-Prozess finden

```bash
ps aux | grep "node.*server" | grep -v grep
```

## Server beenden

```bash
# Wenn der Server im Terminal läuft: Strg+C
# Wenn der Server im Hintergrund läuft:
sudo kill <PID>
# z.B. sudo kill 1643
```
