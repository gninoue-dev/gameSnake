'use strict';

// ─── CONFIGURATION ───────────────────────────────────────────
const GRID             = 20;    // nombre de cases par côté
const BASE_INTERVAL    = 140;   // ms par case au niveau 1
const MIN_INTERVAL     = 55;
const INTERVAL_STEP    = 9;     // accélération par niveau
const APPLES_PER_LEVEL = 5;
const COMBO_WINDOW     = 3500;  // ms pour enchaîner un combo
const MAX_COMBO        = 5;
const SLOW_DURATION    = 5000;
const SLOW_FACTOR      = 1.6;
const MAX_OBSTACLES    = 36;

const MODES = {
  classic:  { wrap: false, obstacles: true  },
  infinite: { wrap: true,  obstacles: false }
};

const FOODS = {
  apple: { points: 10, grow: 1, ttl: Infinity },
  gold:  { points: 50, grow: 2, ttl: 6000 },
  ice:   { points: 5,  grow: 0, ttl: 7000 }
};

const DIRS = {
  up:    { x:  0, y: -1 },
  down:  { x:  0, y:  1 },
  left:  { x: -1, y:  0 },
  right: { x:  1, y:  0 }
};

// ─── STOCKAGE LOCAL ──────────────────────────────────────────
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('snake.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('snake.' + key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  }
};

// ─── DOM ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const canvas     = $('gameCanvas');
const ctx        = canvas.getContext('2d');
const canvasWrap = $('canvasWrap');
const scoreEl    = $('score');
const levelEl    = $('level');
const bestEl     = $('best');
const comboEl    = $('combo');
const progressEl = $('levelProgress');
const slowEl     = $('slowEffect');
const btnSound   = $('btnSound');
const btnPause   = $('btnPause');
const screens    = { menu: $('screenMenu'), pause: $('screenPause'), over: $('screenOver') };

// ─── ÉTAT ────────────────────────────────────────────────────
let mode     = store.get('mode', 'classic');
if (!MODES[mode]) mode = 'classic';
const bests  = store.get('bests', { classic: 0, infinite: 0 });

let BOX = 20;           // taille d'une case en pixels CSS
let dpr = 1;

const game = {
  status: 'menu',       // menu | countdown | playing | paused | over
  snake: [], prev: [],
  dir: DIRS.right,
  queue: [],
  foods: [],
  obstacles: [],
  grow: 0,
  score: 0, level: 1, apples: 0,
  combo: 1, bestCombo: 1, lastEat: -Infinity,
  time: 0,              // horloge de jeu (ms), figée en pause
  acc: 0,
  countdown: 0,
  slowUntil: 0,
  shake: 0
};

let particles  = [];
let floatTexts = [];

// ─── CANVAS RESPONSIVE (net sur écrans HiDPI) ────────────────
function resizeCanvas() {
  const size = canvasWrap.clientWidth;
  dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  BOX = size / GRID;
}
window.addEventListener('resize', resizeCanvas);

// ─── AUDIO ───────────────────────────────────────────────────
let soundEnabled = store.get('sound', true);

const sndGameOver = new Audio('sounds/gameover.mp3');
const sndLevelUp  = new Audio('sounds/levelup.mp3');
const sndTracks   = ['sounds/snakesound1.mp3', 'sounds/snakesound2.mp3', 'sounds/snakesound3.mp3']
  .map(src => { const a = new Audio(src); a.loop = true; a.volume = 0.45; a.preload = 'auto'; return a; });
sndGameOver.volume = 0.8;
sndLevelUp.volume  = 0.8;
let currentTrack = 0;

// Piste qui change tous les 2 niveaux
const trackForLevel = lvl => Math.floor((lvl - 1) / 2) % sndTracks.length;

function stopMusic() {
  sndTracks.forEach(t => { t.pause(); t.currentTime = 0; });
}
function playMusic(restart = false) {
  if (!soundEnabled) return;
  const t = sndTracks[currentTrack];
  if (restart) t.currentTime = 0;
  t.volume = 0.45;
  t.play().catch(() => {});
}
function pauseMusic() {
  sndTracks.forEach(t => t.pause());
}
function switchTrack(index) {
  if (index === currentTrack) return;
  stopMusic();
  currentTrack = index;
  playMusic(true);
}

