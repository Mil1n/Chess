const pieces = {
  r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟',
  R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙',
};

const initialBoard = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

const files = ['a','b','c','d','e','f','g','h'];
const state = {
  board: cloneBoard(initialBoard),
  turn: 'white',
  selected: null,
  history: [],
  gameId: 0,
  onlineStatus: 'idle',
  mode: 'idle',
  opponent: 'ожидает выбора',
  botThinking: false,
  soundEnabled: true,
};

const boardEl = document.querySelector('#board');
const movesEl = document.querySelector('#moves');
const scoreEl = document.querySelector('#score');
const lastMoveEl = document.querySelector('#last-move');
const coachAdviceEl = document.querySelector('#coach-advice');
const reportStatusEl = document.querySelector('#report-status');
const onlineStatusEl = document.querySelector('#online-status');
const opponentNameEl = document.querySelector('#opponent-name');
const newOnlineGameButton = document.querySelector('#new-online-game');
const newBotGameButton = document.querySelector('#new-bot-game');
const toggleSoundButton = document.querySelector('#toggle-sound');
const demoOpponents = ['Mila_1540', 'KnightFox', 'TacticNinja', 'ClubPlayer_1280'];
const botProfiles = ['Bot Nova 900', 'Bot Tactic 1200', 'Bot Aurora 1500'];
let matchmakingTimer = null;
let botTimer = null;
let audioContext = null;


function getAudioContext() {
  if (!state.soundEnabled) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function playTone({ frequency, duration = 0.08, type = 'sine', volume = 0.08, delay = 0 }) {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSound(kind) {
  const sounds = {
    move: [{ frequency: 520, duration: 0.055, type: 'triangle' }],
    capture: [
      { frequency: 220, duration: 0.07, type: 'square', volume: 0.06 },
      { frequency: 150, duration: 0.08, type: 'sawtooth', volume: 0.04, delay: 0.045 },
    ],
    start: [
      { frequency: 440, duration: 0.07, type: 'triangle' },
      { frequency: 660, duration: 0.08, type: 'triangle', delay: 0.07 },
    ],
    bot: [
      { frequency: 330, duration: 0.05, type: 'triangle' },
      { frequency: 500, duration: 0.05, type: 'triangle', delay: 0.055 },
    ],
    report: [{ frequency: 180, duration: 0.16, type: 'sawtooth', volume: 0.04 }],
  };
  (sounds[kind] ?? sounds.move).forEach(playTone);
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isWhite(piece) {
  return Boolean(piece) && piece === piece.toUpperCase();
}

function colorOf(piece) {
  return piece ? (isWhite(piece) ? 'white' : 'black') : null;
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function squareName(r, c) {
  return `${files[c]}${8 - r}`;
}

function generateMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];

  const color = colorOf(piece);
  const lower = piece.toLowerCase();
  const moves = [];
  const add = (nr, nc) => {
    if (!inBounds(nr, nc)) return false;
    const target = board[nr][nc];
    if (!target) {
      moves.push([nr, nc]);
      return true;
    }
    if (colorOf(target) !== color) moves.push([nr, nc]);
    return false;
  };

  if (lower === 'p') {
    const dir = color === 'white' ? -1 : 1;
    const start = color === 'white' ? 6 : 1;
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push([r + dir, c]);
      if (r === start && !board[r + dir * 2][c]) moves.push([r + dir * 2, c]);
    }
    [-1, 1].forEach((dc) => {
      const nr = r + dir;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] && colorOf(board[nr][nc]) !== color) moves.push([nr, nc]);
    });
  }

  if (lower === 'n') {
    [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => add(r + dr, c + dc));
  }

  if (['b','r','q'].includes(lower)) {
    const dirs = [];
    if (['b','q'].includes(lower)) dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if (['r','q'].includes(lower)) dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    dirs.forEach(([dr, dc]) => {
      let nr = r + dr;
      let nc = c + dc;
      while (add(nr, nc)) {
        nr += dr;
        nc += dc;
      }
    });
  }

  if (lower === 'k') {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr || dc) add(r + dr, c + dc);
      }
    }
  }

  return moves;
}

function makeMove(board, from, to) {
  const next = cloneBoard(board);
  const piece = next[from[0]][from[1]];
  next[to[0]][to[1]] = piece;
  next[from[0]][from[1]] = null;
  if (piece === 'P' && to[0] === 0) next[to[0]][to[1]] = 'Q';
  if (piece === 'p' && to[0] === 7) next[to[0]][to[1]] = 'q';
  return next;
}

