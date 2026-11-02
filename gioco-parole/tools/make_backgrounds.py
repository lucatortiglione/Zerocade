"""Draw the chapter backgrounds (SVG, 1080x1920) and write data/chapters.json.

Usage: python tools/make_backgrounds.py

Theme (decision 1, option B of the TODO): a garden that grows. Every chapter keeps what
the garden already had and adds to it: more flowers, taller trees, then a path, the
kitchen garden, a hedge, the fountain, the pergola, the apple tree, a brook and the
greenhouse. Season and time of day change from chapter to chapter.
The top half stays sky, behind the overlay's grid; the garden fills the bottom, where
only its sides and edges show around the letter wheel.
Element positions come from fixed seeds, so a flower stays in its spot as the garden grows.
"""
import json
import math
import os
import random

from common import path

W, H = 1080, 1920
GROUND = 1390  # top of the lawn

# (id, name, season, time of day, chapter-only features)
CHAPTERS = [
    (1, "Il primo seme", "spring", "dawn", set()),
    (2, "Germogli", "spring", "day", set()),
    (3, "Terra smossa", "spring", "day", set()),
    (4, "Pioggia leggera", "spring", "rain", {"rain"}),
    (5, "Primi fiori", "spring", "day", set()),
    (6, "Il sentiero", "spring", "day", set()),
    (7, "Margherite", "spring", "day", {"daisies"}),
    (8, "Api operose", "spring", "noon", {"bees"}),
    (9, "L'orto", "spring", "day", set()),
    (10, "Tulipani", "spring", "day", {"tulips"}),
    (11, "Mezzogiorno", "summer", "noon", set()),
    (12, "La siepe", "summer", "day", set()),
    (13, "Girasoli", "summer", "noon", {"sunflowers"}),
    (14, "La fontana", "summer", "day", set()),
    (15, "Lavanda", "summer", "day", set()),
    (16, "Il pergolato", "summer", "day", set()),
    (17, "Tramonto", "summer", "sunset", set()),
    (18, "Lucciole", "summer", "night", {"fireflies"}),
    (19, "Notte d'estate", "summer", "night", set()),
    (20, "Rugiada", "summer", "dawn", {"dew"}),
    (21, "Il melo", "autumn", "day", {"apples"}),
    (22, "Vendemmia", "autumn", "day", {"apples", "grapes"}),
    (23, "Foglie al vento", "autumn", "day", {"leaves"}),
    (24, "Zucche", "autumn", "sunset", {"pumpkins", "leaves"}),
    (25, "Nebbia", "autumn", "mist", {"mist", "pumpkins"}),
    (26, "Il ruscello", "autumn", "day", {"leaves"}),
    (27, "Prima neve", "winter", "snow", {"snowfall"}),
    (28, "La serra", "winter", "day", set()),
    (29, "Disgelo", "spring", "dawn", {"thaw", "tulips"}),
    (30, "Il giardino in fiore", "spring", "day", {"daisies", "tulips", "bees"}),
]

# The garden keeps these from the given chapter on.
BUILT = {"path": 6, "kitchen": 9, "hedge": 12, "fountain": 14, "lavender": 15, "pergola": 16,
         "appletree": 21, "brook": 26, "greenhouse": 28}

SEASONS = {
    "spring": {"hills": ("#b5dca8", "#8ccb84"), "ground": ("#86c062", "#5a9a43"),
               "leaf": ("#6cc04a", "#4fa83a", "#94d46c"), "petal": ("#ff8fab", "#ffd166", "#ffffff", "#c77dff", "#ff9f68")},
    "summer": {"hills": ("#a5cf8f", "#6aae68"), "ground": ("#68a640", "#3f7d2c"),
               "leaf": ("#3f9a35", "#2f7f2c", "#5bb043"), "petal": ("#ff5d73", "#ffcf3f", "#ffffff", "#9b5de5", "#ff8c42")},
    "autumn": {"hills": ("#dcb878", "#bf8f50"), "ground": ("#a3843f", "#755a2a"),
               "leaf": ("#e07a2f", "#c94f2c", "#f2b632"), "petal": ("#d65a31", "#f2b632", "#ffe8c2", "#a55eea", "#c0392b")},
    "winter": {"hills": ("#e8eff6", "#cddbe8"), "ground": ("#f1f5f9", "#d6e2ee"),
               "leaf": ("#4d7c6b", "#3e6658", "#5f8f7c"), "petal": ("#ffffff", "#e0f0ff", "#ffd1dc", "#c7b8ff", "#ffffff")},
}

