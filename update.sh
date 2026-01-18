#!/bin/bash

# Soaria Update Script
# Verwendung: ./update.sh

echo "🔄 Soaria Update wird gestartet..."

cd ~

# Konfigurations-Backup Ordner erstellen (falls nicht vorhanden)
mkdir -p ~/soaria_config

# Aktuelle Konfiguration sichern (falls vorhanden)
if [ -f ~/Soaria/backend/.env ]; then
    echo "💾 Aktuelle .env wird gesichert..."
    cp ~/Soaria/backend/.env ~/soaria_config/.env
fi

if [ -f ~/Soaria/backend/game.db ]; then
    echo "💾 Aktuelle Datenbank wird gesichert..."
    cp ~/Soaria/backend/game.db ~/soaria_config/game.db
fi

# PM2 stoppen
echo "⏸️  Server wird gestoppt..."
pm2 stop all

# Alten Code löschen
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

# Konfiguration wiederherstellen
echo "📋 Konfiguration wird wiederhergestellt..."
if [ -f ~/soaria_config/.env ]; then
    cp ~/soaria_config/.env ~/Soaria/backend/.env
    echo "   ✓ .env wiederhergestellt"
else
    echo "   ⚠️  Keine .env gefunden - bitte manuell erstellen!"
fi

if [ -f ~/soaria_config/game.db ]; then
    cp ~/soaria_config/game.db ~/Soaria/backend/game.db
    echo "   ✓ Datenbank wiederhergestellt"
fi

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
