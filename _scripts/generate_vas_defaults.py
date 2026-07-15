"""Generate vas.default.json from MAWM providedService catalog + test items."""
import json
import uuid
from pathlib import Path

import requests
import urllib3

urllib3.disable_warnings()

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / ".token").read_text(encoding="utf-8").strip()
ORG = (ROOT / ".org").read_text(encoding="utf-8").strip() if (ROOT / ".org").exists() else "SS-DEMO"
API_HOST = "salep.sce.manh.com"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "selectedOrganization": ORG,
    "selectedLocation": f"{ORG}-DM1",
}

DEFAULT_SECTIONS = {
    "signature": {
        "enabled": True,
        "required": False,
        "label": "Operator Signature",
    },
    "photos": {
        "enabled": True,
        "required": False,
        "label": "Miscellaneous Photos",
    },
    "markupPad": {
        "enabled": True,
        "required": False,
        "label": "Markup Pad",
        "mode": "photo",
    },
}


def nid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def sections_for(title: str) -> dict:
    # Lighter defaults for reverse/generic types
    light = title in {"Reverse VAS", "Generic Instruction", "Pallet Shrink Wrap"}
    return {
        "signature": {
            **DEFAULT_SECTIONS["signature"],
            "enabled": not light,
            "label": f"{title} Signature",
        },
        "photos": {
            **DEFAULT_SECTIONS["photos"],
            "enabled": True,
            "label": f"{title} Photos",
        },
        "markupPad": {
            **DEFAULT_SECTIONS["markupPad"],
            "enabled": not light,
            "label": f"{title} Markup",
        },
    }


EXTRA_INSTRUCTIONS = {
    "Apply UPC Tags": [
        "Confirm the UPC matches the item before applying the tag.",
        "Place the tag on a flat, clean surface of the item.",
    ],
    "Generic Instruction": [
        "Follow site SOPs for this generic VAS instruction.",
    ],
    "Pallet Shrink Wrap": [
        "Wrap the pallet tightly from base to top for stability.",
        "Do not obscure critical barcode labels under wrap.",
    ],
    "Print Price Ticket": [
        "Verify price and SKU on the ticket before attaching.",
        "Stamp or affix the ticket where the customer can see it.",
    ],
    "Promotion Flyer": [
        "Insert or affix one flyer per oLPN as required.",
        "Do not cover shipping labels with the flyer.",
    ],
    "Gift Wrap": [
        "Use approved wrap paper and ribbon for the brand.",
        "Ensure ribbon is snug and ends are trimmed neatly.",
    ],
    "Walmart-Repack": [
        "Repack into the required inner packs before labeling.",
        "Shrink wrap each pack after filling.",
    ],
    "Dicks VAS Activities": [
        "Complete all Dicks Sporting Goods ticket and label steps.",
    ],
    "Reverse VAS": [
        "Review VAS history before reversing completed work.",
        "Document why the reverse is required.",
    ],
    "Engravement": [
        "Confirm engraving letters/artwork against the order notes.",
        "Protect finished surface before packing.",
    ],
    "TF-Engravement": [
        "Engrave with the specified letter set for this order.",
        "Gift pack in the approved blue box when complete.",
    ],
    "Picture": [
        "Verify etching artwork matches the approved picture.",
        "Place finished item in an empty protective box.",
    ],
    "Build Packaging Material": [
        "Measure the part before building the crate.",
        "Pack parts securely and do not leave voids.",
    ],
    "Repack": [
        "Repack to the specified pack quantity before sealing.",
        "Shrink wrap each finished pack.",
    ],
}


def catalog_instructions(svc: dict) -> list:
    texts = []
    for step in svc.get("ProvidedServiceStep") or []:
        for instr in step.get("StepInstruction") or []:
            text = (instr.get("InstructionText") or "").strip()
            if text and text not in texts:
                texts.append(text)
        desc = (step.get("Description") or "").strip()
        if desc and desc not in texts:
            texts.append(desc)
    return texts


def build_type_entry(svc: dict) -> dict:
    psid = svc.get("ProvidedServiceId") or ""
    desc = (svc.get("Description") or psid).strip()
    instr_texts = catalog_instructions(svc)
    for extra in EXTRA_INSTRUCTIONS.get(psid, []):
        if extra not in instr_texts:
            instr_texts.append(extra)
    if not instr_texts:
        instr_texts = [f"Complete VAS: {desc}"]
    content = [
        {
            "id": nid("ins"),
            "type": "text",
            "text": t,
            "bold": False,
            "italic": False,
            "underline": False,
            "color": "#000000",
        }
        for t in instr_texts
    ]
    return {
        "title": psid,
        "description": desc,
        "iconUrl": "/assets/icons/vas-type-default.svg",
        "content": content,
        "instructions": [{"id": c["id"], "text": c["text"]} for c in content],
        "images": [],
        "sections": sections_for(psid),
    }


