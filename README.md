# Tic Tac Fair — Nobody Cheats

A completely normal game of tic-tac-toe, in the visual style of "Tic Tac Cheat"
(https://tic-tac-toe-ai-62a.pages.dev/) but with the twist reversed: **the house
plays 100% fair** — and that's the gag.

- You are X. The house is O. Nobody steals cells, edits moves, or denies appeals.
- The house AI is **minimax-perfect**: it never loses. It can be drawn, never beaten.
- The **REQUEST AN AUDIT** button passes instantly, every time. There is an
  incident log — it's just a play log, because nothing suspicious ever happens.
- Scores (you / house / draws) persist in `localStorage` across matches.

## Game modes

- **PERFECT HOUSE** — minimax-perfect O. Never loses; the best you can do is draw.
- **CASUAL HOUSE** — mostly random, occasionally attentive. Fully honest, but
  genuinely beatable (engine tests: X wins ~44% vs casual).
- **TWO PLAYERS** — local turn-based hot-seat: X then O, no house at all.

"START A CLEAN GAME" resets the board and bumps the match number.

## Run

Static site, no build step. Serve the `docs/` folder with any static server.

Public: **https://victorobahor.github.io/tic-tac-toe-normal/** (GitHub Pages,
built from `docs/` on `main`).

The LAN Docker host is currently stopped (`docker start tic-tac-fair` to
re-enable at `http://192.168.4.231:8080`; it serves the folder live from disk).

## Files

```
app/index.html   page structure (ticker, masthead, board, scorecard, log)
app/styles.css   editorial style: cream paper, hard black borders, green accents
app/rules.js     game engine: winner detection + minimax AI (fair & perfect)
app/app.js       UI wiring: turns, play log, scores, audit, toasts
test/engine.test.mjs  engine tests (node): legality fuzz, optimality, 45 perfect-X games
test/e2e.py      Playwright E2E: plays real games, audits every move for legality
```

## Tests

```bash
node test/engine.test.mjs          # engine: legality, optimality, unbeatability
python3 test/e2e.py 30             # 30 real browser games, 0-violation audit
```

Latest results: engine — 0 losses in 45 games vs perfect X, ~79% wins vs random X;
E2E — 30 games (10 on mobile viewport), house 25 W / 5 D / 0 L, zero illegal moves.
