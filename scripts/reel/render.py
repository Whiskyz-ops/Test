#!/usr/bin/env python3
"""Render the WISING demo-reel rough cut (1080x1350, 4:5, 30fps) from the stills
that scripts/reel/capture.js takes of the real build.

    python3 scripts/reel/render.py <stills_dir> <out.mp4>
    python3 scripts/reel/render.py <stills_dir> <frames_dir> --frames 12.5,30.4

The look is WISING's own: India in gold and the US in cyan (each intake form's
accent), WISING's results in green. Two panes, India above the US, show the
two sides; the signature move is the "ripple", a line running from the number
typed on the India side to every figure it changes on the US side while those
figures tick to their new values. Segments where the founder speaks on camera
are placeholder cards carrying the line and a shooting note; swap them for the
real footage in the edit. Captions follow docs/LAUNCH_REEL.md.

All screen coordinates are CSS pixels of the 1280px-wide capture viewport.
"""
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1350, 30
DPR = 2                                   # capture.js deviceScaleFactor
TOP, BOTTOM = 96, 1104                    # content area between the top bar and captions
SPLIT_GAP = 16
PANE_H = (BOTTOM - TOP - SPLIT_GAP) // 2  # each pane of a split
CAPTION_Y = 1132

ROOT = Path(__file__).resolve().parents[2]
INTER = "/usr/share/fonts/opentype/inter/"
SERIF = ROOT / "monitor-next/node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff"

BG = (9, 9, 11)
CARD = (20, 20, 24)
WHITE = (255, 255, 255)
MUTED = (146, 146, 156)
GOLD = (212, 175, 55)        # India form accent (brandGold)
CYAN = (34, 211, 238)        # US form accent
GREEN = (52, 211, 153)       # WISING
RED = (248, 113, 113)        # WISING critical
HL = {"gold": GOLD, "cyan": CYAN, "green": GREEN, "red": RED}


@lru_cache(None)
def font(weight, size):
    if weight == "Serif":
        return ImageFont.truetype(str(SERIF), size)
    return ImageFont.truetype(f"{INTER}Inter-{weight}.otf", size)


def clamp(t):
    return max(0.0, min(1.0, t))


def ease(t):
    t = clamp(t)
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out(t):
    return 1 - (1 - clamp(t)) ** 3


def keyframes(kfs, t):
    """kfs: [(time, value_tuple)], eased between neighbours."""
    if t <= kfs[0][0]:
        return kfs[0][1]
    for (t0, a), (t1, b) in zip(kfs, kfs[1:]):
        if t <= t1:
            k = ease((t - t0) / (t1 - t0)) if t1 > t0 else 1
            return tuple(x + (y - x) * k for x, y in zip(a, b))
    return kfs[-1][1]


def lerp_col(a, b, k):
    return tuple(int(x + (y - x) * k) for x, y in zip(a, b))


# --------------------------------------------------------------------------
# Timeline. Times in seconds. In captions, *word* is highlighted in the
# caption's colour (hl). "who" is the speaker tag above the caption.
# --------------------------------------------------------------------------
VO = "YOU · VOICE-OVER"
CAM = "YOU · ON CAMERA"
FULL = (TOP, BOTTOM)
UPPER = (TOP, TOP + PANE_H)
LOWER = (BOTTOM - PANE_H, BOTTOM)

EMAIL = dict(
    sender="Rohan Mehta", subject="Quick question about Priya's salary",
    body=("Hi — Priya's employer in India is still paying her while she works "
          "from New York. Do we owe anything? And to which country?"))

