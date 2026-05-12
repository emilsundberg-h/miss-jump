// Miss Jump — Forest Tour
// Complete game engine, adapted from the design prototype

export type GameStateKind = 'start' | 'play' | 'lose' | 'win' | 'stage';

export interface GameCallbacks {
  onStateChange: (state: GameStateKind, data?: { score?: number; tries?: number }) => void;
  onProgress: (pct: number) => void;
  onScore: (n: number) => void;
}

export interface GameControls {
  pressJump: () => void;
  releaseJump: () => void;
  destroy: () => void;
}

const TAU = Math.PI * 2;

// ===== Color palette — golden hour =====
const PAL = {
  skyTop: '#7fb3c4', skyMid: '#f7c87a', skyBot: '#f49b6e',
  sun: '#ffefb0', sunGlow: 'rgba(255,196,120,0.55)',
  mountainFar: '#7c9ba8', mountainMid: '#5a6a78', mountainNear: '#3a4250',
  treeFar: '#4a6058', treeMid: '#2d3a36', treeNear: '#162018',
  waterTop: '#c8e4ee', waterBot: '#5a8aa8',
  mist: 'rgba(255,220,180,0.4)',
  moss: '#4f7e2e', mossLight: '#85b84a',
  stone: '#605040', stoneLight: '#8a6f54', stoneDark: '#3a2c20',
  grass: '#a0c862',
  spike: '#1f160e', spikeHighlight: '#9a5a30',
  ambient: 'rgba(255,200,130,0.1)',
};

// ===== Physics =====
const GRAVITY        = 2000;
const JUMP_VEL       = -760;
const JUMP_HOLD_BOOST = -1400;
const MAX_HOLD       = 0.18;
const MOVE_SPEED     = 320;
const PLAYER_W       = 38;
const PLAYER_H       = 64;
const SPIKE_W        = 28;
const SPIKE_H        = 36;

// ===== Level =====
interface PlatformDef {
  x: number; w: number; y: number;
  spikes?: { ox: number; n: number }[];
  isStage?: boolean;
}

const PLATFORMS: PlatformDef[] = [
  { x: 0,    w: 900,  y: 0 },
  { x: 1080, w: 320,  y: 0 },
  { x: 1540, w: 260,  y: 70,  spikes: [{ ox: 80,  n: 2 }] },
  { x: 1900, w: 380,  y: 0,   spikes: [{ ox: 180, n: 3 }] },
  { x: 2400, w: 240,  y: 100 },
  { x: 2740, w: 200,  y: 180 },
  { x: 3060, w: 360,  y: 60,  spikes: [{ ox: 160, n: 2 }] },
  { x: 3540, w: 220,  y: 0 },
  { x: 3860, w: 180,  y: 130 },
  { x: 4140, w: 180,  y: 220 },
  { x: 4420, w: 460,  y: 90,  spikes: [{ ox: 100, n: 2 }, { ox: 280, n: 2 }] },
  { x: 5000, w: 260,  y: 30 },
  { x: 5360, w: 240,  y: 130 },
  { x: 5700, w: 320,  y: 0,   spikes: [{ ox: 140, n: 4 }] },
  { x: 6120, w: 200,  y: 100 },
  { x: 6420, w: 200,  y: 200 },
  { x: 6720, w: 240,  y: 90 },
  { x: 7060, w: 420,  y: 0 },
  { x: 7600, w: 1400, y: 0,   isStage: true },
];

const STAGE_START = 7600;
const FINISH_X    = 8000;
const LEVEL_END   = 9000;

// Precompute spike world positions
interface SpikePos { x: number; y: number }
const SPIKE_DEFS: SpikePos[] = [];
for (const p of PLATFORMS) {
  if (!p.spikes) continue;
  for (const s of p.spikes) {
    for (let i = 0; i < s.n; i++) {
      SPIKE_DEFS.push({ x: p.x + s.ox + i * SPIKE_W, y: p.y });
    }
  }
}

// Coin templates (re-instantiated each game start)
interface CoinDef { x: number; y: number; t: number }
const COIN_DEFS: CoinDef[] = [];
(function placeCoinDefs() {
  for (const p of PLATFORMS) {
    if (p.isStage) continue;
    const count = Math.max(1, Math.floor(p.w / 140));
    for (let i = 0; i < count; i++) {
      const cx = p.x + 40 + (p.w - 80) * (i + 0.5) / count;
      const cy = p.y + 110 + (i % 2) * 30;
      let blocked = false;
      if (p.spikes) {
        for (const s of p.spikes) {
          for (let k = 0; k < s.n; k++) {
            if (Math.abs(cx - (p.x + s.ox + k * SPIKE_W + SPIKE_W / 2)) < 30) blocked = true;
          }
        }
      }
      if (!blocked) COIN_DEFS.push({ x: cx, y: cy, t: Math.random() * TAU });
    }
  }
})();

// ===== Scenery (generated once, deterministic) =====
interface TreeDef     { x: number; h: number; w: number; sway?: number }
interface MountainDef { x: number; h: number; w: number }
interface WaterfallDef { x: number; w: number; h: number }
interface GrassDef    { x: number; w: number }
interface CloudDef    { x: number; y: number; w: number; o: number }

