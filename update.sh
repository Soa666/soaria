#!/bin/bash

# Soaria Update Script
# Verwendung: ./update.sh

echo "🔄 Soaria Update wird gestartet..."

cd ~

# PM2 stoppen
echo "⏸️  Server wird gestoppt..."
pm2 stop all

# Alten Code löschen (aber nicht das Backup!)
echo "🗑️  Alter Code wird entfernt..."
rm -rf Soaria
rm -f main.zip

# Neuen Code herunterladen
echo "📥 Neuer Code wird heruntergeladen..."
wget -q https://github.com/Soa666/soaria/archive/refs/heads/main.zip

if [ ! -f main.zip ]; then
    echo "❌ Download fehlgeschlagen!"
    pm2 start all
    exit 1
fi

# Entpacken
echo "📦 Code wird entpackt..."
unzip -q main.zip
mv soaria-main Soaria

# Backup-Dateien zurückkopieren
echo "📋 Konfiguration wird wiederhergestellt..."
cp Soaria_backup/backend/.env Soaria/backend/
cp Soaria_backup/backend/*.db Soaria/backend/ 2>/dev/null

# Dependencies installieren
echo "📚 Backend Dependencies..."
cd ~/Soaria/backend && npm install --silent

echo "📚 Frontend Dependencies..."
cd ~/Soaria/frontend && npm install --silent

# Frontend bauen
echo "🔨 Frontend wird gebaut..."
npm run build

# Zurück zum Hauptverzeichnis
cd ~/Soaria

# Server starten
echo "🚀 Server wird gestartet..."
pm2 start ecosystem.config.js

# Aufräumen
rm -f ~/main.zip

echo ""
echo "✅ Update abgeschlossen!"
echo ""
pm2 status