// Petits effets synthétisés (pas de fichier nécessaire)
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq, duration = 0.08, type = 'square', volume = 0.08, delay = 0) {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (!ac) return;
  const t0   = ac.currentTime + delay;
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
const sfx = {
  eat(combo)  { beep(520 + combo * 90, 0.07, 'square', 0.06); beep(780 + combo * 90, 0.06, 'square', 0.04, 0.05); },
  gold()      { [660, 880, 1100, 1320].forEach((f, i) => beep(f, 0.09, 'triangle', 0.08, i * 0.05)); },
  ice()       { [1400, 1100, 1700].forEach((f, i) => beep(f, 0.12, 'sine', 0.06, i * 0.06)); },
  turn()      { beep(220, 0.02, 'sine', 0.015); },
  countdown(last) { beep(last ? 880 : 440, 0.12, 'square', 0.06); }
};
function playSound(audio) {
  if (!soundEnabled) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
function duckMusic() {
  // Baisse la musique le temps du jingle de niveau
  const t = sndTracks[currentTrack];
  t.volume = 0.15;
  setTimeout(() => { t.volume = 0.45; }, 1600);
}

function setSound(on) {
  soundEnabled = on;
  store.set('sound', on);
  btnSound.textContent = on ? '🔊' : '🔇';
  btnSound.classList.toggle('muted', !on);
  if (!on) {
    pauseMusic();
    sndLevelUp.pause();
    sndGameOver.pause();
  } else if (game.status === 'playing' || game.status === 'countdown') {
    playMusic();
  }
}
btnSound.addEventListener('click', () => setSound(!soundEnabled));

// ─── OUTILS ──────────────────────────────────────────────────
const rand    = n => Math.floor(Math.random() * n);
const same    = (a, b) => a.x === b.x && a.y === b.y;
const keyOf   = p => p.y * GRID + p.x;
const lerp    = (a, b, t) => a + (b - a) * t;

function currentInterval() {
  const base = Math.max(MIN_INTERVAL, BASE_INTERVAL - (game.level - 1) * INTERVAL_STEP);
  return game.time < game.slowUntil ? base * SLOW_FACTOR : base;
}

function occupied() {
  const set = new Set();
  game.snake.forEach(s => set.add(keyOf(s)));
  game.obstacles.forEach(o => set.add(keyOf(o)));
  game.foods.forEach(f => set.add(keyOf(f)));
  return set;
}

function freeCell(extraBlocked = () => false) {
  const taken = occupied();
  const free = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (!taken.has(y * GRID + x) && !extraBlocked(x, y)) free.push({ x, y });
  return free.length ? free[rand(free.length)] : null;
}

// ─── NOURRITURE ──────────────────────────────────────────────
function spawnFood(type) {
  const head = game.snake[0];
  // Évite d'apparaître collé à la tête
  const cell = freeCell((x, y) => Math.abs(x - head.x) + Math.abs(y - head.y) < 2);
  if (!cell) return;
  game.foods.push({ ...cell, type, born: game.time });
}

function expireFoods() {
  game.foods = game.foods.filter(f => game.time - f.born < FOODS[f.type].ttl);
}

// ─── OBSTACLES (mode classique) ──────────────────────────────
const SHAPES = [
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]]
];

function addObstacles(count) {
  if (!MODES[mode].obstacles) return;
  const head = game.snake[0];
  const d    = game.dir;
  const danger = (x, y) => {
    // Zone de sécurité : autour de la tête et devant elle
    if (Math.abs(x - head.x) <= 2 && Math.abs(y - head.y) <= 2) return true;
    for (let i = 1; i <= 6; i++)
      if (x === head.x + d.x * i && y === head.y + d.y * i) return true;
    // Jamais collé aux bords pour ne pas créer de cul-de-sac
    return x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1;
  };
  let placed = 0, tries = 0;
  while (placed < count && game.obstacles.length < MAX_OBSTACLES && tries++ < 200) {
    const origin = freeCell(danger);
    if (!origin) return;
    const shape  = SHAPES[rand(SHAPES.length)];
    const cells  = shape.map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy }));
    const taken  = occupied();
    const ok = cells.every(c => c.x > 0 && c.y > 0 && c.x < GRID - 1 && c.y < GRID - 1
      && !taken.has(keyOf(c)) && !danger(c.x, c.y));
    if (!ok) continue;
    cells.forEach(c => game.obstacles.push({ ...c, born: game.time }));
    placed++;
  }
}

