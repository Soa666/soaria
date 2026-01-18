# Deployment-Anleitung für Soaria

Diese Anleitung zeigt, wie du das Spiel auf deinem Server deployen kannst, sodass es immer läuft.

## Voraussetzungen

- Node.js (v18 oder höher)
- npm
- PM2 (Process Manager) - wird installiert
- Optional: Nginx (für Reverse Proxy)

## Schritt 1: Projekt auf den Server kopieren

```bash
# Auf deinem lokalen Rechner
cd /mnt/daten/Cursor/Spiel
# Projekt als ZIP packen oder mit git/rsync auf Server kopieren
```

## Schritt 2: Auf dem Server - Dependencies installieren

```bash
# Zum Projektverzeichnis wechseln
cd /path/to/Spiel

# Alle Dependencies installieren
npm run install:all
```

## Schritt 3: Environment-Variablen konfigurieren

```bash
# Backend .env Datei erstellen
cd backend
cp .env.example .env
nano .env  # oder dein bevorzugter Editor
```

Wichtige Variablen in `.env`:
```env
# JWT Secret (WICHTIG: Ändere das in Produktion!)
JWT_SECRET=dein-super-sicheres-secret-key-hier-min-32-zeichen

# Frontend URL (deine Domain)
FRONTEND_URL=https://deine-domain.de
# oder http://deine-ip:3000 für Entwicklung

# SMTP E-Mail Konfiguration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine-email@gmail.com
SMTP_PASS=dein-app-passwort

# Port (optional, Standard: 3001)
PORT=3001
```

## Schritt 4: Frontend für Produktion builden

```bash
cd frontend
npm run build
```

Das erstellt einen `dist` Ordner mit den optimierten Dateien.

## Schritt 5: PM2 installieren und konfigurieren

```bash
# PM2 global installieren
npm install -g pm2

# PM2 Startup Script erstellen (lädt PM2 beim Systemstart)
pm2 startup
# Folge den Anweisungen (kopiere den ausgegebenen Befehl)
```

## Schritt 6: PM2 Konfigurationsdatei erstellen

Erstelle `ecosystem.config.js` im Hauptverzeichnis:

```javascript
module.exports = {
  apps: [
    {
      name: 'soaria-backend',
      script: './backend/server.js',
      cwd: '/path/to/Spiel',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'soaria-frontend',
      script: 'npm',
      args: 'run preview',
      cwd: '/path/to/Spiel/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false
    }
  ]
};
```

**WICHTIG:** Ersetze `/path/to/Spiel` mit dem tatsächlichen Pfad auf deinem Server!

## Schritt 7: Logs-Verzeichnis erstellen

```bash
mkdir -p logs
```

## Schritt 8: PM2 starten

```bash
# Apps starten
pm2 start ecosystem.config.js

# Apps beim Systemstart laden
pm2 save

# Status prüfen
pm2 status

# Logs ansehen
pm2 logs
```

## Schritt 9: Nginx Reverse Proxy (Optional, aber empfohlen)

Erstelle `/etc/nginx/sites-available/soaria`:

```nginx
server {
    listen 80;
    server_name deine-domain.de;  # oder deine IP

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Statische Dateien (Items, Chars)
    location /items {
        alias /path/to/Spiel/items;
    }
    
    location /chars {
        alias /path/to/Spiel/chars;
    }
}
```

Aktiviere die Site:
```bash
sudo ln -s /etc/nginx/sites-available/soaria /etc/nginx/sites-enabled/
sudo nginx -t  # Konfiguration testen
sudo systemctl reload nginx
```

## Schritt 10: Firewall konfigurieren

```bash
# Falls ufw verwendet wird
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Port 3000 und 3001 nur lokal (nicht öffentlich)
```

## Nützliche PM2 Befehle

```bash
# Status anzeigen
pm2 status

# Logs ansehen
pm2 logs
pm2 logs soaria-backend
pm2 logs soaria-frontend

# App neu starten
pm2 restart soaria-backend
pm2 restart soaria-frontend
pm2 restart all

# App stoppen
pm2 stop soaria-backend

# App löschen
pm2 delete soaria-backend

# Monitoring
pm2 monit
```

## Updates durchführen

```bash
# 1. Code aktualisieren (git pull, rsync, etc.)
cd /path/to/Spiel

# 2. Dependencies aktualisieren
npm run install:all

# 3. Frontend neu builden
cd frontend
npm run build

# 4. Backend neu starten
pm2 restart soaria-backend
pm2 restart soaria-frontend
```

## Troubleshooting

### Server startet nicht
```bash
# Logs prüfen
pm2 logs soaria-backend --lines 50
tail -f logs/backend-error.log
```

### Port bereits belegt
```bash
# Prüfen welcher Prozess Port belegt
lsof -i :3001
lsof -i :3000

# Prozess beenden
kill <PID>
```

### Datenbank-Probleme
```bash
# Datenbank prüfen
cd backend
sqlite3 spiel.db ".tables"
```

## Sicherheit

1. **JWT_SECRET:** Verwende einen starken, zufälligen Secret-Key (mindestens 32 Zeichen)
2. **HTTPS:** Verwende SSL/TLS in Produktion (Let's Encrypt)
3. **Firewall:** Beschränke Zugriff auf notwendige Ports
4. **Backups:** Regelmäßige Backups der Datenbank (`spiel.db`)

## Backup der Datenbank

```bash
# Backup erstellen
cp backend/spiel.db backend/spiel.db.backup.$(date +%Y%m%d_%H%M%S)

# Automatisches Backup (cron)
# Füge zu crontab hinzu:
0 2 * * * cp /path/to/Spiel/backend/spiel.db /path/to/backups/spiel.db.$(date +\%Y\%m\%d)
```