TIMELINE = [
    dict(kind="email", t0=0.0, t1=6.5, who=VO,
         captions=[(0.6, "Every cross-border CPA gets this email."),
                   (3.6, "Here's what answering it usually takes.")]),
    dict(kind="screen", t0=6.5, t1=14.5, who=VO,
         panes=[dict(area=UPPER, color=GOLD, tag="INDIA  ·  ₹  ·  APR–MAR", stills=[(6.5, "india_form")],
                     camera=[(6.5, (0, 0, 1280)), (14.5, (40, 20, 1180))],
                     chips=[(7.2, "Tax year Apr–Mar"), (8.6, "Rupees"), (10.0, "ITR"), (11.4, "Schedule FA")]),
                dict(area=LOWER, color=CYAN, tag="US  ·  $  ·  JAN–DEC", stills=[(6.5, "us_form")],
                     camera=[(6.5, (0, 0, 1280)), (14.5, (40, 20, 1180))],
                     chips=[(7.4, "Tax year Jan–Dec"), (8.8, "Dollars"), (10.2, "Form 1040"), (11.6, "FBAR · Form 1116")])],
         captions=[(6.7, "Two tax years. Two currencies."), (9.4, "Two sets of law."),
                   (11.6, "Usually: an afternoon in a spreadsheet.")]),
    dict(kind="talk", t0=14.5, t1=17.5, who=CAM, note="On camera, laptop open beside you.",
         captions=[(14.6, "Here's the same email, answered in *Wising*.")]),
    dict(kind="screen", t0=17.5, t1=28.0, who=VO,
         panes=[dict(area=FULL, color=GOLD, tag="INDIA  ·  PRIYA'S INTAKE FORM",
                     stills=[(17.5, "form_1"), (19.0, "form_type_0"), (19.2, "form_type_1"), (19.4, "form_type_2"),
                             (19.6, "form_type_3"), (19.8, "form_type_4"), (20.0, "form_type_5"),
                             (20.2, "form_type_6"), (20.8, "form_2")],
                     camera=[(17.5, (370, 330, 560)), (23.2, (370, 330, 560)), (24.2, (380, 400, 500))],
                     glows=[dict(t0=18.6, t1=23.6, box=(400, 484, 147, 45), tag="₹24,00,000", tag_t=20.4),
                            dict(t0=24.4, t1=28.0, box=(400, 536, 448, 140), tag="0 days worked in India")])],
         captions=[(17.8, "One number: Priya's salary."), (19.2, "*₹24 lakh*.", "gold"),
                   (21.6, "She worked zero days in India,"), (24.0, "so India *can't* tax it.", "gold"),
                   (26.0, "The US can.", "cyan")]),
    dict(kind="screen", t0=28.0, t1=41.0, who=VO,
         panes=[dict(area=UPPER, color=GOLD, tag="INDIA  ·  PRIYA'S SALARY", stills=[(28.0, "form_2")],
                     camera=[(28.0, (330, 350, 680))],
                     glows=[dict(t0=28.2, t1=41.0, box=(400, 484, 147, 45))]),
                dict(area=LOWER, color=CYAN, tag="US  ·  JOINT RETURN", stills=[(28.0, "priya_before"), (30.2, "priya_after")],
                     fade=0.25, camera=[(28.0, (270, 122, 660))],
                     glows=[dict(t0=30.2, t1=41.0, box=(800, 164, 76, 34)),
                            dict(t0=33.2, t1=41.0, box=(806, 250, 74, 36))])],
         ripples=[dict(t0=29.0, t1=30.2, src=(0, (480, 506)), dst=(1, (838, 181))),
                  dict(t0=31.9, t1=33.2, src=(0, (480, 506)), dst=(1, (843, 268)))],
         tickers=[dict(t0=30.2, pane=1, slot=0, label="Joint US tax", a=87212, b=96465, fmt="${:,.0f}", color=CYAN),
                  dict(t0=33.2, pane=1, slot=1, label="Rohan's share", a=89, b=84, fmt="{:.0f}%", color=CYAN)],
         captions=[(28.3, "Watch it ripple."), (30.3, "The joint US return *recomputes*.", "cyan"),
                   (33.0, "Rohan's share moves too."), (35.6, "Nobody touched his file."),
                   (38.0, "One number. Both countries. Both spouses.")]),
    dict(kind="screen", t0=41.0, t1=52.0, who=VO,
         panes=[dict(area=FULL, color=GREEN, tag="WISING  ·  PRIYA'S CONFLICTS", stills=[(41.0, "priya_after")],
                     camera=[(41.0, (290, 1060, 760)), (43.6, (300, 1210, 640))],
                     glows=[dict(t0=43.8, t1=52.0, box=(311, 1392, 625, 42), color=RED)])],
         tickers=[dict(t0=44.2, pane=0, slot=0, label="Indian tax to stop or recover", a=0, b=3928, fmt="${:,.0f}", color=RED, wide=True)],
         captions=[(41.3, "Then it catches what a spreadsheet misses:"), (44.0, "*$3,928* of Indian tax withheld", "red"),
                   (46.4, "that India can't charge."), (48.4, "Money your client gets back."),
                   (50.2, "That's the line they *remember*.")]),
    dict(kind="screen", t0=52.0, t1=63.0, who=VO,
         panes=[dict(area=FULL, color=GREEN, tag="WISING  ·  RECONCILIATION", stills=[(52.0, "recon_after")],
                     camera=[(52.0, (268, 630, 488)), (57.2, (268, 630, 488)), (58.2, (268, 1200, 488))],
                     glows=[dict(t0=52.6, t1=57.4, box=(287, 721, 446, 61), color=GOLD, tag="Left out of India's tax, with the reason"),
                            dict(t0=58.4, t1=63.0, box=(292, 1272, 436, 78), color=GREEN)])],
         tickers=[dict(t0=58.6, pane=0, slot=0, label="Unrelieved double tax", a=4408, b=3873, fmt="${:,.0f}", color=GREEN, wide=True)],
         captions=[(52.3, "Every figure shows its working."), (54.6, "The salary leaves India's computation, with the reason."),
                   (58.0, "Double tax drops to *$3,873*."), (60.4, "Which form. Which rule.")]),
    dict(kind="talk", t0=63.0, t1=67.0, who=CAM, note="Back to camera. Calm, slower.",
         captions=[(63.1, "One number."), (64.0, "Both countries. Both spouses."), (65.4, "Shown working.")]),
    dict(kind="talk", t0=67.0, t1=75.0, who=CAM, note="Straight to camera. This is the ask: say it plainly.",
         captions=[(67.1, "Send us one anonymised India–US client."), (70.0, "We'll run it and send you the full dashboard"),
                   (72.4, "within *48 hours*.")]),
    dict(kind="end", t0=75.0, t1=78.0),
]
DURATION = TIMELINE[-1]["t1"]


