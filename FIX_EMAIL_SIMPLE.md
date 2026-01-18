# E-Mail-Problem - Einfache Lösung

## Problem
Die .env wird geladen, aber SMTP-Variablen werden nicht erkannt.

## Lösung: Variablen direkt in ecosystem.config.js eintragen

Statt die .env zu laden, trage die Werte direkt ein:

```bash
cd ~/Soaria
nano ecosystem.config.js
```

Ändere die `env` Sektion für `soaria-backend` zu:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3001,
  JWT_SECRET: 'DEIN-GEHEIMER-JWT-SECRET-HIER-EINTRAGEN',
  FRONTEND_URL: 'https://soaria.soa666.de',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_USER: 'DEINE-EMAIL@gmail.com',
  SMTP_PASS: 'DEIN-APP-PASSWORT'
},
```

⚠️ **Wichtig:** Diese Datei sollte nicht öffentlich zugänglich sein!

Dann:
```bash
pm2 delete soaria-backend
pm2 start ecosystem.config.js --only soaria-backend
pm2 logs soaria-backend --lines 5
```

Die SMTP-Warnung sollte jetzt weg sein!
