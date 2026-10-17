#!/usr/bin/env python3
"""Render the WISING launch-reel rough cut (1080x1920, 30fps) from the stills
that scripts/reel/capture.js takes of the real build.

    python3 scripts/reel/render.py <stills_dir> <out.mp4>
    python3 scripts/reel/render.py <stills_dir> <frames_dir> --frames 12.5,40.9

Screen segments crop the real screenshots with a moving "camera" and add a
Clicky-style cursor, outline and red callout pill. Segments where the founder
talks on camera are placeholder cards carrying the line and a shooting note;
swap them for the real footage in the edit. Captions follow docs/LAUNCH_REEL.md.
All coordinates are CSS pixels of the 1280px-wide capture viewport.
"""
import math
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
DPR = 2                                  # capture.js deviceScaleFactor
WIN_Y, WIN_H = 230, 1350                 # product window inside the frame
CAM_AR = WIN_H / W                       # camera rect height / width
CAPTION_Y = 1450                         # caption centre (above the IG UI)

FONT_DIR = "/usr/share/fonts/opentype/inter/"
BG = (10, 10, 11)
WHITE = (255, 255, 255)
MUTED = (150, 150, 158)
GREEN = (52, 211, 153)
RED = (239, 68, 68)
CURSOR = (96, 165, 250)


@lru_cache(None)
def font(weight, size):
    return ImageFont.truetype(f"{FONT_DIR}Inter-{weight}.otf", size)


def ease(t):
    t = max(0.0, min(1.0, t))
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def pop(t):
    """0→1 with a little overshoot, for labels appearing."""
    t = max(0.0, min(1.0, t))
    c = 1.70158
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2


def keyframes(kfs, t):
    """kfs: [(time, value_tuple)], eased between neighbours."""
    if t <= kfs[0][0]:
        return kfs[0][1]
    for (t0, a), (t1, b) in zip(kfs, kfs[1:]):
        if t <= t1:
            k = ease((t - t0) / (t1 - t0)) if t1 > t0 else 1
            return tuple(x + (y - x) * k for x, y in zip(a, b))
    return kfs[-1][1]


def active(events, t):
    return [e for e in events if e["t0"] <= t < e["t1"]]


# --------------------------------------------------------------------------
# Timeline. Times in seconds. Lines are the spoken script; *word* = highlight.
# --------------------------------------------------------------------------
TALK = "talk"
SCREEN = "screen"