# Sky gradient (top, bottom), sun or moon (x, y, radius, colour, glow), stars, cloud opacity.
TIMES = {
    "dawn": {"sky": ("#8fb2ec", "#ffd8c2"), "orb": (260, 1080, 70, "#fff1c9", "#ffd2a1"), "stars": 0, "clouds": 0.75},
    "day": {"sky": ("#78c3f0", "#d9f1ff"), "orb": (840, 290, 64, "#fff6cf", "#fff2b0"), "stars": 0, "clouds": 0.9},
    "noon": {"sky": ("#56b2ee", "#c9ecff"), "orb": (540, 200, 72, "#fffbe0", "#fff4b8"), "stars": 0, "clouds": 0.85},
    "rain": {"sky": ("#8a9db3", "#cbd6e2"), "orb": None, "stars": 0, "clouds": 0.95},
    "sunset": {"sky": ("#3c3c8f", "#ff9e6e"), "orb": (540, 1150, 110, "#ffcf7a", "#ff8a5c"), "stars": 0, "clouds": 0.55},
    "night": {"sky": ("#0c1433", "#2f3f7c"), "orb": (820, 300, 54, "#f6f1dc", "#9fb0e8"), "stars": 110, "clouds": 0.0},
    "mist": {"sky": ("#aeb9c4", "#e6ebef"), "orb": (760, 420, 60, "#f5f5ef", "#e6e6dc"), "stars": 0, "clouds": 0.0},
    "snow": {"sky": ("#93a6bb", "#e2e9f1"), "orb": None, "stars": 0, "clouds": 0.95},
}

