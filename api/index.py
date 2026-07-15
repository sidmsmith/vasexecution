# api/index.py — VAS Execution v0.1.0
# Phase 1: ORG auth + oLPN VAS lookup (requestor IDs → assigned services). No performVas.
from flask import Flask, request, jsonify, send_from_directory
import base64
import json
import os
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import requests
from requests.auth import HTTPBasicAuth
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
TOKEN_PATH = ROOT_DIR / ".token"
ORG_PATH = ROOT_DIR / ".org"

USAGE_INGEST_URL = os.getenv("MANHATTAN_USAGE_INGEST_URL", "").strip()
USAGE_INGEST_SECRET = os.getenv("MANHATTAN_USAGE_INGEST_SECRET", "").strip()

AUTH_HOST = os.getenv("MANHATTAN_AUTH_HOST", "salep-auth.sce.manh.com")
API_HOST = os.getenv("MANHATTAN_API_HOST", "salep.sce.manh.com")
USERNAME_BASE = os.getenv("MANHATTAN_USERNAME_BASE", "sdtadmin@")
PASSWORD = os.getenv("MANHATTAN_PASSWORD")
CLIENT_ID = os.getenv("MANHATTAN_CLIENT_ID", "omnicomponent.1.0.0")
CLIENT_SECRET = os.getenv("MANHATTAN_SECRET")

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_REPO = os.getenv("GITHUB_REPO", "sidmsmith/vasexecution").strip()
GITHUB_REF = os.getenv("GITHUB_REF", "main").strip()

APP_NAME = "vasexecution"
APP_VERSION = "0.2.0"

# mawm_api_library/_conventions statuses.json → assigned_service_status
# Also documented in olpn_vas_sequential.py (1000 created, 2000 in progress, 5000 complete)
ASSIGNED_SERVICE_STATUS = {
    "1000": "Created",
    "2000": "In Progress",
    "5000": "Complete",
    "8000": "Cancelled",
    "9000": "Failed",
}


def load_token_from_file() -> Optional[str]:
    """Load bearer token from project-root .token (same idea as olpn_vas_sequential.py)."""
    try:
        if not TOKEN_PATH.exists():
            return None
        token = TOKEN_PATH.read_text(encoding="utf-8").strip()
        return token or None
    except Exception as e:
        print(f"[auth] Failed to read .token: {e}")
        return None


def save_token_to_file(token: str) -> None:
    try:
        TOKEN_PATH.write_text(token.strip() + "\n", encoding="utf-8")
        print(f"[auth] Saved token to {TOKEN_PATH}")
    except Exception as e:
        print(f"[auth] Failed to write .token: {e}")


def load_org_from_file() -> Optional[str]:
    try:
        if not ORG_PATH.exists():
            return None
        org = ORG_PATH.read_text(encoding="utf-8").strip().upper()
        return org or None
    except Exception as e:
        print(f"[auth] Failed to read .org: {e}")
        return None


def save_org_to_file(org: str) -> None:
    try:
        ORG_PATH.write_text(org.strip().upper() + "\n", encoding="utf-8")
    except Exception as e:
        print(f"[auth] Failed to write .org: {e}")


def org_from_token(token: Optional[str]) -> Optional[str]:
    """Read organization claim from a Manhattan JWT (no signature verify)."""
    if not token:
        return None
    try:
        import base64
        import json as _json

        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        data = _json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")))
        org = data.get("organization") or data.get("org")
        if org:
            return str(org).strip().upper() or None
        username = str(data.get("preferred_username") or data.get("user_name") or "")
        if "@" in username:
            return username.split("@", 1)[1].strip().upper() or None
    except Exception as e:
        print(f"[auth] Could not parse org from token: {e}")
    return None


def format_assigned_service_status(status_id: Any, status_desc: Any = None) -> Optional[str]:
    """Prefer API description; else map StatusId via assigned_service_status library."""
    if status_desc and str(status_desc).strip():
        return str(status_desc).strip()
    if status_id is None:
        return None
    key = str(status_id).strip()
    return ASSIGNED_SERVICE_STATUS.get(key) or key or None


def forward_usage_event(payload):
    if not USAGE_INGEST_URL:
        print("[usage] MANHATTAN_USAGE_INGEST_URL not set; event not recorded")
        return
    headers = {"Content-Type": "application/json"}
    if USAGE_INGEST_SECRET:
        headers["Authorization"] = f"Bearer {USAGE_INGEST_SECRET}"
    try:
        requests.post(USAGE_INGEST_URL, json=payload, headers=headers, timeout=8)
    except Exception as e:
        print(f"[usage] Forward failed: {e}")


