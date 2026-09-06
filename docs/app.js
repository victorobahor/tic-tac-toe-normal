import { planTurn, winner } from './rules.js';

const $ = selector => document.querySelector(selector);
const cells = [...document.querySelectorAll('[data-cell]')];
const positions = ['Top left', 'Top center', 'Top right', 'Middle left', 'Center', 'Middle right', 'Bottom left', 'Bottom center', 'Bottom right'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pick = list => list[Math.floor(Math.random() * list.length)];
const STORE_KEY = 'tic-tac-fair-score-v1';

let board, turn, busy, done, generation, moves, toastTimer, scores;
let mode = 'house';        // 'house' | 'two'
let houseStyle = 'perfect'; // 'perfect' | 'casual'

function loadScores() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { saved = null; }
  scores = saved && typeof saved.you === 'number' && typeof saved.match === 'number'
    ? saved
    : { you: 0, house: 0, draws: 0, match: 1 };
}
function saveScores() { try { localStorage.setItem(STORE_KEY, JSON.stringify(scores)); } catch { /* private mode */ } }

function renderScores() {
  $('#player-score').textContent = String(scores.you);
  $('#ai-score').textContent = String(scores.house);
  $('#draw-score').textContent = String(scores.draws);
  $('#match-number').textContent = String(scores.match).padStart(3, '0');
}

function applyModeLabels() {
  const versus = mode === 'two';
  $('#label-you').textContent = versus ? 'PLAYER X' : 'YOU';
  $('#label-house').textContent = versus ? 'PLAYER O' : 'THE HOUSE';
  $('#new-game').innerHTML = (versus ? 'START A FRESH ROUND <span>↗</span>' : 'START A CLEAN GAME <span>↗</span>');
  $('#mode-house-perfect').classList.toggle('active', mode === 'house' && houseStyle === 'perfect');
  $('#mode-house-casual').classList.toggle('active', mode === 'house' && houseStyle === 'casual');
  $('#mode-two').classList.toggle('active', mode === 'two');
}

function render(changed = [], secondMoved = false) {
  const line = done ? (winner(board, 'O') || winner(board, 'X')) : null;
  cells.forEach((cell, i) => {
    cell.className = board[i]?.toLowerCase() ?? '';
    if (line?.includes(i)) cell.classList.add('winner');
    if (changed.includes(i)) { void cell.offsetWidth; cell.classList.add(secondMoved ? 'ai-move' : 'player-move'); }
    cell.disabled = done || busy || board[i] !== null;
    cell.setAttribute('aria-label', positions[i] + ', ' + (board[i] === 'X' ? 'an X' : board[i] === 'O' ? 'an O' : 'empty'));
  });
}

function setTurn(label, ai = false) {
  $('#turn-label').textContent = label;
  $('.turn-pill').classList.toggle('ai', ai);
  $('.turn-pill').style.visibility = label ? 'visible' : 'hidden';
}

function logMove(message) {
  if (!moves) $('#move-log').replaceChildren();
  moves += 1;
  const item = document.createElement('li');
  item.dataset.number = String(moves).padStart(2, '0');
  item.textContent = message;
  $('#move-log').prepend(item);
  $('#move-count').textContent = moves + ' move' + (moves === 1 ? '' : 's');
}

function showToast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

function finish(result, changed = []) {
  done = true;
  busy = false;
  const versus = mode === 'two';
  if (result === 'x') {
    scores.you += 1;
    $('#status').textContent = versus
      ? pick(['X takes the round. A clean, certified win.', 'X wins. Nothing suspicious, everything symmetric.', 'X takes it. O demands a rematch, politely.'])
      : pick(['You win?! The auditor is stunned. The result stands.', 'A legitimate victory. Nobody is more surprised than the house.', 'You won. Fairly. It feels strange even typing that.']);
    showToast(versus ? 'X WINS · CERTIFIED CLEAN' : 'YOU WIN · VERIFIED LEGITIMATE');
    logMove(versus ? 'X won — certified clean' : 'You won — live audit found 0 violations');
  } else if (result === 'o') {
    scores.house += 1;
    $('#status').textContent = versus
      ? pick(['O takes the round. A clean, certified win.', 'O wins. Had X scared for a second there.', 'O takes it. Pure fundamentals, no tricks.'])
      : pick(['The house wins. Fair and square.', 'The house takes it. Feel free to review the footage.', 'House wins. No appeals necessary. None would succeed anyway.']);
    showToast(versus ? 'O WINS · CERTIFIED CLEAN' : 'THE HOUSE WINS · FAIR AND SQUARE');
    logMove(versus ? 'O won — certified clean' : 'House won — live audit found 0 violations');
  } else {
    scores.draws += 1;
    $('#status').textContent = pick([
      'A draw. The most honest result in sports.',
      'A draw. Nobody saw anything, because nobody did anything.',
      'A draw. The system works.',
    ]);
    showToast(versus ? 'DRAW · RESPECTFULLY SPLIT' : 'DRAW · THE SYSTEM WORKS');
    logMove('Game drawn — 0 violations, 0 regrets');
  }
  saveScores();
  renderScores();
  setTurn('');
  render(changed, result === 'o');
}

