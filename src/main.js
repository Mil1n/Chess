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
  gameOver: false,
  result: '',
  lastMove: null,
  enPassantTarget: null,
  castlingRights: { whiteKingSide: true, whiteQueenSide: true, blackKingSide: true, blackQueenSide: true },
  clock: { white: 300, black: 300 },
  increment: 2,
  pendingPromotion: null,
  botLevel: 'club',
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
const whiteClockEl = document.querySelector('#white-clock');
const blackClockEl = document.querySelector('#black-clock');
const resignGameButton = document.querySelector('#resign-game');
const drawGameButton = document.querySelector('#draw-game');
const rematchGameButton = document.querySelector('#rematch-game');
const copyPgnButton = document.querySelector('#copy-pgn');
const copyFenButton = document.querySelector('#copy-fen');
const fenInputEl = document.querySelector('#fen-input');
const loadFenButton = document.querySelector('#load-fen');
const botLevelSelect = document.querySelector('#bot-level');
const promotionModalEl = document.querySelector('#promotion-modal');
const endModalEl = document.querySelector('#end-modal');
const demoOpponents = ['Mila_1540', 'KnightFox', 'TacticNinja', 'ClubPlayer_1280'];
const botProfiles = { beginner: 'Bot Pawn 400', club: 'Bot Nova 900', strong: 'Bot Aurora 1400' };
let matchmakingTimer = null;
let botTimer = null;
let audioContext = null;
let clockTimer = null;
let lastStartMode = 'bot';


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

function opposite(color) {
  return color === 'white' ? 'black' : 'white';
}

function defaultCastlingRights() {
  return { whiteKingSide: true, whiteQueenSide: true, blackKingSide: true, blackQueenSide: true };
}

function sameSquare(a, b) {
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const rest = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
}

function startClock() {
  stopClock();
  clockTimer = setInterval(() => {
    if (state.gameOver || state.onlineStatus === 'searching') return;
    state.clock[state.turn] -= 1;
    if (state.clock[state.turn] <= 0) {
      state.clock[state.turn] = 0;
      state.gameOver = true;
      state.result = `Время вышло. Победили ${state.turn === 'white' ? 'черные' : 'белые'}.`;
      stopClock();
      playSound('report');
    }
    render();
  }, 1000);
}

function generatePseudoMoves(board, r, c, { attacksOnly = false } = {}) {
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
    if (!attacksOnly && inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push([r + dir, c]);
      if (r === start && !board[r + dir * 2][c]) moves.push([r + dir * 2, c]);
    }
    [-1, 1].forEach((dc) => {
      const nr = r + dir;
      const nc = c + dc;
      if (!inBounds(nr, nc)) return;
      if (attacksOnly || (board[nr][nc] && colorOf(board[nr][nc]) !== color) || sameSquare(state.enPassantTarget, [nr, nc])) moves.push([nr, nc]);
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

    if (!attacksOnly && !isKingInCheck(board, color)) {
      const homeRow = color === 'white' ? 7 : 0;
      const enemy = opposite(color);
      const kingSideRight = color === 'white' ? state.castlingRights.whiteKingSide : state.castlingRights.blackKingSide;
      const queenSideRight = color === 'white' ? state.castlingRights.whiteQueenSide : state.castlingRights.blackQueenSide;
      if (r === homeRow && c === 4 && kingSideRight && !board[homeRow][5] && !board[homeRow][6]
        && !isSquareAttacked(board, homeRow, 5, enemy) && !isSquareAttacked(board, homeRow, 6, enemy)) moves.push([homeRow, 6]);
      if (r === homeRow && c === 4 && queenSideRight && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3]
        && !isSquareAttacked(board, homeRow, 3, enemy) && !isSquareAttacked(board, homeRow, 2, enemy)) moves.push([homeRow, 2]);
    }
  }

  return moves;
}

function findKing(board, color) {
  const king = color === 'white' ? 'K' : 'k';
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (board[r][c] === king) return [r, c];
    }
  }
  return null;
}

function isSquareAttacked(board, row, col, byColor) {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && colorOf(piece) === byColor) {
        if (generatePseudoMoves(board, r, c, { attacksOnly: true }).some(([mr, mc]) => mr === row && mc === col)) return true;
      }
    }
  }
  return false;
}

function isKingInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return true;
  const opponent = color === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, king[0], king[1], opponent);
}

function generateMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = colorOf(piece);
  return generatePseudoMoves(board, r, c).filter(([nr, nc]) => {
    const target = board[nr][nc];
    if (target?.toLowerCase() === 'k') return false;
    return !isKingInCheck(makeMove(board, [r, c], [nr, nc]), color);
  });
}

