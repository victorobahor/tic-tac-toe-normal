"""E2E: plays N real games against the hosted app across all three modes
(PERFECT house, CASUAL house, TWO PLAYERS turn-based), audits every move for
legality (nothing stolen/overwritten), and checks key UI behaviors.

Usage: python3 e2e.py [N_GAMES] [--headed]
Writes logs/e2e-results.json; exit 0 only if zero failures.
"""
import json
import os
import random
import sys
import time

from playwright.sync_api import sync_playwright

N = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 30
HEADLESS = "--headed" not in sys.argv
BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8080")
OUT = "/home/victor/projects/tic-tac-toe-normal/logs/e2e-results.json"

LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
MODES = [(None, "perfect"), ("#mode-house-casual", "casual"), ("#mode-two", "two")]

results = {"games": [], "ui": {}, "violations": [], "outcomes": {}}
failures = []


def check(cond, msg, game=None):
    if not cond:
        failures.append(msg if game is None else f"[game {game}] {msg}")
        results["violations"].append(msg if game is None else f"[game {game}] {msg}")


def read_board(page):
    return page.evaluate(
        "() => [...document.querySelectorAll('[data-cell]')].map("
        "b => b.classList.contains('x') ? 'X' : b.classList.contains('o') ? 'O' : null)")


def game_over(page):
    # while the house "thinks", every cell is disabled too — the real end signal
    # is the turn pill going hidden (setTurn(''))
    return page.evaluate("() => document.querySelector('.turn-pill').style.visibility === 'hidden'")


def turn_label(page):
    return page.evaluate("() => document.querySelector('#turn-label').textContent")