# --------------------------------------------------------------------------
# Drawing helpers
# --------------------------------------------------------------------------
def rounded(d, box, r, **kw):
    d.rounded_rectangle([round(v) for v in box], radius=r, **kw)


def comp(img, layer, pos=(0, 0)):
    """Blend an RGBA layer over the RGB frame."""
    img.paste(layer, (int(pos[0]), int(pos[1])), layer)


def glow_layer(size, draw_fn, blur):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def parse_rich(text):
    """'a *b*. c' -> words, each a list of (fragment, highlighted)."""
    out, hi, prev = [], False, " "
    for part in text.split("*"):
        for i, w in enumerate(part.split(" ")):
            if not w:
                continue
            if i == 0 and out and not prev.endswith(" "):
                out[-1].append((w, hi))      # e.g. the "." right after a highlight
            else:
                out.append([(w, hi)])
        prev = part or prev
        hi = not hi
    return out


def draw_caption(img, who, text, hl, t_in, t):
    """Lower-third caption: speaker tag, then left-aligned text beside a colour bar."""
    k = ease_out((t - t_in) / 0.25)
    accent = HL.get(hl, GREEN)
    f = font("SemiBold", 46)
    space = f.getlength(" ")
    lines, cur, cur_w = [], [], 0
    for word in parse_rich(text):
        ww = sum(f.getlength(w) for w, _ in word)
        if cur and cur_w + space + ww > 900:
            lines.append(cur); cur, cur_w = [], 0
        cur_w += (space if cur else 0) + ww
        cur.append(word)
    lines.append(cur)
    d = ImageDraw.Draw(img, "RGBA")
    x0 = 64 - (1 - k) * 24
    d.text((64, CAPTION_Y), who, font=font("Bold", 22), fill=MUTED)
    bar_h = 58 * len(lines)
    d.rectangle([40, CAPTION_Y + 40, 46, CAPTION_Y + 40 + bar_h * k], fill=accent)
    a = int(255 * k)
    for i, line in enumerate(lines):
        x, y = x0, CAPTION_Y + 38 + i * 58
        for word in line:
            for w, hi in word:
                d.text((x, y), w, font=f, fill=(accent if hi else WHITE) + (a,))
                x += f.getlength(w)
            x += space


