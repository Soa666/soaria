# Schnell-Deployment Anleitung

## Kurzfassung - So startest du das Spiel auf deinem Server

### 1. Projekt auf Server kopieren
```bash
# Auf Server
cd /opt  # oder wo du es haben willst
# Projekt hierher kopieren (git clone, rsync, scp, etc.)
```

### 2. Dependencies installieren
```bash
cd /opt/Spiel  # oder dein Pfad
npm run install:all
```

### 3. Environment konfigurieren
```bash
cd backend
cp .env.example .env  # Falls vorhanden, sonst erstelle .env
nano .env
```

Wichtigste Einstellungen:
```env
JWT_SECRET=dein-super-sicheres-secret-min-32-zeichen
FRONTEND_URL=http://deine-server-ip:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine-email@gmail.com
SMTP_PASS=dein-app-passwort
```

### 4. Frontend builden
```bash
cd frontend
npm run build
```

### 5. PM2 installieren und starten
```bash
# PM2 global installieren
npm install -g pm2

# Logs-Verzeichnis erstellen
mkdir -p logs

# Apps starten
pm2 start ecosystem.config.js

# Beim Systemstart laden
pm2 save
pm2 startup  # Folge den Anweisungen
```

### 6. Fertig! 🎉

Das Spiel läuft jetzt auf:
- Frontend: http://deine-server-ip:3000
- Backend: http://deine-server-ip:3001

### Nützliche Befehle

```bash
# Status prüfen
pm2 status

# Logs ansehen
pm2 logs

# Neu starten
pm2 restart all

# Stoppen
pm2 stop all
```

### Optional: Nginx Reverse Proxy

Für eine Domain und HTTPS, siehe `DEPLOYMENT.md` für vollständige Nginx-Konfiguration.
