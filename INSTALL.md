# Installation auf dem Server

Falls `npm run install:all` nicht funktioniert, führe diese Befehle manuell aus:

## Option 1: Manuelle Installation (empfohlen)

```bash
# Im Hauptverzeichnis
cd ~/Soaria

# Backend Dependencies installieren
cd backend
npm install
cd ..

# Frontend Dependencies installieren
cd frontend
npm install
cd ..

# Root Dependencies installieren (falls vorhanden)
npm install
```

## Option 2: Script erstellen

Falls du das Script verwenden möchtest, füge es zur `package.json` im Hauptverzeichnis hinzu:

```json
{
  "scripts": {
    "install:all": "npm install && cd backend && npm install && cd ../frontend && npm install"
  }
}
```

Dann kannst du `npm run install:all` verwenden.

## Schnell-Check

```bash
# Prüfe ob alle node_modules vorhanden sind
ls -d backend/node_modules frontend/node_modules

# Falls nicht, installiere sie:
cd backend && npm install
cd ../frontend && npm install
```
