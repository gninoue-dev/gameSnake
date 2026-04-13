const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const pCanvas = document.getElementById("particleCanvas");
const pCtx = pCanvas.getContext("2d");
 
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySub = document.getElementById("overlaySub");
const overlayScore = document.getElementById("overlayScore");
const btnStart = document.getElementById("btnStart");
const canvasWrap = document.querySelector(".canvas-wrap");
 
const BOX = 20;
const COLS = canvas.width / BOX;
const ROWS = canvas.height / BOX;
 
let snake, dir, nextDir, food, score, level, speed, gameLoop, best = 0;
let isRunning = false;
let particles = [];
let prevSnakePos = [];
 
// ─── AUDIO ───────────────────────────────────────────────────
let soundEnabled = true;
const btnSound = document.getElementById("btnSound");
 
// Charger les sons depuis le dossier sounds/
const sndGameOver = new Audio('sounds/gameover.mp3');
const sndLevelUp  = new Audio('sounds/levelup.mp3');
const sndTracks   = [
  new Audio('sounds/snakesound1.mp3'),//snk opening 30 seconde
  new Audio('sounds/snakesound2.mp3'),//Bleach ost espada 30 seconde
  new Audio('sounds/snakesound3.mp3') //Opening mashle bling bang bang creepy nuts 30 seconde
];
 
// Musique de fond : on enchaîne les 3 pistes en boucle
let currentTrack = 0;
sndTracks.forEach((track, i) => {
  track.volume = 0.5;
  track.addEventListener('ended', () => {
    if (!soundEnabled || !isRunning) return;
    currentTrack = (i + 1) % sndTracks.length;
    sndTracks[currentTrack].currentTime = 0;
    sndTracks[currentTrack].play().catch(() => {});
  });
});
 
sndGameOver.volume = 0.8;
sndLevelUp.volume  = 0.8;
 
function stopAllTracks() {
  sndTracks.forEach(t => { t.pause(); t.currentTime = 0; });
}
 
function startMusic() {
  if (!soundEnabled) return;
  stopAllTracks();
  currentTrack = 0;
  const p = sndTracks[0].play();
  if (p) p.catch(e => console.warn('Audio bloqué:', e));
}
 
function soundEat() {
  // Pas de son séparé pour manger — la musique de fond suffit
}
 
function soundLevelUp() {
  if (!soundEnabled) return;
  stopAllTracks();
  sndLevelUp.currentTime = 0;
  sndLevelUp.play().catch(() => {});
  // Reprendre la musique après le son levelup
  sndLevelUp.onended = () => {
    if (isRunning && soundEnabled) startMusic();
  };
}
 
function soundMove() { /* géré par la musique de fond */ }
 
function soundDeath() {
  if (!soundEnabled) return;
  stopAllTracks();
  sndGameOver.currentTime = 0;
  sndGameOver.play().catch(() => {});
}
 
btnSound.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  btnSound.textContent = soundEnabled ? '🔊' : '🔇';
  btnSound.classList.toggle('muted', !soundEnabled);
  if (!soundEnabled) {
    stopAllTracks();
    sndLevelUp.pause();
    sndGameOver.pause();
  } else if (isRunning) {
    startMusic();
  }
});
 
// ─── PARTICLES ───────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 2.5;
    this.vy = (Math.random() - 0.5) * 2.5;
    this.life = 1;
    this.decay = 0.03 + Math.random() * 0.04;
    this.size = 1.5 + Math.random() * 2.5;
    const colors = ['#00f5ff', '#00ff88', '#ffffff', '#7affda'];
    this.color = colors[Math.floor(Math.random() * colors.length)];
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy *= 0.95;
    this.life -= this.decay;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
 
function spawnParticles(x, y, count = 5) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x + BOX / 2, y + BOX / 2));
  }
}
 
function updateParticles() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.update();
    p.draw(pCtx);
  }
}
 
