# WISING demo reel (78 s, 4:5)

A short demo for prospective customers: CPAs and firms who file for Indian clients in the US. It borrows what works in short founder-led demos (a person on camera, the real product, one story that escalates, an outcome at the end) but uses WISING's own look and its own signature moment. It is a different piece from `docs/DEMO_VIDEO_SCRIPT.md`, which is a 2:30 walkthrough for investors and sales calls.

**Rough cut:** `scripts/reel/render.py` builds a 1080×1350 animatic from screenshots of the real build. The product segments are finished; the on-camera segments are placeholder cards carrying the line and a shooting note. Film those, drop them in, and add a voice-over for the screen segments.

**Goal:** booked pilots, not likes. Judge it on replies and pilot requests per 1,000 views, and on how many viewers are still watching at 3 seconds and at the end.

---

## The look

| Element | What it is | Why |
|---|---|---|
| Gold | India: the India intake form's own accent | Viewers learn the code without being told |
| Cyan | US: the US intake form's own accent | |
| Green | WISING's results (conflicts, reconciliation) | The product's own brand colour |
| Two panes, India above the US | The two sides of every cross-border return | This is WISING's natural visual: two systems on one screen |
| **The ripple** | A line runs from the number typed on the India side to each US figure it changes, which then ticks to its new value | The one shot people remember. It shows cause and effect across countries |
| Lower-third captions with a speaker tag | Sentence case, left-aligned, key figure in the country's colour | Calm and professional, readable with the sound off |

What to avoid: cursor-drawn callouts, chalkboard sets, "I dare you" lines, a music bed under the voice. Tax buyers respond to calm confidence, not hype.

## The script

The demo household is Rohan and Priya Mehta, the example audited end to end (`scripts/check-example-household.js`). Every figure below was measured on the current build by `scripts/reel/capture.js`. The screen carries an "Example client · illustrative" tag, so don't present the Mehtas as real clients. WISING gives planning estimates; never say it prepares or files returns.

| Time | Beat | Shot | Line |
|---|---|---|---|
| 0:00–0:06 | **The client's email** | An email from Rohan types on: *"Priya's employer in India is still paying her while she works from New York. Do we owe anything? And to which country?"* | VO: "Every cross-border CPA gets this email. Here's what answering it usually takes." |
| 0:06–0:14 | **The cost** | Split: India form above, US form below. Pairs slam in: *Tax year Apr–Mar / Jan–Dec*, *Rupees / Dollars*, *ITR / Form 1040*, *Schedule FA / FBAR · Form 1116*. | VO: "Two tax years. Two currencies. Two sets of law. Usually: an afternoon in a spreadsheet." |
| 0:14–0:17 | **You** | On camera, laptop open beside you. | "Here's the same email, answered in Wising." |
| 0:17–0:28 | **One number** | Priya's India form, 3. Salary: ₹24,00,000 typed in. Then *Where was this work performed?*: 0 days worked in India, so none of it is treated as earned in India. | VO: "One number: Priya's salary. ₹24 lakh. She worked zero days in India, so India can't tax it. The US can." |
| 0:28–0:41 | **The ripple** | Split: the salary above, the joint US return below. Ripple 1: joint US tax ticks $87,212 → $96,465. Ripple 2: Rohan's share 89% → 84%. | VO: "Watch it ripple. The joint US return recomputes. Rohan's share moves too. Nobody touched his file. One number. Both countries. Both spouses." |
| 0:41–0:52 | **The catch** | Priya's conflicts: *Indian TDS on salary India can't tax — about $3,928 to stop or recover*. Counter ticks $0 → $3,928. | VO: "Then it catches what a spreadsheet misses: $3,928 of Indian tax withheld that India can't charge. Money your client gets back. That's the line they remember." |
| 0:52–1:03 | **The proof** | Reconciliation: the salary greyed out on India's side, "not taxable in India (the US taxes it)". Then FTC: unrelieved double tax ticks $4,408 → $3,873. | VO: "Every figure shows its working. The salary leaves India's computation, with the reason. Double tax drops to $3,873. Which form. Which rule." |
| 1:03–1:07 | **You** | Back to camera, slower. | "One number. Both countries. Both spouses. Shown working." |
| 1:07–1:15 | **The offer** | Straight to camera. Say it plainly. | "Send us one anonymised India–US client. We'll run it and send you the full dashboard within 48 hours." |
| 1:15–1:18 | End card | Logo, the offer, your booking link. | — |

About 170 spoken words. Read it aloud against a timer before recording. If you run long, cut "Two sets of law." and "Which form. Which rule." first.

## What you need to supply

1. **A booking link or form** for the end card. The demo is password-gated (`monitor-next/components/PasswordGate.jsx`), so viewers who want in need somewhere to go. Without it, the offer goes nowhere.
2. **Three on-camera clips:** 0:14, 1:03 and 1:07. Use a dark room, one soft light from the side, a phone at 1080p in 4:5, framed chest up. Record each line 3 times and keep the most natural take.
3. **The voice-over:** record it with a clip-on mic in a quiet room, to the timings above. Audio matters more than the camera.
4. **An email that reads like a real client.** If a real client has sent you something similar, use their wording with the names changed.

## Where it goes

- **LinkedIn, posted natively from your own profile.** Write a 3–4 line post telling the story (the email, the $3,928), and put the booking link in the first comment.
- **Direct outreach:** send it personally to 50 firms that serve Indian clients, with one line on why you picked them. For this audience, replies count for more than reach.
- **Cut-downs from the same material:** a 15-second teaser of the ripple (0:28–0:41) for social, this 78-second version for posts and outreach, and the 2:30 walkthrough for calls.
- **Later:** once a pilot firm has used it, a 20-second clip of a real CPA saying what it caught will outperform anything here.

---

## Rebuilding the rough cut

```bash
cd monitor-next && npm run build && (cd out && python3 -m http.server 8099 &)
cd .. && node scripts/reel/capture.js /tmp/reel-stills        # ~1 min, needs Playwright
python3 scripts/reel/render.py /tmp/reel-stills wising-reel.mp4   # ~3 min, needs Pillow + ffmpeg
```

- Start from a fresh browser profile. `capture.js` edits Priya's India form, so in a browser you use, click **↺ Edited – Reset** afterwards.
- The intake forms load Tailwind from `cdn.tailwindcss.com`. Where that host is blocked (as in some sandboxes), compile each form's stylesheet locally and pass the folder holding `india.css` and `us.css` as `REEL_TAILWIND_DIR`.
- The timeline, captions, ripples, counters and camera moves are in the `TIMELINE` list at the top of `render.py`. Coordinates are CSS pixels in the 1280-wide capture. If the UI moves, `capture.js` writes `boxes.json` with the current positions of the targets.
- To preview single frames without encoding: `python3 scripts/reel/render.py /tmp/reel-stills /tmp/frames --frames 9,30.4,46`.

## Numbers on screen (measured)

| Where | Figure |
|---|---|
| Priya's salary typed into the India form | ₹24,00,000 (0 days worked in India) |
| Joint US income tax, before → after | $87,212 → $96,465 |
| Rohan's share of the joint US tax | 89% → 84% |
| New conflict on Priya | Indian TDS on salary India can't tax, about $3,928 |
| India's computation | Salary ₹23,25,000 left out: "not taxable in India (the US taxes it)" |
| Unrelieved double tax (household FTC), before → after | $4,408 → $3,873 |
