# MMM-PepAtlas

MagicMirror² module — real-time dashboard for:
- **PEP Atlas** (hospital EMR) via REST API + auto token refresh
- **SafeMed** (doctor platform) via Supabase PostgREST

Refreshes every 30s. Runs 24/7 without manual intervention.

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
    // PEP Atlas
    apiUrl: "https://api.pepatlas.com.br/api/v1",
    email: "your-admin@hospital.com",
    password: "your-password",
    refreshInterval: 30 * 1000,
    showActivityFeed: true,
    maxActivityItems: 5,

    // SafeMed
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
| Hospitais ativos | /admin/dashboard → activeHospitals |
| Leitos ocupados/total | occupiedBeds / totalBeds |
| Usuários online agora | activeUsersNow (sessions last 15min) |
| Logins hoje | usersLoggedInEver |
| Tickets abertos | openTickets |
| Taxa de ocupação | occupancyRate % |

Activity feed: last 5 audit log events with color coding.

### SafeMed (4 cards)
| Card | Source |
|---|---|
| Médicos ativos | profiles WHERE role=medico AND status=true |
| Online agora | security_audit_log unique users last 15min |
| Faturamento bruto | faturamento.valor_bruto current month |
| Faturamento líquido | faturamento.valor_liquido current month |

## Token refresh (PEP Atlas)
- Tokens cached in `.token-cache.json` (gitignored)
- Auto-refresh 30s before expiry using refreshToken
- Falls back to full login if refresh fails
- 401 responses trigger immediate re-auth

## .gitignore
```
.token-cache.json
node_modules/
```