// ─── FOOD ────────────────────────────────────────────────────
function randomFood() {
  let f;
  do {
    f = {
      x: Math.floor(Math.random() * COLS) * BOX,
      y: Math.floor(Math.random() * ROWS) * BOX
    };
  } while (snake.some(s => s.x === f.x && s.y === f.y));
  return f;
}
 
// ─── DRAW GAME ───────────────────────────────────────────────
function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
 
  // Draw subtle grid
  ctx.strokeStyle = 'rgba(0,245,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= canvas.width; x += BOX) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += BOX) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
 
  // Draw food
  const fx = food.x + BOX / 2;
  const fy = food.y + BOX / 2;
  const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200);
  ctx.save();
  ctx.shadowColor = '#ff006e';
  ctx.shadowBlur = 15 * pulse;
  ctx.fillStyle = '#ff4d8f';
  ctx.beginPath();
  ctx.arc(fx, fy, (BOX / 2 - 2) * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
 
  // Draw snake
  for (let i = snake.length - 1; i >= 0; i--) {
    const s = snake[i];
    const t = 1 - i / snake.length;
    const r = Math.round(0 + t * 0);
    const g = Math.round(180 + t * 75);
    const b = Math.round(100 + t * 155);
 
    ctx.save();
    if (i === 0) {
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#00ff88';
    } else {
      ctx.shadowColor = `rgba(0,${g},${b},0.4)`;
      ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(0,${g},${b},${0.4 + t * 0.6})`;
    }
    const pad = i === 0 ? 1 : 2;
    const radius = i === 0 ? 5 : 3;
    roundRect(ctx, s.x + pad, s.y + pad, BOX - pad * 2, BOX - pad * 2, radius);
    ctx.fill();
    ctx.restore();
  }
}
 
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
 
// ─── STEP ────────────────────────────────────────────────────
function step() {
  dir = nextDir;
 
  const head = {
    x: snake[0].x + dir.x * BOX,
    y: snake[0].y + dir.y * BOX
  };
 
  // Collision walls
  if (head.x < 0 || head.y < 0 || head.x >= canvas.width || head.y >= canvas.height) {
    endGame(); return;
  }
  // Collision self
  for (let i = 0; i < snake.length; i++) {
    if (head.x === snake[i].x && head.y === snake[i].y) {
      endGame(); return;
    }
  }
 
  snake.unshift(head);
  soundMove();
 
  // Spawn particles along snake trail
  for (let i = 0; i < snake.length; i++) {
    if (Math.random() < 0.12) {
      spawnParticles(snake[i].x, snake[i].y, 1);
    }
  }
 
  // Eat food
  if (head.x === food.x && head.y === food.y) {
    score++;
    updateHUD();
    spawnParticles(food.x, food.y, 18);
    soundEat();
 
    if (score % 5 === 0) {
      level++;
      updateHUD(true);
      soundLevelUp();
      clearInterval(gameLoop);
      speed = Math.max(50, speed - 12);
      gameLoop = setInterval(tick, speed);
      canvasWrap.classList.remove('level-up');
      void canvasWrap.offsetWidth;
      canvasWrap.classList.add('level-up');
    }
 
    food = randomFood();
  } else {
    snake.pop();
  }
 
  drawGame();
  updateParticles();
}
 
function tick() {
  // Animate food pulse even without movement
  drawGame();
  updateParticles();
  step();
}
 
// ─── HUD ─────────────────────────────────────────────────────
function updateHUD(levelUp = false) {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  if (score > best) { best = score; bestEl.textContent = best; }
 
  // Bump animation
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 400);
 
  if (levelUp) {
    levelEl.classList.remove('bump');
    void levelEl.offsetWidth;
    levelEl.classList.add('bump');
    setTimeout(() => levelEl.classList.remove('bump'), 400);
  }
}
 
// ─── INIT ────────────────────────────────────────────────────
function initGame() {
  snake = [
    { x: 9 * BOX, y: 10 * BOX },
    { x: 8 * BOX, y: 10 * BOX },
    { x: 7 * BOX, y: 10 * BOX }
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  food = randomFood();
  score = 0;
  level = 1;
  speed = 120;
  particles = [];
  scoreEl.textContent = 0;
  levelEl.textContent = 1;
}
 
function startGame() {
  initGame();
  isRunning = true;
  overlay.classList.add('hidden');
  clearInterval(gameLoop);
  gameLoop = setInterval(tick, speed);
  startMusic();
}
 
function endGame() {
  clearInterval(gameLoop);
  isRunning = false;
  soundDeath();
 
  // Explosion on death
  for (const s of snake) {
    spawnParticles(s.x, s.y, 6);
  }
 
  overlayTitle.textContent = 'GAME OVER';
  overlaySub.textContent = 'Appuie sur Espace pour recommencer';
  overlayScore.textContent = 'SCORE : ' + score;
  overlayScore.classList.remove('hidden');
  overlay.classList.remove('hidden');
}
 
// ─── CONTROLS ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!isRunning && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    startGame();
    return;
  }
  if (!isRunning) return;
  if (e.key === 'ArrowLeft'  && dir.x !== 1)  nextDir = { x: -1, y: 0 };
  if (e.key === 'ArrowRight' && dir.x !== -1) nextDir = { x: 1,  y: 0 };
  if (e.key === 'ArrowUp'    && dir.y !== 1)  nextDir = { x: 0,  y: -1 };
  if (e.key === 'ArrowDown'  && dir.y !== -1) nextDir = { x: 0,  y: 1 };
  e.preventDefault();
});
 
// ─── D-PAD MOBILE ────────────────────────────────────────────
function dpadPress(dx, dy) {
  if (!isRunning) { startGame(); return; }
  if (dx === -1 && dir.x !== 1)  nextDir = { x: -1, y: 0 };
  if (dx ===  1 && dir.x !== -1) nextDir = { x: 1,  y: 0 };
  if (dy === -1 && dir.y !== 1)  nextDir = { x: 0,  y: -1 };
  if (dy ===  1 && dir.y !== -1) nextDir = { x: 0,  y: 1 };
}
 
document.getElementById('dUp').addEventListener('touchstart',    e => { e.preventDefault(); dpadPress(0, -1); }, { passive: false });
document.getElementById('dDown').addEventListener('touchstart',  e => { e.preventDefault(); dpadPress(0,  1); }, { passive: false });
document.getElementById('dLeft').addEventListener('touchstart',  e => { e.preventDefault(); dpadPress(-1, 0); }, { passive: false });
document.getElementById('dRight').addEventListener('touchstart', e => { e.preventDefault(); dpadPress( 1, 0); }, { passive: false });
document.getElementById('dCenter').addEventListener('touchstart',e => { e.preventDefault(); startGame(); },     { passive: false });
 
// Fallback click pour desktop
document.getElementById('dUp').addEventListener('click',    () => dpadPress(0, -1));
document.getElementById('dDown').addEventListener('click',  () => dpadPress(0,  1));
document.getElementById('dLeft').addEventListener('click',  () => dpadPress(-1, 0));
document.getElementById('dRight').addEventListener('click', () => dpadPress( 1, 0));
document.getElementById('dCenter').addEventListener('click',() => startGame());
 
// ─── SWIPE MOBILE ────────────────────────────────────────────
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  e.preventDefault();
}, { passive: false });
 
canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (!isRunning) { startGame(); return; }
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 20)       dpadPress(1, 0);
    else if (dx < -20) dpadPress(-1, 0);
  } else {
    if (dy > 20)       dpadPress(0, 1);
    else if (dy < -20) dpadPress(0, -1);
  }
  e.preventDefault();
}, { passive: false });
 
btnStart.addEventListener('click', startGame);
 
// Initial draw
drawGame();