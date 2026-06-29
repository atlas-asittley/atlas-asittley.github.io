# Spectra

A daily color-deduction puzzle. A secret RGB color (each channel 0–9) is hidden
each day; crack it in 6 guesses. Each channel shows 🟩 exact / 🟨 within 2 /
⬛ far, plus an arrow for higher/lower. Share your spoiler-free result grid.

- 100% client-side. No backend, no login, no tracking.
- Deterministic daily puzzle (same color for everyone, by UTC day).
- `logic.js` is pure and unit-tested (`node logic.test.mjs` from the source repo).

## Tip jar

Set `TIP_URL` at the top of `game.js` to a Ko-fi / Buy-Me-a-Coffee link to show
the "Tip the dev" button. While it contains `REPLACE_ME` the button stays hidden.