def wait_mark(page, prev_filled, timeout=8.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if sum(1 for v in read_board(page) if v) > prev_filled:
            return True
        time.sleep(0.08)
    return False


def wait_your_turn_or_end(page, prev_filled, timeout=8.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if game_over(page):
            return True
        if sum(1 for v in read_board(page) if v) > prev_filled and turn_label(page) == "YOUR TURN":
            return True
        time.sleep(0.08)
    return False


def line_winner(b):
    for a, c, d in LINES:
        if b[a] and b[a] == b[c] == b[d]:
            return b[a]
    return None


def outcome_of(board):
    w = line_winner(board)
    if w == "X":
        return "you"
    if w == "O":
        return "house"
    return "draw" if all(v is not None for v in board) else "incomplete"


def record_outcome(outcome, index):
    results["outcomes"][outcome] = results["outcomes"].get(outcome, 0) + 1
    board = None  # outcome already validated by caller


def score_check(page, score_before, outcome, index):
    score_after = page.evaluate("""() => {
        const s = JSON.parse(localStorage.getItem('tic-tac-fair-score-v1') || '{}');
        return {you: s.you || 0, house: s.house || 0, draws: s.draws || 0};
    }""")
    if outcome == "you":
        check(score_after["you"] == score_before["you"] + 1, "your win not scored", index)
    if outcome == "house":
        check(score_after["house"] == score_before["house"] + 1, "house win not scored", index)
    if outcome == "draw":
        check(score_after["draws"] == score_before["draws"] + 1, "draw not scored", index)
    return score_after


def play_game(pw, index, mobile=False, mode_btn=None, mode_name="perfect"):
    browser = pw.chromium.launch(headless=HEADLESS)
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("[data-cell='0']")
    if mode_btn:
        page.click(mode_btn)
        page.wait_for_timeout(400)

    expected = [None] * 9
    score_before = page.evaluate("""() => {
        const s = JSON.parse(localStorage.getItem('tic-tac-fair-score-v1') || '{}');
        return {you: s.you || 0, house: s.house || 0, draws: s.draws || 0};
    }""")
    rec = {"index": index, "mode": mode_name, "plies": 0}

    if mode_name == "two":
        # turn-based: clicks alternate X, O; marks must appear instantly and persist
        for ply in range(9):
            board = read_board(page)
            if game_over(page) or line_winner(board):
                break
            empty = [i for i, v in enumerate(board) if v is None]
            if not empty:
                break
            want = "X" if ply % 2 == 0 else "O"
            cell = random.choice(empty)
            page.click(f"[data-cell='{cell}']")
            page.wait_for_timeout(150)
            now = read_board(page)
            check(now[cell] == want, f"turn-based: cell {cell} shows {now[cell]}, expected {want}", index)
            for i2, m2 in enumerate(expected):
                if m2 is not None and now[i2] != m2:
                    check(False, f"turn-based: ILLEGAL, cell {i2} changed from {m2}", index)
            expected[cell] = want
            rec["plies"] += 1
            board = now
        outcome = outcome_of(board)
        results["outcomes"][outcome] = results["outcomes"].get(outcome, 0) + 1
    else:
        # vs house: click as X, verify persistence, expect exactly one legal O reply
        for ply in range(9):
            board = read_board(page)
            if game_over(page) or line_winner(board):
                break
            empty = [i for i, v in enumerate(board) if v is None]
            if not empty:
                break
            cell = random.choice(empty)
            page.click(f"[data-cell='{cell}']")
            prev = sum(1 for v in board if v)
            ok = wait_mark(page, prev)
            check(ok, "player X never appeared within 8s", index)
            if not ok:
                break

            now = read_board(page)
            for i, mark in enumerate(expected):
                if mark is not None and now[i] != mark:
                    check(False, f"ILLEGAL: cell {i} was '{mark}', now '{now[i]}'", index)
            if now[cell] != "X":
                check(False, f"player X not at {cell} after click", index)
            expected[cell] = "X"
            rec["plies"] += 1

            if (game_over(page) or line_winner(now) or all(v is not None for v in now)):
                board = now
                break
            ok = wait_your_turn_or_end(page, sum(1 for v in now if v))
            check(ok, "house never replied within 8s", index)
            if not ok:
                break
            after = read_board(page)
            for i, mark in enumerate(expected):
                if mark is not None and after[i] != mark:
                    check(False, f"ILLEGAL: cell {i} was '{mark}', now '{after[i]}' (house)", index)
            changed = [i for i in range(9) if after[i] != expected[i]]
            check(len(changed) == 1 and expected[changed[0]] is None and after[changed[0]] == "O",
                  f"ILLEGAL house move: touched {changed}", index)
            if changed and expected[changed[0]] is None:
                expected[changed[0]] = "O"
                rec["plies"] += 1
            board = after
            if game_over(page) or line_winner(board):
                break
        outcome = outcome_of(board)
        results["outcomes"][outcome] = results["outcomes"].get(outcome, 0) + 1

    # final-position sanity: loser must not have a completed line
    if outcome in ("you", "house"):
        loser = "O" if outcome == "you" else "X"
        for a, c, d in LINES:
            check(not (board[a] == board[c] == board[d] == loser), f"loser {loser} has a completed line", index)

    score_check(page, score_before, outcome, index)

    # new game resets the board and bumps the match number
    match_before = page.evaluate("() => document.querySelector('#match-number').textContent")
    page.click("#new-game")
    page.wait_for_timeout(250)
    board_reset = read_board(page)
    check(all(v is None for v in board_reset), "new game did not clear the board", index)
    match_after = page.evaluate("() => document.querySelector('#match-number').textContent")
    check(int(match_after) == int(match_before) + 1, f"match number {match_before}->{match_after}", index)

    # active mode button must stay highlighted
    active = page.evaluate(
        "() => [...document.querySelectorAll('.mode-btn')].filter(b => b.classList.contains('active')).map(b => b.id)")
    check(len(active) == 1, f"expected exactly one active mode button, got {active}", index)
    if mode_btn:
        check(active == [mode_btn.lstrip('#')], "wrong mode button highlighted", index)

    if mode_name != "two":
        # occupied cells disabled, empty cells enabled, game stays live afterwards
        page.click("[data-cell='4']")
        page.wait_for_function("() => document.querySelector('#turn-label').textContent === 'YOUR TURN'", timeout=8000)
        check(wait_your_turn_or_end(page, 1), "house did not reply on fresh game", index)
        board_mid = read_board(page)
        check(board_mid.count("X") == 1 and board_mid.count("O") == 1, "fresh game did not start exactly one exchange", index)
        disabled_states = page.evaluate(
            "() => [...document.querySelectorAll('[data-cell]')].map(b => b.disabled)")
        occupied_disabled = all(disabled_states[i] for i, v in enumerate(board_mid) if v is not None)
        empty_enabled = all(not disabled_states[i] for i, v in enumerate(board_mid) if v is None)
        check(occupied_disabled, "an occupied cell is still clickable", index)
        check(empty_enabled, "an empty cell is disabled", index)
        empty2 = board_mid.index(None)
        page.click(f"[data-cell='{empty2}']")
        check(wait_mark(page, 2), "live game does not respond after the exchange", index)
        check(wait_your_turn_or_end(page, 3), "house did not reply after valid move", index)
    else:
        # two-player: X first, then the turn alternates
        first_label = turn_label(page)
        check(first_label == "X TO PLAY", f"two-player fresh game shows '{first_label}'", index)
        page.click("[data-cell='4']")
        page.wait_for_timeout(150)
        check(read_board(page)[4] == "X", "two-player: X did not place", index)
        check(turn_label(page) == "O TO PLAY", f"after X, label shows '{turn_label(page)}'", index)
        page.click("[data-cell='0']")
        page.wait_for_timeout(150)
        check(read_board(page)[0] == "O", "two-player: O did not place", index)
        check(turn_label(page) == "X TO PLAY", f"after O, label shows '{turn_label(page)}'", index)
        page.click("#new-game")
        page.wait_for_timeout(250)
        check(all(v is None for v in read_board(page)), "two-player: new game did not clear", index)

    rec["outcome"] = outcome
    rec["score_after"] = score_check(page, score_before, outcome, index) if False else rec.get("score_after")
    results["games"].append(rec)
    browser.close()


def ui_checks(pw):
    browser = pw.chromium.launch(headless=HEADLESS)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("[data-cell='0']")
    check("CERTIFIED FAIR" in page.inner_text(".ticker"), "ticker text missing")
    page.click("#audit")
    page.wait_for_timeout(200)
    check("AUDIT PASSED" in page.inner_text("#toast"), "audit toast missing")
    check("audit" in page.inner_text("#move-log").lower(), "audit not logged")
    for btn in ("#mode-house-perfect", "#mode-house-casual", "#mode-two"):
        page.click(btn)
        page.wait_for_timeout(250)
        check(page.evaluate(f"() => document.querySelector('{btn}').classList.contains('active')"),
              f"{btn} did not activate", None)
    mob = browser.new_page(viewport={"width": 390, "height": 844})
    mob.goto(BASE, wait_until="load")
    mob.wait_for_selector("[data-cell='0']")
    overflow = mob.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(overflow <= 2, f"mobile horizontal overflow: {overflow}px")
    results["ui"] = {"audit_ok": True, "mobile_overflow_px": overflow, "title": page.title()}
    browser.close()


with sync_playwright() as pw:
    ui_checks(pw)
    for i in range(N):
        btn, name = MODES[i % 3]
        play_game(pw, i, mobile=(i % 3 == 2), mode_btn=btn, mode_name=name)

with open(OUT, "w") as f:
    json.dump(results, f, indent=2)

per_mode = {}
for g in results["games"]:
    per_mode.setdefault(g["mode"], []).append(g["outcome"])
print("games:", len(results["games"]))
for m, outs in per_mode.items():
    you, house, draw = outs.count("you"), outs.count("house"), outs.count("draw")
    print(f"  {m:8s}: you {you} · house {house} · draw {draw}")
print("violations:", len(results["violations"]))
for f_ in failures[:10]:
    print("FAIL:", f_)
print("E2E PASSED" if not failures else f"E2E FAILED ({len(failures)} failures)")
sys.exit(0 if not failures else 1)