TIMELINE = [
    dict(kind=TALK, t0=0.0, t1=4.2, note="Close-up. Chalkboard behind you: two overlapping circles, IN and US.",
         captions=[(0.0, "This couple earns"), (1.0, "in India *and* the US."), (2.2, "*$4,408* of it"), (3.2, "is taxed *twice*.")]),
    dict(kind=TALK, t0=4.2, t1=8.0, note="Tap the overlap on the chalkboard.",
         captions=[(4.2, "So we built a system"), (5.4, "that reads *both* countries'"), (6.8, "tax law at once.")]),
    dict(kind=TALK, t0=8.0, t1=11.0, note="Turn the laptop toward the camera.",
         captions=[(8.0, "Meet Rohan."), (8.9, "Engineer in New York."), (9.9, "Business in Pune.")]),
    dict(kind=SCREEN, t0=11.0, t1=27.0,
         stills=[(11.0, "rohan")],
         camera=[(11.0, (262, 330, 996)), (15.4, (262, 330, 996)), (16.4, (700, 820, 560)),
                 (19.4, (700, 820, 560)), (20.4, (282, 1010, 660)), (23.4, (282, 1010, 660)),
                 (24.4, (600, 2120, 560))],
         cursor=[(11.6, (760, 900)), (12.4, (458, 496)), (13.8, (458, 496)), (14.6, (947, 545)),
                 (16.4, (947, 545)), (17.2, (1083, 1143)), (20.4, (1083, 1143)), (21.2, (420, 1396)),
                 (24.4, (420, 1396)), (25.2, (860, 2437))],
         marks=[dict(t0=12.5, t1=16.2, box=(410, 470, 120, 52), label="US · $37,014 unpaid", side="above"),
                dict(t0=14.7, t1=16.2, box=(900, 520, 120, 52), label="India · $14,032 unpaid", side="below"),
                dict(t0=17.3, t1=20.2, box=(925, 1114, 316, 58), label="2 advance-tax payments missed", side="below"),
                dict(t0=21.3, t1=24.2, box=(298, 1374, 296, 46), label="Taxed twice · $4,408", side="below"),
                dict(t0=25.3, t1=27.0, box=(768, 2340, 232, 282), label="FBAR due · 542% over", side="above")],
         captions=[(11.2, "Both countries"), (12.4, "say he *owes* them."), (14.6, "Both are right."),
                   (16.4, "He's missed two"), (17.6, "tax payments in India…"), (20.4, "…and *$4,408*"),
                   (21.6, "is being taxed *twice*."), (24.4, "Plus forms"), (25.4, "he's never heard of.")]),
    dict(kind=TALK, t0=27.0, t1=30.0, note="Reaction. Grin at the camera.",
         captions=[(27.0, "That's a CPA's afternoon"), (28.2, "of spreadsheets."), (29.0, "Done in *seconds*.")]),
    dict(kind=TALK, t0=30.0, t1=33.5, note="Lean in. This is Clicky's 'something actually hard' beat.",
         captions=[(30.0, "But here's what"), (31.0, "actually breaks"), (32.2, "the spreadsheet.")]),
    dict(kind=TALK, t0=33.5, t1=37.0, note="Over the shoulder: the India form open on the laptop.",
         captions=[(33.5, "His wife Priya's"), (34.4, "Indian employer pays her"), (35.6, "while she works from *New York*.")]),
    dict(kind=SCREEN, t0=37.0, t1=44.5,
         stills=[(37.0, "form_0"), (38.0, "form_1"), (39.3, "form_type_0"), (39.5, "form_type_1"),
                 (39.7, "form_type_2"), (39.9, "form_type_3"), (40.1, "form_type_4"), (40.3, "form_type_5"),
                 (40.5, "form_type_6"), (40.9, "form_2")],
         camera=[(37.0, (360, 150, 540)), (40.9, (360, 150, 540)), (41.7, (370, 300, 520))],
         cursor=[(37.2, (640, 420)), (37.9, (824, 281)), (38.5, (824, 281)), (39.1, (470, 506)),
                 (41.0, (470, 506)), (41.7, (620, 600))],
         clicks=[37.95, 39.15],
         marks=[dict(t0=38.1, t1=39.1, box=(800, 262, 52, 38), label="Add her salary", side="below"),
                dict(t0=39.3, t1=41.0, box=(400, 484, 147, 45), label="₹24 lakh", side="below"),
                dict(t0=41.8, t1=44.5, box=(400, 536, 448, 140), label="0 days in India → India can't tax it", side="below")],
         captions=[(37.2, "One edit."), (38.2, "Her salary:"), (39.3, "*₹24 lakh*."), (41.0, "India *can't* tax it."),
                   (42.6, "The US can.")]),
    dict(kind=SCREEN, t0=44.5, t1=53.0,
         stills=[(44.5, "priya_before"), (46.2, "priya_after")], fade=0.3,
         camera=[(44.5, (270, 130, 640)), (49.6, (270, 130, 640)), (50.6, (282, 1000, 660))],
         cursor=[(44.7, (600, 600)), (45.4, (839, 182)), (47.6, (839, 182)), (48.2, (845, 269)),
                 (50.6, (845, 269)), (51.3, (480, 1413))],
         clicks=[46.1],
         marks=[dict(t0=45.5, t1=46.2, box=(804, 166, 70, 32), label="Joint US tax $87,212", side="below"),
                dict(t0=46.4, t1=47.8, box=(804, 166, 70, 32), label="$87,212 → $96,465", side="below"),
                dict(t0=48.3, t1=50.4, box=(730, 250, 150, 34), label="Rohan 89% → 84%", side="below"),
                dict(t0=51.4, t1=53.0, box=(311, 1392, 560, 42), label="New · $3,928 to stop or recover", side="below")],
         captions=[(44.7, "Refresh."), (45.6, "The joint US return"), (46.4, "*recomputes*."),
                   (47.8, "Rohan's share moved."), (49.0, "Nobody touched his file."),
                   (50.6, "And it caught *$3,928*"), (51.8, "of Indian tax to claw back.")]),
    dict(kind=TALK, t0=53.0, t1=56.5, note="Back to camera. Slow down.",
         captions=[(53.0, "One edit."), (53.9, "Two countries. Two people."), (55.2, "Everything in *sync*.")]),
    dict(kind=TALK, t0=56.5, t1=61.0, note="Straight to camera, deadpan. Your version of Clicky's 'I dare you.'",
         captions=[(56.5, "If you file for Indians in the US,"), (58.0, "send us your *hardest* client."),
                   (59.6, "Comment *WISING*.")]),
    dict(kind="end", t0=61.0, t1=63.0),
]
DURATION = TIMELINE[-1]["t1"]


# --------------------------------------------------------------------------
# Drawing helpers
# --------------------------------------------------------------------------
def parse_rich(text):
    """'a *b* c' -> [(word, highlighted)]"""
    out, hi, prev = [], False, " "
    for part in text.split("*"):
        for i, w in enumerate(part.split(" ")):
            if not w:
                continue
            if i == 0 and out and not prev.endswith(" "):
                out[-1][0].append((w, hi))   # e.g. the "." right after a highlight
            else:
                out.append(([(w, hi)],))
        prev = part or prev
        hi = not hi
    return [t[0] for t in out]


