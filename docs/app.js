import { planTurn, winner } from './rules.js';

const $ = selector => document.querySelector(selector);
const cells = [...document.querySelectorAll('[data-cell]')];
const positions = ['Top left', 'Top center', 'Top right', 'Middle left', 'Center', 'Middle right', 'Bottom left', 'Bottom center', 'Bottom right'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pick = list => list[Math.floor(Math.random() * list.length)];
const STORE_KEY = 'tic-tac-fair-score-v1';

let board, turn, busy, done, generation, moves, toastTimer, scores;

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

function render(changed = [], houseMoved = false) {
  const line = done ? (winner(board, 'O') || winner(board, 'X')) : null;
  cells.forEach((cell, i) => {
    cell.className = board[i]?.toLowerCase() ?? '';
    if (line?.includes(i)) cell.classList.add('winner');
    if (changed.includes(i)) { void cell.offsetWidth; cell.classList.add(houseMoved ? 'ai-move' : 'player-move'); }
    cell.disabled = done || busy || board[i] !== null;
    cell.setAttribute('aria-label', positions[i] + ', ' + (board[i] === 'X' ? 'your X' : board[i] === 'O' ? 'house O' : 'empty'));
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
  if (result === 'you') {
    scores.you += 1;
    $('#status').textContent = pick([
      'You win?! The auditor is stunned. The result stands.',
      'A legitimate victory. Nobody is more surprised than the house.',
      'You won. Fairly. It feels strange even typing that.',
    ]);
    showToast('YOU WIN · VERIFIED LEGITIMATE');
    logMove('You won — live audit found 0 violations');
  } else if (result === 'house') {
    scores.house += 1;
    $('#status').textContent = pick([
      'The house wins. Fair and square.',
      'The house takes it. Feel free to review the footage.',
      'House wins. No appeals necessary. None would succeed anyway.',
    ]);
    showToast('THE HOUSE WINS · FAIR AND SQUARE');
    logMove('House won — live audit found 0 violations');
  } else {
    scores.draws += 1;
    $('#status').textContent = pick([
      'A draw. The most honest result in sports.',
      'A draw. Nobody saw anything, because nobody did anything.',
      'A draw. The system works.',
    ]);
    showToast('DRAW · THE SYSTEM WORKS');
    logMove('Game drawn — 0 violations, 0 regrets');
  }
  saveScores();
  renderScores();
  setTurn('');
  render(changed, result === 'house');
}

async function play(index) {
  if (busy || done || board[index] !== null) return;
  busy = true;
  const round = generation;
  board[index] = 'X';
  turn += 1;
  logMove('You → ' + positions[index]);
  if (winner(board, 'X')) { finish('you', [index]); return; }
  if (!board.includes(null)) { finish('draw', [index]); return; }
  render([index]);
  setTurn('HOUSE TURN', true);
  $('#status').textContent = 'The house is thinking. Under oath.';
  await wait(420 + Math.random() * 260);
  if (round !== generation) return;
  const plan = planTurn(board);
  const step = plan.steps[0];
  board = [...step.board];
  turn += 1;
  logMove('House → ' + positions[step.changed[0]]);
  if (winner(board, 'O')) { finish('house', step.changed); return; }
  if (!board.includes(null)) { finish('draw', step.changed); return; }
  $('#status').textContent = 'Your move. Still no tricks.';
  setTurn('YOUR TURN');
  busy = false;
  render(step.changed, true);
}

function reset() {
  generation += 1;
  board = Array(9).fill(null);
  turn = 0; busy = false; done = false; moves = 0;
  scores.match += 1;
  saveScores();
  renderScores();
  $('#move-count').textContent = '0 moves';
  $('#move-log').innerHTML = '<li class="empty-log">No moves yet.<br><span>The board is clean.</span></li>';
  $('#status').textContent = 'Your move. The house plays it straight.';
  clearTimeout(toastTimer);
  $('#toast').classList.remove('show');
  setTurn('YOUR TURN');
  render();
}

cells.forEach((cell, i) => cell.addEventListener('click', () => void play(i)));
$('#new-game').addEventListener('click', reset);
$('#audit').addEventListener('click', () => {
  logMove('Spot audit requested — passed instantly, 0 violations');
  showToast('AUDIT PASSED ✓ · 0 VIOLATIONS');
});
$('#year').textContent = String(new Date().getFullYear());

loadScores();
board = Array(9).fill(null);
turn = 0; busy = false; done = false; moves = 0; generation = 0;
renderScores();
setTurn('YOUR TURN');
render();