function collectLegalMovesForColor(board, color) {
  const moves = [];
  board.forEach((row, r) => {
    row.forEach((piece, c) => {
      if (piece && colorOf(piece) === color) {
        generateMoves(board, r, c).forEach(([tr, tc]) => {
          moves.push({ from: [r, c], to: [tr, tc], capture: Boolean(board[tr][tc]) });
        });
      }
    });
  });
  return moves;
}

function updateGameEndState() {
  const legalMoves = collectLegalMovesForColor(state.board, state.turn);
  const inCheck = isKingInCheck(state.board, state.turn);
  state.gameOver = legalMoves.length === 0;

  if (!state.gameOver) {
    state.result = inCheck ? `Шах: ${state.turn === 'white' ? 'белому' : 'черному'} королю.` : '';
    return;
  }

  if (inCheck) {
    const winner = state.turn === 'white' ? 'черные' : 'белые';
    state.result = `Мат. Победили ${winner}.`;
  } else {
    state.result = 'Пат. Ничья.';
  }
  stopClock();
}

function makeMove(board, from, to, { promotion, enPassantTarget = state.enPassantTarget } = {}) {
  const next = cloneBoard(board);
  const piece = next[from[0]][from[1]];
  const lower = piece?.toLowerCase();
  const isEnPassant = lower === 'p' && enPassantTarget && sameSquare(to, enPassantTarget) && !next[to[0]][to[1]] && from[1] !== to[1];
  const isCastling = lower === 'k' && Math.abs(to[1] - from[1]) === 2;

  next[to[0]][to[1]] = piece;
  next[from[0]][from[1]] = null;

  if (isEnPassant) next[from[0]][to[1]] = null;
  if (isCastling) {
    const rookFrom = to[1] === 6 ? 7 : 0;
    const rookTo = to[1] === 6 ? 5 : 3;
    next[to[0]][rookTo] = next[to[0]][rookFrom];
    next[to[0]][rookFrom] = null;
  }

  if (piece === 'P' && to[0] === 0) next[to[0]][to[1]] = promotion ?? 'Q';
  if (piece === 'p' && to[0] === 7) next[to[0]][to[1]] = promotion?.toLowerCase() ?? 'q';
  return next;
}

function updateCastlingRights(piece, from, to) {
  if (piece === 'K') {
    state.castlingRights.whiteKingSide = false;
    state.castlingRights.whiteQueenSide = false;
  }
  if (piece === 'k') {
    state.castlingRights.blackKingSide = false;
    state.castlingRights.blackQueenSide = false;
  }
  if (piece === 'R' && from[0] === 7 && from[1] === 0) state.castlingRights.whiteQueenSide = false;
  if (piece === 'R' && from[0] === 7 && from[1] === 7) state.castlingRights.whiteKingSide = false;
  if (piece === 'r' && from[0] === 0 && from[1] === 0) state.castlingRights.blackQueenSide = false;
  if (piece === 'r' && from[0] === 0 && from[1] === 7) state.castlingRights.blackKingSide = false;
  if (to[0] === 7 && to[1] === 0) state.castlingRights.whiteQueenSide = false;
  if (to[0] === 7 && to[1] === 7) state.castlingRights.whiteKingSide = false;
  if (to[0] === 0 && to[1] === 0) state.castlingRights.blackQueenSide = false;
  if (to[0] === 0 && to[1] === 7) state.castlingRights.blackKingSide = false;
}

function needsPromotion(piece, to) {
  return piece?.toLowerCase() === 'p' && (to[0] === 0 || to[0] === 7);
}

function applyMove(from, to, { bot = false, promotion } = {}) {
  const movingPiece = state.board[from[0]][from[1]];
  const capturedPiece = state.board[to[0]][to[1]];
  const finalPromotion = promotion ?? (bot && needsPromotion(movingPiece, to) ? (isWhite(movingPiece) ? 'Q' : 'q') : undefined);
  const isEnPassant = movingPiece?.toLowerCase() === 'p' && state.enPassantTarget && sameSquare(to, state.enPassantTarget) && !capturedPiece && from[1] !== to[1];
  const isCastling = movingPiece?.toLowerCase() === 'k' && Math.abs(to[1] - from[1]) === 2;

  state.board = makeMove(state.board, from, to, { promotion: finalPromotion });
  updateCastlingRights(movingPiece, from, to);
  state.enPassantTarget = movingPiece?.toLowerCase() === 'p' && Math.abs(to[0] - from[0]) === 2 ? [(from[0] + to[0]) / 2, from[1]] : null;
  state.lastMove = { from, to };
  state.clock[colorOf(movingPiece)] += state.increment;

  const special = isCastling ? ' рокировка' : isEnPassant ? ' e.p.' : finalPromotion ? `=${finalPromotion.toUpperCase()}` : (capturedPiece ? ' взятие' : '');
  state.history = [`${pieces[movingPiece]} ${squareName(from[0], from[1])} → ${squareName(to[0], to[1])}${special}`, ...state.history].slice(0, 12);
  state.turn = opposite(state.turn);
  state.selected = null;
  updateGameEndState();
  if (!bot) playSound((capturedPiece || isEnPassant) ? 'capture' : 'move');
}