def draw_caption(img, text, t_in, t):
    if not text:
        return
    words = parse_rich(text)
    f = font("ExtraBold", 66)
    space = f.getlength(" ")
    lines, cur, cur_w = [], [], 0
    for word in words:
        ww = sum(f.getlength(w) for w, _ in word)
        if cur and cur_w + space + ww > 900:
            lines.append(cur); cur, cur_w = [], 0
        cur_w += (space if cur else 0) + ww
        cur.append((word, ww))
    lines.append(cur)
    k = pop((t - t_in) / 0.18)
    line_h = 80
    total_h = line_h * len(lines)
    y0 = CAPTION_Y - total_h / 2 + (1 - k) * 18
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i, line in enumerate(lines):
        lw = sum(ww for _, ww in line) + space * (len(line) - 1)
        x = (W - lw) / 2
        y = y0 + i * line_h
        for word, ww in line:
            for w, hi in word:
                col = GREEN if hi else WHITE
                d.text((x, y), w, font=f, fill=col + (int(255 * min(1, k)),), stroke_width=7, stroke_fill=(0, 0, 0, int(230 * min(1, k))))
                x += f.getlength(w)
            x += space
    img.alpha_composite(layer)


def rounded(d, box, r, **kw):
    d.rounded_rectangle([round(v) for v in box], radius=r, **kw)


