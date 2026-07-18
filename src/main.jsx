import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

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
const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isWhite = (piece) => piece && piece === piece.toUpperCase();
const colorOf = (piece) => piece ? (isWhite(piece) ? 'white' : 'black') : null;
const cloneBoard = (board) => board.map((row) => [...row]);
const squareName = (r, c) => `${files[c]}${8 - r}`;

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
    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] && colorOf(board[nr][nc]) !== color) moves.push([nr, nc]);
    }
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
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
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

function CoachPanel({ history, board }) {
  const score = evaluate(board);
  const last = history.at(-1);
  const advice = score > 2 ? 'У белых перевес: упрощайте позицию и ищите размен ферзей.'
    : score < -2 ? 'Черные впереди: белым стоит создавать тактические угрозы, а не пассивно защищаться.'
    : 'Позиция примерно равная: улучшайте худшую фигуру и контролируйте центр.';

  return <section className="card coach">
    <div className="section-eyebrow">AI Coach</div>
    <h2>Персональный тренер после партии</h2>
    <p>{advice}</p>
    <ul>
      <li>Материальная оценка: <strong>{score > 0 ? '+' : ''}{score}</strong></li>
      <li>Последний ход: <strong>{last ?? 'пока нет'}</strong></li>
      <li>Тренировка: решите 3 позиции на висячие фигуры и матовые угрозы.</li>
    </ul>
  </section>;
}

function ChessBoard({ board, turn, selected, legalMoves, onSquareClick }) {
  return <div className="board" aria-label="Шахматная доска">
    {board.map((row, r) => row.map((piece, c) => {
      const selectedSquare = selected?.[0] === r && selected?.[1] === c;
      const legal = legalMoves.some(([mr, mc]) => mr === r && mc === c);
      return <button
        key={`${r}-${c}`}
        className={`square ${(r + c) % 2 ? 'dark' : 'light'} ${selectedSquare ? 'selected' : ''} ${legal ? 'legal' : ''}`}
        onClick={() => onSquareClick(r, c)}
        aria-label={`${squareName(r,c)} ${piece ? pieces[piece] : 'empty'}`}
      >
        <span>{piece ? pieces[piece] : ''}</span>
        {legal && <i />}
      </button>;
    }))}
    <div className="turn-badge">Ход: {turn === 'white' ? 'белые' : 'черные'}</div>
  </div>;
}

function App() {
  const [board, setBoard] = useState(initialBoard);
  const [turn, setTurn] = useState('white');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [reportStatus, setReportStatus] = useState('Нет активных жалоб');
  const legalMoves = useMemo(() => selected ? generateMoves(board, selected[0], selected[1]) : [], [board, selected]);

  const onSquareClick = (r, c) => {
    const piece = board[r][c];
    const isLegalTarget = legalMoves.some(([mr, mc]) => mr === r && mc === c);
    if (selected && isLegalTarget) {
      const movingPiece = board[selected[0]][selected[1]];
      setBoard(makeMove(board, selected, [r, c]));
      setHistory((items) => [`${pieces[movingPiece]} ${squareName(selected[0], selected[1])} → ${squareName(r, c)}`, ...items].slice(0, 8));
      setTurn(turn === 'white' ? 'black' : 'white');
      setSelected(null);
      return;
    }
    if (piece && colorOf(piece) === turn) setSelected([r, c]);
    else setSelected(null);
  };

  const reset = () => {
    setBoard(initialBoard);
    setTurn('white');
    setSelected(null);
    setHistory([]);
    setReportStatus('Нет активных жалоб');
  };

  return <main>
    <section className="hero">
      <div>
        <p className="eyebrow">Chess Prime MVP</p>
        <h1>Онлайн-шахматы с честной игрой, обучением и клубами</h1>
        <p className="lead">Первый рабочий прототип превращает стратегию в продукт: доска с легальными ходами, история партии, тренерские подсказки, fair play workflow и план развития комьюнити.</p>
        <div className="hero-actions">
          <button onClick={reset}>Новая партия</button>
          <a href="#roadmap">Открыть стратегию</a>
        </div>
      </div>
      <div className="stats">
        <span><strong>&lt;5 сек</strong> цель матчмейкинга</span>
        <span><strong>92%+</strong> completion rate</span>
        <span><strong>Fair play</strong> статусы жалоб</span>
      </div>
    </section>

    <section className="game-layout">
      <ChessBoard board={board} turn={turn} selected={selected} legalMoves={legalMoves} onSquareClick={onSquareClick} />
      <aside className="side-panel">
        <section className="card">
          <div className="section-eyebrow">Live Game</div>
          <h2>История ходов</h2>
          <ol className="moves">{history.length ? history.map((move, index) => <li key={`${move}-${index}`}>{move}</li>) : <li>Сделайте первый ход</li>}</ol>
        </section>
        <CoachPanel history={history} board={board} />
      </aside>
    </section>

    <section id="roadmap" className="roadmap card">
      <div className="section-eyebrow">Roadmap</div>
      <h2>План реализации из стратегии</h2>
      <ol>
        <li><strong>Игровое ядро:</strong> real-time партии, часы, рейтинг, история и PGN.</li>
        <li><strong>Доверие:</strong> жалобы, античит-телеметрия, reconnect и компенсация рейтинга.</li>
        <li><strong>Обучение:</strong> Stockfish review, персональные пазлы и дебютный explorer.</li>
        <li><strong>Комьюнити:</strong> клубы, арены, командные матчи и совместный анализ.</li>
      </ol>
    </section>

    <section className="feature-grid">
      <article className="card">
        <div className="section-eyebrow">Fair Play</div>
        <h2>Прозрачная жалоба</h2>
        <p>Показываем статус обращения без раскрытия античит-сигналов.</p>
        <button className="secondary" onClick={() => setReportStatus('Жалоба получена → проверяется модерацией')}>Пожаловаться на партию</button>
        <p className="status">{reportStatus}</p>
      </article>
      <article className="card">
        <div className="section-eyebrow">Matchmaking</div>
        <h2>Умная очередь</h2>
        <p>Будущая очередь учитывает рейтинг, стабильность сети, уровень доверия и режим verified ranked.</p>
      </article>
      <article className="card">
        <div className="section-eyebrow">Community</div>
        <h2>Клубы и лиги</h2>
        <p>Сезоны, дивизионы, командные матчи, совместный разбор и инструменты капитана.</p>
      </article>
      <article className="card">
        <div className="section-eyebrow">Beginner UX</div>
        <h2>Мягкий старт</h2>
        <p>Подсказки без рейтинга, анти-tilt режим, безопасный чат и детский профиль.</p>
      </article>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
