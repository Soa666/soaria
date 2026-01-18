# Soaria - Fantasy RPG

Ein webbasiertes Fantasy-RPG-Spiel mit Ressourcen-Sammeln, Crafting, Gebäude-Bau und mehr. - Webbasiertes Ressourcen-Sammel- und Crafting-Spiel

Ein vollständiges webbasiertes Spiel mit User-Accounts, Rollensystem, Ressourcen-Sammeln und Crafting-System.

## Features

- ✅ **User-Accounts**: Login, Register, Profil
- ✅ **Rollen-System**: Admin, Mod, VIP, User
- ✅ **Ressourcen-Sammeln**: Holz, Lehm, Steine, Wasser, Feuerstein, etc.
- ✅ **Erweiterbares Item-System**: Einfach neue Items hinzufügen
- ✅ **Crafting-System**: Rezepte mit Zutaten
- ✅ **Werkbank**: Upgradbar mit Items

## Installation

1. Alle Dependencies installieren:
```bash
npm run install:all
```

2. Backend starten:
```bash
npm run dev:backend
```

3. Frontend starten (in einem neuen Terminal):
```bash
npm run dev:frontend
```

Oder beide gleichzeitig:
```bash
npm run dev
```

## Projektstruktur

```
Spiel/
├── backend/
│   ├── database.js          # Datenbank-Schema und Initialisierung
│   ├── server.js            # Express Server
│   ├── middleware/
│   │   └── auth.js          # JWT Authentifizierung
│   └── routes/
│       ├── auth.js          # Login, Register, Profil
│       ├── items.js         # Item-Verwaltung
│       ├── inventory.js     # Inventar & Ressourcen sammeln
│       ├── crafting.js      # Crafting-System
│       └── workbench.js     # Werkbank-Upgrades
├── frontend/
│   └── src/
│       ├── components/      # React Komponenten
│       ├── pages/          # Seiten (Login, Dashboard, etc.)
│       ├── context/        # Auth Context
│       └── services/       # API Client
└── package.json
```

## API Endpoints

### Authentifizierung
- `POST /api/auth/register` - Registrierung
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Profil abrufen

### Items
- `GET /api/items` - Alle Items
- `GET /api/items/:id` - Item nach ID
- `POST /api/items` - Neues Item (Admin/Mod)

### Inventar
- `GET /api/inventory` - Inventar abrufen
- `POST /api/inventory/collect` - Ressource sammeln

### Crafting
- `GET /api/crafting/recipes` - Alle Rezepte
- `POST /api/crafting/craft` - Item craften

### Werkbank
- `GET /api/workbench` - Werkbank-Status
- `POST /api/workbench/upgrade` - Werkbank upgraden

## Datenbank

Das Projekt verwendet SQLite. Die Datenbank wird automatisch beim ersten Start erstellt.

### Standard-Items
- Ressourcen: Holz, Lehm, Stein, Wasser, Feuerstein, Ast
- Materialien: Eisenbarren
- Tools: Spitzhacke (Basis), Spitzhacke (Eisen)

### Standard-Rezepte
- Spitzhacke (Basis): 2x Ast + 3x Stein
- Spitzhacke (Eisen): 2x Ast + 3x Eisenbarren (Werkbank Level 1)

## Erweiterungen

Das System ist darauf ausgelegt, einfach erweitert zu werden:

1. **Neue Items hinzufügen**: Über die API oder direkt in der Datenbank
2. **Neue Rezepte erstellen**: Über die API (Admin/Mod) oder direkt in der Datenbank
3. **Neue Ressourcen-Typen**: Einfach neue Items mit `type: 'resource'` hinzufügen

## Entwicklung

- Backend läuft auf: http://localhost:3001
- Frontend läuft auf: http://localhost:3000

Viel Spaß beim Spielen! 🎮
