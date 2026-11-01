"""Write the category icons and gradient backgrounds as SVG into assets/.

Usage: python tools/make_category_assets.py
Icons are white line pictograms (100x100) meant to sit on the category colour;
backgrounds use the same size ratios measured in the reference app
(category card 981x339, game screen 1125x1395).
"""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")

# Category id -> (gradient start, gradient end, icon body)
CATEGORIES = {
    "cibo": ("#ffb547", "#f97316",
             '<path d="M16 48H84A34 30 0 0 1 16 48Z"/><path d="M38 84h24"/>'
             '<path d="M38 36c-4-5 4-9 0-14M50 36c-4-5 4-9 0-14M62 36c-4-5 4-9 0-14"/>'),
    "soldi": ("#4ade80", "#15803d",
              '<circle cx="50" cy="50" r="34"/><path d="M62 37a15 15 0 1 0 0 26"/><path d="M33 46h22M33 55h22"/>'),
    "fantasia": ("#c084fc", "#7e22ce",
                 '<path d="M22 80 56 46"/><path d="M68 16 72.1 26.3 83.2 27.1 74.7 34.2 77.4 44.9 68 39 58.6 44.9 '
                 '61.3 34.2 52.8 27.1 63.9 26.3Z"/><path d="M28 22v14M21 29h14"/>'),
    "sopravvivenza": ("#a3a36b", "#4d5b2a",
                      '<path d="M12 80 50 20 88 80Z"/><path d="M42 80 50 64 58 80"/>'),
    "viaggi": ("#38bdf8", "#0369a1",
               '<path d="M14 48 86 18 64 84 50 56Z"/><path d="M50 56 86 18"/>'),
    "scuola_lavoro": ("#94a3b8", "#334155",
                      '<rect x="14" y="34" width="72" height="46" rx="8"/>'
                      '<path d="M38 34v-8a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v8"/><path d="M14 54h72"/>'),
    "social_tech": ("#f472b6", "#be185d",
                    '<rect x="30" y="12" width="40" height="76" rx="8"/><path d="M44 22h12"/>'
                    '<path d="M50 64c-10-7-14-12-14-17a6.5 6.5 0 0 1 14-3 6.5 6.5 0 0 1 14 3c0 5-4 10-14 17Z"/>'),
    "sport": ("#fb7185", "#b91c1c",
              '<circle cx="50" cy="50" r="34"/>'
              '<path d="M24 28c13 12 13 32 0 44M76 28c-13 12-13 32 0 44"/>'),
    "tempo": ("#fcd34d", "#b45309",
              '<path d="M28 14h44M28 86h44"/><path d="M33 14v10c0 16 17 20 17 26s-17 10-17 26v10"/>'
              '<path d="M67 14v10c0 16-17 20-17 26s17 10 17 26v10"/><path d="M42 78h16"/>'),
    "amici_famiglia": ("#5eead4", "#0f766e",
                       '<circle cx="36" cy="36" r="12"/><circle cx="67" cy="41" r="10"/>'
                       '<path d="M14 82c0-16 10-26 22-26s22 10 22 26"/><path d="M53 82c0-12 6-20 14-20s14 8 14 20"/>'),
    "dilemmi": ("#818cf8", "#3730a3",
                '<path d="M50 22v60M32 82h36M20 30h60"/><circle cx="50" cy="18" r="4"/>'
                '<path d="M20 30 11 54M20 30l9 24M80 30l-9 24M80 30l9 24"/>'
                '<path d="M9 54q11 14 22 0ZM69 54q11 14 22 0Z"/>'),
    "assurde": ("#facc15", "#ea580c",
                '<circle cx="50" cy="50" r="34"/><path d="M38 40v6M62 37v6"/><path d="M33 62q8 8 17 0t17 0"/>'),
}

ICON = ('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none" '
        'stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">{body}</svg>\n')

GRADIENT = ('<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>'
            '<rect width="{w}" height="{h}" fill="url(#g)"/>{extra}</svg>\n')


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def faint_icon(body, x, y, scale):
    """The category icon, large and faint, used as a watermark on card backgrounds."""
    return (f'<g transform="translate({x} {y}) scale({scale})" opacity="0.16" fill="none" stroke="#fff" '
            f'stroke-width="6" stroke-linecap="round" stroke-linejoin="round">{body}</g>')


for cid, (c1, c2, body) in CATEGORIES.items():
    write(f"category-icons/{cid}.svg", ICON.format(body=body))
    # Portrait deck card (632x832) and wide banner (981x339), the two sizes used by the reference.
    write(f"category-cards/{cid}.svg", GRADIENT.format(w=632, h=832, c1=c1, c2=c2, extra=faint_icon(body, 260, 420, 5)))
    write(f"category-backgrounds/{cid}.svg", GRADIENT.format(w=981, h=339, c1=c1, c2=c2, extra=faint_icon(body, 700, -40, 4.2)))

write("backgrounds/option_a.svg", GRADIENT.format(w=1125, h=1395, c1="#2dd4bf", c2="#0e7f78", extra=""))
write("backgrounds/option_b.svg", GRADIENT.format(w=1125, h=1395, c1="#a78bfa", c2="#5b21b6", extra=""))
write("backgrounds/app_dark.svg", GRADIENT.format(w=1500, h=1800, c1="#1d2042", c2="#0b0c18", extra=""))
print(f"{len(CATEGORIES)} categories written to {os.path.normpath(ROOT)}")