// ─── PARTICULES & TEXTES FLOTTANTS ───────────────────────────
function burst(cx, cy, count, colors, speed = 2.5) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (0.4 + Math.random()) * speed;
    particles.push({
      x: (cx + 0.5) * BOX, y: (cy + 0.5) * BOX,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
      size: 1.5 + Math.random() * 2.5,
      color: colors[rand(colors.length)]
    });
  }
}

function floatText(cx, cy, text, color) {
  floatTexts.push({ x: (cx + 0.5) * BOX, y: (cy + 0.5) * BOX, text, color, life: 1 });
}

function updateEffects(dt) {
  const k = dt / 16.67;
  for (const p of particles) {
    p.x += p.vx * k; p.y += p.vy * k;
    p.vx *= Math.pow(0.94, k); p.vy *= Math.pow(0.94, k);
    p.life -= p.decay * k;
  }
  particles = particles.filter(p => p.life > 0);
  for (const t of floatTexts) { t.y -= 0.6 * k; t.life -= 0.018 * k; }
  floatTexts = floatTexts.filter(t => t.life > 0);
  game.shake = Math.max(0, game.shake - 0.6 * k);
}

// ─── LOGIQUE ─────────────────────────────────────────────────
function newGame() {
  const mid = Math.floor(GRID / 2);
  game.snake = [{ x: mid - 1, y: mid }, { x: mid - 2, y: mid }, { x: mid - 3, y: mid }];
  game.prev  = game.snake.map(s => ({ ...s }));
  game.dir   = DIRS.right;
  game.queue = [];
  game.foods = [];
  game.obstacles = [];
  game.grow  = 0;
  game.score = 0; game.level = 1; game.apples = 0;
  game.combo = 1; game.bestCombo = 1; game.lastEat = -Infinity;
  game.time  = 0; game.acc = 0;
  game.slowUntil = 0;
  game.shake = 0;
  particles = []; floatTexts = [];
  spawnFood('apple');
  currentTrack = 0;
  updateHUD();
}

function queueDir(name) {
  const d = DIRS[name];
  if (!d) return;
  if (game.status === 'menu' || game.status === 'over') return;
  const last = game.queue.length ? game.queue[game.queue.length - 1] : game.dir;
  if (d === last || (d.x === -last.x && d.y === -last.y)) return; // pas de demi-tour
  if (game.queue.length < 3) {
    game.queue.push(d);
    if (game.status === 'playing') sfx.turn();
  }
}

function step() {
  game.prev = game.snake.map(s => ({ ...s }));
  if (game.queue.length) game.dir = game.queue.shift();

  const head = game.snake[0];
  let nx = head.x + game.dir.x;
  let ny = head.y + game.dir.y;

  if (MODES[mode].wrap) {
    nx = (nx + GRID) % GRID;
    ny = (ny + GRID) % GRID;
  } else if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
    return die();
  }

  const next = { x: nx, y: ny };
  // La queue libère sa case si on ne grandit pas ce tour-ci
  const body = game.grow > 0 ? game.snake : game.snake.slice(0, -1);
  if (body.some(s => same(s, next)) || game.obstacles.some(o => same(o, next))) return die();

  game.snake.unshift(next);
  if (game.grow > 0) game.grow--;
  else game.snake.pop();

  const fi = game.foods.findIndex(f => same(f, next));
  if (fi !== -1) eat(game.foods.splice(fi, 1)[0]);
}

