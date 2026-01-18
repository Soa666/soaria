# Build-Fehler beheben

Falls `npm run build` einen Fehler wirft, führe diese Schritte aus:

## Lösung: node_modules löschen und neu installieren

```bash
cd ~/Soaria/frontend

# Alte node_modules löschen
rm -rf node_modules package-lock.json

# Neu installieren
npm install

# Jetzt builden
npm run build
```

## Falls das nicht hilft: Cache löschen

```bash
cd ~/Soaria/frontend

# Alles löschen
rm -rf node_modules package-lock.json .vite

# npm Cache löschen (optional)
npm cache clean --force

# Neu installieren
npm install

# Builden
npm run build
```

## Alternative: Mit --force

```bash
cd ~/Soaria/frontend
npm install --force
npm run build
```
