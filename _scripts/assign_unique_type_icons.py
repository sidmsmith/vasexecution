"""Create unique default SVGs per VAS Type and wire iconUrl into configs/generator."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "assets" / "icons"


def slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip()).strip("-").lower()
    return s or "vas-type"


SVGS = {
    "Apply UPC Tags": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#eff6ff"/><rect x="18" y="28" width="60" height="40" rx="6" fill="#2563eb"/><rect x="24" y="34" width="4" height="28" fill="#fff"/><rect x="32" y="34" width="2" height="28" fill="#fff"/><rect x="38" y="34" width="5" height="28" fill="#fff"/><rect x="46" y="34" width="2" height="28" fill="#fff"/><rect x="52" y="34" width="3" height="28" fill="#fff"/><rect x="58" y="34" width="2" height="28" fill="#fff"/><rect x="64" y="34" width="6" height="28" fill="#fff"/><circle cx="72" cy="24" r="10" fill="#f59e0b"/><path d="M68 24h8M72 20v8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>""",
    "Build Packaging Material": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#fff7ed"/><path d="M20 40l28-14 28 14v28l-28 14-28-14z" fill="#ea580c"/><path d="M48 26v42" stroke="#fed7aa" stroke-width="3"/><path d="M20 40l28 14 28-14" stroke="#c2410c" stroke-width="3" fill="none"/><rect x="40" y="48" width="16" height="12" rx="2" fill="#fb923c"/></svg>""",
    "Dicks VAS Activities": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#ecfdf5"/><circle cx="48" cy="48" r="26" fill="#10b981"/><circle cx="48" cy="48" r="10" fill="#fff"/><path d="M48 18v8M48 70v8M18 48h8M70 48h8" stroke="#059669" stroke-width="4" stroke-linecap="round"/><circle cx="48" cy="48" r="3" fill="#059669"/></svg>""",
    "Engravement": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#f5f3ff"/><rect x="22" y="38" width="40" height="30" rx="4" fill="#7c3aed"/><path d="M58 30l16-8 4 8-16 8z" fill="#a78bfa"/><path d="M62 28l8 16" stroke="#5b21b6" stroke-width="3"/><circle cx="34" cy="52" r="5" fill="#ddd6fe"/><path d="M42 58h12" stroke="#ddd6fe" stroke-width="3" stroke-linecap="round"/></svg>""",
    "Generic Instruction": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#f8fafc"/><rect x="26" y="18" width="44" height="60" rx="6" fill="#64748b"/><rect x="32" y="28" width="32" height="4" rx="2" fill="#e2e8f0"/><rect x="32" y="38" width="28" height="4" rx="2" fill="#cbd5e1"/><rect x="32" y="48" width="30" height="4" rx="2" fill="#cbd5e1"/><rect x="32" y="58" width="20" height="4" rx="2" fill="#94a3b8"/><circle cx="66" cy="66" r="14" fill="#0ea5e9"/><path d="M66 60v8M62 68h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>""",
    "Gift Wrap": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#fdf2f8"/><rect x="20" y="40" width="56" height="36" rx="6" fill="#db2777"/><rect x="16" y="28" width="64" height="16" rx="5" fill="#ec4899"/><rect x="44" y="28" width="8" height="48" rx="2" fill="#fbbf24"/><rect x="20" y="42" width="56" height="7" rx="2" fill="#fbbf24"/><path d="M48 28c-5-8-14-10-18-5-3 4 1 9 7 10 4 1 9-1 11-5 2 4 7 6 11 5 6-1 10-6 7-10-4-5-13-3-18 5z" fill="#f59e0b"/></svg>""",
    "Pallet Shrink Wrap": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#ecfeff"/><rect x="22" y="62" width="52" height="10" rx="2" fill="#78716c"/><rect x="26" y="66" width="8" height="10" fill="#57534e"/><rect x="62" y="66" width="8" height="10" fill="#57534e"/><rect x="28" y="30" width="40" height="32" rx="3" fill="rgba(6,182,212,0.35)" stroke="#06b6d4" stroke-width="3"/><rect x="34" y="36" width="28" height="20" rx="2" fill="#0891b2"/></svg>""",
    "Picture": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#fff1f2"/><rect x="18" y="22" width="60" height="52" rx="6" fill="#e11d48"/><rect x="24" y="28" width="48" height="36" rx="3" fill="#ffe4e6"/><circle cx="36" cy="40" r="5" fill="#fb7185"/><path d="M26 58l12-12 10 10 8-8 12 14H26z" fill="#be123c"/></svg>""",
    "Print Price Ticket": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#fefce8"/><rect x="22" y="34" width="52" height="28" rx="4" fill="#ca8a04"/><rect x="30" y="20" width="36" height="18" rx="3" fill="#eab308"/><rect x="30" y="56" width="36" height="18" rx="3" fill="#fef9c3" stroke="#a16207" stroke-width="2"/><text x="48" y="69" text-anchor="middle" font-size="14" font-family="Segoe UI,Arial" font-weight="700" fill="#854d0e">$</text></svg>""",
    "Promotion Flyer": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#fff7ed"/><path d="M28 30h40l-6 40H34z" fill="#f97316"/><rect x="36" y="40" width="24" height="4" rx="2" fill="#ffedd5"/><rect x="36" y="50" width="18" height="4" rx="2" fill="#fed7aa"/><circle cx="70" cy="28" r="12" fill="#ef4444"/><path d="M70 22v8M66 28h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>""",
    "Repack": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#eef2ff"/><rect x="16" y="42" width="28" height="26" rx="3" fill="#6366f1"/><rect x="52" y="34" width="28" height="34" rx="3" fill="#4f46e5"/><path d="M40 48h10M50 48l-4-4M50 48l-4 4" stroke="#818cf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 58H36m0 0l4-4m-4 4l4 4" stroke="#a5b4fc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>""",
    "Reverse VAS": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#fef2f2"/><circle cx="48" cy="48" r="26" fill="#ef4444"/><path d="M58 38c-3-3-7-5-12-5-11 0-18 8-18 18h0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M28 42l-2 12 12-1" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>""",
    "TF-Engravement": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#f0fdfa"/><path d="M48 18l10 22h24l-19 14 7 24-22-15-22 15 7-24-19-14h24z" fill="#14b8a6"/><path d="M48 30l6 14h15l-12 9 4 15-13-9-13 9 4-15-12-9h15z" fill="#99f6e4"/></svg>""",
    "Walmart-Repack": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#eff6ff"/><rect x="20" y="36" width="56" height="36" rx="4" fill="#1d4ed8"/><path d="M28 36v-6a20 12 0 0 1 40 0v6" fill="none" stroke="#3b82f6" stroke-width="5"/><circle cx="48" cy="54" r="10" fill="#facc15"/><path d="M48 46v16M40 54h16" stroke="#1d4ed8" stroke-width="2.5" stroke-linecap="round"/></svg>""",
}