function boardToFen() {
  const placement = state.board.map((row) => {
    let empty = 0;
    let fenRow = '';
    row.forEach((piece) => {
      if (!piece) {
        empty += 1;
        return;
      }
      if (empty) {
        fenRow += empty;
        empty = 0;
      }
      fenRow += piece;
    });
    return fenRow + (empty || '');
  }).join('/');
  const castling = [
    state.castlingRights.whiteKingSide && 'K',
    state.castlingRights.whiteQueenSide && 'Q',
    state.castlingRights.blackKingSide && 'k',
    state.castlingRights.blackQueenSide && 'q',
  ].filter(Boolean).join('') || '-';
  const enPassant = state.enPassantTarget ? squareName(state.enPassantTarget[0], state.enPassantTarget[1]) : '-';
  return `${placement} ${state.turn[0]} ${castling} ${enPassant} 0 1`;
}

function historyToPgn() {
  const moves = [...state.history].reverse().filter((move) => !move.includes('партия'));
  const pairs = [];
  for (let index = 0; index < moves.length; index += 2) {
    pairs.push(`${Math.floor(index / 2) + 1}. ${moves[index] ?? ''} ${moves[index + 1] ?? ''}`.trim());
  }
  return pairs.join(' ') || '*';
}

function copyText(text, label) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
  reportStatusEl.textContent = `${label} скопирован: ${text}`;
}


function loadFen(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error('FEN должен содержать позицию, сторону хода, рокировку и en passant');
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error('В FEN должно быть 8 рядов');
  const board = rows.map((row) => {
    const cells = [];
    row.split('').forEach((char) => {
      if (/\d/.test(char)) cells.push(...Array(Number(char)).fill(null));
      else if ('prnbqkPRNBQK'.includes(char)) cells.push(char);
      else throw new Error(`Недопустимый символ FEN: ${char}`);
    });
    if (cells.length !== 8) throw new Error('Каждый ряд FEN должен содержать 8 клеток');
    return cells;
  });
  state.board = board;
  state.turn = parts[1] === 'b' ? 'black' : 'white';
  state.castlingRights = {
    whiteKingSide: parts[2].includes('K'),
    whiteQueenSide: parts[2].includes('Q'),
    blackKingSide: parts[2].includes('k'),
    blackQueenSide: parts[2].includes('q'),
  };
  state.enPassantTarget = parts[3] === '-' ? null : [8 - Number(parts[3][1]), files.indexOf(parts[3][0])];
  state.history = [`FEN загружен: ${parts[0]}`];
  state.lastMove = null;
  state.gameOver = false;
  state.result = '';
  updateGameEndState();
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
  if (state.botThinking || state.gameOver) return;

  const piece = state.board[r][c];
  const legalMoves = state.selected ? generateMoves(state.board, state.selected[0], state.selected[1]) : [];
  const legalTarget = legalMoves.some(([mr, mc]) => mr === r && mc === c);

  if (state.selected && legalTarget) {
    if (needsPromotion(state.board[state.selected[0]][state.selected[1]], [r, c])) {
      state.pendingPromotion = { from: state.selected, to: [r, c], piece: state.board[state.selected[0]][state.selected[1]] };
      state.selected = null;
      render();
      return;
    }
    applyMove(state.selected, [r, c]);
    render();
    queueBotMoveIfNeeded();
    return;
  }

  const canSelectPiece = piece && colorOf(piece) === state.turn && !(state.mode === 'bot' && state.turn === 'black');
  state.selected = canSelectPiece ? [r, c] : null;
  render();
}