function eat(food) {
  const def = FOODS[food.type];

  // Combo : manger vite fait monter le multiplicateur
  game.combo = game.time - game.lastEat <= COMBO_WINDOW ? Math.min(MAX_COMBO, game.combo + 1) : 1;
  game.lastEat   = game.time;
  game.bestCombo = Math.max(game.bestCombo, game.combo);

  const pts = def.points * game.combo;
  game.score += pts;
  game.grow  += def.grow;

  if (food.type === 'apple') {
    burst(food.x, food.y, 16, ['#ff4d8f', '#ff006e', '#ffffff']);
    floatText(food.x, food.y, '+' + pts, '#ff4d8f');
    sfx.eat(game.combo);
    game.apples++;
    spawnFood('apple');
    if (!game.foods.some(f => f.type === 'gold') && Math.random() < 0.18) spawnFood('gold');
    if (!game.foods.some(f => f.type === 'ice')  && Math.random() < 0.10) spawnFood('ice');
    if (game.apples % APPLES_PER_LEVEL === 0) levelUp();
  } else if (food.type === 'gold') {
    burst(food.x, food.y, 30, ['#ffd166', '#fff3b0', '#ffffff'], 3.5);
    floatText(food.x, food.y, '+' + pts, '#ffd166');
    sfx.gold();
  } else if (food.type === 'ice') {
    burst(food.x, food.y, 22, ['#8be9ff', '#ffffff', '#4cc9f0']);
    floatText(food.x, food.y, 'RALENTI', '#8be9ff');
    sfx.ice();
    game.slowUntil = game.time + SLOW_DURATION;
  }
  updateHUD(true);
}

function levelUp() {
  game.level++;
  const h = game.snake[0];
  floatText(h.x, h.y - 1, 'NIVEAU ' + game.level, '#00ff88');
  canvasWrap.classList.remove('level-up');
  void canvasWrap.offsetWidth;
  canvasWrap.classList.add('level-up');
  bump(levelEl);
  if (game.level >= 3) addObstacles(game.level === 3 ? 3 : 2);

  const track = trackForLevel(game.level);
  if (track !== currentTrack) switchTrack(track);
  duckMusic();
  playSound(sndLevelUp);
}

function die() {
  game.status = 'over';
  game.shake  = 14;
  game.snake.forEach((s, i) => {
    if (i % 2 === 0) burst(s.x, s.y, 5, ['#00ff88', '#00f5ff', '#ff006e', '#ffffff'], 3);
  });
  stopMusic();
  playSound(sndGameOver);
  if (navigator.vibrate) navigator.vibrate(120);

  const isRecord = game.score > (bests[mode] || 0);
  if (isRecord) {
    bests[mode] = game.score;
    store.set('bests', bests);
  }
  updateHUD();

  $('stScore').textContent  = game.score;
  $('stLevel').textContent  = game.level;
  $('stLength').textContent = game.snake.length;
  $('stTime').textContent   = formatTime(game.time);
  $('stCombo').textContent  = 'x' + game.bestCombo;
  $('stBest').textContent   = bests[mode];
  $('newRecord').classList.toggle('hidden', !isRecord || game.score === 0);
  setTimeout(() => { if (game.status === 'over') showScreen('over'); }, 750);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ─── FLUX DE JEU ─────────────────────────────────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
  if (name === 'menu') refreshMenu();
  const focusBtn = { menu: 'btnStart', pause: 'btnResume', over: 'btnRetry' }[name];
  if (focusBtn) $(focusBtn).focus({ preventScroll: true });
  else if (document.activeElement) document.activeElement.blur();
}

function startGame() {
  getAudioCtx(); // débloque l'audio sur mobile (geste utilisateur)
  newGame();
  showScreen(null);
  game.status = 'countdown';
  game.countdown = 1500;
  lastCountBeep = 4;
  playMusic(true);
}

function pauseGame() {
  if (game.status !== 'playing' && game.status !== 'countdown') return;
  game.status = 'paused';
  pauseMusic();
  showScreen('pause');
  btnPause.textContent = '▶';
}

function resumeGame() {
  if (game.status !== 'paused') return;
  showScreen(null);
  game.status = 'countdown';
  game.countdown = 1500;
  lastCountBeep = 4;
  btnPause.textContent = '⏸';
  playMusic();
}

function togglePause() {
  if (game.status === 'paused') resumeGame();
  else pauseGame();
}

function toMenu() {
  game.status = 'menu';
  stopMusic();
  btnPause.textContent = '⏸';
  newGame();
  showScreen('menu');
}

// ─── HUD ─────────────────────────────────────────────────────
function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

function updateHUD(animate = false) {
  scoreEl.textContent = game.score;
  levelEl.textContent = game.level;
  bestEl.textContent  = Math.max(bests[mode] || 0, game.score);
  if (animate) bump(scoreEl);
  progressEl.style.width = ((game.apples % APPLES_PER_LEVEL) / APPLES_PER_LEVEL * 100) + '%';
}