function evaluate(board) {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  return board.flat().reduce((score, piece) => {
    if (!piece) return score;
    const value = values[piece.toLowerCase()];
    return score + (isWhite(piece) ? value : -value);
  }, 0);
}

function isSameSquare(a, b) {
  return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}

function handleSquareClick(r, c) {
  if (state.botThinking) return;

  const piece = state.board[r][c];
  const legalMoves = state.selected ? generateMoves(state.board, state.selected[0], state.selected[1]) : [];
  const legalTarget = legalMoves.some(([mr, mc]) => mr === r && mc === c);

  if (state.selected && legalTarget) {
    const movingPiece = state.board[state.selected[0]][state.selected[1]];
    const capturedPiece = state.board[r][c];
    state.board = makeMove(state.board, state.selected, [r, c]);
    state.history = [`${pieces[movingPiece]} ${squareName(state.selected[0], state.selected[1])} → ${squareName(r, c)}`, ...state.history].slice(0, 8);
    state.turn = state.turn === 'white' ? 'black' : 'white';
    state.selected = null;
    playSound(capturedPiece ? 'capture' : 'move');
    render();
    queueBotMoveIfNeeded();
    return;
  }

  const canSelectPiece = piece && colorOf(piece) === state.turn && !(state.mode === 'bot' && state.turn === 'black');
  state.selected = canSelectPiece ? [r, c] : null;
  render();
}

function renderBoard() {
  const legalMoves = state.selected ? generateMoves(state.board, state.selected[0], state.selected[1]) : [];
  boardEl.replaceChildren();

  state.board.forEach((row, r) => {
    row.forEach((piece, c) => {
      const button = document.createElement('button');
      const legal = legalMoves.some(([mr, mc]) => mr === r && mc === c);
      button.type = 'button';
      button.className = `square ${(r + c) % 2 ? 'dark' : 'light'} ${isSameSquare(state.selected, [r, c]) ? 'selected' : ''} ${legal ? 'legal' : ''}`;
      button.setAttribute('aria-label', `${squareName(r, c)} ${piece ? pieces[piece] : 'empty'}`);
      button.addEventListener('click', () => handleSquareClick(r, c));

      const pieceEl = document.createElement('span');
      pieceEl.className = piece ? `${colorOf(piece)}-piece` : '';
      pieceEl.textContent = piece ? pieces[piece] : '';
      button.append(pieceEl);
      if (legal) button.append(document.createElement('i'));
      boardEl.append(button);
    });
  });

  const badge = document.createElement('div');
  badge.className = 'turn-badge';
  badge.textContent = `Ход: ${state.turn === 'white' ? 'белые' : 'черные'}`;
  boardEl.append(badge);
}

function renderMoves() {
  movesEl.replaceChildren();
  const moves = state.history.length ? state.history : ['Сделайте первый ход'];
  moves.forEach((move) => {
    const li = document.createElement('li');
    li.textContent = move;
    movesEl.append(li);
  });
}

function renderCoach() {
  const score = evaluate(state.board);
  scoreEl.textContent = `${score > 0 ? '+' : ''}${score}`;
  lastMoveEl.textContent = state.history[0] ?? 'пока нет';
  coachAdviceEl.textContent = score > 2
    ? 'У белых перевес: упрощайте позицию и ищите размен ферзей.'
    : score < -2
      ? 'Черные впереди: белым стоит создавать тактические угрозы, а не пассивно защищаться.'
      : 'Позиция примерно равная: улучшайте худшую фигуру и контролируйте центр.';
}