function endTurnCheck(secondMoved) {
  if (winner(board, 'X')) { finish('x', secondMoved); return true; }
  if (winner(board, 'O')) { finish('o', secondMoved); return true; }
  if (!board.includes(null)) { finish('draw', secondMoved); return true; }
  return false;
}

async function playHouse(index) {
  const round = generation;
  board[index] = 'X';
  turn += 1;
  logMove('You → ' + positions[index]);
  if (endTurnCheck([index])) return;
  render([index]);
  setTurn(houseStyle === 'casual' ? 'CASUAL HOUSE TURN' : 'HOUSE TURN', true);
  $('#status').textContent = houseStyle === 'casual'
    ? 'The casual house is thinking. Loosely.'
    : 'The house is thinking. Under oath.';
  await wait(420 + Math.random() * 260);
  if (round !== generation) return;
  const plan = planTurn(board, houseStyle === 'casual');
  const step = plan.steps[0];
  board = [...step.board];
  turn += 1;
  logMove(houseStyle === 'casual' ? 'Casual house → ' : 'House → ' + positions[step.changed[0]]);
  if (endTurnCheck(step.changed)) return;
  $('#status').textContent = 'Your move. Still no tricks.';
  setTurn('YOUR TURN');
  busy = false;
  render(step.changed, true);
}

function playTwo(index) {
  const mover = turn % 2 === 0 ? 'X' : 'O';
  const firstMove = mover === 'X';
  board[index] = mover;
  turn += 1;
  logMove('Player ' + mover + ' → ' + positions[index]);
  if (endTurnCheck([index])) return;
  const nextMover = turn % 2 === 0 ? 'X' : 'O';
  $('#status').textContent = nextMover === 'X'
    ? 'X to play. No tricks between friends.'
    : 'O to play. Equally honest.';
  setTurn(nextMover === 'X' ? 'X TO PLAY' : 'O TO PLAY', nextMover === 'O');
  busy = false;
  render([index], !firstMove);
}

async function play(index) {
  if (busy || done || board[index] !== null) return;
  busy = true;
  if (mode === 'two') playTwo(index);
  else await playHouse(index);
}

function reset(startNewMatch = true) {
  generation += 1;
  board = Array(9).fill(null);
  turn = 0; busy = false; done = false; moves = 0;
  if (startNewMatch) {
    scores.match += 1;
    saveScores();
  }
  renderScores();
  $('#move-count').textContent = '0 moves';
  $('#move-log').innerHTML = '<li class="empty-log">No moves yet.<br><span>The board is clean.</span></li>';
  $('#status').textContent = mode === 'two'
    ? 'X moves first. Loser fetches the drinks.'
    : houseStyle === 'casual'
      ? 'Your move against the casual house. It is beatable. Allegedly.'
      : 'Your move. The house plays it straight.';
  clearTimeout(toastTimer);
  $('#toast').classList.remove('show');
  setTurn(mode === 'two' ? 'X TO PLAY' : 'YOUR TURN', false);
  render();
}

function setMode(nextMode, nextStyle) {
  mode = nextMode;
  if (nextStyle) houseStyle = nextStyle;
  applyModeLabels();
  reset(true);
}

cells.forEach((cell, i) => cell.addEventListener('click', () => void play(i)));
$('#new-game').addEventListener('click', () => reset(true));
$('#audit').addEventListener('click', () => {
  logMove('Spot audit requested — passed instantly, 0 violations');
  showToast('AUDIT PASSED ✓ · 0 VIOLATIONS');
});
$('#mode-house-perfect').addEventListener('click', () => setMode('house', 'perfect'));
$('#mode-house-casual').addEventListener('click', () => setMode('house', 'casual'));
$('#mode-two').addEventListener('click', () => setMode('two'));
$('#year').textContent = String(new Date().getFullYear());

loadScores();
board = Array(9).fill(null);
turn = 0; busy = false; done = false; moves = 0; generation = 0;
renderScores();
applyModeLabels();
setTurn('YOUR TURN');
render();
