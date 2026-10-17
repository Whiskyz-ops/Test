# WISING launch reel (63 s, vertical)

A short-form launch video in the style of Farza's Clicky reel (Instagram, 53.8K likes and 597 comments when it was reviewed). It is a different piece from `docs/DEMO_VIDEO_SCRIPT.md`: that one is a 2:30 walkthrough for investors, and this one is made to stop a scroll.

**Rough cut:** `scripts/reel/render.py` builds a 1080×1920 animatic from screenshots of the real build. The product segments are finished; the on-camera segments are placeholder cards that carry the line and a shooting note. Film those, drop them in, and the reel is done.

---

## Why the Clicky reel works

| Clicky beat | What it does |
|---|---|
| "So we built a system that can draw" | A new capability in one sentence, with the founder on camera. |
| "Let's say I'm watching this YouTube video…" | A scenario everyone has lived. |
| "Hey Clicky, I don't understand how…" → it labels the triangle | The product does the thing, on screen, in real time. No slides. |
| "But what if I wanted to do something actually hard" | Escalation: the second demo is harder than the first. |
| FL Studio, step by step → "We made our first beat" | The payoff is an outcome, not a feature. |
| "It's live. I dare you. Try it for free." | A challenge, and the viewer can act on it in 30 seconds. |

Production details worth copying: the founder's face on camera, a chalkboard sketch behind him, short burned-in captions, red callout labels and a cursor drawn over the screen, hard cuts, and no music bed under the voice.

## What doesn't carry over (read this first)

1. **There is nowhere for viewers to go.** Clicky's CTA works because anyone can install it right away. WISING has no sign-up, and demo.wising.app is password-gated (`monitor-next/components/PasswordGate.jsx`). Without a waitlist or booking page, a reel that takes off loses its viewers. Set up the capture point before you post.
2. **The product isn't visual on its own.** An AI cursor drawing on your screen is the spectacle in Clicky's reel. A tax dashboard isn't, so the reel has to create the moment: the map with both countries in red, "taxed twice · $4,408", and one edit that moves both spouses' numbers.
3. **The viewer and the buyer are different people.** WISING is sold to tax professionals and firms (`docs/ACCOUNT_LICENSING_MODEL.md`). Most people on Instagram who feel this pain are Indians earning in the US, and they can't buy WISING. One shoot covers both: only the first line and the CTA change (see *Two cuts* below).
4. **Clicky came with an audience.** Farza already had a large following, and the likes reflect that as well as the edit. Plan distribution (founder accounts, NRI and CPA communities, creators who already cover India–US money) rather than hoping the algorithm finds you.

---

## The script

The demo household is Rohan and Priya Mehta, the example audited end to end (`scripts/check-example-household.js`). Every figure below was measured on the current build by `scripts/reel/capture.js`. The screen carries an "Example household · illustrative" tag, so don't present the Mehtas as real clients.

| Time | Shot | Line (captions on screen; **bold** = green highlight) |
|---|---|---|
| 0:00–0:04 | **You**, close-up. Chalkboard behind you: two overlapping circles, IN and US. | "This couple earns in India and the US. **$4,408** of it is taxed **twice**." |
| 0:04–0:08 | **You** tap the overlap. *(Clicky: "we built a system that can draw")* | "So we built a system that reads **both** countries' tax law at once." |
| 0:08–0:11 | **You** turn the laptop toward the camera. | "Meet Rohan. Engineer in New York. Business in Pune." |
| 0:11–0:27 | **Screen**: Rohan's Monitor. Cursor to the US (*US · $37,014 unpaid*), then India (*India · $14,032 unpaid*), then the missed instalments (*2 advance-tax payments missed*), then the conflict (*Taxed twice · $4,408*), then the FBAR meter (*FBAR due · 542% over*). | "Both countries say he **owes** them. Both are right. He's missed two tax payments in India… and **$4,408** is being taxed **twice**. Plus forms he's never heard of." |
| 0:27–0:30 | **You**, reaction, grin. | "That's a CPA's afternoon of spreadsheets. Done in **seconds**." |
| 0:30–0:33 | **You** lean in. *(Clicky: "something actually hard")* | "But here's what actually breaks the spreadsheet." |
| 0:33–0:37 | **You**, over the shoulder, the India form open. | "His wife Priya's Indian employer pays her while she works from **New York**." |
| 0:37–0:44 | **Screen**: Priya's India form, 3. Salary. Toggle *Salary Income & Exemptions*, type 24,00,000. Hold on *Where was this work performed?*: "0 days worked in India — none of this salary treated as earned for work in India." | "One edit. Her salary: **₹24 lakh**. India **can't** tax it. The US can." |
| 0:44–0:53 | **Screen**: Priya's Monitor, ↻ Refresh. Joint US tax *$87,212 → $96,465*; *Rohan 89% → 84%*; new conflict *$3,928 to stop or recover*. | "Refresh. The joint US return **recomputes**. Rohan's share moved. Nobody touched his file. And it caught **$3,928** of Indian tax to claw back." |
| 0:53–0:56 | **You**, slower. | "One edit. Two countries. Two people. Everything in **sync**." |
| 0:56–1:01 | **You**, straight to camera, deadpan. *(Clicky: "I dare you")* | "If you file for Indians in the US, send us your **hardest** client. Comment **WISING**." |
| 1:01–1:03 | End card. | WISING · Comment WISING |