interface Scenery {
  farTrees: TreeDef[]; midTrees: TreeDef[]; mountains: MountainDef[];
  clouds: CloudDef[]; waterfalls: WaterfallDef[]; grass: GrassDef[];
}

function seededRand(seed: number) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) / 4294967296); };
}

function buildScenery(): Scenery {
  const r = seededRand(42);
  const farTrees: TreeDef[] = [];
  for (let i = 0; i < 80; i++) farTrees.push({ x: r() * LEVEL_END * 1.2, h: 50 + r() * 60, w: 40 + r() * 30 });
  const midTrees: TreeDef[] = [];
  for (let i = 0; i < 50; i++) midTrees.push({ x: r() * LEVEL_END * 1.1, h: 90 + r() * 70, w: 60 + r() * 35, sway: r() * TAU });
  const mountains: MountainDef[] = [];
  for (let i = 0; i < 18; i++) mountains.push({ x: r() * LEVEL_END * 1.3, h: 180 + r() * 160, w: 500 + r() * 350 });
  const clouds: CloudDef[] = [];
  for (let i = 0; i < 12; i++) clouds.push({ x: r() * LEVEL_END, y: 40 + r() * 160, w: 120 + r() * 200, o: 0.4 + r() * 0.4 });
  const waterfalls: WaterfallDef[] = [
    { x: 1700, w: 70,  h: 200 },
    { x: 4200, w: 90,  h: 240 },
    { x: 6500, w: 80,  h: 220 },
    { x: 8200, w: 140, h: 300 },
  ];
  const grass: GrassDef[] = [];
  for (let i = 0; i < 40; i++) grass.push({ x: r() * LEVEL_END, w: 30 + r() * 30 });
  return { farTrees, midTrees, mountains, clouds, waterfalls, grass };
}

const SCENERY = buildScenery();

