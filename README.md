# Zorion Life — quiz landing page

Single-file prototype of the five-question quiz, contact screen and results screen,
built to the design implementation spec. Open `index.html` directly — no build step,
no framework, no bundler.

```
index.html          the whole page (inline CSS, inline SVG icons, inline JS)
assets/advisor.svg  placeholder for the advisor photo — replace before launch
```

## Placeholders that must be replaced before launch

| Item | Where | Note |
|---|---|---|
| Advisor photo | `assets/advisor.svg` | Swap for a square photo (`assets/advisor.jpg`) and update the `src` on the results screen. The circular mask and 88px size are handled in CSS. |
| Advisor name and role | Results call card | Currently "Danielle Roy / Licensed life insurance advisor, 11 years in Ontario". Update the `alt` text to match. |
| Calling window | Results call card | "She'll call you today." and "usually within a few hours." are placeholders. Replace with the advisor's real window, and check the pronoun matches. A missed promise on this screen costs the pickup the page exists to earn. |
| Legal footer | Every screen | Placeholder compliance line. Have it confirmed by whoever signs off on Ontario licensing disclosure. |
| Form handler | Screen 6 | The submit currently advances to results without posting anywhere. Wire it to the CRM before traffic. `window.zorionAnswers()` returns all five answers as an object for that wiring. |

## Two notes on the spec

1. **Advisor photo on question screens.** §4 says the photo is used at 40px on the
   question screens; §5's question-screen skeleton has no photo in it, and §6 item 18
   fails the build if the photo appears anywhere but the results call card. Built to
   §5/§6 — the photo appears once, on the results card only.
2. **Results figure.** The spec's figure has to come from the Q3 range, so each range
   renders its midpoint ($70,000 / $175,000 / $375,000 / $650,000). Two branches keep
   it honest: picking "None of these" on Q2 shows $0 with its own caption and body,
   and picking "Not sure" on Q3 shows "Not yet totalled" rather than inventing a
   number. No premium, monthly cost, price or booking widget appears anywhere.

## Rebuilding in GoHighLevel

Auto-advance-on-tap is not a native drag-and-drop feature. A GHL rebuild needs custom
JS or an embedded quiz tool — nothing here assumes a form-builder widget, so the
markup and CSS port as-is into a custom-code block.