def draw_top_bar(img, right):
    d = ImageDraw.Draw(img, "RGBA")
    d.text((40, 48), "W I S I N G", font=font("Serif", 40), fill=WHITE, anchor="lm")
    d.text((W - 40, 48), right, font=font("Medium", 22), fill=MUTED, anchor="rm")


def draw_tag(img, xy, text, color, anchor="lt"):
    d = ImageDraw.Draw(img, "RGBA")
    f = font("Bold", 22)
    tw = f.getlength(text)
    x, y = xy
    if anchor == "lb":
        y -= 40
    rounded(d, (x, y, x + tw + 28, y + 40), 10, fill=(12, 12, 14), outline=color, width=2)
    d.text((x + 14, y + 20), text, font=f, fill=color, anchor="lm")


def fmt_num(fmt, v):
    return fmt.format(v)


# --------------------------------------------------------------------------
# Panes
# --------------------------------------------------------------------------
class Stills:
    def __init__(self, root):
        self.root = Path(root)
        self.cache = {}

    def get(self, name):
        if name not in self.cache:
            if len(self.cache) > 5:
                self.cache.pop(next(iter(self.cache)))
            self.cache[name] = Image.open(self.root / f"{name}.png").convert("RGB")
        return self.cache[name]


class PaneView:
    """Maps capture CSS coordinates into a pane's place in the frame."""

    def __init__(self, pane, t):
        y0, y1 = pane["area"]
        self.x0, self.y0, self.w, self.h = 24, y0, W - 48, y1 - y0
        cx, cy, cw = keyframes(pane["camera"], t)
        self.cx, self.cy, self.cw = cx, cy, cw
        self.ch = cw * self.h / self.w
        self.scale = self.w / cw

    def to_frame(self, px, py):
        return (self.x0 + (px - self.cx) * self.scale, self.y0 + (py - self.cy) * self.scale)

    def crop(self, src):
        box = [self.cx * DPR, self.cy * DPR, (self.cx + self.cw) * DPR, (self.cy + self.ch) * DPR]
        return src.crop([round(v) for v in box]).resize((self.w, self.h), Image.LANCZOS)


