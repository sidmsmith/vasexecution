# VAS Execution

Warehouse UI for looking up and completing **assigned VAS services** on an **oLPN**.

Folder: `Web/vasexecution` (sibling of Inspection). **Do not mix changes into Inspection.**

## Features

1. ORG auth (Manhattan Bearer + `selectedOrganization` / `selectedLocation`)
2. Enter oLPN → **Load oLPN** (only when the id is in the search result set)
3. Assigned services + steps (oLPN UOM first, then ITEM; item image hover)
4. **Complete Selected** / **Complete All** → `performVas` (top-level `OlpnId`)
5. **VAS Execution Config** — per VAS Type (`ProvidedServiceId`) and Item overlays: instructions, images, signature, misc photos, markup pad
6. **Admin** — [/admin.html](./admin.html) editor with desktop/mobile preview and Save & Deploy

### API

| Route | Purpose |
|---|---|
| `POST /api/auth` | ORG → Manhattan token |
| `POST /api/session` | Soft session / remembered ORG |
| `POST /api/search_olpn_vas` | oLPN search + requestor ID resolution |
| `POST /api/assigned_services` | Assigned services (sorted, item enrich) |
| `POST /api/perform_vas` | Complete selected steps + refresh |
| `POST /api/provided_services` | VAS Type catalog (`ServiceTypeId='VAS'`) |
| `POST /api/save_vas_config` | Commit `config/orgs/{ORG}.json` via GitHub |

Reference script: `olpn_vas_sequential.py`.

### Local run

```bash
# Preferred: paste a Manhattan bearer token into project-root .token (gitignored).
# Sign in with ORG skips OAuth when .token exists.
# Optional fallback: MANHATTAN_PASSWORD + MANHATTAN_SECRET in .env

cp .env.example .env   # only needed if you want OAuth fallback
npm install
# Terminal A — Flask API (5001; avoids other Web apps on 5000)
python api/index.py
# Terminal B — static + proxy
npm start              # http://localhost:3000  (admin: /admin.html)
```

Config files are served from `/config/` (`vas.default.json`, optional `orgs/{ORG}.json`).

### Deploy

Separate GitHub repo / Vercel project (like Inspection). Env vars:

- `MANHATTAN_PASSWORD`, `MANHATTAN_SECRET` (OAuth fallback)
- `GITHUB_TOKEN` — required for Admin **Save & Deploy**
- `GITHUB_REPO` (default `sidmsmith/vasexecution`), `GITHUB_REF` (default `main`)

Do not deploy `.token`.

Git remote: `https://github.com/sidmsmith/vasexecution` on `main`.

### URL parameters (case-insensitive)

| Param | Also accepted | Behavior |
|---|---|---|
| `org` | `organization` | Auto-authenticate |
| `olpn` | `OLPN`, `oLPN`, `olpnId`, `olpn_id` | Prefill + auto-load after auth |
| `theme` | — | Apply theme key, or `theme=N` to hide theme gear |

Example: `/?org=SS-DEMO&olpn=0000099999000013973&theme=manhattan`

### Config model

- Shared defaults: `config/vas.default.json`
- Per-ORG overrides: `config/orgs/{ORG}.json` (merged over defaults at runtime)
- Execution shows **Type** instructions block, then **Item** block; capture sections enabled if either layer enables them

See [HANDOFF.md](./HANDOFF.md) for API quirks and phase history.
