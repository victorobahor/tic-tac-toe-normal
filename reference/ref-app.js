import { planTurn, winner, strategyCycle } from './rules.js';
const $ = selector => document.querySelector(selector);
const cells = [...document.querySelectorAll('[data-cell]')];
const positions = ['Top left','Top center','Top right','Middle left','Center','Middle right','Bottom left','Bottom center','Bottom right'];
let board = Array(9).fill(null), turn = 0, previous = '', busy = false, done = false;
let generation = 0, houseWins = 0, match = 1, incidents = 0, toastTimer;
let strategies = strategyCycle();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function render(changed = [], cheat = false) {
  const line = done ? winner(board, 'O') : [];
  cells.forEach((cell, i) => {
    cell.className = board[i]?.toLowerCase() ?? '';
    if (line?.includes(i)) cell.classList.add('winner');
    if (changed.includes(i)) { void cell.offsetWidth; cell.classList.add(cheat ? 'cheated' : 'ai-move'); }
    cell.disabled = done || busy || board[i] !== null;
    cell.setAttribute('aria-label', positions[i] + ', ' + (board[i] === 'X' ? 'your X' : board[i] === 'O' ? 'house O' : 'empty'));
  });
}
function setTurn(label, ai = false) {
  $('#turn-label').textContent = label;
  $('.turn-pill').classList.toggle('ai', ai);
  $('.turn-pill').style.visibility = label ? 'visible' : 'hidden';
}
function report(message) {
  if (!incidents) $('#incident-log').replaceChildren();
  const item = document.createElement('li');
  item.dataset.number = String(++incidents).padStart(2, '0');
  item.textContent = message;
  $('#incident-log').prepend(item);
  $('#incident-count').textContent = incidents + ' violation' + (incidents === 1 ? '' : 's');
}
function showToast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2800);
}
async function play(index) {
  if (busy || done || board[index] !== null) return;
  busy = true;
  const round = generation;
  board[index] = 'X';
  const threatenedWin = Boolean(winner(board, 'X'));
  const nextTurn = turn + 1;
  const plan = planTurn(board, ++turn, previous, Math.random, nextTurn > 1 ? strategies[(nextTurn - 2) % strategies.length] : undefined);
  // Do not paint a completed player line as if it were a valid result.
  // Apply the referee's first correction atomically with the attempted move.
  if (threatenedWin) {
    const correction = plan.steps.shift();
    board = [...correction.board];
    report(correction.message);
    $('#status').textContent = correction.message;
    render(correction.changed, true);
  } else {
    render([index]);
    $('#status').textContent = 'Let me think…';
  }
  setTurn('HOUSE TURN', true);
  await wait(450 + Math.random() * 250);
  if (round !== generation) return;
  for (const step of plan.steps) {
    board = [...step.board];
    render(step.changed, Boolean(step.message));
    if (step.message) { report(step.message); $('#status').textContent = step.message; }
    else if (step.cue) $('#status').textContent = step.cue;
    await wait(step.delay);
    if (round !== generation) return;
  }
  previous = plan.kind;
  busy = false;
  if (winner(board, 'O')) {
    done = true;
    $('#ai-score').textContent = String(++houseWins);
    $('#status').textContent = incidents ? ['A triumph of talent. And editing.', 'I would like to thank the referee. Me.', 'A fair result, according to me.'][Math.floor(Math.random() * 3)] : 'A perfectly ordinary victory. Suspicious.';
    setTurn('');
    showToast('The House wins. What are the odds?');
  } else {
    $('#status').textContent = turn === 1 ? 'Your move.' : 'Your move. Take your time.';
    setTurn('YOUR TURN');
  }
  render();
}
function reset() {
  generation++;
  strategies = strategyCycle();
  board = Array(9).fill(null); turn = 0; previous = ''; busy = false; done = false; incidents = 0;
  $('#match-number').textContent = String(++match).padStart(3, '0');
  $('#incident-count').textContent = '0 violations';
  $('#incident-log').innerHTML = '<li class="empty-log">Nothing suspicious yet.<br><span>Give it a second.</span></li>';
  $('#status').textContent = 'Your move, hotshot.';
  clearTimeout(toastTimer); $('#toast').classList.remove('show');
  setTurn('YOUR TURN'); render();
}
cells.forEach((cell, i) => cell.addEventListener('click', () => void play(i)));
$('#new-game').addEventListener('click', reset);
$('#appeal').addEventListener('click', () => {
  $('#ai-score').textContent = String(++houseWins);
  report('Appeal denied. A processing fee of one point was awarded to the House.');
  showToast('APPEAL DENIED · HOUSE +1');
});
$('#year').textContent = String(new Date().getFullYear());
render();
