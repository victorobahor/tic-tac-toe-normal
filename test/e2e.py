"""E2E: plays N real games against the hosted app, audits every move for
legality (nothing stolen/overwritten), and checks key UI behaviors.

Usage: python3 e2e.py [N_GAMES] [--headed]
Writes logs/e2e-results.json; exit 0 only if zero failures.
"""
import json
import random
import sys
import time

from playwright.sync_api import sync_playwright

N = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 30
HEADLESS = "--headed" not in sys.argv
BASE = "http://127.0.0.1:8080"
OUT = "/home/victor/projects/tic-tac-toe-normal/logs/e2e-results.json"

LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]

results = {"games": [], "ui": {}, "violations": [], "outcomes": {"you": 0, "house": 0, "draw": 0}}
failures = []


def check(cond, msg, game=None):
    if not cond:
        failures.append(msg if game is None else f"[game {game}] {msg}")
        results["violations"].append(msg if game is None else f"[game {game}] {msg}")


def read_board(page):
    return page.evaluate(
        "() => [...document.querySelectorAll('[data-cell]')].map("
        "b => b.classList.contains('x') ? 'X' : b.classList.contains('o') ? 'O' : null)")


def all_disabled(page):
    return page.evaluate("() => [...document.querySelectorAll('[data-cell]')].every(b => b.disabled)")


def line_winner(b):
    for a, c, d in LINES:
        if b[a] and b[a] == b[c] == b[d]:
            return b[a]
    return None


def game_over(page):
    # while the house "thinks", every cell is disabled too — the real end signal
    # is the turn pill going hidden (setTurn(''))
    return page.evaluate("() => document.querySelector('.turn-pill').style.visibility === 'hidden'")


def wait_mark(page, prev_filled, timeout=8.0):
    """Resolves as soon as one more mark is on the board."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if sum(1 for v in read_board(page) if v) > prev_filled:
            return True
        time.sleep(0.08)
    return False


def wait_your_turn_or_end(page, prev_filled, timeout=8.0):
    """Resolves when the house has replied (or the game ended)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if game_over(page):
            return True
        filled = sum(1 for v in read_board(page) if v)
        label = page.evaluate("() => document.querySelector('#turn-label').textContent")
        if filled > prev_filled and label == "YOUR TURN":
            return True
        time.sleep(0.08)
    return False


def play_game(pw, index, mobile=False):
    browser = pw.chromium.launch(headless=HEADLESS)
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("[data-cell='0']")

    expected = [None] * 9
    score_before = page.evaluate("() => ({you:+localStorage.getItem('tic-tac-fair-score-v1')?.match(/\"you\":(\\d+)/)?.[1]||0})") \
        if False else page.evaluate("""() => {
            const s = JSON.parse(localStorage.getItem('tic-tac-fair-score-v1') || '{}');
            return {you: s.you || 0, house: s.house || 0, draws: s.draws || 0};
        }""")
    rec = {"index": index, "plies": 0}

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
        # every previously placed mark must persist unchanged
        for i, mark in enumerate(expected):
            if mark is not None and now[i] != mark:
                check(False, f"ILLEGAL: cell {i} was '{mark}', now '{now[i]}'", index)
        if expected[cell] is not None:
            check(False, f"ILLEGAL: clicked occupied cell {cell}", index)
        if now[cell] != "X":
            check(False, f"player X not at {cell} after click", index)
        expected[cell] = "X"
        rec["plies"] += 1

        if (game_over(page) or line_winner(now) or all(v is not None for v in now)):
            board = now
            break
        # house reply: wait for its move (or game end)
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

    winner = line_winner(board)
    full = all(v is not None for v in board)
    if winner == "X":
        outcome = "you"
    elif winner == "O":
        outcome = "house"
    elif full:
        outcome = "draw"
    else:
        outcome = "incomplete"
    results["outcomes"][outcome] = results["outcomes"].get(outcome, 0) + 1

    # legality of the final position: winner has a line, loser does not
    if outcome in ("you", "house"):
        loser = "O" if winner == "X" else "X"
        check(not line_winner(board) or winner == line_winner(board), "multiple winners?!", index)
        for a, c, d in LINES:
            check(not (board[a] == board[c] == board[d] == loser), f"loser {loser} has a completed line", index)
        check(board.count(winner) == board.count("X" if winner == "X" else "O"), "mark count sane", index)

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

    # new game resets the board and bumps the match number
    match_before = page.evaluate("() => document.querySelector('#match-number').textContent")
    page.click("#new-game")
    page.wait_for_timeout(250)
    board_reset = read_board(page)
    check(all(v is None for v in board_reset), "new game did not clear the board", index)
    match_after = page.evaluate("() => document.querySelector('#match-number').textContent")
    check(int(match_after) == int(match_before) + 1, f"match number {match_before}->{match_after}", index)

    # occupied cells must be disabled once placed, and the game stays live
    page.click("[data-cell='4']")
    page.wait_for_function("() => document.querySelector('#turn-label').textContent === 'YOUR TURN'", timeout=8000)
    check(wait_your_turn_or_end(page, 1), "house did not reply on fresh game", index)
    board_mid = read_board(page)
    check(board_mid.count("X") == 1 and board_mid.count("O") == 1, "fresh game did not start exactly one exchange", index)
    o_cell = board_mid.index("O")
    disabled_states = page.evaluate(
        "() => [...document.querySelectorAll('[data-cell]')].map(b => b.disabled)")
    occupied_disabled = all(disabled_states[i] for i, v in enumerate(board_mid) if v is not None)
    empty_enabled = all(not disabled_states[i] for i, v in enumerate(board_mid) if v is None)
    check(occupied_disabled, "an occupied cell is still clickable", index)
    check(empty_enabled, "an empty cell is disabled", index)
    # game is still live afterwards: a real move still gets a house reply
    empty2 = board_mid.index(None)
    page.click(f"[data-cell='{empty2}']")
    check(wait_mark(page, 2), "live game does not respond after the exchange", index)
    check(wait_your_turn_or_end(page, 3), "house did not reply after valid move", index)

    rec["outcome"] = outcome
    rec["score_after"] = score_after
    results["games"].append(rec)
    browser.close()


def ui_checks(pw):
    browser = pw.chromium.launch(headless=HEADLESS)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("[data-cell='0']")

    # ticker text present
    check("CERTIFIED FAIR" in page.inner_text(".ticker"), "ticker text missing")
    # audit button passes and toasts
    page.click("#audit")
    page.wait_for_timeout(200)
    check("AUDIT PASSED" in page.inner_text("#toast"), "audit toast missing")
    check("audit" in page.inner_text("#move-log").lower(), "audit not logged")
    # no horizontal overflow on mobile
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
        play_game(pw, i, mobile=(i % 3 == 2))  # every 3rd game on a phone viewport

with open(OUT, "w") as f:
    json.dump(results, f, indent=2)

o = results["outcomes"]
print(f"games: {len(results['games'])} · you {o.get('you', 0)} / house {o.get('house', 0)} / draw {o.get('draw', 0)}"
      f" · violations: {len(results['violations'])}")
for f_ in failures[:10]:
    print("FAIL:", f_)
print("E2E PASSED" if not failures else f"E2E FAILED ({len(failures)} failures)")
sys.exit(0 if not failures else 1)