def draw_pane(img, pane, t, stills):
    v = PaneView(pane, t)
    names = pane["stills"]
    cur = max((s for s in names if s[0] <= t), key=lambda s: s[0])
    view = v.crop(stills.get(cur[1]))
    fade = pane.get("fade")
    idx = names.index(cur)
    if fade and idx > 0 and t - cur[0] < fade:
        view = Image.blend(v.crop(stills.get(names[idx - 1][1])), view, (t - cur[0]) / fade)
    mask = Image.new("L", (v.w, v.h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, v.w - 1, v.h - 1], radius=22, fill=255)
    img.paste(view, (v.x0, v.y0), mask)

    for g in pane.get("glows", []):
        if not g["t0"] <= t < g["t1"]:
            continue
        k = ease_out((t - g["t0"]) / 0.35)
        col = g.get("color", pane["color"])
        bx, by, bw, bh = g["box"]
        x0, y0 = v.to_frame(bx, by)
        x1, y1 = v.to_frame(bx + bw, by + bh)
        breathe = 0.75 + 0.25 * abs(((t - g["t0"]) % 1.6) / 0.8 - 1)
        comp(img, glow_layer(img.size, lambda d: rounded(
            d, (x0 - 4, y0 - 4, x1 + 4, y1 + 4), 14, outline=col + (int(220 * k * breathe),), width=10), 10))
        rounded(ImageDraw.Draw(img, "RGBA"), (x0, y0, x1, y1), 12, outline=col + (int(255 * k),), width=3)
        if g.get("tag") and k > 0.3 and t >= g.get("tag_t", 0):
            draw_tag(img, (max(v.x0 + 12, x0), min(y1 + 12, v.y0 + v.h - 52)), g["tag"], col)

    d = ImageDraw.Draw(img, "RGBA")
    rounded(d, (v.x0, v.y0, v.x0 + v.w, v.y0 + v.h), 22, outline=pane["color"] + (200,), width=3)
    draw_tag(img, (v.x0 + 16, v.y0 + 16), pane["tag"], pane["color"])

    chips = [c for c in pane.get("chips", []) if c[0] <= t]
    for i, (c_t, text) in enumerate(chips):
        k = ease_out((t - c_t) / 0.3)
        f = font("ExtraBold", 40)
        tw = f.getlength(text)
        col, row = i % 2, i // 2
        x = v.x0 + 24 + col * 500
        y = v.y0 + v.h - 150 + row * 70 + (1 - k) * 20
        rounded(d, (x, y, x + tw + 40, y + 58), 14, fill=(10, 10, 12, int(235 * k)), outline=pane["color"] + (int(255 * k),), width=3)
        d.text((x + 20, y + 29), text, font=f, fill=pane["color"] + (int(255 * k),), anchor="lm")
    return v


def draw_ripple(img, r, views, t):
    """A line from the India figure to the US figure it changes, gold turning cyan."""
    p = ease((t - r["t0"]) / (r["t1"] - r["t0"]))
    if p <= 0:
        return
    sx, sy = views[r["src"][0]].to_frame(*r["src"][1])
    ex, ey = views[r["dst"][0]].to_frame(*r["dst"][1])
    c1 = (sx, sy + (ey - sy) * 0.55)
    c2 = (ex, sy + (ey - sy) * 0.45)
    n = 60
    pts = []
    for i in range(int(n * p) + 1):
        u = i / n
        x = (1 - u) ** 3 * sx + 3 * (1 - u) ** 2 * u * c1[0] + 3 * (1 - u) * u * u * c2[0] + u ** 3 * ex
        y = (1 - u) ** 3 * sy + 3 * (1 - u) ** 2 * u * c1[1] + 3 * (1 - u) * u * u * c2[1] + u ** 3 * ey
        pts.append((x, y, lerp_col(GOLD, CYAN, u)))
    fade = 1 - clamp((t - r["t1"] - 0.6) / 0.6)
    if fade <= 0:
        return

    def strokes(d, width, alpha):
        for (x0, y0, c), (x1, y1, _) in zip(pts, pts[1:]):
            d.line([x0, y0, x1, y1], fill=c + (int(alpha * fade),), width=width)

    comp(img, glow_layer(img.size, lambda d: strokes(d, 16, 160), 9))
    strokes(ImageDraw.Draw(img, "RGBA"), 4, 255)
    hx, hy, hc = pts[-1]
    if p < 1:
        comp(img, glow_layer(img.size, lambda d: d.ellipse([hx - 16, hy - 16, hx + 16, hy + 16], fill=hc + (230,)), 8))
        ImageDraw.Draw(img, "RGBA").ellipse([hx - 7, hy - 7, hx + 7, hy + 7], fill=WHITE)
    else:
        k = clamp((t - r["t1"]) / 0.5)
        rr = 10 + 50 * k
        ImageDraw.Draw(img, "RGBA").ellipse([ex - rr, ey - rr, ex + rr, ey + rr], outline=CYAN + (int(255 * (1 - k)),), width=4)