function renderBoard() {
  const legalMoves = state.selected && !state.gameOver ? generateMoves(state.board, state.selected[0], state.selected[1]) : [];
  boardEl.replaceChildren();

  state.board.forEach((row, r) => {
    row.forEach((piece, c) => {
      const button = document.createElement('button');
      const legal = legalMoves.some(([mr, mc]) => mr === r && mc === c);
      const last = sameSquare(state.lastMove?.from, [r, c]) || sameSquare(state.lastMove?.to, [r, c]);
      const kingInCheck = piece?.toLowerCase() === 'k' && isKingInCheck(state.board, colorOf(piece));
      button.type = 'button';
      button.className = `square ${(r + c) % 2 ? 'dark' : 'light'} ${isSameSquare(state.selected, [r, c]) ? 'selected' : ''} ${legal ? 'legal' : ''} ${last ? 'last-move' : ''} ${kingInCheck ? 'in-check' : ''}`;
      button.setAttribute('aria-label', `${squareName(r, c)} ${piece ? pieces[piece] : 'empty'}`);
      button.addEventListener('click', () => handleSquareClick(r, c));

      const pieceEl = document.createElement('span');
      pieceEl.className = piece ? `${colorOf(piece)}-piece` : '';
      pieceEl.textContent = piece ? pieces[piece] : '';
      button.append(pieceEl);
      if (legal) button.append(document.createElement('i'));
      if (r === 7) {
        const fileLabel = document.createElement('em');
        fileLabel.className = 'coord file';
        fileLabel.textContent = files[c];
        button.append(fileLabel);
      }
      if (c === 0) {
        const rankLabel = document.createElement('em');
        rankLabel.className = 'coord rank';
        rankLabel.textContent = 8 - r;
        button.append(rankLabel);
      }
      boardEl.append(button);
    });
  });

  const badge = document.createElement('div');
  badge.className = 'turn-badge';
  badge.textContent = state.gameOver ? state.result : (state.result || `Ход: ${state.turn === 'white' ? 'белые' : 'черные'}`);
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

  if (state.gameOver) {
    onlineStatusEl.textContent = state.result;
    onlineStatusEl.className = 'online-status finished';
    return;
  }

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

function renderTimers() {
  whiteClockEl.textContent = formatClock(state.clock.white);
  blackClockEl.textContent = formatClock(state.clock.black);
  whiteClockEl.className = state.turn === 'white' && !state.gameOver ? 'active-clock' : '';
  blackClockEl.className = state.turn === 'black' && !state.gameOver ? 'active-clock' : '';
}


function renderPromotionModal() {
  promotionModalEl.replaceChildren();
  promotionModalEl.className = state.pendingPromotion ? 'modal' : 'modal hidden';
  if (!state.pendingPromotion) return;

  const card = document.createElement('section');
  card.className = 'modal-card';
  const title = document.createElement('h2');
  title.textContent = 'Выберите фигуру для превращения';
  card.append(title);
  const choices = isWhite(state.pendingPromotion.piece)
    ? [['Q', '♕'], ['R', '♖'], ['B', '♗'], ['N', '♘']]
    : [['q', '♛'], ['r', '♜'], ['b', '♝'], ['n', '♞']];
  const row = document.createElement('div');
  row.className = 'promotion-row';
  choices.forEach(([piece, icon]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = icon;
    button.addEventListener('click', () => {
      const { from, to } = state.pendingPromotion;
      state.pendingPromotion = null;
      applyMove(from, to, { promotion: piece });
      render();
      queueBotMoveIfNeeded();
    });
    row.append(button);
  });
  card.append(row);
  promotionModalEl.append(card);
}

function gameSummary() {
  const moves = state.history.filter((move) => !move.includes('партия'));
  const captures = moves.filter((move) => move.includes('взятие') || move.includes('e.p.')).length;
  return [`Ходов в истории: ${moves.length}`, `Материал: ${evaluate(state.board)}`, `Взятий/спецходов: ${captures}`];
}

function renderEndModal() {
  endModalEl.replaceChildren();
  endModalEl.className = state.gameOver ? 'modal' : 'modal hidden';
  if (!state.gameOver) return;

  const card = document.createElement('section');
  card.className = 'modal-card';
  const title = document.createElement('h2');
  title.textContent = state.result;
  card.append(title);
  const list = document.createElement('ul');
  gameSummary().forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.append(li);
  });
  card.append(list);
  const actions = document.createElement('div');
  actions.className = 'game-actions';
  [['Реванш', () => rematchGameButton.click()], ['PGN', () => copyPgnButton.click()], ['FEN', () => copyFenButton.click()]].forEach(([label, action]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    actions.append(button);
  });
  card.append(actions);
  endModalEl.append(card);
}

function render() {
  renderBoard();
  renderMoves();
  renderCoach();
  renderOnlineStatus();
  renderTimers();
  renderPromotionModal();
  renderEndModal();
}

