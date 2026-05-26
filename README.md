# MMM-PepAtlas

MagicMirror² module — real-time dashboard for:
- **PEP Atlas** (hospital EMR) via read-only mirror API key
- **SafeMed** (doctor platform) via Supabase Edge Function

Refreshes every 30s. No authentication required — uses a static API key.
Boots instantly with no login flow, no 2FA, no token cache.

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/YOUR_USER/MMM-PepAtlas
cd MMM-PepAtlas
npm install node-fetch
```

## config/config.js

```javascript
{
  module: "MMM-PepAtlas",
  position: "top_right",
  config: {
    apiUrl: "https://api.pepatlas.com.br/api/v1",
    mirrorKey: "YOUR_MIRROR_API_KEY",   // from MIRROR_API_KEY in backend .env
    refreshInterval: 30 * 1000,
    showActivityFeed: true,
    maxActivityItems: 5,

    safemed: {
      enabled: true,
      supabaseUrl: "https://kllwasybursqjxgscbdb.supabase.co",
      supabaseKey: "YOUR_SERVICE_ROLE_KEY",
    },
  },
},
```

## What it shows

### PEP Atlas (6 cards + activity feed)
| Card | Source |
|---|---|
| Hospitais ativos | activeHospitals |
| Leitos ocupados/total | occupiedBeds / totalBeds |
| Usuários online agora | activeUsersNow (sessions last 15 min) |
| Tickets abertos | openTickets |
| Taxa de ocupação | occupancyRate % |

Activity feed: last 5 audit log events with color coding by action type.
No patient names, IDs or clinical content — LGPD compliant for semi-public display.

### SafeMed (6 cards)
| Card | Source |
|---|---|
| Médicos ativos | totalDoctors |
| Online agora | onlineNow |
| Faturamento bruto (mês) | grossRevenueThisMonth |
| Faturamento bruto (total) | grossRevenueAllTime |
| Atividades (mês) | totalActivitiesThisMonth |
| Atividades (total) | totalActivitiesAllTime |

## Auth model

The mirror endpoint (`GET /api/v1/mirror/dashboard`) is a `@Public()` route
protected only by the `X-Mirror-Key` header. No JWT, no session, no 2FA.

Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to backend `.env`:
```
MIRROR_API_KEY=<generated-value>
```

Add to MagicMirror `config.js`:
```
mirrorKey: "<generated-value>"
```

## .gitignore
```
node_modules/
```