def draw_ticker(img, tk, view, t):
    k = ease_out((t - tk["t0"]) / 0.35)
    if k <= 0:
        return
    tick = ease((t - tk["t0"] - 0.15) / 1.1)
    val = tk["a"] + (tk["b"] - tk["a"]) * tick
    w = (view.w - 48) if tk.get("wide") else (view.w - 72) // 2
    h = 132
    x = view.x0 + 24 + tk["slot"] * (w + 24)
    y = view.y0 + view.h - h - 24 + (1 - k) * 24
    d = ImageDraw.Draw(img, "RGBA")
    comp(img, glow_layer(img.size, lambda dd: rounded(dd, (x, y + 8, x + w, y + h + 8), 20, fill=(0, 0, 0, 200)), 14))
    rounded(d, (x, y, x + w, y + h), 20, fill=(14, 14, 18, int(250 * k)), outline=tk["color"] + (int(255 * k),), width=3)
    d.text((x + 24, y + 30), tk["label"].upper(), font=font("Bold", 22), fill=MUTED + (int(255 * k),), anchor="lm")
    d.text((x + 24, y + 86), fmt_num(tk["fmt"], val), font=font("ExtraBold", 60), fill=tk["color"] + (int(255 * k),), anchor="lm")
    was = "was " + fmt_num(tk["fmt"], tk["a"])
    d.text((x + w - 24, y + 92), was, font=font("Medium", 26), fill=MUTED + (int(255 * k * tick),), anchor="rm")


# --------------------------------------------------------------------------
# Scenes
# --------------------------------------------------------------------------
def new_frame():
    return Image.new("RGB", (W, H), BG)


def screen_frame(seg, t, stills):
    img = new_frame()
    views = [draw_pane(img, p, t, stills) for p in seg["panes"]]
    for r in seg.get("ripples", []):
        if t >= r["t0"]:
            draw_ripple(img, r, views, t)
    for tk in seg.get("tickers", []):
        if t >= tk["t0"]:
            draw_ticker(img, tk, views[tk["pane"]], t)
    draw_top_bar(img, "Example client · illustrative")
    return img


def email_frame(seg, t):
    img = new_frame()
    d = ImageDraw.Draw(img, "RGBA")
    x0, y0, x1, y1 = 48, 200, W - 48, 900
    k = ease_out((t - seg["t0"]) / 0.4)
    y_off = (1 - k) * 30
    rounded(d, (x0, y0 + y_off, x1, y1 + y_off), 28, fill=CARD, outline=(44, 44, 52), width=2)
    y = y0 + y_off
    d.ellipse([x0 + 36, y + 40, x0 + 108, y + 112], fill=(58, 58, 70))
    d.text((x0 + 72, y + 76), "RM", font=font("Bold", 28), fill=WHITE, anchor="mm")
    d.text((x0 + 132, y + 58), EMAIL["sender"], font=font("Bold", 34), fill=WHITE, anchor="lm")
    d.text((x0 + 132, y + 98), "to me  ·  9:14 AM", font=font("Medium", 26), fill=MUTED, anchor="lm")
    d.text((x0 + 36, y + 170), EMAIL["subject"], font=font("Bold", 40), fill=WHITE, anchor="lm")
    d.line([x0 + 36, y + 216, x1 - 36, y + 216], fill=(44, 44, 52), width=2)
    # body types on
    body = EMAIL["body"]
    n = int(len(body) * clamp((t - seg["t0"] + 0.4) / 2.8))  # first words already on frame one
    f = font("Regular", 38)
    words, lines, cur = body[:n].split(" "), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if f.getlength(test) > x1 - x0 - 72:
            lines.append(cur); cur = w
        else:
            cur = test
    lines.append(cur)
    for i, line in enumerate(lines):
        d.text((x0 + 36, y + 250 + i * 56), line, font=f, fill=(222, 222, 228))
    if n < len(body) and int(t * 2) % 2 == 0:
        lx = x0 + 36 + f.getlength(lines[-1]) + 4
        ly = y + 250 + (len(lines) - 1) * 56
        d.rectangle([lx, ly + 6, lx + 3, ly + 46], fill=WHITE)
    draw_top_bar(img, "Example client · illustrative")
    return img