def fetch_catalog() -> list:
    r = requests.post(
        f"https://{API_HOST}/aux-svcs/api/aux-svcs/providedService/search",
        headers=HEADERS,
        json={"Query": "ServiceTypeId='VAS'", "Size": 200, "Page": 0},
        timeout=60,
        verify=False,
    )
    r.raise_for_status()
    return r.json().get("data") or []


def fetch_item(item_id: str) -> dict:
    r = requests.post(
        f"https://{API_HOST}/item-master/api/item-master/item/search",
        headers=HEADERS,
        json={
            "Query": f"ItemId in ('{item_id}')",
            "Size": 5,
            "Page": 0,
            "Template": {"ItemId": "", "Description": "", "ImageUrl": ""},
        },
        timeout=60,
        verify=False,
    )
    if not r.ok:
        return {}
    data = r.json().get("data") or []
    return data[0] if data else {}


def main() -> None:
    catalog = fetch_catalog()
    vas_types = {}
    for svc in catalog:
        psid = str(svc.get("ProvidedServiceId") or "").strip()
        if not psid:
            continue
        vas_types[psid] = build_type_entry(svc)

    # Test items commonly used in SS-DEMO VAS demos
    item_ids = ["6000121"]
    items = {}
    for item_id in item_ids:
        meta = fetch_item(item_id)
        desc = meta.get("Description") or item_id
        image = meta.get("ImageUrl") or meta.get("imageUrl") or ""
        images = []
        if image:
            images.append(
                {
                    "id": nid("img"),
                    "url": image,
                    "caption": desc,
                }
            )
        content = [
            {
                "id": nid("ins"),
                "type": "text",
                "text": f"Confirm item {item_id} ({desc}) before starting item-level VAS.",
                "bold": False,
                "italic": False,
                "underline": False,
                "color": "#000000",
            },
            {
                "id": nid("ins"),
                "type": "text",
                "text": "Photograph the finished work if branding or tagging is visible.",
                "bold": False,
                "italic": False,
                "underline": False,
                "color": "#000000",
            },
        ]
        for img in images:
            content.append(
                {
                    "id": img["id"],
                    "type": "image",
                    "url": img["url"],
                    "caption": img.get("caption") or "",
                    "scale": 100,
                }
            )
        items[item_id] = {
            "title": desc,
            "description": desc,
            "content": content,
            "instructions": [
                {"id": c["id"], "text": c["text"]} for c in content if c["type"] == "text"
            ],
            "images": images,
            "sections": {
                "signature": {
                    "enabled": False,
                    "required": False,
                    "label": "Item Signature",
                },
                "photos": {
                    "enabled": True,
                    "required": False,
                    "label": "Item Photos",
                },
                "markupPad": {
                    "enabled": True,
                    "required": False,
                    "label": "Item Markup",
                    "mode": "photo",
                },
            },
        }

    # A couple of invented placeholder SKUs for admin/testing without MAWM hits
    def text_block(text: str) -> dict:
        return {
            "id": nid("ins"),
            "type": "text",
            "text": text,
            "bold": False,
            "italic": False,
            "underline": False,
            "color": "#000000",
        }

    gift_content = [
        text_block("Use holiday wrap materials for DEMO-GIFT-001."),
        text_block("Include a blank gift receipt in the package."),
    ]
    items["DEMO-GIFT-001"] = {
        "title": "Demo Gift SKU",
        "description": "Demo gift item for config testing",
        "content": gift_content,
        "instructions": [{"id": c["id"], "text": c["text"]} for c in gift_content],
        "images": [],
        "sections": {
            "signature": {"enabled": True, "required": False, "label": "Gift Signature"},
            "photos": {"enabled": True, "required": False, "label": "Gift Photos"},
            "markupPad": {
                "enabled": False,
                "required": False,
                "label": "Gift Markup",
                "mode": "photo",
            },
        },
    }
    ticket_content = [
        text_block("Hang price ticket on the right sleeve for DEMO-TICKET-100.")
    ]
    items["DEMO-TICKET-100"] = {
        "title": "Demo Ticket SKU",
        "description": "Demo ticketed apparel for config testing",
        "content": ticket_content,
        "instructions": [{"id": c["id"], "text": c["text"]} for c in ticket_content],
        "images": [],
        "sections": {
            "signature": {"enabled": False, "required": False, "label": "Ticket Signature"},
            "photos": {"enabled": True, "required": False, "label": "Ticket Photos"},
            "markupPad": {
                "enabled": True,
                "required": False,
                "label": "Ticket Markup",
                "mode": "photo",
            },
        },
    }

    payload = {
        "version": 1,
        "vasTypes": dict(sorted(vas_types.items(), key=lambda kv: kv[0].lower())),
        "items": items,
    }

    out_dir = ROOT / "config"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "orgs").mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "vas.default.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"vasTypes={len(vas_types)} items={len(items)}")


if __name__ == "__main__":
    main()