// ===== Main factory =====
export function createGame(canvas: HTMLCanvasElement, cb: GameCallbacks): GameControls {
  const ctx = canvas.getContext('2d')!;
  let DPR = 1, W = 0, H = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const groundY = () => H * 0.78;

  // Player state
  const player = {
    x: 120, y: 0, vx: 0, vy: 0,
    onGround: false, holding: false, holdTime: 0,
    jumps: 0, alive: true, runT: 0,
    winning: false, winT: 0,
    flipping: false, flipT: 0,  // somersault on double jump
  };

  let gstate: GameStateKind = 'start';
  let tries  = 1;
  let score  = 0;
  let camX   = 0;

  interface Particle { x:number; y:number; vx:number; vy:number; life:number; color:string; size:number }
  interface Coin { x:number; y:number; collected:boolean; t:number }
  let particles: Particle[] = [];
  let coins: Coin[] = [];

  const screenX = (wx: number) => wx - camX;
  const screenY = (wy: number, top = false) => groundY() - wy - (top ? PLAYER_H : 0);

  function platformAt(wx: number): PlatformDef | null {
    for (const p of PLATFORMS) if (wx >= p.x && wx <= p.x + p.w) return p;
    return null;
  }

  // ── State transitions ──
  function startGame() {
    gstate = 'play'; score = 0;
    player.x = 120; player.y = 0; player.vx = MOVE_SPEED; player.vy = 0;
    player.onGround = true; player.jumps = 0; player.alive = true;
    player.winning = false; player.winT = 0;
    player.flipping = false; player.flipT = 0;
    camX = 0;
    coins = COIN_DEFS.map(c => ({ ...c, collected: false }));
    particles = [];
    cb.onStateChange('play');
    cb.onScore(0); cb.onProgress(0);
  }

  function loseGame() {
    if (gstate !== 'play') return;
    gstate = 'lose'; player.alive = false;
    for (let i = 0; i < 24; i++) particles.push({
      x: screenX(player.x), y: screenY(player.y, true),
      vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 400 - 100,
      life: 1.0, color: '#ff7a8a', size: 4 + Math.random() * 4,
    });
    cb.onStateChange('lose', { score: Math.floor(score), tries });
  }

  function winGame() {
    if (gstate !== 'play' && gstate !== 'stage') return;
    gstate = 'win';
    cb.onStateChange('win', { score: Math.floor(score), tries });
  }

  // ── Update ──
  function update(dt: number) {
    if (gstate === 'play') {
      // Speed ramps up progressively with distance (1× → 2× over the level)
      const speedMul = Math.min(2.0, 1.0 + player.x / 7000);
      player.vx = MOVE_SPEED * speedMul;
      player.x += player.vx * dt;
      if (player.holding && player.holdTime < MAX_HOLD && player.vy < 0) {
        player.vy += JUMP_HOLD_BOOST * dt; player.holdTime += dt;
      }
      const prevY = player.y; // save BEFORE physics — used for from-above landing check
      player.vy += GRAVITY * dt;
      player.y -= player.vy * dt;

      // Flip animation progress
      if (player.flipping) {
        player.flipT = Math.min(1, player.flipT + dt / 0.38);
        if (player.flipT >= 1) { player.flipping = false; player.flipT = 0; }
      }

      const p = platformAt(player.x);
      if (p) {
        // Only land if the player was at or above the platform surface last frame.
        // This prevents snapping back up after falling into a gap and reaching the next platform.
        if (player.y <= p.y && player.vy >= 0 && prevY >= p.y - 2) {
          player.y = p.y; player.vy = 0; player.onGround = true; player.jumps = 0;
          player.flipping = false; player.flipT = 0;
        }
      } else { player.onGround = false; }

      // Die quickly when falling into a gap (80px below ground baseline)
      if (player.y < -80) { loseGame(); return; }

      // Spike collision
      for (const s of SPIKE_DEFS) {
        const px1 = player.x - PLAYER_W / 2 + 6, px2 = player.x + PLAYER_W / 2 - 6;
        const py1 = player.y, py2 = player.y + PLAYER_H - 4;
        if (px2 > s.x + 4 && px1 < s.x + SPIKE_W - 4 && py1 < s.y + SPIKE_H && py2 > s.y) {
          loseGame(); return;
        }
      }

      // Coins
      for (const c of coins) {
        if (c.collected) continue;
        const dx = c.x - player.x, dy = c.y - (player.y + PLAYER_H / 2);
        if (dx * dx + dy * dy < 40 * 40) {
          c.collected = true; score += 10; spawnSparkle(c.x, c.y);
        }
      }

      if (player.x >= STAGE_START + 80 && player.y >= 0) {
        gstate = 'stage'; player.winning = true; player.winT = 0;
      }
    } else if (gstate === 'stage') {
      player.winT += dt;
      const dx = FINISH_X - player.x;
      if (dx > 2) player.x += Math.max(80, dx * 1.5) * dt;
      player.vy += GRAVITY * dt; player.y -= player.vy * dt;
      const p = platformAt(player.x);
      if (p && player.y <= p.y) { player.y = p.y; player.vy = 0; }
      if (Math.abs(player.x - FINISH_X) < 2 && player.winT > 1.4) {
        if (Math.random() < 0.4) particles.push({
          x: FINISH_X - camX + (Math.random() - 0.5) * 60,
          y: screenY(player.y, true) - 100,
          vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 30,
          life: 1.2, color: ['#ffd6a8','#ffb0c8','#c4a8ff','#fff2c4'][Math.floor(Math.random()*4)],
          size: 3 + Math.random() * 3,
        });
        if (player.winT > 2.4) winGame();
      }
    }

    player.runT += dt * (player.onGround ? 14 : 6);
    const target = player.x - W * 0.32;
    camX += (target - camX) * Math.min(1, dt * 6);
    camX = Math.max(0, camX);
    cb.onScore(Math.floor(score));
    cb.onProgress(Math.min(1, player.x / FINISH_X));
  }

  function updateParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  function spawnPuff(sx: number, sy: number) {
    for (let i = 0; i < 8; i++) particles.push({
      x: sx, y: sy + PLAYER_H * 0.9,
      vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60 - 20,
      life: 0.5, color: 'rgba(255,255,255,0.9)', size: 4 + Math.random() * 4,
    });
  }

  function spawnSparkle(wx: number, wy: number) {
    const sx = screenX(wx), sy = groundY() - wy;
    for (let i = 0; i < 10; i++) particles.push({
      x: sx, y: sy, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 200 - 40,
      life: 0.6, color: ['#ffe8a8','#ffd470','#fff4cc'][Math.floor(Math.random()*3)],
      size: 3 + Math.random() * 3,
    });
  }

  // ── Drawing ──
  // Draw order guarantees trees are ALWAYS rendered before ground/obstacles/player:
  // sky → sun → clouds → mountains → waterfalls → farTrees → midTrees → mist
  // → platforms → spikes → coins → stage → player → particles → foregroundGrass → vignette

  function draw() {
    drawSky(); drawSun(); drawClouds(); drawMountains();
    drawWaterfalls();
    drawFarTrees();    // parallax 0.25 — always behind platforms
    drawMidTrees();    // parallax 0.45 — always behind platforms
    drawGroundMist();
    // World-scale elements (ground always in front of trees):
    drawPlatforms(); drawSpikes(); drawCoins(); drawStage();
    if (gstate !== 'start') drawPlayer();
    drawParticles();
    drawForegroundGrass(); // tiny edge-only tufts, no parallax
    drawVignette();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.skyTop); g.addColorStop(0.55, PAL.skyMid); g.addColorStop(1, PAL.skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawSun() {
    const px = W * 0.78 - camX * 0.02, py = H * 0.28;
    const gr = ctx.createRadialGradient(px, py, 0, px, py, 260);
    gr.addColorStop(0, PAL.sunGlow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(px - 320, py - 320, 640, 640);
    ctx.fillStyle = PAL.sun; ctx.beginPath(); ctx.arc(px, py, 56, 0, TAU); ctx.fill();
  }

  function drawClouds() {
    ctx.save();
    for (const c of SCENERY.clouds) {
      const sx = c.x * 0.15 - camX * 0.06;
      const x = ((sx % (W * 1.5)) + W * 1.5) % (W * 1.5) - 100;
      if (x < -c.w * 2 || x > W + 100) continue;
      ctx.globalAlpha = c.o * 0.55; ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x,           c.y,     c.w * 0.50, c.w * 0.18, 0, 0, TAU);
      ctx.ellipse(x + c.w*0.3, c.y - 6, c.w * 0.36, c.w * 0.14, 0, 0, TAU);
      ctx.ellipse(x - c.w*0.3, c.y + 4, c.w * 0.32, c.w * 0.12, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMountains() {
    drawRange(0.12, 1.0,  H * 0.48, PAL.mountainFar);
    drawRange(0.25, 0.85, H * 0.56, PAL.mountainMid);
    drawRange(0.40, 0.70, H * 0.62, PAL.mountainNear);
  }

  function drawRange(par: number, scale: number, baseY: number, color: string) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-50, H);
    for (const m of SCENERY.mountains) {
      const x = m.x * par - camX * par, w = m.w * scale, h = m.h * scale;
      if (x + w < -50 || x > W + 50) continue;
      ctx.lineTo(x, baseY); ctx.lineTo(x + w * 0.5, baseY - h); ctx.lineTo(x + w, baseY);
    }
    ctx.lineTo(W + 50, H); ctx.closePath(); ctx.fill();
  }

  function drawWaterfalls() {
    // Parallax 0.4 — behind mid-trees (0.45) and far in the scene
    const par = 0.4, baseSky = H * 0.78, t = performance.now() / 1000;
    for (const wf of SCENERY.waterfalls) {
      const sx = wf.x * par - camX * par;
      if (sx + wf.w < -80 || sx - wf.w > W + 80) continue;
      const topY = baseSky - wf.h, cliffW = wf.w * 1.8;
      ctx.fillStyle = PAL.stoneDark; ctx.fillRect(sx - cliffW/2, topY - 24, cliffW, wf.h + 60);
      ctx.fillStyle = PAL.stone; ctx.fillRect(sx - cliffW/2 + 6, topY - 18, cliffW - 12, 6);
      ctx.fillStyle = PAL.moss; ctx.fillRect(sx - cliffW/2, topY - 28, cliffW, 8);
      ctx.fillStyle = PAL.mossLight; ctx.fillRect(sx - cliffW/2, topY - 30, cliffW, 3);
      const wg = ctx.createLinearGradient(0, topY, 0, baseSky);
      wg.addColorStop(0, PAL.waterTop); wg.addColorStop(1, PAL.waterBot);
      ctx.fillStyle = wg; ctx.fillRect(sx - wf.w/2, topY, wf.w, wf.h);
      ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < 5; i++) {
        const off = ((t * 180 + i * 38) % (wf.h + 30)) - 30;
        ctx.fillRect(sx - wf.w/2 + (i + 0.5)/5 * wf.w - 1, topY + off, 2, 18);
      }
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) {
        const px = sx + Math.sin(t*0.5 + i*1.7) * wf.w * 0.4;
        const py = baseSky - 6 - ((t*26 + i*30) % 60);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.ellipse(px, py, 16 + i*3, 6, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFarTrees() {
    // Parallax 0.25 — drawn BEFORE platforms, so always behind ground
    const baseY = H * 0.70;
    ctx.fillStyle = PAL.treeFar;
    for (const tr of SCENERY.farTrees) {
      const x = tr.x * 0.25 - camX * 0.25;
      if (x + tr.w < -10 || x > W + 10) continue;
      ctx.beginPath();
      ctx.moveTo(x - tr.w/2, baseY);
      ctx.bezierCurveTo(x - tr.w/2, baseY - tr.h*0.7, x, baseY - tr.h, x, baseY - tr.h);
      ctx.bezierCurveTo(x, baseY - tr.h, x + tr.w/2, baseY - tr.h*0.7, x + tr.w/2, baseY);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawMidTrees() {
    // Parallax 0.45 — drawn BEFORE platforms, so always behind ground
    const baseY = H * 0.76, tt = performance.now() / 1000;
    for (const tr of SCENERY.midTrees) {
      const x = tr.x * 0.45 - camX * 0.45;
      if (x + tr.w < -20 || x > W + 20) continue;
      const sway = Math.sin(tt * 0.6 + (tr.sway ?? 0)) * 4;
      ctx.fillStyle = '#1a120e'; ctx.fillRect(x - 4, baseY - tr.h*0.4, 8, tr.h*0.4);
      ctx.fillStyle = PAL.treeMid;
      ctx.beginPath(); ctx.ellipse(x + sway,            baseY - tr.h*0.60, tr.w*0.50, tr.h*0.45, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x - tr.w*0.25 + sway*0.7, baseY - tr.h*0.50, tr.w*0.35, tr.h*0.32, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + tr.w*0.25 + sway*0.7, baseY - tr.h*0.50, tr.w*0.35, tr.h*0.32, 0, 0, TAU); ctx.fill();
    }
  }

  function drawGroundMist() {
    const y = groundY();
    const g = ctx.createLinearGradient(0, y - 60, 0, y + 40);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, PAL.mist);
    ctx.fillStyle = g; ctx.fillRect(0, y - 60, W, 100);
  }

  function drawPlatforms() {
    const gy = groundY();
    for (const p of PLATFORMS) {
      if (p.isStage) continue;
      const sx = p.x - camX, sy = gy - p.y;
      if (sx + p.w < -20 || sx > W + 20) continue;
      const dh = H - sy + 40;
      const g = ctx.createLinearGradient(0, sy, 0, sy + dh);
      g.addColorStop(0, PAL.stone); g.addColorStop(1, PAL.stoneDark);
      ctx.fillStyle = g; ctx.fillRect(sx, sy, p.w, dh);
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = PAL.stoneDark;
      const seams = Math.floor(p.w / 80);
      for (let i = 1; i <= seams; i++) ctx.fillRect(sx + p.w*i/(seams+1), sy+14, 2, dh-14);
      ctx.globalAlpha = 0.15; ctx.fillStyle = PAL.stoneLight;
      ctx.fillRect(sx+6, sy+14, p.w-12, 4); ctx.restore();
      const mh = 18;
      ctx.fillStyle = PAL.moss;      ctx.fillRect(sx, sy, p.w, mh);
      ctx.fillStyle = PAL.mossLight; ctx.fillRect(sx, sy, p.w, 6);
      ctx.fillStyle = PAL.grass;
      const tufts = Math.max(3, Math.floor(p.w/60));
      for (let i = 0; i < tufts; i++) {
        const gx = sx + 14 + (p.w-28) * (i / Math.max(1, tufts-1));
        ctx.beginPath();
        ctx.moveTo(gx,sy); ctx.lineTo(gx-3,sy-7); ctx.lineTo(gx,sy-4);
        ctx.lineTo(gx+3,sy-8); ctx.lineTo(gx+6,sy-3); ctx.lineTo(gx+8,sy);
        ctx.closePath(); ctx.fill();
      }
      drawFern(sx + 4,       sy + mh + 6, -1);
      drawFern(sx + p.w - 4, sy + mh + 6,  1);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(sx, sy+mh, p.w, 3);
    }
  }

  function drawFern(x: number, y: number, dir: number) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = PAL.moss;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(12,8,24,30); ctx.quadraticCurveTo(14,10,0,6); ctx.fill();
    ctx.fillStyle = PAL.mossLight;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(8,4,16,18); ctx.quadraticCurveTo(9,6,0,3); ctx.fill();
    ctx.restore();
  }

  function drawSpikes() {
    const gy = groundY();
    for (const s of SPIKE_DEFS) {
      const sx = s.x - camX, sy = gy - s.y;
      if (sx + SPIKE_W < -10 || sx > W + 10) continue;

      // Dark shadow under spike for separation from platform
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(sx + SPIKE_W/2, sy - 1, SPIKE_W*0.55, 4, 0, 0, TAU); ctx.fill();

      // Main spike body: warm bone/ivory — high contrast against dark stone
      ctx.fillStyle = '#e8d8a8';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx+SPIKE_W/2, sy-SPIKE_H); ctx.lineTo(sx+SPIKE_W, sy); ctx.closePath(); ctx.fill();

      // Right face: darker warm tone for depth
      ctx.fillStyle = '#c0a870';
      ctx.beginPath(); ctx.moveTo(sx+SPIKE_W/2, sy-SPIKE_H); ctx.lineTo(sx+SPIKE_W/2+5, sy-SPIKE_H+14); ctx.lineTo(sx+SPIKE_W-3, sy-2); ctx.closePath(); ctx.fill();

      // Sharp tip accent
      ctx.fillStyle = '#fff8e0';
      ctx.beginPath(); ctx.arc(sx+SPIKE_W/2, sy-SPIKE_H+1, 2, 0, TAU); ctx.fill();

      // Dark outline for crispness
      ctx.strokeStyle = '#1a1008'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx+SPIKE_W/2, sy-SPIKE_H); ctx.lineTo(sx+SPIKE_W, sy); ctx.stroke();

      // Base root embedded in platform
      ctx.fillStyle = '#a89060'; ctx.fillRect(sx+3, sy-5, SPIKE_W-6, 5);
    }
  }

  function drawCoins() {
    const gy = groundY(), t = performance.now() / 1000;
    for (const c of coins) {
      if (c.collected) continue;
      const sx = c.x - camX, sy = gy - c.y + Math.sin(t*2 + c.t)*4;
      if (sx < -30 || sx > W + 30) continue;
      const g = ctx.createRadialGradient(sx,sy,0,sx,sy,28);
      g.addColorStop(0,'rgba(255,230,150,0.5)'); g.addColorStop(1,'rgba(255,230,150,0)');
      ctx.fillStyle = g; ctx.fillRect(sx-28,sy-28,56,56);
      ctx.save(); ctx.translate(sx,sy); ctx.rotate(t*0.8 + c.t);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i/10)*TAU - Math.PI/2, r = i%2===0 ? 10 : 4;
        ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      ctx.closePath(); ctx.fillStyle = '#ffe07a'; ctx.fill();
      ctx.fillStyle = '#fff5c4'; ctx.beginPath(); ctx.arc(-2,-2,2.5,0,TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawStage() {
    const sp = PLATFORMS.find(p => p.isStage);
    if (!sp) return;
    const gy = groundY(), sx = sp.x - camX, sy = gy - sp.y;
    if (sx + sp.w < 0 || sx > W) return;
    const stageTopY = sy - 8;
    ctx.fillStyle = '#3a241a'; ctx.fillRect(sx, stageTopY, sp.w, H - stageTopY);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < sp.w; i += 70) ctx.fillRect(sx+i, stageTopY, 2, H-stageTopY);
    ctx.fillStyle = '#6a4530'; ctx.fillRect(sx, stageTopY, sp.w, 6);
    ctx.fillStyle = '#9a6a48'; ctx.fillRect(sx, stageTopY, sp.w, 2);

    const drapeX = FINISH_X - 220 - camX, drapeW = 520, drapeY = stageTopY - 240;
    ctx.fillStyle = '#2a1828'; ctx.fillRect(drapeX, drapeY, drapeW, 240);
    for (const [ox, flip] of [[ 0, 1],[ drapeW, -1]] as [number,number][]) {
      ctx.fillStyle = '#7a1f3a'; ctx.beginPath();
      ctx.moveTo(drapeX+ox, drapeY); ctx.lineTo(drapeX+ox + 90*flip, drapeY);
      ctx.bezierCurveTo(drapeX+ox+70*flip,drapeY+80, drapeX+ox+50*flip,drapeY+160, drapeX+ox+30*flip,drapeY+240);
      ctx.lineTo(drapeX+ox, drapeY+240); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(drapeX+14+i*18, drapeY, 2, 240-i*40);
      ctx.fillRect(drapeX+drapeW-14-i*18, drapeY, 2, 240-i*40);
    }
    ctx.fillStyle = '#5a1428'; ctx.beginPath(); ctx.moveTo(drapeX, drapeY);
    for (let i = 0; i < 8; i++) ctx.lineTo(drapeX+(drapeW*i)/7, drapeY+((i%2===0)?0:26)+40);
    ctx.lineTo(drapeX+drapeW, drapeY); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#fff2c4'; ctx.fillRect(drapeX+drapeW/2-110, drapeY+60, 220, 50);
    ctx.fillStyle = '#1f0e26'; ctx.font = '700 italic 22px "Playfair Display", serif';
    ctx.textAlign = 'center'; ctx.fillText('MISS JUMP', drapeX+drapeW/2, drapeY+92);
    ctx.font = '500 10px "Inter", sans-serif'; ctx.fillStyle = '#7a3a4a';
    ctx.fillText('LIVE TONIGHT', drapeX+drapeW/2, drapeY+104);
    ctx.fillStyle = '#ffd470';
    const blink = (performance.now()/250)|0;
    for (let i = 0; i < 12; i++) {
      ctx.globalAlpha = (blink+i)%3!==0 ? 1 : 0.4;
      const bx = drapeX+drapeW/2-110+(220*i)/11;
      ctx.beginPath(); ctx.arc(bx, drapeY+58,  3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(bx, drapeY+116, 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const mx = FINISH_X - camX;
    drawMicStand(mx, stageTopY);
    const beamA = (gstate==='stage'||gstate==='win') ? 0.3 : 0.12;
    const bg = ctx.createLinearGradient(mx, drapeY+60, mx, stageTopY);
    bg.addColorStop(0, `rgba(255,240,200,${beamA})`); bg.addColorStop(1,'rgba(255,240,200,0)');
    ctx.fillStyle = bg; ctx.beginPath();
    ctx.moveTo(mx-12,drapeY+60); ctx.lineTo(mx+12,drapeY+60);
    ctx.lineTo(mx+140,stageTopY); ctx.lineTo(mx-140,stageTopY); ctx.closePath(); ctx.fill();
    drawSpeaker(FINISH_X-200-camX, stageTopY);
    drawSpeaker(FINISH_X+200-camX, stageTopY);
  }

  function drawMicStand(x: number, y: number) {
    ctx.fillStyle='#1a1118'; ctx.beginPath(); ctx.ellipse(x,y-2,22,6,0,0,TAU); ctx.fill();
    ctx.fillStyle='#2a2230'; ctx.fillRect(x-1.5,y-130,3,130);
    ctx.fillStyle='#6a6478'; ctx.fillRect(x-0.5,y-130,1,130);
    ctx.save(); ctx.translate(x,y-138); ctx.rotate(-0.18);
    ctx.fillStyle='#1f1a24'; ctx.beginPath(); ctx.ellipse(0,0,8,12,0,0,TAU); ctx.fill();
    ctx.fillStyle='#5a5468'; ctx.beginPath(); ctx.ellipse(-2,-2,3,5,0,0,TAU); ctx.fill();
    ctx.fillStyle='#fff2c4'; ctx.fillRect(-7,6,14,2); ctx.restore();
  }

  function drawSpeaker(x: number, y: number) {
    ctx.fillStyle='#0e0810'; ctx.fillRect(x-22,y-70,44,70);
    ctx.fillStyle='#1a1420'; ctx.beginPath(); ctx.arc(x,y-48,14,0,TAU); ctx.fill();
    ctx.fillStyle='#2a2230'; ctx.beginPath(); ctx.arc(x,y-22,8,0,TAU); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(x-18,y-66,4,60);
  }

  function drawPlayer() {
    const sx = screenX(player.x), sy = screenY(player.y, true);
    const cx = sx, cy = sy + PLAYER_H;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 0.25 - Math.max(0,player.y)*0.001)})`;
    const p = platformAt(player.x);
    if (p) { ctx.beginPath(); ctx.ellipse(cx, groundY()-p.y+2, 18,5,0,0,TAU); ctx.fill(); }
    ctx.restore();
    const inAir   = !player.onGround;
    const legSwing = inAir ? 0.6 : Math.sin(player.runT) * 0.9;
    const armSwing = inAir ? -0.5 : Math.sin(player.runT + Math.PI) * 0.7;
    const bounce   = inAir ? 0 : Math.abs(Math.sin(player.runT * 0.5)) * -2;
    ctx.save();
    ctx.translate(cx, cy + bounce);
    // Somersault on double jump: rotate around character midpoint
    if (player.flipping) {
      ctx.translate(0, -PLAYER_H / 2);
      ctx.rotate(player.flipT * TAU);
      ctx.translate(0, PLAYER_H / 2);
    }
    ctx.rotate(gstate==='stage' ? 0 : inAir ? 0.05 : 0.08);
    drawCharacter(0, 0, legSwing, armSwing, inAir);
    ctx.restore();
  }

  function drawCharacter(cx: number, cy: number, legSwing: number, armSwing: number, inAir: boolean) {
    const isStage = gstate==='stage' || gstate==='win';
    const dress='#1a1320', dressTrim='#f7d8e0', dressAccent='#c0394a';

    // Back leg
    ctx.save(); ctx.translate(cx-6, cy-22); ctx.rotate(-legSwing*0.6);
    ctx.fillStyle='#f4d2b8'; ctx.fillRect(-4,0,8,22);
    ctx.fillStyle='#1a1018'; ctx.fillRect(-6,18,12,6); ctx.restore();
    // Front leg
    ctx.save(); ctx.translate(cx+4, cy-22); ctx.rotate(legSwing*0.6);
    ctx.fillStyle='#f4d2b8'; ctx.fillRect(-4,0,8,22);
    ctx.fillStyle='#1a1018'; ctx.fillRect(-6,18,12,6); ctx.restore();

    // Skirt
    ctx.fillStyle=dress; ctx.beginPath();
    ctx.moveTo(cx-12,cy-38); ctx.lineTo(cx+12,cy-38); ctx.lineTo(cx+17,cy-22); ctx.lineTo(cx-17,cy-22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=dressTrim; ctx.fillRect(cx-17,cy-23,34,2);
    // Torso
    ctx.fillStyle=dress; ctx.beginPath();
    ctx.moveTo(cx-11,cy-56); ctx.lineTo(cx+11,cy-56); ctx.lineTo(cx+12,cy-38); ctx.lineTo(cx-12,cy-38);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=dressAccent; ctx.fillRect(cx-12,cy-40,24,2);

    // Back arm
    ctx.save(); ctx.translate(cx-10,cy-54); ctx.rotate(armSwing*0.5);
    ctx.fillStyle='#f4d2b8'; ctx.fillRect(-3,0,6,18);
    ctx.fillStyle=dress; ctx.fillRect(-4,0,8,6); ctx.restore();
    // Front arm
    ctx.save(); ctx.translate(cx+10,cy-54); ctx.rotate(isStage ? -0.7 : -armSwing*0.5);
    ctx.fillStyle='#f4d2b8'; ctx.fillRect(-3,0,6,18);
    ctx.fillStyle=dress; ctx.fillRect(-4,0,8,6);
    ctx.fillStyle='#f4d2b8'; ctx.beginPath(); ctx.arc(0,18,3.5,0,TAU); ctx.fill(); ctx.restore();

    // Neck
    ctx.fillStyle='#f4d2b8'; ctx.fillRect(cx-3,cy-60,6,6);

    const hx=cx, hy=cy-70;

    // ── HAIR LAYER 1: back volume — drawn BEFORE head so it stays behind the face ──
    // Main mass: wraps around back of head, does NOT cross the face front
    ctx.fillStyle='#c87840';
    ctx.beginPath();
    ctx.moveTo(hx-10, hy-8);
    ctx.bezierCurveTo(hx-18, hy-4, hx-18, hy+12, hx-12, hy+18);
    ctx.lineTo(hx+8, hy+18);
    ctx.bezierCurveTo(hx+17, hy+14, hx+17, hy+2, hx+13, hy-6);
    ctx.bezierCurveTo(hx+12, hy-14, hx-10, hy-16, hx-10, hy-8);
    ctx.closePath(); ctx.fill();
    // Left side curl — stays to the left of face
    ctx.fillStyle='#b06828';
    ctx.beginPath();
    ctx.moveTo(hx-11, hy+4);
    ctx.bezierCurveTo(hx-20, hy+8, hx-18, hy+20, hx-10, hy+22);
    ctx.bezierCurveTo(hx-6,  hy+14, hx-10, hy+6,  hx-11, hy+4);
    ctx.fill();

    // ── HEAD — drawn on top of back hair ──
    ctx.fillStyle='#f7d8be'; ctx.beginPath(); ctx.arc(hx,hy,11,0,TAU); ctx.fill();

    // ── FACE FEATURES (always on top of head) ──
    // Blush
    ctx.fillStyle='rgba(220,100,120,0.4)';
    ctx.beginPath(); ctx.arc(hx-6,hy+3,2.5,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx+6,hy+3,2.5,0,TAU); ctx.fill();

    // Eyes
    ctx.fillStyle='#1a1320';
    if (isStage) {
      ctx.strokeStyle='#1a1320'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(hx-5,hy); ctx.lineTo(hx-2,hy+1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx+2,hy); ctx.lineTo(hx+5,hy+1); ctx.stroke();
    } else {
      ctx.fillRect(hx-5,hy-2,3,2.5); ctx.fillRect(hx+2,hy-2,3,2.5);
      ctx.strokeStyle='#1a1320'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(hx+5,hy-2); ctx.lineTo(hx+7.5,hy-4); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(hx-4,hy-1,0.9,0,TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(hx+3,hy-1,0.9,0,TAU); ctx.fill();
    }
    // Red lips
    ctx.fillStyle='#c0394a';
    ctx.beginPath(); ctx.moveTo(hx-3,hy+4);
    ctx.quadraticCurveTo(hx,hy+7,hx+3,hy+4);
    ctx.quadraticCurveTo(hx,hy+5,hx-3,hy+4); ctx.closePath(); ctx.fill();

    // ── HAIR LAYER 2: front bangs — only covers FOREHEAD (above eyes at hy-2) ──
    ctx.fillStyle='#c87840';
    ctx.beginPath();
    ctx.moveTo(hx-10, hy-5);                                    // left temple
    ctx.bezierCurveTo(hx-8, hy-14, hx+8, hy-14, hx+11, hy-5); // crown arc
    ctx.lineTo(hx+7,  hy-5);
    ctx.bezierCurveTo(hx+4,  hy-5, hx+0, hy-5, hx-6, hy-5);   // bottom of bangs — stays above hy-5, well above eyes
    ctx.closePath(); ctx.fill();
    // Hair highlight on crown
    ctx.fillStyle='#e0a868';
    ctx.beginPath(); ctx.ellipse(hx+1,hy-9,4.5,2.5,-0.3,0,TAU); ctx.fill();

    // Earring
    ctx.fillStyle='#f0d060';
    ctx.beginPath(); ctx.arc(hx+10,hy+2,2,0,TAU); ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life/0.6));
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawForegroundGrass() {
    // Tiny edge tufts at the absolute bottom — no parallax, only where ground exists
    const baseY = H - 8;
    for (const g of SCENERY.grass) {
      const sx = g.x - camX;
      if (sx + g.w < -20 || sx > W + 20) continue;
      if (!platformAt(g.x)) continue;
      ctx.fillStyle = PAL.treeNear;
      ctx.beginPath();
      ctx.moveTo(sx,baseY); ctx.lineTo(sx+g.w*0.3,baseY-16);
      ctx.lineTo(sx+g.w*0.5,baseY-6); ctx.lineTo(sx+g.w*0.7,baseY-18);
      ctx.lineTo(sx+g.w,baseY); ctx.closePath(); ctx.fill();
    }
  }

  function drawVignette() {
    const gr = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.5, W/2,H/2,Math.max(W,H)*0.85);
    gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(10,6,16,0.45)');
    ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
    ctx.fillStyle=PAL.ambient; ctx.fillRect(0,0,W,H);
  }

  // ── Game loop ──
  let rafId = 0, lastT = performance.now();
  function loop(now: number) {
    const dt = Math.min(0.033, (now - lastT) / 1000);
    lastT = now;
    if (gstate === 'play' || gstate === 'stage') update(dt);
    updateParticles(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(t => { lastT = t; rafId = requestAnimationFrame(loop); });

  // ── Controls ──
  function pressJump() {
    if (gstate === 'start') { startGame(); return; }
    if (gstate === 'lose' || gstate === 'win') { tries++; startGame(); return; }
    if (gstate !== 'play' || !player.alive) return;
    if (player.jumps < 2) {
      player.vy = player.jumps === 0 ? JUMP_VEL : JUMP_VEL * 0.86;
      if (player.jumps === 1) {
        // Double jump: trigger somersault + puff
        spawnPuff(screenX(player.x), screenY(player.y, true));
        player.flipping = true;
        player.flipT = 0;
      }
      player.onGround = false; player.holding = true; player.holdTime = 0; player.jumps++;
    }
  }

  function releaseJump() { player.holding = false; }

  function destroy() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
  }

  return { pressJump, releaseJump, destroy };
}