def draw_pill(img, text, anchor, side, k, color=RED):
    f = font("Bold", 40)
    tw = f.getlength(text)
    pw, ph = tw + 48, 68
    ax, ay = anchor
    x = min(max(ax - pw / 2, 40), W - 40 - pw)
    y = ay + 22 if side == "below" else ay - 22 - ph
    y = min(max(y, WIN_Y + 20), WIN_Y + WIN_H - ph - 20)
    s = 0.6 + 0.4 * k
    layer = Image.new("RGBA", (int(pw) + 40, ph + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rounded(d, (20, 24, 20 + pw, 24 + ph), 18, fill=(0, 0, 0, 120))
    layer = layer.filter(ImageFilter.GaussianBlur(8))
    d = ImageDraw.Draw(layer)
    rounded(d, (20, 20, 20 + pw, 20 + ph), 18, fill=color + (255,))
    d.text((20 + 24, 20 + ph / 2), text, font=f, fill=WHITE, anchor="lm")
    lw, lh = layer.size
    layer = layer.resize((max(1, int(lw * s)), max(1, int(lh * s))), Image.LANCZOS)
    a = layer.getchannel("A").point(lambda v: int(v * min(1, k)))
    layer.putalpha(a)
    cx, cy = x + pw / 2, y + ph / 2
    img.alpha_composite(layer, (int(cx - layer.size[0] / 2), int(cy - layer.size[1] / 2)))


def draw_cursor(img, pos, press=0.0):
    x, y = pos
    s = 1.0 - 0.18 * press
    pts = [(0, 0), (0, 46), (12, 35), (21, 55), (30, 51), (21, 32), (37, 32)]
    pts = [(x + px * s, y + py * s) for px, py in pts]
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.polygon([(px + 3, py + 5) for px, py in pts], fill=(0, 0, 0, 110))
    layer = layer.filter(ImageFilter.GaussianBlur(4))
    d = ImageDraw.Draw(layer)
    d.polygon(pts, fill=CURSOR + (255,), outline=WHITE + (255,), width=4)
    img.alpha_composite(layer)


def draw_ripple(img, pos, k):
    if not 0 <= k <= 1:
        return
    d = ImageDraw.Draw(img)
    r = 14 + 46 * k
    a = int(220 * (1 - k))
    d.ellipse([pos[0] - r, pos[1] - r, pos[0] + r, pos[1] + r], outline=CURSOR + (a,), width=5)


# --------------------------------------------------------------------------
# Frames
# --------------------------------------------------------------------------
class Stills:
    def __init__(self, root):
        self.root = Path(root)
        self.cache = {}

    def get(self, name):
        if name not in self.cache:
            if len(self.cache) > 4:
                self.cache.pop(next(iter(self.cache)))
            self.cache[name] = Image.open(self.root / f"{name}.png").convert("RGB")
        return self.cache[name]


def chrome(img, label):
    d = ImageDraw.Draw(img)
    d.text((48, 170), "WISING", font=font("Black", 34), fill=WHITE, anchor="lm")
    d.text((W - 48, 170), label, font=font("SemiBold", 26), fill=MUTED, anchor="rm")


def screen_frame(seg, t, stills):
    img = Image.new("RGBA", (W, H), BG + (255,))
    cx, cy, cw = keyframes([(a, b) for a, b in seg["camera"]], t)
    ch = cw * CAM_AR
    scale = W / cw

    def crop(name):
        src = stills.get(name)
        box = [cx * DPR, cy * DPR, (cx + cw) * DPR, (cy + ch) * DPR]
        return src.crop([round(v) for v in box]).resize((W, WIN_H), Image.LANCZOS)

    names = seg["stills"]
    cur = max((s for s in names if s[0] <= t), key=lambda s: s[0])
    view = crop(cur[1])
    fade = seg.get("fade")
    if fade:
        idx = names.index(cur)
        if idx > 0 and t - cur[0] < fade:
            prev = crop(names[idx - 1][1])
            view = Image.blend(prev, view, (t - cur[0]) / fade)
    img.paste(view, (0, WIN_Y))

    def to_frame(px, py):
        return ((px - cx) * scale, WIN_Y + (py - cy) * scale)

    d = ImageDraw.Draw(img)
    for m in active(seg.get("marks", []), t):
        k = pop((t - m["t0"]) / 0.25)
        bx, by, bw, bh = m["box"]
        x0, y0 = to_frame(bx, by)
        x1, y1 = to_frame(bx + bw, by + bh)
        a = int(255 * min(1, k))
        rounded(d, (x0, y0, x1, y1), 14, outline=RED + (a,), width=6)
        anchor = ((x0 + x1) / 2, y1 if m["side"] == "below" else y0)
        draw_pill(img, m["label"], anchor, m["side"], k)

    cur_kf = seg.get("cursor")
    if cur_kf and t >= cur_kf[0][0]:
        px, py = keyframes(cur_kf, t)
        fx, fy = to_frame(px, py)
        press = 0.0
        for c in seg.get("clicks", []):
            draw_ripple(img, (fx, fy), (t - c) / 0.45)
            if 0 <= t - c < 0.15:
                press = 1.0
        draw_cursor(img, (fx, fy), press)

    # soft top/bottom edges so the window reads as a crop, not a slab
    grad = Image.new("L", (1, 60))
    for i in range(60):
        grad.putpixel((0, i), int(255 * (1 - i / 60)))
    edge = Image.new("RGBA", (W, 60), BG + (255,))
    edge.putalpha(grad.resize((W, 60)))
    img.alpha_composite(edge, (0, WIN_Y))
    img.alpha_composite(edge.transpose(Image.FLIP_TOP_BOTTOM), (0, WIN_Y + WIN_H - 60))
    chrome(img, "Example household · illustrative")
    return img


def talk_frame(seg, t):
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    rounded(d, (40, WIN_Y, W - 40, WIN_Y + WIN_H), 36, fill=(22, 22, 26), outline=(48, 48, 56), width=2)
    tag = "YOU · ON CAMERA"
    f = font("Bold", 30)
    tw = f.getlength(tag)
    rounded(d, (W / 2 - tw / 2 - 26, 420, W / 2 + tw / 2 + 26, 476), 28, fill=(16, 44, 36), outline=GREEN, width=2)
    d.text((W / 2, 448), tag, font=f, fill=GREEN, anchor="mm")
    # shooting note, wrapped
    nf = font("Medium", 36)
    words, lines, cur = seg["note"].split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if nf.getlength(test) > 840:
            lines.append(cur); cur = w
        else:
            cur = test
    lines.append(cur)
    for i, line in enumerate(lines):
        d.text((W / 2, 560 + i * 52), line, font=nf, fill=MUTED, anchor="mm")
    chrome(img, "Placeholder · replace with footage")
    return img


def end_frame(seg, t):
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    k = pop((t - seg["t0"]) / 0.4)
    a = int(255 * min(1, k))
    d.text((W / 2, 760), "WISING", font=font("Black", 120), fill=WHITE + (a,), anchor="mm")
    d.text((W / 2, 860), "India + US tax, on one screen", font=font("SemiBold", 42), fill=MUTED + (a,), anchor="mm")
    rounded(d, (W / 2 - 330, 1000, W / 2 + 330, 1110), 55, fill=GREEN + (a,))
    d.text((W / 2, 1055), "Comment WISING", font=font("ExtraBold", 50), fill=(4, 18, 15, a), anchor="mm")
    d.text((W / 2, 1180), "Send us your hardest India–US client.", font=font("Medium", 36), fill=MUTED + (a,), anchor="mm")
    return img


def frame_at(t, stills):
    seg = next(s for s in TIMELINE if s["t0"] <= t < s["t1"]) if t < DURATION else TIMELINE[-1]
    if seg["kind"] == SCREEN:
        img = screen_frame(seg, t, stills)
    elif seg["kind"] == TALK:
        img = talk_frame(seg, t)
    else:
        return end_frame(seg, t).convert("RGB")
    caps = [c for c in seg["captions"] if c[0] <= t]
    if caps:
        t_in, text = caps[-1]
        draw_caption(img, text, t_in, t)
    return img.convert("RGB")


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
