const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winner(board, mark) {
  for (const line of LINES) if (line.every(index => board[index] === mark)) return line;
  return null;
}

const empties = board => board.map((value, index) => (value === null ? index : null)).filter(index => index !== null);

function findWinningCell(board, mark) {
  for (const line of LINES) {
    const owned = line.filter(index => board[index] === mark);
    const open = line.filter(index => board[index] === null);
    if (owned.length === 2 && open.length === 1) return open[0];
  }
  return null;
}

// CASUAL house: mostly random, occasionally attentive. Still 100% honest —
// it only ever fills one empty cell — but it is genuinely beatable.
function casualMove(board) {
  if (Math.random() < 0.35) {
    const win = findWinningCell(board, 'O');
    if (win !== null) return win;
    const block = findWinningCell(board, 'X');
    if (block !== null) return block;
  }
  const open = empties(board);
  return open[Math.floor(Math.random() * open.length)];
}

// Best achievable value for `mover` from this position: +1 win, 0 draw, -1 loss.
function minimax(board, mover) {
  if (winner(board, 'O')) return 1;
  if (winner(board, 'X')) return -1;
  const open = empties(board);
  if (!open.length) return 0;
  let best = mover === 'O' ? -2 : 2;
  for (const index of open) {
    const next = [...board];
    next[index] = mover;
    const value = minimax(next, mover === 'O' ? 'X' : 'O');
    best = mover === 'O' ? Math.max(best, value) : Math.min(best, value);
    if (best === (mover === 'O' ? 1 : -1)) break;
  }
  return best;
}

// The house plays honestly and perfectly: it never removes, overwrites, or
// rearranges anything — it simply always makes the best available move.
// Against perfect play from O, the best any X can achieve is a draw.
function chooseMove(board) {
  let best = -2;
  let picks = [];
  for (const index of empties(board)) {
    const next = [...board];
    next[index] = 'O';
    const value = minimax(next, 'X');
    if (value > best) { best = value; picks = [index]; }
    else if (value === best) picks.push(index);
  }
  return picks[Math.floor(Math.random() * picks.length)];
}

export function planTurn(board, casual = false) {
  if (!board.includes(null)) return { kind: 'none', steps: [] };
  const index = casual ? casualMove(board) : chooseMove(board);
  const next = [...board];
  next[index] = 'O';
  return { kind: 'move', steps: [{ board: next, changed: [index] }] };
}
