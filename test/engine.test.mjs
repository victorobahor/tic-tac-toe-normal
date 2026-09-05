import { planTurn, winner } from '../app/rules.js';

const empties = board => board.map((v, i) => (v === null ? i : null)).filter(i => i !== null);
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures += 1; console.error('FAIL:', msg); } };

// 1 — winner detection
assert(JSON.stringify(winner(['X','X','X',null,null,null,null,null,null], 'X')) === '[0,1,2]', 'winner: top row X');
assert(winner([null,null,null,null,'O',null,null,null,'O'], 'O') === null, 'winner: no line');
assert(JSON.stringify(winner([null,'O',null,null,'O',null,null,'O',null], 'O')) === '[1,4,7]', 'winner: middle column O');
assert(JSON.stringify(winner(['O',null,null,null,'O',null,null,null,'O'], 'O')) === '[0,4,8]', 'winner: diagonal O');

// 2 — house priorities, via planTurn (positions with a UNIQUE correct move)
{
  // O,O top row with X,X mid row: taking 2 wins immediately (+1); everything else is 0 or -1.
  const board = ['O','O',null,'X','X',null,null,null,null];
  assert(planTurn(board).steps[0].changed[0] === 2, 'house takes its available win');
}
{
  // X@0 and X@4 with O to move is actually a FORCED X win (8 walks into the 1-fork) —
  // no reply saves O. Classic unique-reply position instead: X opens a corner,
  // and the center is the only non-losing answer.
  const board = ['X',null,null,null,null,null,null,null,null];
  assert(planTurn(board).steps[0].changed[0] === 4, 'house answers a corner opening with center');
}
{
  // Property: the house's chosen move always achieves the best possible value.
  const place = (b, i, m) => { const n = [...b]; n[i] = m; return n; };
  const sampleBoards = [
    ['X',null,null,null,'O',null,null,null,null],
    [null,null,'X',null,'O',null,null,'X',null],
    ['O',null,null,'X','X',null,null,null,null],
    [null,'X',null,null,'O','X',null,null,null],
  ];
  for (const board of sampleBoards) {
    const plan = planTurn(board);
    const idx = plan.steps[0].changed[0];
    const place2 = (b, i) => place(b, i, 'O');
    const best = Math.max(...empties(board).map(i => value(place2(board, i), 'X', 'O')));
    assert(value(place2(board, idx), 'X', 'O') === best, 'house plays a minimax-optimal move');
  }
}

// 3 — legality fuzz: house only ever fills one empty cell, touches nothing else
for (let trial = 0; trial < 4000; trial += 1) {
  const board = Array(9).fill(null);
  let mover = 'X';
  const plies = 1 + Math.floor(Math.random() * 7);
  for (let p = 0; p < plies; p += 1) {
    if (winner(board, 'X') || winner(board, 'O')) break;
    const e = empties(board);
    board[e[Math.floor(Math.random() * e.length)]] = mover;
    mover = mover === 'X' ? 'O' : 'X';
  }
  if (winner(board, 'X') || winner(board, 'O') || !board.includes(null)) continue;
  const before = [...board];
  const plan = planTurn(board);
  assert(plan.steps.length === 1, 'fuzz: exactly one step');
  const step = plan.steps[0];
  const changedCount = step.board.reduce((n, v, i) => n + (v !== before[i] ? 1 : 0), 0);
  assert(changedCount === 1, 'fuzz: exactly one cell changed');
  const filled = step.board.findIndex((v, i) => v !== before[i]);
  assert(before[filled] === null, 'fuzz: house only fills an EMPTY cell');
  assert(step.board[filled] === 'O', 'fuzz: house places O');
}

// 4 — priority: take a win even while a block is also urgent
{
  const board = ['O','O',null,'X','X',null,null,null,null];
  const step = planTurn(board).steps[0];
  assert(step.changed[0] === 2, 'priority: house takes its win over blocking');
}
// and blocks when it cannot win
{
  const board = ['X',null,null,'X','O',null,null,null,null];
  const step = planTurn(board).steps[0];
  assert(step.changed[0] === 6, 'priority: house blocks the column threat');
}

// 5 — perfect X vs house O: the house must never lose
function value(board, mover, me) {
  if (winner(board, 'X')) return me === 'X' ? 1 : -1;
  if (winner(board, 'O')) return me === 'O' ? 1 : -1;
  const empty = empties(board);
  if (!empty.length) return 0;
  let best = mover === me ? -2 : 2;
  for (const i of empty) {
    const b = [...board];
    b[i] = mover;
    const v = value(b, mover === 'X' ? 'O' : 'X', me);
    best = mover === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}
function bestX(board) {
  let best = -2, picks = [];
  for (const i of empties(board)) {
    const b = [...board];
    b[i] = 'X';
    const v = value(b, 'O', 'X');
    if (v > best) { best = v; picks = [i]; } else if (v === best) picks.push(i);
  }
  return picks[Math.floor(Math.random() * picks.length)];
}

const perfect = { xWins: 0, oWins: 0, draws: 0 };
for (let open = 0; open < 9; open += 1) {
  for (let rep = 0; rep < 5; rep += 1) {
    let board = Array(9).fill(null);
    board[open] = 'X';
    for (let guard = 0; guard < 9; guard += 1) {
      if (winner(board, 'X')) { perfect.xWins += 1; break; }
      if (winner(board, 'O')) { perfect.oWins += 1; break; }
      if (!board.includes(null)) { perfect.draws += 1; break; }
      board = [...planTurn(board).steps[0].board];
      if (winner(board, 'O')) { perfect.oWins += 1; break; }
      if (!board.includes(null)) { perfect.draws += 1; break; }
      board[bestX(board)] = 'X';
    }
  }
}
assert(perfect.xWins === 0, `perfect X must never beat the house (got ${perfect.xWins} X wins)`);

// 6 — random X vs house O: house should win the vast majority
const random = { xWins: 0, oWins: 0, draws: 0 };
for (let rep = 0; rep < 500; rep += 1) {
  let board = Array(9).fill(null);
  for (let guard = 0; guard < 9; guard += 1) {
    if (winner(board, 'X')) { random.xWins += 1; break; }
    if (winner(board, 'O')) { random.oWins += 1; break; }
    if (!board.includes(null)) { random.draws += 1; break; }
    const e = empties(board);
    board[e[Math.floor(Math.random() * e.length)]] = 'X';
    if (winner(board, 'X')) { random.xWins += 1; break; }
    if (!board.includes(null)) { random.draws += 1; break; }
    board = [...planTurn(board).steps[0].board];
    if (winner(board, 'O')) { random.oWins += 1; break; }
    if (!board.includes(null)) { random.draws += 1; break; }
  }
}

console.log(`perfect-X series : X ${perfect.xWins} · O ${perfect.oWins} · draws ${perfect.draws}`);
console.log(`random-X series  : X ${random.xWins} · O ${random.oWins} · draws ${random.draws}  (of 500)`);
console.log(failures === 0 ? 'ALL ENGINE TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