def talk_frame(seg, t):
    img = new_frame()
    d = ImageDraw.Draw(img, "RGBA")
    rounded(d, (24, TOP, W - 24, BOTTOM), 22, fill=CARD, outline=(44, 44, 52), width=2)
    tag = "YOU · ON CAMERA"
    f = font("Bold", 28)
    tw = f.getlength(tag)
    rounded(d, (W / 2 - tw / 2 - 26, 470, W / 2 + tw / 2 + 26, 526), 28, fill=(16, 44, 36), outline=GREEN, width=2)
    d.text((W / 2, 498), tag, font=f, fill=GREEN, anchor="mm")
    nf = font("Medium", 34)
    words, lines, cur = seg["note"].split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if nf.getlength(test) > 820:
            lines.append(cur); cur = w
        else:
            cur = test
    lines.append(cur)
    for i, line in enumerate(lines):
        d.text((W / 2, 600 + i * 50), line, font=nf, fill=MUTED, anchor="mm")
    draw_top_bar(img, "Placeholder · replace with footage")
    return img


@lru_cache(None)
def logo(stills_root, height):
    im = Image.open(Path(stills_root) / "logo.png").convert("RGBA")
    return im.resize((int(im.width * height / im.height), height), Image.LANCZOS)


def end_frame(seg, t, stills):
    img = new_frame()
    k = ease_out((t - seg["t0"]) / 0.6)
    a = int(255 * k)
    mark = logo(str(stills.root), 150).copy()
    mark.putalpha(mark.getchannel("A").point(lambda v: int(v * k)))
    comp(img, mark, ((W - mark.width) // 2, 300))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((W / 2, 540), "W I S I N G", font=font("Serif", 76), fill=WHITE + (a,), anchor="mm")
    d.text((W / 2, 640), "Send one India–US client.", font=font("SemiBold", 44), fill=WHITE + (a,), anchor="mm")
    d.text((W / 2, 700), "Get the full dashboard in 48 hours.", font=font("SemiBold", 44), fill=MUTED + (a,), anchor="mm")
    rounded(d, (W / 2 - 300, 800, W / 2 + 300, 900), 50, fill=GREEN + (a,))
    d.text((W / 2, 850), "[ your booking link ]", font=font("ExtraBold", 40), fill=(4, 18, 15, a), anchor="mm")
    return img


def frame_at(t, stills):
    seg = next((s for s in TIMELINE if s["t0"] <= t < s["t1"]), TIMELINE[-1])
    kind = seg["kind"]
    if kind == "end":
        return end_frame(seg, t, stills)
    img = {"screen": lambda: screen_frame(seg, t, stills), "email": lambda: email_frame(seg, t),
           "talk": lambda: talk_frame(seg, t)}[kind]()
    caps = [c for c in seg["captions"] if c[0] <= t]
    if caps:
        c = caps[-1]
        draw_caption(img, seg["who"], c[1], c[2] if len(c) > 2 else "green", c[0], t)
    return img


def main():
    stills_dir, out = sys.argv[1], sys.argv[2]
    stills = Stills(stills_dir)
    if "--frames" in sys.argv:
        Path(out).mkdir(parents=True, exist_ok=True)
        for t in sys.argv[sys.argv.index("--frames") + 1].split(","):
            frame_at(float(t), stills).save(f"{out}/t_{t}.png")
        return
    n = int(DURATION * FPS)
    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", out],
        stdin=subprocess.PIPE)
    for i in range(n):
        ff.stdin.write(frame_at(i / FPS, stills).tobytes())
        if i % (FPS * 5) == 0:
            print(f"{i / FPS:5.1f}s / {DURATION:.0f}s", flush=True)
    ff.stdin.close()
    ff.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