function updateLiveStatus() {
  const comboAlive = game.combo > 1 && game.time - game.lastEat <= COMBO_WINDOW;
  if (!comboAlive && game.combo > 1 && game.status === 'playing') game.combo = 1;
  comboEl.classList.toggle('active', comboAlive);
  comboEl.querySelector('b').textContent = 'x' + game.combo;
  slowEl.classList.toggle('hidden', !(game.time < game.slowUntil && game.status !== 'menu'));
}

function refreshMenu() {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('selected', b.dataset.mode === mode));
  document.querySelectorAll('[data-best]').forEach(el => { el.textContent = bests[el.dataset.best] || 0; });
  bestEl.textContent = bests[mode] || 0;
}

// ─── RENDU ───────────────────────────────────────────────────
function render(alpha) {
  const W = BOX * GRID;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, W);

  ctx.save();
  if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);

  drawBoard(W);
  drawObstacles();
  drawFoods();
  drawSnake(alpha);
  drawEffects();
  ctx.restore();

  if (game.status === 'countdown') drawCountdown(W);
}

function drawBoard(W) {
  // Damier discret
  ctx.fillStyle = '#060d15';
  ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = 'rgba(0,245,255,0.022)';
  for (let y = 0; y < GRID; y++)
    for (let x = (y % 2); x < GRID; x += 2)
      ctx.fillRect(x * BOX, y * BOX, BOX, BOX);

  // Bords : rouges en mode classique (mortels), pointillés en mode infini
  ctx.lineWidth = 2;
  if (MODES[mode].wrap) {
    ctx.setLineDash([BOX / 3, BOX / 3]);
    ctx.strokeStyle = 'rgba(0,245,255,0.25)';
  } else {
    ctx.strokeStyle = 'rgba(255,0,110,0.35)';
  }
  ctx.strokeRect(1, 1, W - 2, W - 2);
  ctx.setLineDash([]);

  // Teinte bleue pendant le ralenti
  if (game.time < game.slowUntil) {
    const left = (game.slowUntil - game.time) / SLOW_DURATION;
    ctx.fillStyle = `rgba(80,180,255,${0.07 * Math.min(1, left * 3)})`;
    ctx.fillRect(0, 0, W, W);
  }
}

