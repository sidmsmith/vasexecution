# VAS Execution — Handoff

Start / continue work under `Web/vasexecution` (sibling of `Web/inspection`). **Keep Inspection untouched.**

## Reference script

`C:\Users\ssmith\Downloads\olpn_vas_sequential.py`

Auth headers: `Authorization: Bearer`, `selectedOrganization`, `selectedLocation`.

```text
Enter oLPN
  → POST /pickpack/api/pickpack/olpn/search  (resolve ServiceRequestorIds)
  → POST /pickpack/api/fw-aux-svcs/assignedService/search
  → Display Assigned Services + Steps (+ VAS Type/Item config overlays)
  → POST /pickpack/api/pickpack/assignedServices/performVas
```

### Step 1 — oLPN search

- Attempt A: header `AssignedService: null` + detail ItemIds (no nested AS — avoids HTTP 500 on some oLPNs)
- Attempt B fallback: templates with nested `AssignedService`
- Extract requestor IDs from `OlpnAndDetailsServiceRequestorIds` / `ServiceRequestorId(s)` / nested `AssignedService`

### Step 2 — Assigned services

- Query: `ServiceRequestorId IN (...)`
- Sort: oLPN UOM / `Olpn` first, then ITEM
- Service fields: `ProvidedServiceId`, `Description`, `ServiceRequestorTypeId`, `ServiceRequestorId`, `ServiceUomId`, `AssignedServiceStatusDesc` / `StatusId`
- Step fields: `AssignedServiceStepId`, `StepDescription`, `RequestedQuantity`, `RemainingQuantity`, `CompletedQuantity`, `AssignedServiceStepStatusDesc`
- Item enrich via item-master (`ItemId`, Description, ImageUrl)

### Step 3 — complete

- Qty validation (≤ Remaining); `performVas` with top-level `OlpnId` (not `AdditionalFields.OLPN_ID` — that 500s on this tenant)
- Refresh after each round

## Phase status

| Phase | Status |
|---|---|
| 0 Scaffold from Inspection, own identity | Done |
| 1 Lookup + display only | Done |
| 2 performVas UX | Done |
| 3 VAS Execution Config (`ProvidedServiceId` + Item) | Done (desktop) |

### Phase 3 — VAS Execution Config

- Defaults: [`config/vas.default.json`](./config/vas.default.json) (VAS Types + sample items)
- Merge: Type block then Item block; capture sections OR’d
- Runtime: [`js/vas-config.js`](./js/vas-config.js), pads in [`js/vas-pads.js`](./js/vas-pads.js)
- Admin: [`admin.html`](./admin.html) — edit types/items, desktop/mobile preview, Sync from MAWM, Import/Export/Reset, Save & Deploy → `POST /api/save_vas_config` (needs `GITHUB_TOKEN`)
- Catalog API: `POST /api/provided_services` → `providedService/search` `ServiceTypeId='VAS'`
- Library: [`mawm_api_library/provided_service/`](../mawm_api_library/provided_service/api.md)

Org overrides land in `config/orgs/{ORG}.json` via GitHub Contents API (`GITHUB_REPO` default `sidmsmith/vasexecution`).

## Still deferred

- Mobile-first execution UX polish (preview exists in admin; field execution is desktop-first)
- Expand object types beyond oLPN
- Do not mix VAS changes into the Inspection repo