function resetBoardForNewGame() {
  state.board = cloneBoard(initialBoard);
  state.turn = 'white';
  state.selected = null;
  state.history = [];
  state.botThinking = false;
  state.lastMove = null;
  state.enPassantTarget = null;
  state.castlingRights = defaultCastlingRights();
  state.clock = { white: 300, black: 300 };
  state.gameOver = false;
  state.result = '';
  state.pendingPromotion = null;
  reportStatusEl.textContent = 'Нет активных жалоб';
}

function startOnlineGame() {
  clearTimeout(matchmakingTimer);
  clearTimeout(botTimer);
  resetBoardForNewGame();
  state.gameId += 1;
  state.onlineStatus = 'searching';
  state.mode = 'online';
  lastStartMode = 'online';
  state.opponent = 'поиск…';
  playSound('move');
  render();

  matchmakingTimer = setTimeout(() => {
    const opponentIndex = state.gameId % demoOpponents.length;
    state.onlineStatus = 'connected';
    state.opponent = demoOpponents[opponentIndex];
    state.history = [`Онлайн партия #${state.gameId} началась против ${state.opponent}`];
    playSound('start');
    startClock();
    render();
  }, 700);
}

function scoreBotMove(move) {
  const target = state.board[move.to[0]][move.to[1]];
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let score = target ? values[target.toLowerCase()] * 10 : 0;
  const next = makeMove(state.board, move.from, move.to);
  if (isKingInCheck(next, 'white')) score += 6;
  if (needsPromotion(state.board[move.from[0]][move.from[1]], move.to)) score += 18;
  return score + Math.random();
}

function chooseBotMove() {
  const moves = collectLegalMovesForColor(state.board, 'black');
  if (!moves.length) return null;
  if (state.botLevel === 'beginner') return moves[Math.floor(Math.random() * moves.length)];

  const ranked = moves.map((move) => ({ move, score: scoreBotMove(move) })).sort((a, b) => b.score - a.score);
  if (state.botLevel === 'club') {
    const pool = ranked.slice(0, Math.min(4, ranked.length));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  return ranked[0].move;
}

function queueBotMoveIfNeeded() {
  clearTimeout(botTimer);
  if (state.mode !== 'bot' || state.turn !== 'black' || state.gameOver) return;

  state.botThinking = true;
  render();

  botTimer = setTimeout(() => {
    const botMove = chooseBotMove();
    if (!botMove) {
      state.history = [`${state.opponent} не нашел легальных ходов`, ...state.history].slice(0, 8);
      state.botThinking = false;
      state.gameOver = true;
      state.result = 'Пат. Ничья.';
      render();
      return;
    }

    applyMove(botMove.from, botMove.to, { bot: true });
    state.history[0] = `${state.opponent}: ${state.history[0]}`;
    state.botThinking = false;
    playSound(botMove.capture ? 'capture' : 'bot');
    render();
  }, 650);
}

function startBotGame() {
  clearTimeout(matchmakingTimer);
  clearTimeout(botTimer);
  resetBoardForNewGame();
  state.gameId += 1;
  state.mode = 'bot';
  lastStartMode = 'bot';
  state.onlineStatus = 'connected';
  state.botLevel = botLevelSelect.value;
  state.opponent = botProfiles[state.botLevel];
  state.history = [`Офлайн партия #${state.gameId} началась против ${state.opponent}`];
  playSound('start');
  updateGameEndState();
  startClock();
  render();
}

newOnlineGameButton.addEventListener('click', startOnlineGame);
newBotGameButton.addEventListener('click', startBotGame);
resignGameButton.addEventListener('click', () => {
  if (state.gameOver) return;
  state.gameOver = true;
  state.result = `${state.turn === 'white' ? 'Белые' : 'Черные'} сдались. Победили ${state.turn === 'white' ? 'черные' : 'белые'}.`;
  stopClock();
  render();
});

drawGameButton.addEventListener('click', () => {
  if (state.gameOver) return;
  state.gameOver = true;
  state.result = 'Ничья по соглашению.';
  stopClock();
  render();
});

rematchGameButton.addEventListener('click', () => {
  if (lastStartMode === 'online') startOnlineGame();
  else startBotGame();
});

copyPgnButton.addEventListener('click', () => copyText(historyToPgn(), 'PGN'));
copyFenButton.addEventListener('click', () => copyText(boardToFen(), 'FEN'));
loadFenButton.addEventListener('click', () => {
  try {
    loadFen(fenInputEl.value);
    reportStatusEl.textContent = 'FEN загружен';
    render();
  } catch (error) {
    reportStatusEl.textContent = error.message;
  }
});
botLevelSelect.addEventListener('change', () => { state.botLevel = botLevelSelect.value; });

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