function renderOnlineStatus() {
  opponentNameEl.textContent = state.opponent;
  newOnlineGameButton.textContent = state.onlineStatus === 'searching' ? 'Ищем соперника…' : 'Новая онлайн партия';
  newOnlineGameButton.disabled = state.onlineStatus === 'searching' || state.botThinking;
  newBotGameButton.disabled = state.onlineStatus === 'searching' || state.botThinking;
  toggleSoundButton.textContent = state.soundEnabled ? 'Звук: вкл' : 'Звук: выкл';

  if (state.mode === 'bot') {
    onlineStatusEl.textContent = state.botThinking
      ? `${state.opponent} думает над ответом…`
      : `Офлайн партия #${state.gameId} против ${state.opponent}. Вы играете белыми.`;
    onlineStatusEl.className = state.botThinking ? 'online-status searching' : 'online-status connected';
    return;
  }

  if (state.onlineStatus === 'connected') {
    onlineStatusEl.textContent = `Партия #${state.gameId} запущена. Соперник найден, играйте ходами на доске.`;
    onlineStatusEl.className = 'online-status connected';
    return;
  }

  if (state.onlineStatus === 'searching') {
    onlineStatusEl.textContent = 'Подбираем соперника по рейтингу и уровню доверия…';
    onlineStatusEl.className = 'online-status searching';
    return;
  }

  onlineStatusEl.textContent = 'Выберите онлайн-поиск или офлайн-бота, чтобы начать новую партию.';
  onlineStatusEl.className = 'online-status';
}

function render() {
  renderBoard();
  renderMoves();
  renderCoach();
  renderOnlineStatus();
}

function resetBoardForNewGame() {
  state.board = cloneBoard(initialBoard);
  state.turn = 'white';
  state.selected = null;
  state.history = [];
  state.botThinking = false;
  reportStatusEl.textContent = 'Нет активных жалоб';
}

function startOnlineGame() {
  clearTimeout(matchmakingTimer);
  clearTimeout(botTimer);
  resetBoardForNewGame();
  state.gameId += 1;
  state.onlineStatus = 'searching';
  state.mode = 'online';
  state.opponent = 'поиск…';
  playSound('move');
  render();

  matchmakingTimer = setTimeout(() => {
    const opponentIndex = state.gameId % demoOpponents.length;
    state.onlineStatus = 'connected';
    state.opponent = demoOpponents[opponentIndex];
    state.history = [`Онлайн партия #${state.gameId} началась против ${state.opponent}`];
    playSound('start');
    render();
  }, 700);
}

function collectMovesForColor(color) {
  const moves = [];
  state.board.forEach((row, r) => {
    row.forEach((piece, c) => {
      if (piece && colorOf(piece) === color) {
        generateMoves(state.board, r, c).forEach(([tr, tc]) => {
          moves.push({ from: [r, c], to: [tr, tc], capture: Boolean(state.board[tr][tc]) });
        });
      }
    });
  });
  return moves;
}

function chooseBotMove() {
  const moves = collectMovesForColor('black');
  if (!moves.length) return null;
  const captures = moves.filter((move) => move.capture);
  const pool = captures.length ? captures : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

function queueBotMoveIfNeeded() {
  clearTimeout(botTimer);
  if (state.mode !== 'bot' || state.turn !== 'black') return;

  state.botThinking = true;
  render();

  botTimer = setTimeout(() => {
    const botMove = chooseBotMove();
    if (!botMove) {
      state.history = [`${state.opponent} не нашел легальных ходов`, ...state.history].slice(0, 8);
      state.botThinking = false;
      render();
      return;
    }

    const movingPiece = state.board[botMove.from[0]][botMove.from[1]];
    const capturedPiece = state.board[botMove.to[0]][botMove.to[1]];
    state.board = makeMove(state.board, botMove.from, botMove.to);
    state.history = [`${state.opponent}: ${pieces[movingPiece]} ${squareName(botMove.from[0], botMove.from[1])} → ${squareName(botMove.to[0], botMove.to[1])}`, ...state.history].slice(0, 8);
    state.turn = 'white';
    state.botThinking = false;
    playSound(capturedPiece ? 'capture' : 'bot');
    render();
  }, 650);
}

function startBotGame() {
  clearTimeout(matchmakingTimer);
  clearTimeout(botTimer);
  resetBoardForNewGame();
  state.gameId += 1;
  state.mode = 'bot';
  state.onlineStatus = 'connected';
  state.opponent = botProfiles[state.gameId % botProfiles.length];
  state.history = [`Офлайн партия #${state.gameId} началась против ${state.opponent}`];
  playSound('start');
  render();
}

newOnlineGameButton.addEventListener('click', startOnlineGame);
newBotGameButton.addEventListener('click', startBotGame);
toggleSoundButton.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  if (state.soundEnabled) playSound('move');
  render();
});

document.querySelector('#report-game').addEventListener('click', () => {
  reportStatusEl.textContent = 'Жалоба получена → проверяется модерацией';
  playSound('report');
});

render();