DEFAULT_TYPE_ICON_URL = "/assets/icons/vas-type-default.svg"


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    for name, svg in SVGS.items():
        fname = f"vas-type-{slug(name)}.svg"
        (ICONS / fname).write_text(svg, encoding="utf-8")
        mapping[name] = f"/assets/icons/{fname}"
        print("wrote", fname)

    for rel in ["config/vas.default.json", "config/orgs/SS-DEMO.json"]:
        path = ROOT / rel
        data = json.loads(path.read_text(encoding="utf-8"))
        for key, entry in (data.get("vasTypes") or {}).items():
            if isinstance(entry, dict):
                entry["iconUrl"] = mapping.get(key, DEFAULT_TYPE_ICON_URL)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print("updated", rel)

    gen = ROOT / "_scripts" / "generate_vas_defaults.py"
    text = gen.read_text(encoding="utf-8")
    block_lines = ["TYPE_ICON_URLS = {"]
    for k, v in mapping.items():
        block_lines.append(f"    {json.dumps(k)}: {json.dumps(v)},")
    block_lines.append("}")
    block_lines.append(f'DEFAULT_TYPE_ICON_URL = "{DEFAULT_TYPE_ICON_URL}"')
    block_lines.append("")
    block = "\n".join(block_lines) + "\n"

    if "TYPE_ICON_URLS" in text:
        text = re.sub(
            r"TYPE_ICON_URLS = \{.*?\}\nDEFAULT_TYPE_ICON_URL = \".*?\"\n\n",
            block,
            text,
            count=1,
            flags=re.S,
        )
    else:
        text = text.replace("DEFAULT_SECTIONS = {", block + "DEFAULT_SECTIONS = {", 1)

    text = text.replace(
        '"iconUrl": "/assets/icons/vas-type-default.svg",',
        '"iconUrl": TYPE_ICON_URLS.get(psid, DEFAULT_TYPE_ICON_URL),',
    )
    text = text.replace(
        '"iconUrl": TYPE_ICON_URLS.get(psid, DEFAULT_TYPE_ICON_URL),',
        '"iconUrl": TYPE_ICON_URLS.get(psid, DEFAULT_TYPE_ICON_URL),',
    )
    # If older generator still has literal default only once, ensure get() form exists
    if "TYPE_ICON_URLS.get(psid" not in text:
        text = text.replace(
            '"description": desc,\n',
            '"description": desc,\n        "iconUrl": TYPE_ICON_URLS.get(psid, DEFAULT_TYPE_ICON_URL),\n',
            1,
        )
    gen.write_text(text, encoding="utf-8")
    print("updated generator")


if __name__ == "__main__":
    main()