DUSKY = {"night": 0.55, "sunset": 0.25, "mist": 0.2, "rain": 0.15}


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def mix(hex1, hex2, t):
    a = [int(hex1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(a, b))


class Scene:
    def __init__(self, chapter):
        self.id, self.name, self.season, self.time, self.only = chapter
        self.s = SEASONS[self.season]
        self.t = TIMES[self.time]
        self.dark = DUSKY.get(self.time, 0)
        self.defs, self.back, self.mid, self.front, self.sky_fx = [], [], [], [], []

    def has(self, feature):
        return self.id >= BUILT.get(feature, 99)

    def tone(self, color):
        """Night and dusk dim the garden toward a deep blue."""
        return mix(color, "#14183a", self.dark) if self.dark else color

    # --- sky ---

    def sky(self):
        top, bottom = self.t["sky"]
        self.defs.append(f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/>'
                         f'<stop offset="0.72" stop-color="{bottom}"/></linearGradient>')
        out = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
        rng = random.Random("stars")
        for _ in range(self.t["stars"]):
            x, y, r = rng.uniform(0, W), rng.uniform(0, 1100), rng.uniform(1.2, 3.2)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#fff" opacity="{f(rng.uniform(0.35, 0.95))}"/>')
        if self.t["orb"]:
            x, y, r, color, glow = self.t["orb"]
            self.defs.append(f'<radialGradient id="glow"><stop offset="0" stop-color="{glow}" stop-opacity="0.75"/>'
                             f'<stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient>')
            out.append(f'<circle cx="{x}" cy="{y}" r="{r * 3.4}" fill="url(#glow)"/>')
            out.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>')
            if self.time == "night":  # crescent: the sky colour bites into the moon
                out.append(f'<circle cx="{x + 24}" cy="{y - 14}" r="{r - 4}" fill="{self.t["sky"][0]}"/>')
        alpha = self.t["clouds"]
        if alpha:
            rng = random.Random("clouds")
            fill = "#eef2f6" if self.time in ("rain", "snow") else "#ffffff"
            for i in range(5):
                cx, cy, s = rng.uniform(60, 1020), rng.uniform(120, 980), rng.uniform(0.7, 1.35)
                if i >= 3 and self.time not in ("rain", "snow"):
                    break
                puffs = "".join(f'<circle cx="{f(cx + dx * s)}" cy="{f(cy + dy * s)}" r="{f(r * s)}"/>'
                                for dx, dy, r in ((-70, 10, 42), (-20, -18, 60), (45, 0, 50), (95, 16, 34)))
                out.append(f'<g fill="{fill}" opacity="{alpha * 0.8:.2f}">{puffs}'
                           f'<rect x="{f(cx - 110 * s)}" y="{f(cy + 10 * s)}" width="{f(240 * s)}" height="{f(40 * s)}" rx="{f(20 * s)}"/></g>')
        return out

    # --- land ---

    def hills(self):
        far, near = (self.tone(c) for c in self.s["hills"])
        out = []
        for color, base, amp, seed in ((far, 1180, 70, "far"), (near, 1290, 55, "near")):
            rng = random.Random(seed)
            pts = [(x, base - rng.uniform(0, amp)) for x in range(-120, W + 241, 240)]
            d = f"M{pts[0][0]},{f(pts[0][1])}"
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                d += f" C{x0 + 80},{f(y0)} {x1 - 80},{f(y1)} {x1},{f(y1)}"
            out.append(f'<path d="{d} L{W + 120},{H} L-120,{H}Z" fill="{color}"/>')
        top, bottom = (self.tone(c) for c in self.s["ground"])
        self.defs.append(f'<linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/>'
                         f'<stop offset="1" stop-color="{bottom}"/></linearGradient>')
        out.append(f'<path d="M0,{GROUND + 20} C300,{GROUND - 20} 760,{GROUND - 26} {W},{GROUND + 14} L{W},{H} L0,{H}Z" fill="url(#lawn)"/>')
        return out

    def leaf(self, i):
        return self.tone(self.s["leaf"][i % 3])

    def grass(self):
        """Tufts along the lawn: a few at first, many later."""
        rng = random.Random("grass")
        count = 10 + self.id * 3
        out = []
        for _ in range(count):
            x, y = rng.uniform(0, W), rng.uniform(GROUND + 30, H - 20)
            h = rng.uniform(16, 34)
            color = self.leaf(rng.randrange(3))
            out.append(f'<path d="M{f(x - 8)},{f(y)} q4,-{f(h)} 2,-{f(h * 1.1)} M{f(x)},{f(y)} q1,-{f(h * 1.2)} 6,-{f(h * 1.35)} '
                       f'M{f(x + 7)},{f(y)} q2,-{f(h * 0.8)} 9,-{f(h * 0.9)}" stroke="{color}" stroke-width="4" '
                       f'stroke-linecap="round" fill="none"/>')
        return out

    # --- plants ---

    def flower(self, x, y, size, color, kind):
        stem = self.tone("#3f8a37" if self.season != "autumn" else "#7a6a2e")
        out = [f'<path d="M{f(x)},{f(y)} q-6,{f(size * 1.4)} 2,{f(size * 2.6)}" stroke="{stem}" stroke-width="{f(size * 0.18)}" fill="none" stroke-linecap="round"/>']
        petal = self.tone(color)
        if kind == "tulip":
            out.append(f'<path d="M{f(x - size * 0.6)},{f(y - size * 0.2)} q0,{f(size * 1.1)} {f(size * 0.6)},{f(size * 1.0)} '
                       f'q{f(size * 0.6)},0 {f(size * 0.6)},-{f(size)} l-{f(size * 0.3)},{f(size * 0.35)} l-{f(size * 0.3)},-{f(size * 0.5)} '
                       f'l-{f(size * 0.3)},{f(size * 0.5)}Z" fill="{petal}"/>')
            return out
        if kind == "sunflower":
            petals = "".join(f'<ellipse cx="{f(x + math.cos(a) * size * 0.75)}" cy="{f(y + math.sin(a) * size * 0.75)}" '
                             f'rx="{f(size * 0.42)}" ry="{f(size * 0.16)}" transform="rotate({f(math.degrees(a))} '
                             f'{f(x + math.cos(a) * size * 0.75)} {f(y + math.sin(a) * size * 0.75)})"/>'
                             for a in (k * math.pi / 7 for k in range(14)))
            out.append(f'<g fill="{self.tone("#ffc928")}">{petals}</g>')
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(size * 0.45)}" fill="{self.tone("#6b3f1d")}"/>')
            return out
        n, spread, r = (10, 0.62, 0.3) if kind == "daisy" else (5, 0.5, 0.42)
        color = self.tone("#ffffff") if kind == "daisy" else petal
        petals = "".join(f'<circle cx="{f(x + math.cos(k * 2 * math.pi / n) * size * spread)}" '
                         f'cy="{f(y + math.sin(k * 2 * math.pi / n) * size * spread)}" r="{f(size * r)}"/>' for k in range(n))
        out.append(f'<g fill="{color}">{petals}</g>')
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(size * 0.26)}" fill="{self.tone("#ffd23f" if kind == "daisy" else "#fff3b0")}"/>')
        return out

    def flowers(self):
        rng = random.Random("flowers")
        # Spots for up to 90 flowers, kept for the whole garden; chapter k shows the first 3k.
        spots = []
        for _ in range(90):
            side = rng.random()
            x = rng.uniform(10, 290) if side < 0.42 else rng.uniform(790, 1070) if side < 0.84 else rng.uniform(300, 780)
            y = rng.uniform(GROUND + 40, H - 60) if side < 0.84 else rng.uniform(H - 170, H - 50)
            spots.append((x, y, rng.uniform(13, 22), rng.randrange(5)))
        shown = min(len(spots), self.id * 3)
        if self.season == "winter":
            shown //= 4
        out = []
        for i, (x, y, size, c) in enumerate(sorted(spots[:shown], key=lambda s: s[1])):
            kind = "round"
            if "daisies" in self.only and i % 2 == 0:
                kind = "daisy"
            elif "tulips" in self.only and i % 3 == 1:
                kind = "tulip"
            out += self.flower(x, y, size, self.s["petal"][c], kind)
        if "sunflowers" in self.only or (self.season == "summer" and self.id > 13):
            for k, (x, y) in enumerate(((60, 1300), (140, 1260), (950, 1270), (1030, 1310))):
                if self.season == "summer" and k % 2 and "sunflowers" not in self.only:
                    continue
                out.insert(0, f'<path d="M{x},{y} L{x + 4},{GROUND + 140}" stroke="{self.tone("#3f8a37")}" stroke-width="8"/>')
                out += self.flower(x, y, 34, "#ffc928", "sunflower")
        return out

    def tree(self, x, base, height, fruit=False, wide=1.0):
        trunk = self.tone("#7a5232")
        out = [f'<path d="M{f(x - 18 * wide)},{base} Q{f(x - 6)},{f(base - height * 0.5)} {f(x - 10)},{f(base - height)} '
               f'L{f(x + 10)},{f(base - height)} Q{f(x + 6)},{f(base - height * 0.5)} {f(x + 18 * wide)},{base}Z" fill="{trunk}"/>']
        r = 70 + height * 0.18
        cy = base - height - r * 0.3
        blobs = ((-0.9, 0.35, 0.75), (0.9, 0.3, 0.78), (0, -0.35, 1.0), (-0.45, -0.05, 0.8), (0.5, 0.0, 0.85))
        for k, (dx, dy, s) in enumerate(blobs):
            out.append(f'<circle cx="{f(x + dx * r * wide)}" cy="{f(cy + dy * r)}" r="{f(r * s)}" fill="{self.leaf(k)}"/>')
        if self.season == "winter":
            out.append(f'<path d="M{f(x - r * 1.3)},{f(cy - r * 0.2)} q{f(r * 0.6)},-{f(r * 1.1)} {f(r * 1.3)},-{f(r * 1.05)} '
                       f'q{f(r * 0.8)},0 {f(r * 1.3)},{f(r * 1.0)} q-{f(r * 1.3)},-{f(r * 0.45)} -{f(r * 2.6)},{f(r * 0.05)}Z" fill="#ffffff"/>')
        if fruit:
            rng = random.Random(f"fruit{x}")
            for _ in range(9):
                a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.2, 0.95) * r
                out.append(f'<circle cx="{f(x + math.cos(a) * d * wide)}" cy="{f(cy + math.sin(a) * d * 0.8)}" r="11" fill="{self.tone("#e63946")}"/>')
        return out

    def shrub(self, x, y, r, k):
        return [f'<circle cx="{f(x + dx * r)}" cy="{f(y + dy * r)}" r="{f(r * s)}" fill="{self.leaf(k + i)}"/>'
                for i, (dx, dy, s) in enumerate(((-0.6, 0.1, 0.7), (0.6, 0.12, 0.72), (0, -0.2, 0.85)))]

    # --- structures ---

    def path_stones(self):
        rng = random.Random("path")
        stone = self.tone("#d9cdb6" if self.season != "winter" else "#c7ced8")
        out = []
        for i in range(14):
            t = i / 13
            x = 540 + math.sin(t * 3.1) * 120 * (1 - t * 0.4)
            y = H - 20 - t * (H - GROUND - 40)
            s = 1.0 - t * 0.6
            out.append(f'<ellipse cx="{f(x + rng.uniform(-10, 10))}" cy="{f(y)}" rx="{f(46 * s)}" ry="{f(16 * s)}" fill="{stone}"/>')
        return out

    def kitchen(self):
        soil = self.tone("#7b5a3a")
        out = []
        for row in range(3):
            y = 1640 + row * 70
            out.append(f'<rect x="830" y="{y}" width="230" height="34" rx="17" fill="{soil}"/>')
            for k in range(5):
                x = 850 + k * 46
                if self.season == "winter":
                    out.append(f'<circle cx="{x}" cy="{y + 8}" r="9" fill="#ffffff"/>')
                    continue
                out.append(f'<path d="M{x},{y + 10} q-14,-26 -4,-38 q8,14 4,38 q2,-22 16,-30 q2,18 -16,30" fill="{self.leaf(k)}"/>')
                if self.season in ("summer", "autumn") and (k + row) % 2 == 0:
                    out.append(f'<circle cx="{x + 6}" cy="{y - 6}" r="8" fill="{self.tone("#e8472b")}"/>')
        return out

    def hedge(self):
        color = self.leaf(1)
        out = [f'<rect x="-20" y="{GROUND - 60}" width="300" height="86" rx="40" fill="{color}"/>',
               f'<rect x="800" y="{GROUND - 54}" width="300" height="80" rx="40" fill="{color}"/>']
        if self.season == "winter":
            out += [f'<rect x="-10" y="{GROUND - 64}" width="280" height="22" rx="11" fill="#ffffff"/>',
                    f'<rect x="810" y="{GROUND - 58}" width="280" height="22" rx="11" fill="#ffffff"/>']
        return out

    def fountain(self):
        stone, water = self.tone("#cfd6dd"), self.tone("#8fd3f4" if self.season != "winter" else "#dff3ff")
        x, y = 175, 1560
        out = [f'<ellipse cx="{x}" cy="{y + 40}" rx="120" ry="34" fill="{stone}"/>',
               f'<ellipse cx="{x}" cy="{y + 30}" rx="104" ry="24" fill="{water}"/>',
               f'<rect x="{x - 14}" y="{y - 80}" width="28" height="110" rx="10" fill="{stone}"/>',
               f'<ellipse cx="{x}" cy="{y - 80}" rx="50" ry="14" fill="{stone}"/>']
        if self.season != "winter":
            out += [f'<path d="M{x},{y - 90} q-40,-60 -70,40 M{x},{y - 90} q40,-60 70,40 M{x},{y - 90} q0,-70 0,-70" '
                    f'stroke="{water}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.9"/>']
        return out

    def lavender(self):
        color = self.tone("#9d7be0" if self.season != "winter" else "#b6aecb")
        stem = self.tone("#6f8f5a")
        out = []
        for k in range(9):
            x = 30 + k * 30
            y = 1820 - (k % 2) * 16
            out.append(f'<path d="M{x},{y} l0,-70" stroke="{stem}" stroke-width="5"/>')
            if self.season in ("spring", "summer"):
                out.append("".join(f'<circle cx="{x + (3 if j % 2 else -3)}" cy="{y - 70 - j * 9}" r="6" fill="{color}"/>' for j in range(6)))
        return out

    def pergola(self):
        wood = self.tone("#8a5a36")
        x0, x1, top = 830, 1060, 1180
        out = [f'<rect x="{x0}" y="{top}" width="16" height="{GROUND + 60 - top}" fill="{wood}"/>',
               f'<rect x="{x1 - 16}" y="{top}" width="16" height="{GROUND + 60 - top}" fill="{wood}"/>',
               f'<rect x="{x0 - 30}" y="{top - 18}" width="{x1 - x0 + 60}" height="22" rx="6" fill="{wood}"/>']
        vine = self.leaf(0)
        for k in range(7):
            x = x0 + k * (x1 - x0) / 6
            out.append(f'<circle cx="{f(x)}" cy="{top - 10}" r="{26 if self.season != "winter" else 10}" fill="{vine}"/>')
        if "grapes" in self.only:
            for k in range(4):
                gx = x0 + 30 + k * 60
                out.append("".join(f'<circle cx="{gx + dx}" cy="{top + 20 + dy}" r="8" fill="{self.tone("#6d3fa0")}"/>'
                                   for dx, dy in ((0, 0), (14, 0), (7, 12), (-7, 12), (21, 12), (0, 24), (14, 24), (7, 36))))
        return out

    def brook(self):
        water = self.tone("#7cc6ee" if self.season != "winter" else "#e3f2fb")
        edge = self.tone("#bfe6f8")
        return [f'<path d="M-20,{GROUND + 70} C200,{GROUND + 30} 360,{GROUND + 120} 560,{GROUND + 80} S900,{GROUND + 30} {W + 20},{GROUND + 90} '
                f'L{W + 20},{GROUND + 130} C900,{GROUND + 80} 760,{GROUND + 140} 560,{GROUND + 122} S200,{GROUND + 80} -20,{GROUND + 112}Z" fill="{water}"/>',
                f'<path d="M80,{GROUND + 70} q40,-8 80,0 M620,{GROUND + 96} q40,-8 80,0" stroke="{edge}" stroke-width="4" fill="none" stroke-linecap="round"/>']

    def greenhouse(self):
        frame, glass = self.tone("#ecf3f7"), self.tone("#bfe9f2")
        x, y = 40, GROUND - 120
        return [f'<path d="M{x},{y + 120} L{x},{y + 40} L{x + 90},{y - 20} L{x + 180},{y + 40} L{x + 180},{y + 120}Z" fill="{glass}" opacity="0.85"/>',
                f'<path d="M{x},{y + 120} L{x},{y + 40} L{x + 90},{y - 20} L{x + 180},{y + 40} L{x + 180},{y + 120} M{x + 60},{y + 120} '
                f'L{x + 60},{y + 20} M{x + 120},{y + 120} L{x + 120},{y + 20} M{x},{y + 80} L{x + 180},{y + 80}" stroke="{frame}" '
                f'stroke-width="6" fill="none" stroke-linejoin="round"/>',
                f'<circle cx="{x + 30}" cy="{y + 100}" r="16" fill="{self.tone("#4fa83a")}"/>',
                f'<circle cx="{x + 150}" cy="{y + 98}" r="14" fill="{self.tone("#ff8fab")}"/>']

    # --- weather and wildlife ---

    def effects(self):
        out = []
        if "rain" in self.only:
            rng = random.Random("rain")
            lines = "".join(f'M{f(x)},{f(y)} l-10,34 ' for x, y in ((rng.uniform(0, W + 60), rng.uniform(0, H)) for _ in range(150)))
            out.append(f'<path d="{lines}" stroke="#ffffff" stroke-width="3" opacity="0.45" stroke-linecap="round"/>')
        if "snowfall" in self.only:
            rng = random.Random("snow")
            out.append('<g fill="#ffffff">' + "".join(
                f'<circle cx="{f(rng.uniform(0, W))}" cy="{f(rng.uniform(0, H))}" r="{f(rng.uniform(2.5, 7))}" opacity="{f(rng.uniform(0.5, 0.95))}"/>'
                for _ in range(170)) + "</g>")
        if "thaw" in self.only:
            rng = random.Random("thaw")
            out.append('<g fill="#ffffff" opacity="0.9">' + "".join(
                f'<ellipse cx="{f(rng.uniform(0, W))}" cy="{f(rng.uniform(GROUND + 60, H - 40))}" rx="{f(rng.uniform(30, 80))}" ry="{f(rng.uniform(8, 16))}"/>'
                for _ in range(14)) + "</g>")
        if "leaves" in self.only:
            rng = random.Random("leaves")
            for _ in range(36):
                x, y, a = rng.uniform(0, W), rng.uniform(300, H - 100), rng.uniform(0, 180)
                out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="12" ry="6" transform="rotate({f(a)} {f(x)} {f(y)})" fill="{self.leaf(rng.randrange(3))}"/>')
        if "fireflies" in self.only or self.time == "night":
            rng = random.Random("fireflies")
            self.defs.append('<radialGradient id="fly"><stop offset="0" stop-color="#f6ff9e"/><stop offset="0.3" stop-color="#e6ff6a" stop-opacity="0.8"/>'
                             '<stop offset="1" stop-color="#e6ff6a" stop-opacity="0"/></radialGradient>')
            count = 34 if "fireflies" in self.only else 10
            out.append("".join(f'<circle cx="{f(rng.uniform(0, W))}" cy="{f(rng.uniform(1150, H - 80))}" r="{f(rng.uniform(10, 18))}" fill="url(#fly)"/>'
                               for _ in range(count)))
        if "dew" in self.only:
            rng = random.Random("dew")
            out.append('<g fill="#ffffff">' + "".join(
                f'<path d="M{f(x)},{f(y - 9)} l3,9 -3,9 -3,-9Z M{f(x - 9)},{f(y)} l9,3 9,-3 -9,-3Z" opacity="0.85"/>'
                for x, y in ((rng.uniform(0, W), rng.uniform(GROUND + 30, H - 40)) for _ in range(40))) + "</g>")
        if "bees" in self.only:
            rng = random.Random("bees")
            for _ in range(7):
                x, y = rng.uniform(40, 1040), rng.uniform(1150, 1700)
                out.append(f'<g transform="translate({f(x)} {f(y)})"><ellipse cx="-4" cy="-10" rx="8" ry="6" fill="#ffffff" opacity="0.85"/>'
                           f'<ellipse cx="6" cy="-10" rx="8" ry="6" fill="#ffffff" opacity="0.85"/><ellipse rx="13" ry="9" fill="#ffc928"/>'
                           f'<path d="M-3,-8 v16 M4,-8 v16" stroke="#2b2b2b" stroke-width="3.5"/></g>')
        if "pumpkins" in self.only:
            for x, y, s in ((90, 1700, 1.0), (210, 1760, 0.8), (990, 1730, 1.1), (870, 1800, 0.75)):
                out.append(f'<g transform="translate({x} {y}) scale({s})" fill="{self.tone("#f08a24")}"><ellipse rx="44" ry="34"/>'
                           f'<ellipse cx="-22" rx="24" ry="32" fill="{self.tone("#e27718")}"/><ellipse cx="22" rx="24" ry="32" fill="{self.tone("#e27718")}"/>'
                           f'<rect x="-5" y="-48" width="10" height="18" rx="4" fill="{self.tone("#5b7a2e")}"/></g>')
        if "mist" in self.only:
            self.defs.append('<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/>'
                             '<stop offset="0.5" stop-color="#ffffff" stop-opacity="0.65"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>')
            out += [f'<rect x="0" y="{y}" width="{W}" height="{h}" fill="url(#mist)"/>' for y, h in ((1060, 260), (1380, 220), (1660, 200))]
        return out

    def render(self):
        back = self.sky() + self.hills()
        land = []
        if self.has("brook"):
            land += self.brook()
        if self.has("greenhouse"):
            land += self.greenhouse()
        if self.has("hedge"):
            land += self.hedge()
        # Two trees frame the grid and grow with every chapter; a third joins later.
        grow = min(1.0, 0.25 + self.id / 24)
        land += self.tree(70, GROUND + 70, 120 + 420 * grow, wide=0.9 + grow * 0.3)
        land += self.tree(1010, GROUND + 60, 90 + 380 * grow, wide=0.85 + grow * 0.3)
        if self.has("appletree"):
            land += self.tree(250, GROUND + 40, 260, fruit="apples" in self.only, wide=0.8)
        if self.has("pergola"):
            land += self.pergola()
        land += self.grass()
        if self.has("path"):
            land += self.path_stones()
        if self.id >= 3:
            rng = random.Random("shrubs")
            spots = [(rng.uniform(20, 300), rng.uniform(GROUND + 20, GROUND + 140)) for _ in range(5)] + \
                    [(rng.uniform(780, 1060), rng.uniform(GROUND + 20, GROUND + 140)) for _ in range(5)]
            for k, (x, y) in enumerate(spots[: min(10, self.id // 3 + 1)]):
                land += self.shrub(x, y, 34 + (k % 3) * 8, k)
        if self.has("fountain"):
            land += self.fountain()
        if self.has("lavender"):
            land += self.lavender()
        if self.has("kitchen"):
            land += self.kitchen()
        if self.id <= 2:
            # The first seed and its sprouts, in a small patch of soil.
            land.append(f'<ellipse cx="160" cy="1720" rx="90" ry="26" fill="{self.tone("#7b5a3a")}"/>')
            land.append(f'<path d="M160,1716 q-4,-40 -30,-54 q30,0 30,54 q2,-46 34,-56 q0,34 -34,56" fill="{self.leaf(0)}"/>')
        land += self.flowers()
        land += self.effects()
        body = "".join(back + land)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
                f'preserveAspectRatio="xMidYMax slice"><defs>{"".join(self.defs)}</defs>{body}</svg>\n')


def accent(chapter):
    """The colour of found letters on this chapter's grid: a flower colour of its season."""
    _id, _name, season, _time, _only = chapter
    return {"spring": "#e8577e", "summer": "#ef7d1a", "autumn": "#c8541e", "winter": "#3f86c9"}[season]


def main():
    out_dir = path("assets", "backgrounds")
    os.makedirs(out_dir, exist_ok=True)
    chapters = []
    for chapter in CHAPTERS:
        scene = Scene(chapter)
        svg = scene.render()
        name = f"chapter_{scene.id:02d}.svg"
        with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(svg)
        chapters.append({"id": scene.id, "name": scene.name, "season": scene.season,
                         "time": scene.time, "background": name, "accent": accent(chapter),
                         "sky": scene.t["sky"][0]})
    with open(path("data", "chapters.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"levelsPerChapter": 20, "chapters": chapters}, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    sizes = [os.path.getsize(os.path.join(out_dir, c["background"])) for c in chapters]
    print(f"{len(chapters)} backgrounds ({sum(sizes) // 1024} KB, largest {max(sizes) // 1024} KB) -> {out_dir}")


if __name__ == "__main__":
    main()