function drawObstacles() {
  for (const o of game.obstacles) {
    const appear = Math.min(1, (game.time - o.born) / 400);
    const pad = BOX * (0.5 - 0.42 * appear);
    ctx.save();
    ctx.shadowColor = '#ff006e';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#3a0a24';
    roundRect(o.x * BOX + pad, o.y * BOX + pad, BOX - pad * 2, BOX - pad * 2, 3);
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = '#ff006e';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

function drawFoods() {
  const now = performance.now();
  for (const f of game.foods) {
    const cx = (f.x + 0.5) * BOX, cy = (f.y + 0.5) * BOX;
    const def = FOODS[f.type];
    const left = def.ttl - (game.time - f.born);
    // Clignote avant de disparaître
    if (left < 1500 && Math.floor(now / 120) % 2 === 0) continue;
    const pulse = 0.8 + 0.2 * Math.sin(now / 200);

    ctx.save();
    if (f.type === 'apple') {
      ctx.shadowColor = '#ff006e';
      ctx.shadowBlur  = 15 * pulse;
      ctx.fillStyle   = '#ff4d8f';
      ctx.beginPath();
      ctx.arc(cx, cy, (BOX / 2 - 2) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(cx - BOX * 0.12, cy - BOX * 0.12, BOX * 0.09, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.type === 'gold') {
      ctx.translate(cx, cy);
      ctx.rotate(now / 600);
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur  = 18;
      ctx.fillStyle   = '#ffd166';
      star(0, 0, 5, BOX * 0.5 * pulse, BOX * 0.22 * pulse);
      ctx.fill();
    } else if (f.type === 'ice') {
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4 + Math.sin(now / 300) * 0.2);
      ctx.shadowColor = '#8be9ff';
      ctx.shadowBlur  = 16;
      ctx.fillStyle   = '#8be9ff';
      const s = BOX * 0.36 * pulse;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(-s * 0.6, -s * 0.6, s * 0.5, s * 0.5);
    }
    ctx.restore();

    // Anneau de durée de vie pour les bonus
    if (def.ttl !== Infinity) {
      ctx.strokeStyle = f.type === 'gold' ? 'rgba(255,209,102,0.6)' : 'rgba(139,233,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, BOX * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left / def.ttl));
      ctx.stroke();
    }
  }
}

function segmentPositions(alpha) {
  // Interpolation entre l'ancienne et la nouvelle position : mouvement fluide
  return game.snake.map((s, i) => {
    const p = game.prev[i] || s;
    if (Math.abs(p.x - s.x) > 1 || Math.abs(p.y - s.y) > 1) return { x: s.x, y: s.y }; // passage de bord
    return { x: lerp(p.x, s.x, alpha), y: lerp(p.y, s.y, alpha) };
  });
}

function drawSnake(alpha) {
  if (!game.snake.length) return;
  const pos  = segmentPositions(alpha);
  const n    = pos.length;
  const slow = game.time < game.slowUntil;
  const dead = game.status === 'over';
  const colorAt = i => {
    const t = 1 - i / Math.max(1, n);
    if (dead) return `rgba(255,${Math.round(40 + 60 * t)},${Math.round(110 + 40 * t)},${0.35 + t * 0.5})`;
    if (slow) return `rgba(${Math.round(80 + 60 * t)},${Math.round(180 + 60 * t)},255,${0.45 + t * 0.55})`;
    return `rgba(0,${Math.round(180 + t * 75)},${Math.round(100 + t * 155)},${0.45 + t * 0.55})`;
  };

  // Corps : segments reliés pour un serpent continu
  ctx.lineCap = 'round';
  ctx.lineWidth = BOX * 0.72;
  for (let i = n - 1; i > 0; i--) {
    const a = pos[i], b = pos[i - 1];
    ctx.strokeStyle = colorAt(i);
    ctx.beginPath();
    ctx.moveTo((a.x + 0.5) * BOX, (a.y + 0.5) * BOX);
    if (Math.abs(a.x - b.x) <= 1.01 && Math.abs(a.y - b.y) <= 1.01) ctx.lineTo((b.x + 0.5) * BOX, (b.y + 0.5) * BOX);
    ctx.stroke();
  }

  // Tête
  const h  = pos[0];
  const hx = (h.x + 0.5) * BOX, hy = (h.y + 0.5) * BOX;
  ctx.save();
  ctx.shadowColor = dead ? '#ff006e' : slow ? '#8be9ff' : '#00ff88';
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = dead ? '#ff4d8f' : slow ? '#a8f0ff' : '#00ff88';
  ctx.beginPath();
  ctx.arc(hx, hy, BOX * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Yeux orientés selon la direction
  const d  = game.dir;
  const px = -d.y, py = d.x; // perpendiculaire
  const eo = BOX * 0.2, ef = BOX * 0.12;
  for (const side of [-1, 1]) {
    const ex = hx + d.x * ef + px * eo * side;
    const ey = hy + d.y * ef + py * eo * side;
    ctx.fillStyle = '#04121c';
    ctx.beginPath(); ctx.arc(ex, ey, BOX * 0.11, 0, Math.PI * 2); ctx.fill();
    if (!dead) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + d.x * BOX * 0.03, ey + d.y * BOX * 0.03, BOX * 0.045, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Langue qui sort de temps en temps
  if (!dead && game.status === 'playing' && Math.floor(performance.now() / 400) % 5 === 0) {
    ctx.strokeStyle = '#ff006e';
    ctx.lineWidth = Math.max(1, BOX * 0.07);
    ctx.lineCap = 'round';
    const tx = hx + d.x * BOX * 0.45, ty = hy + d.y * BOX * 0.45;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + d.x * BOX * 0.25, ty + d.y * BOX * 0.25);
    ctx.stroke();
  }
}

function drawEffects() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of floatTexts) {
    ctx.globalAlpha = Math.max(0, t.life);
    ctx.font = `700 ${Math.round(BOX * 0.7)}px Orbitron, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 8;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

let lastCountBeep = 4;
function drawCountdown(W) {
  const n = Math.ceil(game.countdown / 500);
  if (n !== lastCountBeep) { lastCountBeep = n; sfx.countdown(false); }
  const frac = (game.countdown % 500) / 500;
  ctx.save();
  ctx.fillStyle = 'rgba(2,5,8,0.35)';
  ctx.fillRect(0, 0, W, W);
  ctx.globalAlpha = 0.3 + 0.7 * frac;
  ctx.font = `900 ${Math.round(W * (0.18 + 0.06 * frac))}px Orbitron, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00f5ff';
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 30;
  ctx.fillText(String(n), W / 2, W / 2);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(cx, cy, spikes, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

// ─── BOUCLE PRINCIPALE ───────────────────────────────────────
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(100, now - lastFrame);
  lastFrame = now;

  if (game.status === 'countdown') {
    game.countdown -= dt;
    if (game.countdown <= 0) {
      game.status = 'playing';
      game.acc = 0;
      sfx.countdown(true);
    }
  } else if (game.status === 'playing') {
    game.time += dt;
    game.acc  += dt;
    let iv = currentInterval();
    while (game.acc >= iv && game.status === 'playing') {
      game.acc -= iv;
      step();
      iv = currentInterval();
    }
    expireFoods();
  }

  updateEffects(dt);
  updateLiveStatus();
  const alpha = game.status === 'playing' ? Math.min(1, game.acc / currentInterval()) : 1;
  render(alpha);
  requestAnimationFrame(frame);
}

// ─── CONTRÔLES CLAVIER ───────────────────────────────────────
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  z: 'up', s: 'down', q: 'left', d: 'right',
  w: 'up', a: 'left'
};

document.addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (KEYMAP[k] && (game.status === 'playing' || game.status === 'countdown')) {
    e.preventDefault();
    queueDir(KEYMAP[k]);
    return;
  }
  if (k === ' ' || k === 'Enter') {
    // Laisse les boutons focalisés gérer Entrée/Espace eux-mêmes
    if (document.activeElement && document.activeElement.tagName === 'BUTTON' && game.status !== 'playing') return;
    e.preventDefault();
    if (game.status === 'menu' || game.status === 'over') startGame();
    else togglePause();
    return;
  }
  if (k === 'p' || k === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (k === 'm') setSound(!soundEnabled);
});

// ─── CONTRÔLES TACTILES ──────────────────────────────────────
document.querySelectorAll('.dpad-btn[data-dir]').forEach(btn => {
  const press = e => {
    e.preventDefault();
    if (game.status === 'menu' || game.status === 'over') { startGame(); return; }
    queueDir(btn.dataset.dir);
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);
  };
  btn.addEventListener('touchstart', press, { passive: false });
  btn.addEventListener('mousedown', press);
});
$('dCenter').addEventListener('click', () => {
  if (game.status === 'menu' || game.status === 'over') startGame();
  else togglePause();
});

// Swipe : réagit pendant le glissement (plus réactif qu'au relâchement)
let swipe = null;
canvasWrap.addEventListener('touchstart', e => {
  if (game.status !== 'playing' && game.status !== 'countdown') return;
  const t = e.touches[0];
  swipe = { x: t.clientX, y: t.clientY };
  e.preventDefault();
}, { passive: false });
canvasWrap.addEventListener('touchmove', e => {
  if (!swipe) return;
  const t  = e.touches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  queueDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  swipe = { x: t.clientX, y: t.clientY }; // permet plusieurs virages dans un même geste
  e.preventDefault();
}, { passive: false });
canvasWrap.addEventListener('touchend', () => { swipe = null; });

// ─── BOUTONS DES ÉCRANS ──────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
  mode = btn.dataset.mode;
  store.set('mode', mode);
  refreshMenu();
}));
$('btnStart').addEventListener('click', startGame);
$('btnRetry').addEventListener('click', startGame);
$('btnResume').addEventListener('click', resumeGame);
$('btnQuit').addEventListener('click', toMenu);
$('btnMenu').addEventListener('click', toMenu);
btnPause.addEventListener('click', togglePause);

// Pause automatique quand l'onglet est masqué
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);

// ─── DÉMARRAGE ───────────────────────────────────────────────
resizeCanvas();
setSound(soundEnabled);
newGame();
showScreen('menu');
requestAnimationFrame(frame);