def get_manhattan_token(org):
    if not PASSWORD or not CLIENT_SECRET:
        return None
    url = f"https://{AUTH_HOST}/oauth/token"
    username = f"{USERNAME_BASE}{org.lower()}"
    data = {
        "grant_type": "password",
        "username": username,
        "password": PASSWORD,
    }
    auth = HTTPBasicAuth(CLIENT_ID, CLIENT_SECRET)
    try:
        r = requests.post(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            auth=auth,
            timeout=30,
            verify=False,
        )
        r.raise_for_status()
        return r.json().get("access_token")
    except Exception:
        return None


def resolve_auth_token(org: str, prefer_file: bool = True) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (token, source) where source is 'file' or 'oauth'.
    Prefers local .token so ORG sign-in does not need OAuth every time.
    """
    if prefer_file:
        file_token = load_token_from_file()
        if file_token:
            print(f"[auth] Using token from {TOKEN_PATH}")
            return file_token, "file"

    oauth_token = get_manhattan_token(org)
    if oauth_token:
        save_token_to_file(oauth_token)
        return oauth_token, "oauth"
    return None, None


def manhattan_api_headers(org, token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "selectedOrganization": org,
        "selectedLocation": f"{org}-DM1",
    }


def verify_manhattan_token(org, token):
    if not org or not token:
        return False
    url = f"https://{API_HOST}/item-master/api/item-master/item/search"
    payload = {"Query": "", "Template": {"ItemId": None}, "Size": 1, "Page": 0}
    try:
        r = requests.post(
            url,
            json=payload,
            headers=manhattan_api_headers(org, token),
            timeout=20,
            verify=False,
        )
        return r.ok
    except Exception:
        return False


def github_api_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def github_contents_url(file_path: str) -> str:
    parts = GITHUB_REPO.split("/", 1)
    if len(parts) != 2:
        raise ValueError("GITHUB_REPO must be owner/repo")
    owner, repo = parts
    return f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"


def as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def coerce_ids(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = [p.strip() for p in value.split(",")]
        return [p for p in parts if p]
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        return [str(value)]
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            out.extend(coerce_ids(item))
        return out
    if isinstance(value, dict):
        out: List[str] = []
        for v in value.values():
            out.extend(coerce_ids(v))
        return out
    return []


def recursive_find(obj: Any, target_keys: Set[str], found: List[Any]) -> None:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in target_keys:
                found.append(value)
            recursive_find(value, target_keys, found)
    elif isinstance(obj, list):
        for item in obj:
            recursive_find(item, target_keys, found)


def dedupe_preserve(values: Iterable[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for value in values:
        normalized = str(value).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def extract_olpn_records(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if isinstance(data, dict):
            if isinstance(data.get("Results"), list):
                return [x for x in data.get("Results", []) if isinstance(x, dict)]
            return [data]
    return []


def extract_requestor_ids_from_record(record: Dict[str, Any]) -> List[str]:
    raw_hits: List[Any] = []
    recursive_find(
        record,
        {
            "OlpnAndDetailsServiceRequestorIds",
            "ServiceRequestorIds",
            "ServiceRequestorId",
        },
        raw_hits,
    )
    ids: List[str] = []
    for hit in raw_hits:
        ids.extend(coerce_ids(hit))

    assigned_services: List[Any] = []
    recursive_find(record, {"AssignedService"}, assigned_services)
    for assigned in assigned_services:
        if isinstance(assigned, list):
            for item in assigned:
                if isinstance(item, dict):
                    ids.extend(coerce_ids(item.get("ServiceRequestorId")))
                    ids.extend(coerce_ids(item.get("ServiceRequestorIds")))
        elif isinstance(assigned, dict):
            ids.extend(coerce_ids(assigned.get("ServiceRequestorId")))
            ids.extend(coerce_ids(assigned.get("ServiceRequestorIds")))

    return dedupe_preserve(ids)


def extract_assigned_service_records(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict) and isinstance(data.get("Results"), list):
            return [x for x in data.get("Results", []) if isinstance(x, dict)]
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    return []


def olpn_search_body_with_requestor_ids(olpn: str) -> Dict[str, Any]:
    """
    Attempt A — requestor IDs + header AssignedService + detail ItemIds.

    Nesting AssignedService under OlpnDetail returns HTTP 500 on some oLPNs.
    Header-level AssignedService (null) is safe and returns oLPN-level services.
    """
    return {
        "Query": f"OlpnId='{olpn}'",
        "Template": {
            "OlpnId": None,
            "OrderId": None,
            "OrgId": None,
            "FacilityId": None,
            "OlpnAndDetailsServiceRequestorIds": None,
            "AssignedService": None,
            "OlpnDetail": {
                "OlpnDetailId": None,
                "ItemId": None,
                "PK": None,
            },
        },
        "Page": 0,
        "Size": 20,
    }


def olpn_search_body_with_assigned_service_fallback(olpn: str) -> Dict[str, Any]:
    """Attempt B — detail AssignedService (may 500 for some oLPNs; try after A)."""
    return {
        "Query": f"OlpnId='{olpn}'",
        "Template": {
            "AssignedService": "",
            "OlpnDetail": {
                "OlpnDetailId": None,
                "ItemId": None,
                "AssignedService": None,
            },
        },
        "Page": 0,
        "Size": 20,
    }


def build_requestor_item_map(
    olpn_record: Dict[str, Any], services: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    detail_items: List[str] = []
    for detail in as_list(olpn_record.get("OlpnDetail")):
        if not isinstance(detail, dict):
            continue
        item_id = str(detail.get("ItemId") or "").strip()
        if item_id:
            detail_items.append(item_id)
        for svc in as_list(detail.get("AssignedService")):
            if not isinstance(svc, dict):
                continue
            requestor_id = str(svc.get("ServiceRequestorId") or "").strip()
            if requestor_id and item_id and requestor_id not in mapping:
                mapping[requestor_id] = item_id

    # Fallback when detail AssignedService cannot be expanded: single-item oLPN
    unique_items = dedupe_preserve(detail_items)
    if len(unique_items) == 1 and services:
        only_item = unique_items[0]
        for svc in services:
            if not isinstance(svc, dict):
                continue
            requestor_type = str(svc.get("ServiceRequestorTypeId") or "")
            uom = str(svc.get("ServiceUomId") or "").upper()
            if requestor_type == "OlpnDetail" or uom == "ITEM":
                requestor_id = str(svc.get("ServiceRequestorId") or "").strip()
                if requestor_id and requestor_id not in mapping:
                    mapping[requestor_id] = only_item
    return mapping


def search_items(org: str, token: str, item_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    cleaned = dedupe_preserve([str(i) for i in item_ids])
    if not cleaned:
        return {}
    quoted = ", ".join("'" + i.replace("'", "''") + "'" for i in cleaned)
    body = {
        "Query": f"ItemId in ({quoted})",
        "Page": 0,
        "Size": max(len(cleaned), 50),
        "Template": {"ItemId": "", "Description": "", "ImageUrl": ""},
    }
    path = "/item-master/api/item-master/item/search"
    try:
        response, payload = post_manhattan(org, token, path, body)
    except Exception as e:
        print(f"[item] search failed: {e}")
        return {}
    if response.status_code != 200 or not isinstance(payload, dict):
        print(f"[item] search HTTP {getattr(response, 'status_code', '?')}")
        return {}
    data = payload.get("data")
    rows = data if isinstance(data, list) else []
    out: Dict[str, Dict[str, Any]] = {}
    for item in rows:
        if isinstance(item, dict) and item.get("ItemId"):
            out[str(item.get("ItemId"))] = item
    return out


def is_olpn_level_service(svc: Dict[str, Any]) -> bool:
    uom = str(svc.get("ServiceUomId") or "").strip().upper().replace(" ", "")
    requestor_type = str(svc.get("ServiceRequestorTypeId") or "").strip()
    if uom in ("OLPN", "O_LPN"):
        return True
    if requestor_type == "Olpn":
        return True
    return False


def sort_services_olpn_then_item(services: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def sort_key(svc: Dict[str, Any]):
        group = 0 if is_olpn_level_service(svc) else 1
        return (
            group,
            str(svc.get("ProvidedServiceId") or ""),
            str(svc.get("ServiceRequestorId") or ""),
        )

    return sorted(services, key=sort_key)


def summarize_service(
    svc: Dict[str, Any],
    requestor_item_map: Optional[Dict[str, str]] = None,
    items_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    requestor_item_map = requestor_item_map or {}
    items_by_id = items_by_id or {}
    service_status_id = svc.get("StatusId")
    service_status_desc = format_assigned_service_status(
        service_status_id, svc.get("AssignedServiceStatusDesc")
    )
    requestor_id = str(svc.get("ServiceRequestorId") or "").strip()
    item_id = ""
    if str(svc.get("ServiceRequestorTypeId") or "") == "OlpnDetail" or str(
        svc.get("ServiceUomId") or ""
    ).upper() == "ITEM":
        item_id = requestor_item_map.get(requestor_id, "")
    item = items_by_id.get(item_id) if item_id else None
    steps = []
    for step in as_list(svc.get("AssignedServiceStep")):
        if not isinstance(step, dict):
            continue
        step_status_id = (
            step.get("StatusId")
            or step.get("AssignedServiceStepStatusId")
            or service_status_id
        )
        step_status_desc = format_assigned_service_status(
            step_status_id,
            step.get("AssignedServiceStepStatusDesc") or step.get("StatusDesc"),
        )
        instructions = []
        for instr in as_list(step.get("AssignedServiceStepInstruction")):
            if isinstance(instr, dict) and instr.get("InstructionText"):
                instructions.append(str(instr.get("InstructionText")))
        steps.append(
            {
                "AssignedServiceStepId": step.get("AssignedServiceStepId"),
                "StepDescription": step.get("StepDescription"),
                "RequestedQuantity": step.get("RequestedQuantity"),
                "RemainingQuantity": step.get("RemainingQuantity"),
                "CompletedQuantity": step.get("CompletedQuantity"),
                "AssignedServiceStepStatusDesc": step_status_desc,
                "StatusId": step_status_id,
                "Instructions": instructions,
            }
        )
    return {
        "ProvidedServiceId": svc.get("ProvidedServiceId"),
        "Description": svc.get("Description") or svc.get("ProvidedServiceId"),
        "ServiceRequestorTypeId": svc.get("ServiceRequestorTypeId"),
        "ServiceRequestorId": requestor_id,
        "ServiceUomId": svc.get("ServiceUomId"),
        "AssignedServiceStatusDesc": service_status_desc,
        "StatusId": service_status_id,
        "ItemId": item_id or None,
        "ItemDescription": (item or {}).get("Description") if item else None,
        "ImageUrl": (item or {}).get("ImageUrl") or (item or {}).get("imageUrl") or None,
        "IsOlpnLevel": is_olpn_level_service(svc),
        "AssignedServiceStep": steps,
        "_raw": svc,
    }


def build_perform_vas_payload(
    service: Dict[str, Any],
    step: Dict[str, Any],
    quantity: float,
    olpn_id: str,
    requestor_item_map: Dict[str, str],
) -> Dict[str, Any]:
    requestor_id = str(service.get("ServiceRequestorId") or "").strip()
    requestor_type = str(service.get("ServiceRequestorTypeId") or "").strip()
    item_id = requestor_item_map.get(requestor_id, "") if requestor_type == "OlpnDetail" else ""

    previous_completed = float(step.get("CompletedQuantity") or 0)
    requested_quantity = float(step.get("RequestedQuantity") or 0)
    current_completed = previous_completed + quantity
    if requested_quantity > 0:
        current_completed = min(current_completed, requested_quantity)
    remaining_quantity = max(0.0, requested_quantity - current_completed)

    previous_service_status = str(service.get("StatusId") or "1000")
    current_status = "5000" if remaining_quantity <= 0 else "2000"

    return {
        "ProvidedServiceId": service.get("ProvidedServiceId"),
        "AssignedServiceStepId": step.get("AssignedServiceStepId"),
        "CompletedQuantity": current_completed,
        "RemainingQuantity": remaining_quantity,
        "RequestedQuantity": requested_quantity,
        "EnteredQuantity": quantity,
        "CurrentCompletedQuantity": quantity,
        "CurrentStepCompletedQuantity": quantity,
        "PreviousMinimumCompletedQty": previous_completed,
        "CurrentMinimumCompletedQty": current_completed,
        "StepStatus": current_status,
        "ServiceStatus": current_status,
        "OverallStatus": current_status,
        "PreviousServiceStatus": previous_service_status,
        "ServiceRequestorId": requestor_id,
        "ServiceRequestorIds": [requestor_id],
        "ServiceRequestorTypeId": requestor_type,
        "ServiceUomId": service.get("ServiceUomId"),
        "ItemId": item_id or None,
        "OlpnId": olpn_id,
        "ActivityTrackingDTO": {
            "TransactionId": "VAS",
            "TransactionTypeId": "ServiceExecution",
            "ItemId": item_id,
            "TaskId": "",
            "Quantity": quantity,
            "AssignedService": service.get("ProvidedServiceId"),
            "AssignedServiceStepCompletedQuantity": current_completed,
        },
        # Note: AdditionalFields.OLPN_ID causes HTTP 500 on this tenant; use top-level OlpnId instead.
    }


def fetch_assigned_service_rows(
    org: str, token: str, requestor_ids: List[str]
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    cleaned = dedupe_preserve([str(x) for x in requestor_ids])
    if not cleaned:
        return None, "requestor_ids required"
    path = "/pickpack/api/fw-aux-svcs/assignedService/search"
    body = {"Query": f"ServiceRequestorId IN ({','.join(cleaned)})"}
    try:
        response, payload = post_manhattan(org, token, path, body)
    except Exception as e:
        return None, str(e)
    if response.status_code != 200:
        return None, f"Assigned service search failed. HTTP status: {response.status_code}"
    return extract_assigned_service_records(payload), None


def enrich_and_sort_services(
    org: str,
    token: str,
    raw_services: List[Dict[str, Any]],
    olpn_record: Optional[Dict[str, Any]] = None,
    requestor_item_map: Optional[Dict[str, str]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    olpn_record = olpn_record or {}
    item_map = dict(requestor_item_map or {})
    if not item_map:
        item_map = build_requestor_item_map(olpn_record, raw_services)
    else:
        # fill gaps with fallback
        fallback = build_requestor_item_map(olpn_record, raw_services)
        for k, v in fallback.items():
            item_map.setdefault(k, v)

    item_ids = list(item_map.values())
    for detail in as_list(olpn_record.get("OlpnDetail")):
        if isinstance(detail, dict) and detail.get("ItemId"):
            item_ids.append(str(detail.get("ItemId")))
    items_by_id = search_items(org, token, item_ids)
    summarized = [
        summarize_service(svc, item_map, items_by_id) for svc in raw_services
    ]
    return sort_services_olpn_then_item(summarized), item_map


def fetch_paginated_ids(org: str, token: str, api_path: str, id_field: str, query: str = ""):
    url = f"https://{API_HOST}{api_path}"
    headers = manhattan_api_headers(org, token)
    ids: List[str] = []
    seen: Set[str] = set()
    page = 0
    page_size = 200
    while True:
        payload = {
            "Query": query,
            "Template": {id_field: None},
            "Size": page_size,
            "Page": page,
        }
        r = requests.post(url, json=payload, headers=headers, timeout=60, verify=False)
        if not r.ok:
            return None, f"Failed to fetch records (HTTP {r.status_code})"
        data = r.json().get("data", [])
        if not isinstance(data, list):
            data = []
        for record in data:
            if not isinstance(record, dict):
                continue
            record_id = record.get(id_field)
            if record_id is None:
                continue
            normalized = str(record_id).strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                ids.append(normalized)
        if len(data) < page_size:
            break
        page += 1
    return ids, None


def post_manhattan(org: str, token: str, path: str, body: Dict[str, Any], timeout: int = 60):
    url = f"https://{API_HOST}{path}"
    r = requests.post(
        url,
        json=body,
        headers=manhattan_api_headers(org, token),
        timeout=timeout,
        verify=False,
    )
    try:
        payload = r.json()
    except Exception:
        payload = None
    return r, payload


# === API ROUTES ===
@app.route("/api/app_opened", methods=["POST"])
def app_opened():
    return jsonify({"success": True})


@app.route("/api/usage-track", methods=["POST"])
def usage_track():
    try:
        data = request.json or {}
        event_name = data.get("event_name")
        metadata = data.get("metadata", {})
        payload = {
            "event_name": event_name,
            "app_name": APP_NAME,
            "app_version": APP_VERSION,
            **metadata,
            "timestamp": datetime.now().isoformat(),
        }
        forward_usage_event(payload)
        return jsonify({"success": True})
    except Exception as e:
        print(f"[usage] Failed to track event: {e}")
        return jsonify({"success": True})


@app.route("/api/session", methods=["POST"])
def session_info():
    """Return local .token presence + org (from .org or JWT) so UI can skip ORG prompt."""
    token = load_token_from_file()
    org = load_org_from_file() or org_from_token(token)
    if token and org:
        save_org_to_file(org)
    return jsonify(
        {
            "success": True,
            "has_token": bool(token),
            "org": org,
        }
    )


@app.route("/api/auth", methods=["POST"])
def auth():
    data = request.json or {}
    org = (data.get("org") or "").strip() or (load_org_from_file() or "")
    org = org.strip().upper()
    if not org:
        return jsonify({"success": False, "error": "ORG required"})
    prefer_file = not bool(data.get("force_oauth"))
    token, source = resolve_auth_token(org, prefer_file=prefer_file)
    if token:
        save_org_to_file(org)
        return jsonify(
            {
                "success": True,
                "token": token,
                "org": org,
                "source": source or "unknown",
            }
        )
    if not load_token_from_file() and (not PASSWORD or not CLIENT_SECRET):
        return jsonify(
            {
                "success": False,
                "error": "No .token file and MANHATTAN_PASSWORD / MANHATTAN_SECRET not set",
            }
        )
    return jsonify({"success": False, "error": "Auth failed"})


@app.route("/api/olpns", methods=["POST"])
def olpns():
    """Fetch oLPN IDs for Load-button validation (same pattern as Inspection)."""
    data = request.json or {}
    org = (data.get("org") or "").strip()
    token = data.get("token")
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})
    path = "/pickpack/api/pickpack/olpn/search"
    try:
        ids, err = fetch_paginated_ids(org, token, path, "OlpnId")
        if err:
            return jsonify({"success": False, "error": err})
        return jsonify({"success": True, "count": len(ids), "ids": ids})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/search_olpn_vas", methods=["POST"])
def search_olpn_vas():
    data = request.json or {}
    org = (data.get("org") or "").strip()
    token = data.get("token")
    olpn_id = (data.get("olpn_id") or "").strip()
    if not all([org, token, olpn_id]):
        return jsonify({"success": False, "error": "Missing data"})

    path = "/pickpack/api/pickpack/olpn/search"
    attempts = [
        ("A", olpn_search_body_with_requestor_ids(olpn_id)),
        ("B", olpn_search_body_with_assigned_service_fallback(olpn_id)),
    ]

    last_status: Optional[int] = None
    last_error: Optional[str] = None
    found_olpn = None

    for attempt_label, body in attempts:
        try:
            response, payload = post_manhattan(org, token, path, body)
        except Exception as e:
            last_error = str(e)
            continue

        last_status = response.status_code
        if response.status_code != 200:
            detail = ""
            if isinstance(payload, dict):
                detail = (
                    payload.get("message")
                    or payload.get("rootCause")
                    or ""
                )
                if detail:
                    detail = f" ({str(detail)[:180]})"
            last_error = f"oLPN search HTTP {response.status_code}{detail} [attempt {attempt_label}]"
            continue

        records = extract_olpn_records(payload)
        if not records:
            last_error = f"oLPN '{olpn_id}' not found"
            continue

        record = records[0]
        details = []
        for detail in as_list(record.get("OlpnDetail")):
            if isinstance(detail, dict):
                details.append(
                    {
                        "OlpnDetailId": detail.get("OlpnDetailId"),
                        "ItemId": detail.get("ItemId"),
                        "PK": detail.get("PK"),
                    }
                )
        found_olpn = {
            "OlpnId": record.get("OlpnId"),
            "OrderId": record.get("OrderId"),
            "OrgId": record.get("OrgId"),
            "FacilityId": record.get("FacilityId"),
            "OlpnDetail": details,
        }
        requestor_ids = extract_requestor_ids_from_record(record)
        if requestor_ids:
            return jsonify(
                {
                    "success": True,
                    "olpn": found_olpn,
                    "olpn_record": record,
                    "requestor_ids": requestor_ids,
                    "attempt": attempt_label,
                }
            )
        last_error = (
            "Could not resolve ServiceRequestorIds from the oLPN search response. "
            "The tenant may use a different response shape or a different relationship flow."
        )

    if last_status is not None and last_status != 200:
        return jsonify(
            {
                "success": False,
                "error": last_error or f"oLPN search failed. Last HTTP status: {last_status}",
                "olpn": found_olpn,
            }
        )
    return jsonify(
        {
            "success": False,
            "error": last_error
            or "Could not resolve ServiceRequestorIds from the oLPN search response.",
            "olpn": found_olpn,
        }
    )


@app.route("/api/assigned_services", methods=["POST"])
def assigned_services():
    data = request.json or {}
    org = (data.get("org") or "").strip()
    token = data.get("token")
    requestor_ids = data.get("requestor_ids") or []
    olpn_record = data.get("olpn_record") or {}
    requestor_item_map = data.get("requestor_item_map") or {}
    if not org or not token:
        return jsonify({"success": False, "error": "Missing data"})
    if not isinstance(requestor_ids, list) or not requestor_ids:
        return jsonify({"success": False, "error": "requestor_ids required"})

    raw, err = fetch_assigned_service_rows(org, token, requestor_ids)
    if err:
        return jsonify({"success": False, "error": err})
    services, item_map = enrich_and_sort_services(
        org, token, raw or [], olpn_record, requestor_item_map
    )
    # Strip raw payloads from client response (keep for perform only on server)
    public_services = []
    for svc in services:
        row = {k: v for k, v in svc.items() if k != "_raw"}
        public_services.append(row)
    return jsonify(
        {
            "success": True,
            "services": public_services,
            "requestor_ids": dedupe_preserve([str(x) for x in requestor_ids]),
            "requestor_item_map": item_map,
            "count": len(public_services),
        }
    )


@app.route("/api/perform_vas", methods=["POST"])
def perform_vas():
    """
    Complete selected assigned-service steps via performVas.
    completions: [{ ServiceRequestorId, ProvidedServiceId, AssignedServiceStepId, quantity }]
    """
    data = request.json or {}
    org = (data.get("org") or "").strip()
    token = data.get("token")
    olpn_id = (data.get("olpn_id") or "").strip()
    requestor_ids = data.get("requestor_ids") or []
    olpn_record = data.get("olpn_record") or {}
    requestor_item_map = data.get("requestor_item_map") or {}
    completions = data.get("completions") or []
    if not all([org, token, olpn_id]):
        return jsonify({"success": False, "error": "Missing data"})
    if not isinstance(completions, list) or not completions:
        return jsonify({"success": False, "error": "completions required"})

    raw, err = fetch_assigned_service_rows(org, token, requestor_ids)
    if err:
        return jsonify({"success": False, "error": err})
    raw = raw or []
    item_map = dict(requestor_item_map or {})
    fallback_map = build_requestor_item_map(olpn_record, raw)
    for k, v in fallback_map.items():
        item_map.setdefault(k, v)

    by_key: Dict[str, Dict[str, Any]] = {}
    for svc in raw:
        req = str(svc.get("ServiceRequestorId") or "").strip()
        provided = str(svc.get("ProvidedServiceId") or "").strip()
        for step in as_list(svc.get("AssignedServiceStep")):
            if not isinstance(step, dict):
                continue
            step_id = str(step.get("AssignedServiceStepId") or "").strip()
            by_key[f"{req}|{provided}|{step_id}"] = {"service": svc, "step": step}

    path = "/pickpack/api/pickpack/assignedServices/performVas"
    results = []
    for entry in completions:
        if not isinstance(entry, dict):
            continue
        req = str(entry.get("ServiceRequestorId") or "").strip()
        provided = str(entry.get("ProvidedServiceId") or "").strip()
        step_id = str(entry.get("AssignedServiceStepId") or "").strip()
        try:
            quantity = float(entry.get("quantity"))
        except (TypeError, ValueError):
            return jsonify(
                {
                    "success": False,
                    "error": f"Invalid quantity for {provided} / {step_id}",
                }
            )
        if quantity <= 0:
            return jsonify(
                {
                    "success": False,
                    "error": f"Quantity must be greater than 0 for {provided} / {step_id}",
                }
            )

        key = f"{req}|{provided}|{step_id}"
        match = by_key.get(key)
        if not match:
            return jsonify(
                {
                    "success": False,
                    "error": f"Assigned service step not found: {provided} / {step_id}",
                }
            )
        service = match["service"]
        step = match["step"]
        remaining = float(step.get("RemainingQuantity") or 0)
        if quantity > remaining + 1e-9:
            return jsonify(
                {
                    "success": False,
                    "error": (
                        f"Quantity {quantity} exceeds remaining quantity {remaining} "
                        f"for {provided} / {step_id}"
                    ),
                }
            )

        payload = build_perform_vas_payload(
            service, step, quantity, olpn_id, item_map
        )
        try:
            response, resp_payload = post_manhattan(org, token, path, payload)
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})
        if response.status_code != 200:
            detail = ""
            if isinstance(resp_payload, dict):
                detail = str(
                    resp_payload.get("message")
                    or resp_payload.get("rootCause")
                    or ""
                )[:240]
            return jsonify(
                {
                    "success": False,
                    "error": (
                        f"performVas failed for {provided} / {step_id}. "
                        f"HTTP {response.status_code}"
                        + (f": {detail}" if detail else "")
                    ),
                }
            )
        results.append(
            {
                "ProvidedServiceId": provided,
                "AssignedServiceStepId": step_id,
                "EnteredQuantity": quantity,
                "NewCompletedQuantity": payload.get("CompletedQuantity"),
                "NewRemainingQuantity": payload.get("RemainingQuantity"),
            }
        )

    refreshed_raw, refresh_err = fetch_assigned_service_rows(org, token, requestor_ids)
    if refresh_err:
        return jsonify(
            {
                "success": True,
                "completed": results,
                "warning": f"Completed but refresh failed: {refresh_err}",
                "services": [],
            }
        )
    services, item_map = enrich_and_sort_services(
        org, token, refreshed_raw or [], olpn_record, item_map
    )
    public_services = [{k: v for k, v in svc.items() if k != "_raw"} for svc in services]
    return jsonify(
        {
            "success": True,
            "completed": results,
            "services": public_services,
            "requestor_item_map": item_map,
            "count": len(public_services),
        }
    )


@app.route("/api/provided_services", methods=["POST"])
def provided_services():
    """VAS Type catalog: providedService/search where ServiceTypeId='VAS'."""
    data = request.json or {}
    org = (data.get("org") or "").strip()
    token = data.get("token")
    if not all([org, token]):
        return jsonify({"success": False, "error": "Missing data"})
    path = "/aux-svcs/api/aux-svcs/providedService/search"
    body = {"Query": "ServiceTypeId='VAS'", "Size": 100, "Page": 0}
    try:
        response, payload = post_manhattan(org, token, path, body)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
    if response.status_code != 200 or not isinstance(payload, dict):
        return jsonify(
            {
                "success": False,
                "error": f"providedService search failed. HTTP {response.status_code}",
            }
        )
    rows = payload.get("data") if isinstance(payload.get("data"), list) else []
    services = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        steps = []
        for step in as_list(row.get("ProvidedServiceStep")):
            if not isinstance(step, dict):
                continue
            instructions = []
            for instr in as_list(step.get("StepInstruction")):
                if isinstance(instr, dict) and instr.get("InstructionText"):
                    instructions.append(
                        {
                            "StepInstructionId": instr.get("StepInstructionId"),
                            "InstructionText": instr.get("InstructionText"),
                            "Sequence": instr.get("Sequence"),
                        }
                    )
            steps.append(
                {
                    "ProvidedServiceStepId": step.get("ProvidedServiceStepId"),
                    "Description": step.get("Description"),
                    "StepSequence": step.get("StepSequence"),
                    "Instructions": instructions,
                }
            )
        services.append(
            {
                "ProvidedServiceId": row.get("ProvidedServiceId"),
                "Description": row.get("Description"),
                "ServiceTypeId": row.get("ServiceTypeId"),
                "ProvidedServiceStep": steps,
            }
        )
    return jsonify({"success": True, "services": services, "count": len(services)})


@app.route("/api/save_vas_config", methods=["POST"])
def save_vas_config():
    """Commit per-ORG VAS config overrides to GitHub (config/orgs/{ORG}.json)."""
    body = request.json or {}
    org = str(body.get("org", "")).strip().upper()
    token = body.get("token")
    config = body.get("config")

    if not org or not token:
        return jsonify({"success": False, "error": "Missing org or token"})
    if not isinstance(config, dict):
        return jsonify({"success": False, "error": "Missing config"})
    if not GITHUB_TOKEN:
        return jsonify(
            {
                "success": False,
                "error": "Save not configured — set GITHUB_TOKEN on the server (Vercel env)",
            }
        )
    if not verify_manhattan_token(org, token):
        return jsonify({"success": False, "error": "Session expired — authenticate again"})

    file_path = f"config/orgs/{org}.json"
    vas_types = config.get("vasTypes") if isinstance(config.get("vasTypes"), dict) else {}
    items = config.get("items") if isinstance(config.get("items"), dict) else {}
    has_overrides = bool(vas_types) or bool(items)

    try:
        gh_headers = github_api_headers()
        get_url = f"{github_contents_url(file_path)}?ref={GITHUB_REF}"
        existing_sha = None
        gr = requests.get(get_url, headers=gh_headers, timeout=30)
        if gr.status_code == 200:
            existing_sha = gr.json().get("sha")
        elif gr.status_code != 404:
            return jsonify(
                {"success": False, "error": f"GitHub read failed (HTTP {gr.status_code})"}
            )

        if not has_overrides:
            if not existing_sha:
                return jsonify(
                    {
                        "success": True,
                        "message": f"No overrides for {org} — nothing to save",
                        "deleted": False,
                    }
                )
            dr = requests.delete(
                github_contents_url(file_path),
                headers=gh_headers,
                json={
                    "message": f"VAS config: remove {org} overrides",
                    "sha": existing_sha,
                    "branch": GITHUB_REF,
                },
                timeout=30,
            )
            if not dr.ok:
                return jsonify(
                    {
                        "success": False,
                        "error": f"GitHub delete failed (HTTP {dr.status_code})",
                    }
                )
            return jsonify(
                {
                    "success": True,
                    "message": f"Removed {org} overrides — Vercel will redeploy shortly",
                    "deleted": True,
                }
            )

        save_doc = {
            "org": org,
            "updatedAt": config.get("updatedAt")
            or datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "version": config.get("version") or 1,
            "vasTypes": vas_types,
            "items": items,
        }
        content_text = json.dumps(save_doc, indent=2, ensure_ascii=False) + "\n"
        payload = {
            "message": f"VAS config: update {org}",
            "content": base64.b64encode(content_text.encode("utf-8")).decode("ascii"),
            "branch": GITHUB_REF,
        }
        if existing_sha:
            payload["sha"] = existing_sha

        pr = requests.put(
            github_contents_url(file_path),
            headers=gh_headers,
            json=payload,
            timeout=30,
        )
        if not pr.ok:
            detail = pr.text.replace("\n", " ").strip()[:200]
            return jsonify(
                {
                    "success": False,
                    "error": f"GitHub save failed (HTTP {pr.status_code}): {detail}",
                }
            )

        commit_sha = pr.json().get("commit", {}).get("sha")
        return jsonify(
            {
                "success": True,
                "message": f"Saved {org} VAS config — please wait ~1 minute for deploy",
                "commit": commit_sha,
                "path": file_path,
            }
        )
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)})
    except Exception as e:
        print(f"[VAS CONFIG SAVE] Exception: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)})


@app.route("/config/<path:filename>")
def serve_config(filename):
    try:
        return send_from_directory(
            os.path.join(os.path.dirname(__file__), "..", "config"), filename
        )
    except Exception:
        return "File not found", 404


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    if path.startswith("api/"):
        return "API route not found", 404
    if path.endswith(".js"):
        return jsonify({"error": "File not found"}), 404
    try:
        return send_from_directory("..", "index.html")
    except Exception:
        return "File not found", 404


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", "5001"))
    app.run(port=port, debug=True)