About 150 spoken words. Read it aloud against a timer before you shoot. If you run long, cut "Both are right." and "Plus forms he's never heard of." first.

## Two cuts from one shoot

Film both versions of the first line and the CTA. Everything in between stays the same.

| | CPA cut (LinkedIn, X) | NRI cut (Instagram, YouTube Shorts) |
|---|---|---|
| Hook, 0:00 | "This couple earns in India and the US. $4,408 of it is taxed twice." | "Earn in India and the US? Some of your income may be taxed twice." |
| CTA, 0:56 | "If you file for Indians in the US, send us your hardest client. Comment WISING." | "Send this to your CPA. Or comment WISING and we'll tell you when you can try it." |
| Lands on | Early access for firms (booking link) | Waitlist that records the person's CPA, which gives you warm intros to firms |

Post both. Judge them on sign-ups per 1,000 views, not likes.

## Shooting notes

- **Look:** copy Clicky. Dark room, one soft window light from the side, a chalkboard or dark wall with a chalk sketch, glasses on if you wear them. Use a phone's rear camera at 1080p, framed vertically, chest up.
- **Sound:** a clip-on mic matters more than the camera. Viewers forgive soft footage but scroll past bad audio.
- **Takes:** film each line 3 times at different energy levels and keep the fastest. Leave half a second of silence at both ends of each take for cuts.
- **Screen footage:** the rough cut's product segments can go straight into the edit. To re-record them yourself, use `?present=1` (hides engineering chrome), 90% zoom, and follow the clicks in the table.
- **Captions:** keep them as rendered: 2–4 words, white on a black outline, the key number in green. Keep everything above the bottom 20% of the frame, where Instagram's own UI sits.

---

## Rebuilding the rough cut

```bash
cd monitor-next && npm run build && (cd out && python3 -m http.server 8099 &)
cd .. && node scripts/reel/capture.js /tmp/reel-stills        # ~1 min, needs Playwright
python3 scripts/reel/render.py /tmp/reel-stills wising-reel.mp4   # ~2 min, needs Pillow + ffmpeg
```

- Start from a fresh browser profile. `capture.js` edits Priya's form, so in a browser you use, click **↺ Edited – Reset** afterwards.
- If `cdn.tailwindcss.com` is blocked (as in some sandboxes), compile the India form's Tailwind locally and pass it in with `REEL_TAILWIND_CSS=/path/india.css`.
- The timeline, captions, callouts and camera moves are in the `TIMELINE` list at the top of `render.py`. Coordinates are CSS pixels in the 1280-wide capture. If the UI moves, `capture.js` writes `boxes.json` with the current positions of the targets.
- To preview single frames without encoding: `python3 scripts/reel/render.py /tmp/reel-stills /tmp/frames --frames 13,22.5,46.5`.

## Numbers on screen (measured)

| Where | Figure |
|---|---|
| Rohan: US unpaid / India unpaid | $37,014 / $14,032 |
| Rohan: India advance tax | Q1 (15 Jun) and Q2 (15 Sep) not paid |
| Same income taxed by both countries | $4,408 |
| FBAR meter | $54,217 against the $10,000 threshold (542%) |
| Joint US income tax, before → after Priya's salary | $87,212 → $96,465 |
| Rohan's share of the joint US tax | 89% → 84% |
| New conflict on Priya | Indian TDS on salary India can't tax, about $3,928 |
