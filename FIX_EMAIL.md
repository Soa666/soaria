# E-Mail-Problem beheben

## Problem
Keine E-Mails kommen an bei Registrierung.

## Ursache
Die `.env` Datei wird nicht von PM2 geladen. Die SMTP-Variablen sind nicht verfügbar.

## Lösung 1: ecosystem.config.js aktualisieren (empfohlen)

Die `ecosystem.config.js` wurde aktualisiert, um die .env-Datei zu laden. 

**Auf deinem Server:**

1. `ecosystem.config.js` aktualisieren:
```bash
cd ~/Soaria
nano ecosystem.config.js
```

Die Datei sollte so beginnen:
```javascript
require('dotenv').config({ path: './backend/.env' });

module.exports = {
  apps: [
    {
      name: 'soaria-backend',
      script: './backend/server.js',
      cwd: process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        JWT_SECRET: process.env.JWT_SECRET,
        FRONTEND_URL: process.env.FRONTEND_URL,
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS
      },
      // ... rest bleibt gleich
```

2. Backend neu starten:
```bash
cd ~/Soaria
pm2 delete soaria-backend
pm2 start ecosystem.config.js --only soaria-backend
```

3. Prüfen ob SMTP geladen wurde:
```bash
pm2 logs soaria-backend --lines 10
```

**Die SMTP-Warnung sollte jetzt weg sein!**

## Lösung 2: Variablen direkt eintragen (falls Lösung 1 nicht funktioniert)

Falls die .env nicht geladen wird, kannst du die Werte direkt in `ecosystem.config.js` eintragen:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3001,
  JWT_SECRET: 'Soa95449939-soantos95449939-soa9544-',
  FRONTEND_URL: 'https://soaria.soa666.de',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'd.rudolph83@gmail.com',
  SMTP_PASS: 'gsaboelxgbuctrbs'
},
```

⚠️ **Sicherheit:** Diese Datei sollte nicht öffentlich zugänglich sein!

## Lösung 3: Manuell .env testen

Teste ob die .env-Datei korrekt ist:

```bash
cd ~/Soaria/backend
node -e "require('dotenv').config(); console.log('SMTP_USER:', process.env.SMTP_USER); console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');"
```

Falls "NOT SET" ausgegeben wird, prüfe die .env-Datei:
```bash
cat .env | grep SMTP
```

## E-Mail testen

Nach dem Neustart versuche eine neue Registrierung. Die E-Mail sollte jetzt ankommen.

**Prüfe auch:**
- Spam-Ordner
- Gmail-Sicherheitseinstellungen (2-Faktor-Auth aktiviert? App-Passwort verwendet?)
- Backend-Logs für E-Mail-Fehler
