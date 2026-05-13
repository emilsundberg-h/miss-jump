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
  pointerDown: (x: number, y: number) => void;
  pointerUp:   (x: number, y: number) => void;
  setJoystick: (dx: number, dy: number) => void;
  destroy: () => void;
}

// ── Level 5: Boomerang Fu / mic-throw constants ──────────────────────────────
const L5_TOTAL        = 40;
const L5_P_SPEED      = 190;
const L5_MIC_SPEED    = 480;
const L5_MIC_RETURN   = 380;
const L5_MIC_RANGE    = 280;
const L5_ENEMY_COLORS = ['#ff9ec0','#ffd86b','#b8eecc','#d4a8ff','#ffc898','#a8e8f0','#f0c4d8','#e8e070'];
interface L5Enemy { x:number; y:number; vx:number; vy:number; color:string; id:number; alive:boolean; hitT:number; angle:number }
interface L5Spawn { wx:number; wy:number; t:number; color:string } // pending spawns (with preview flash)

// ── Level 3: Flappy obstacles (gapFrac = gapTop/H, H-independent) ──────────
const FLAP_OBS_DEFS: { wx: number; gapFrac: number }[] = (() => {
  const list: { wx: number; gapFrac: number }[] = [];
  let s = 1234567;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };
  for (let x = 480; x < 10200; x += 300 + r() * 130) list.push({ wx: x, gapFrac: 0.12 + r() * 0.60 });
  return list;
})();
const FL_GAP_H      = 210;  // gap height px
const FL_OBS_W      = 88;   // obstacle cloud width px
const FL_GRAVITY    = 2000;
const FL_FLAP_V     = -580;
const FL_BASE_SPEED = 240;
const FL_WIN_DIST   = 10500;

// ── Level 4: Falling obstacles (gap normalised 0-1 over screen width) ───────
const FALL_OBS_DEFS: { wy: number; gapFrac: number; gapWFrac: number }[] = (() => {
  const list: { wy: number; gapFrac: number; gapWFrac: number }[] = [];
  let s = 9876543;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };
  // Gaps biased left or right so hovering centre is never safe.
  // Uses edge-to-edge reachability: each gap is clamped so it's reachable from
  // the WORST-CASE position (either edge) of the previous gap.
  // REACH = 0.18 covers physical lateral travel + pre-positioning margin.
  // Spacing tightens from 320 → 220 px, width 22–30% of screen.
  const REACH = 0.18;
  let prevGL = 0.35, prevGR = 0.65; // virtual starting gap at centre
  for (let y = 900; y < 10500; y += Math.max(220, 320 - y / 60)) {
    const left = r() < 0.5;
    const rawCentre = left ? 0.10 + r() * 0.22 : 0.68 + r() * 0.22;
    const hw = 0.11 + r() * 0.04;
    // maxCentre ensures gL ≤ prevGL + REACH (reachable from left edge moving right)
    // minCentre ensures gR ≥ prevGR - REACH (reachable from right edge moving left)
    const centre = Math.max(prevGR - REACH - hw, Math.min(prevGL + REACH + hw, rawCentre));
    const gL = Math.max(0.02, centre - hw);
    const gR = Math.min(0.98, centre + hw);
    prevGL = gL; prevGR = gR;
    list.push({ wy: y, gapFrac: gL, gapWFrac: gR - gL });
  }
  return list;
})();
const FALL_SPEED     = 300;   // px/s downward
const FALL_SIDE_SPD  = 260;   // px/s horizontal
const FALL_OBS_H     = 60;    // obstacle cloud thickness
const FALL_WIN_Y     = 10800;

const TAU = Math.PI * 2;

// Pre-generated scenery for Flappy level (world-space coords 0..FL_WIN_DIST*1.1)
const FLAP_BG = (() => {
  let s = 77665544;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };
  const clouds = Array.from({ length: 55 }, () => ({
    x: r() * FL_WIN_DIST * 1.08, y: r() * 0.62, w: 80 + r() * 220, o: 0.3 + r() * 0.5,
  }));
  const stars = Array.from({ length: 80 }, () => ({
    fx: r(), fy: r() * 0.50, sr: 0.8 + r() * 1.5, phase: r() * Math.PI * 2,
  }));
  return { clouds, stars };
})();

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
const JUMP_CUT_MIN   = 0.45; // velocity fraction kept on instant tap (scales to 1.0 at full hold)
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

// ===== Level 2: Cloud level =====
// Warm pink cloud palette — from the Miss Jump cloud design
const CLOUD_PAL = {
  skyTop: '#5a7ac8', skyMid: '#b8d0f0', skyBot: '#ffc5d2',
  sun: '#fff8e8', sunGlow: 'rgba(255,230,200,0.55)',
  cloudFar: '#fce4ef', cloudMid: '#ffd9e6',
  platformSurf: '#fff6fa', platformMid: '#ffd9e6', platformEdge: '#f0b0c8',
  mist: 'rgba(255,180,210,0.35)',
  ambient: 'rgba(255,100,180,0.05)',
  stone: '#e0b8c8', stoneDark: '#c890a8', stoneLight: '#f0d0e0',
  moss: '#d890b0', mossLight: '#f0b0c8', grass: '#f0c8d8',
  spike: '#7a8898', spikeHighlight: '#c8d4de',
  treeFar: '#e080b0', treeMid: '#c06090', treeNear: '#904070',
  waterTop: '#ffd9e6', waterBot: '#ff9ec0',
};

const CLOUD_PLATFORMS: PlatformDef[] = [
  // ── Uppvärmning ──
  { x: 0,     w: 620,  y: 0 },
  { x: 810,   w: 150,  y: 70 },
  { x: 1060,  w: 130,  y: 180 },
  { x: 1300,  w: 140,  y: 70 },
  { x: 1570,  w: 160,  y: 180, spikes: [{ ox: 55, n: 2 }] },
  { x: 1870,  w: 100,  y: 80 },
  // ── Klättring ──
  { x: 2110,  w: 120,  y: 200 },
  { x: 2370,  w: 90,   y: 300 },
  { x: 2600,  w: 120,  y: 170 },
  { x: 2880,  w: 100,  y: 60 },
  { x: 3120,  w: 260,  y: 0,   spikes: [{ ox: 70, n: 2 }, { ox: 165, n: 2 }] },
  { x: 3550,  w: 90,   y: 150 },
  { x: 3800,  w: 80,   y: 270 },
  { x: 4020,  w: 110,  y: 150 },
  // ── Svårt avsnitt 1 ──
  { x: 4310,  w: 90,   y: 260 },
  { x: 4570,  w: 90,   y: 150 },
  { x: 4860,  w: 80,   y: 50 },
  { x: 5110,  w: 210,  y: 160, spikes: [{ ox: 50, n: 2 }, { ox: 140, n: 2 }] },
  { x: 5510,  w: 80,   y: 80 },
  { x: 5760,  w: 80,   y: 210 },
  { x: 6010,  w: 90,   y: 310 },
  { x: 6280,  w: 80,   y: 190 },
  // ── Fartsträcka ──
  { x: 6570,  w: 80,   y: 80 },
  { x: 6840,  w: 260,  y: 0,   spikes: [{ ox: 60, n: 2 }, { ox: 150, n: 3 }] },
  { x: 7310,  w: 80,   y: 160 },
  { x: 7580,  w: 80,   y: 270 },
  { x: 7870,  w: 80,   y: 150 },
  { x: 8150,  w: 80,   y: 60 },
  { x: 8430,  w: 80,   y: 180 },
  { x: 8720,  w: 90,   y: 290 },
  // ── Slutattack ──
  { x: 9030,  w: 80,   y: 170 },
  { x: 9310,  w: 120,  y: 60 },
  { x: 9600,  w: 90,   y: 190 },
  { x: 9900,  w: 80,   y: 280 },
  { x: 10210, w: 110,  y: 150 },
  { x: 10530, w: 260,  y: 0 },
  { x: 11000, w: 1400, y: 0,   isStage: true },
];
const CLOUD_STAGE_START = 11000;
const CLOUD_FINISH_X    = 11400;
const CLOUD_LEVEL_END   = 13000;

const CLOUD_SPIKE_DEFS: SpikePos[] = [];
for (const p of CLOUD_PLATFORMS) {
  if (!p.spikes) continue;
  for (const s of p.spikes)
    for (let i = 0; i < s.n; i++)
      CLOUD_SPIKE_DEFS.push({ x: p.x + s.ox + i * SPIKE_W, y: p.y });
}

const CLOUD_COIN_DEFS: CoinDef[] = [];
(function placeCloudCoins() {
  for (const p of CLOUD_PLATFORMS) {
    if (p.isStage) continue;
    const count = Math.max(1, Math.floor(p.w / 140));
    for (let i = 0; i < count; i++) {
      const cx = p.x + 40 + (p.w - 80) * (i + 0.5) / count;
      const cy = p.y + 110 + (i % 2) * 30;
      let blocked = false;
      if (p.spikes)
        for (const s of p.spikes)
          for (let k = 0; k < s.n; k++)
            if (Math.abs(cx - (p.x + s.ox + k * SPIKE_W + SPIKE_W / 2)) < 30) blocked = true;
      if (!blocked) CLOUD_COIN_DEFS.push({ x: cx, y: cy, t: Math.random() * TAU });
    }
  }
})();

function buildCloudScenery(): Scenery {
  const r = seededRand(99);
  const mountains: MountainDef[] = [];
  for (let i = 0; i < 34; i++)
    mountains.push({ x: r() * CLOUD_LEVEL_END * 1.2, h: 50 + r() * 110, w: 180 + r() * 420 });
  const clouds: CloudDef[] = [];
  for (let i = 0; i < 42; i++)
    clouds.push({ x: r() * CLOUD_LEVEL_END, y: 20 + r() * 220, w: 80 + r() * 230, o: 0.45 + r() * 0.55 });
  return { farTrees: [], midTrees: [], mountains, clouds, waterfalls: [], grass: [] };
}
const CLOUD_SCENERY = buildCloudScenery();

// ===== Level 4 runner phase — cloud platforms before the fall =====
const FALL4_PLATFORMS: PlatformDef[] = [
  { x: 0,    w: 500,  y: 0 },
  { x: 680,  w: 130,  y: 70 },
  { x: 900,  w: 120,  y: 170 },
  { x: 1110, w: 100,  y: 70 },
  { x: 1310, w: 140,  y: 180, spikes: [{ ox: 50, n: 2 }] },
  { x: 1570, w: 100,  y: 80 },
  { x: 1780, w: 110,  y: 190 },
  { x: 2000, w: 90,   y: 80 },
  { x: 2200, w: 100,  y: 190 },
  { x: 2410, w: 90,   y: 80 },
  // No more platforms after x=2500 — player walks off the edge
];
const FALL4_RUN_END = 2500; // world x where runner section ends

const FALL4_SPIKE_DEFS: SpikePos[] = [];
for (const p of FALL4_PLATFORMS) {
  if (!p.spikes) continue;
  for (const s of p.spikes)
    for (let i = 0; i < s.n; i++)
      FALL4_SPIKE_DEFS.push({ x: p.x + s.ox + i * SPIKE_W, y: p.y });
}

const FALL4_COIN_DEFS: CoinDef[] = [];
(function placeFall4Coins() {
  for (const p of FALL4_PLATFORMS) {
    const count = Math.max(1, Math.floor(p.w / 160));
    for (let i = 0; i < count; i++) {
      const cx = p.x + 40 + (p.w - 80) * (i + 0.5) / count;
      const cy = p.y + 110 + (i % 2) * 30;
      let blocked = false;
      if (p.spikes)
        for (const s of p.spikes)
          for (let k = 0; k < s.n; k++)
            if (Math.abs(cx - (p.x + s.ox + k * SPIKE_W + SPIKE_W / 2)) < 30) blocked = true;
      if (!blocked) FALL4_COIN_DEFS.push({ x: cx, y: cy, t: Math.random() * TAU });
    }
  }
})();

// ===== Character customisation =====
export interface CharCustom {
  hair: string; hairMid: string; hairHi: string;
  dress: string; dressTrim: string; dressAccent: string;
  shoe: string;
  hairLength: 'short' | 'long';
  outfit: 'dress' | 'top';
  pantsColor: string;
  skin: string;
}
export const DEFAULT_CUSTOM: CharCustom = {
  hair: '#c87840', hairMid: '#b06828', hairHi: '#e0a868',
  dress: '#1a1320', dressTrim: '#f7d8e0', dressAccent: '#c0394a',
  shoe: '#1a1018',
  hairLength: 'short',
  outfit: 'dress',
  pantsColor: '#161016',
  skin: '#f4d2b8',
};
export const HAIR_PRESETS: { key: string; label: string; swatch: string; hair: string; hairMid: string; hairHi: string }[] = [
  { key:'auburn',  label:'Auburn',  swatch:'#c87840', hair:'#c87840', hairMid:'#b06828', hairHi:'#e0a868' },
  { key:'blonde',  label:'Blond',   swatch:'#e8c030', hair:'#e0b820', hairMid:'#c09000', hairHi:'#f8e060' },
  { key:'black',   label:'Svart',   swatch:'#2a1818', hair:'#1a1010', hairMid:'#100808', hairHi:'#3a2820' },
  { key:'red',     label:'Röd',     swatch:'#c02020', hair:'#c02020', hairMid:'#900808', hairHi:'#e04040' },
  { key:'pink',    label:'Rosa',    swatch:'#d05090', hair:'#d05090', hairMid:'#b03070', hairHi:'#f080b0' },
  { key:'silver',  label:'Silver',  swatch:'#c4bcb4', hair:'#d0c8c0', hairMid:'#a8a0a0', hairHi:'#eceae8' },
];
export const DRESS_PRESETS: { key: string; label: string; swatch: string; dress: string; dressTrim: string; dressAccent: string }[] = [
  { key:'black',  label:'Svart',     swatch:'#1a1320', dress:'#1a1320', dressTrim:'#f7d8e0', dressAccent:'#c0394a' },
  { key:'red',    label:'Röd',       swatch:'#8a1020', dress:'#8a1020', dressTrim:'#ffd4c0', dressAccent:'#fff5c4' },
  { key:'purple', label:'Lila',      swatch:'#4a1870', dress:'#4a1870', dressTrim:'#d4a8ff', dressAccent:'#ffd6a8' },
  { key:'teal',   label:'Turkos',    swatch:'#1a5050', dress:'#1a5050', dressTrim:'#a0e0d8', dressAccent:'#f0e880' },
  { key:'navy',   label:'Marinblå',  swatch:'#181870', dress:'#181870', dressTrim:'#a8c8f0', dressAccent:'#f0e8a0' },
  { key:'gold',   label:'Guld',      swatch:'#6a4010', dress:'#6a4010', dressTrim:'#f8d860', dressAccent:'#fff8d0' },
];

export const PANTS_PRESETS: { key: string; label: string; swatch: string; color: string }[] = [
  { key:'black',  label:'Svart',    swatch:'#161016', color:'#161016' },
  { key:'navy',   label:'Marinblå', swatch:'#101438', color:'#101438' },
  { key:'grey',   label:'Grå',      swatch:'#484858', color:'#484858' },
  { key:'beige',  label:'Beige',    swatch:'#c4a880', color:'#c4a880' },
  { key:'green',  label:'Grön',     swatch:'#1a4020', color:'#1a4020' },
  { key:'rust',   label:'Rostbrun', swatch:'#6a2810', color:'#6a2810' },
];

export const SKIN_PRESETS: { key: string; label: string; swatch: string; skin: string }[] = [
  { key:'1', label:'1', swatch:'#fde4c4', skin:'#fde4c4' },
  { key:'2', label:'2', swatch:'#f4d2b8', skin:'#f4d2b8' },
  { key:'3', label:'3', swatch:'#dfa870', skin:'#dfa870' },
  { key:'4', label:'4', swatch:'#c07840', skin:'#c07840' },
  { key:'5', label:'5', swatch:'#8a4c24', skin:'#8a4c24' },
  { key:'6', label:'6', swatch:'#4e2210', skin:'#4e2210' },
];

/** Draw Miss Li on any canvas — used for in-game rendering and the preview. */
export function drawPreviewChar(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, custom: CharCustom = DEFAULT_CUSTOM
): void {
  renderMissLi(ctx, cx, cy, 0, 0, false, false, custom);
}

function renderMissLi(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  legSwing: number, armSwing: number,
  inAir: boolean, isStage: boolean,
  c: CharCustom,
): void {
  const hx = cx, hy = cy - 70;

  // ── Long hair — drawn FIRST so it sits behind legs, dress, and arms ──
  if (c.hairLength === 'long') {
    // Main flowing mass (left/back side of body)
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.moveTo(hx-6,  hy-10);
    ctx.bezierCurveTo(hx-22, hy-4,  hx-26, cy-52, hx-20, cy-24);
    ctx.bezierCurveTo(hx-14, cy-14, hx-6,  cy-20, hx-4,  cy-28);
    ctx.bezierCurveTo(hx-10, cy-42, hx-14, hy+6,  hx-8,  hy+2);
    ctx.closePath(); ctx.fill();
    // Inner shadow stripe for wave depth
    ctx.fillStyle = c.hairMid;
    ctx.beginPath();
    ctx.moveTo(hx-10, hy-8);
    ctx.bezierCurveTo(hx-18, hy-2,  hx-20, cy-50, hx-16, cy-28);
    ctx.bezierCurveTo(hx-12, cy-20, hx-8,  cy-22, hx-8,  cy-32);
    ctx.bezierCurveTo(hx-12, cy-44, hx-16, hy+4,  hx-12, hy-1);
    ctx.closePath(); ctx.fill();
    // Right side flow (visible over right shoulder)
    ctx.fillStyle = c.hair;
    ctx.beginPath();
    ctx.moveTo(hx+8,  hy-8);
    ctx.bezierCurveTo(hx+18, hy-2,  hx+18, cy-54, hx+14, cy-32);
    ctx.bezierCurveTo(hx+10, cy-20, hx+6,  cy-24, hx+6,  cy-34);
    ctx.bezierCurveTo(hx+10, cy-48, hx+14, hy+4,  hx+10, hy-2);
    ctx.closePath(); ctx.fill();
  }

  // Legs — pants-coloured when outfit='top', skin when dress
  const legFill = c.outfit === 'top' ? c.pantsColor : c.skin;
  // Back leg
  ctx.save(); ctx.translate(cx-6, cy-22); ctx.rotate(-legSwing*0.6);
  ctx.fillStyle=legFill; ctx.fillRect(-4,0,8,22);
  ctx.fillStyle=c.shoe; ctx.fillRect(-6,18,12,6); ctx.restore();
  // Front leg
  ctx.save(); ctx.translate(cx+4, cy-22); ctx.rotate(legSwing*0.6);
  ctx.fillStyle=legFill; ctx.fillRect(-4,0,8,22);
  ctx.fillStyle=c.shoe; ctx.fillRect(-6,18,12,6); ctx.restore();

  if (c.outfit === 'top') {
    // ── Byxor (raka byxben + midjeband) ──
    ctx.fillStyle = c.pantsColor;
    ctx.fillRect(cx-13, cy-38, 12, 16); // vänster byxben
    ctx.fillRect(cx+1,  cy-38, 12, 16); // höger byxben
    ctx.fillRect(cx-13, cy-38, 25, 5);  // midja/grenskygg
    // Söm
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(cx-1, cy-38, 2, 16);
    // Midjeband
    ctx.fillStyle = c.dressAccent;
    ctx.fillRect(cx-14, cy-41, 28, 4);
    // ── Topp (kortare, tightare) ──
    ctx.fillStyle = c.dress;
    ctx.beginPath();
    ctx.moveTo(cx-11,cy-56); ctx.lineTo(cx+11,cy-56);
    ctx.lineTo(cx+12,cy-38); ctx.lineTo(cx-12,cy-38);
    ctx.closePath(); ctx.fill();
    // Halsringning
    ctx.fillStyle = c.dressTrim;
    ctx.beginPath();
    ctx.moveTo(cx-5,cy-56); ctx.quadraticCurveTo(cx,cy-52,cx+5,cy-56);
    ctx.lineTo(cx+3,cy-56); ctx.quadraticCurveTo(cx,cy-54,cx-3,cy-56);
    ctx.fill();
    // Hem
    ctx.fillStyle = c.dressAccent;
    ctx.fillRect(cx-12,cy-39,24,2);
  } else {
    // ── Klänning (A-linje kjol + överdel) ──
    ctx.fillStyle=c.dress; ctx.beginPath();
    ctx.moveTo(cx-12,cy-38); ctx.lineTo(cx+12,cy-38);
    ctx.lineTo(cx+17,cy-22); ctx.lineTo(cx-17,cy-22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=c.dressTrim; ctx.fillRect(cx-17,cy-23,34,2);
    // Överdel
    ctx.fillStyle=c.dress; ctx.beginPath();
    ctx.moveTo(cx-11,cy-56); ctx.lineTo(cx+11,cy-56);
    ctx.lineTo(cx+12,cy-38); ctx.lineTo(cx-12,cy-38);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=c.dressAccent; ctx.fillRect(cx-12,cy-40,24,2);
  }

  // Back arm
  ctx.save(); ctx.translate(cx-10,cy-54); ctx.rotate(armSwing*0.5);
  ctx.fillStyle=c.skin; ctx.fillRect(-3,0,6,18);
  ctx.fillStyle=c.dress; ctx.fillRect(-4,0,8,6); ctx.restore();
  // Front arm
  ctx.save(); ctx.translate(cx+10,cy-54); ctx.rotate(isStage ? -0.7 : -armSwing*0.5);
  ctx.fillStyle=c.skin; ctx.fillRect(-3,0,6,18);
  ctx.fillStyle=c.dress; ctx.fillRect(-4,0,8,6);
  ctx.fillStyle=c.skin; ctx.beginPath(); ctx.arc(0,18,3.5,0,TAU); ctx.fill(); ctx.restore();

  // Neck
  ctx.fillStyle=c.skin; ctx.fillRect(cx-3,cy-60,6,6);

  // Hair back volume (drawn BEFORE head) — stays within head circle, max hy+9 (chin level)
  ctx.fillStyle=c.hair;
  ctx.beginPath();
  ctx.moveTo(hx-10,hy-8);
  ctx.bezierCurveTo(hx-18,hy-4,hx-17,hy+6,hx-12,hy+9);
  ctx.lineTo(hx+8,hy+9);
  ctx.bezierCurveTo(hx+17,hy+5,hx+17,hy+0,hx+13,hy-6);
  ctx.bezierCurveTo(hx+12,hy-14,hx-10,hy-16,hx-10,hy-8);
  ctx.closePath(); ctx.fill();
  // Left side wave — stays beside the face, does not go below chin (hy+9)
  ctx.fillStyle=c.hairMid;
  ctx.beginPath();
  ctx.moveTo(hx-11,hy+2);
  ctx.bezierCurveTo(hx-20,hy+0,hx-19,hy+7,hx-13,hy+9);
  ctx.bezierCurveTo(hx-9,hy+6,hx-10,hy+2,hx-11,hy+2);
  ctx.fill();

  // Head
  ctx.fillStyle=c.skin; ctx.beginPath(); ctx.arc(hx,hy,11,0,TAU); ctx.fill();

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
  // Lips
  ctx.fillStyle='#c0394a';
  ctx.beginPath(); ctx.moveTo(hx-3,hy+4);
  ctx.quadraticCurveTo(hx,hy+7,hx+3,hy+4);
  ctx.quadraticCurveTo(hx,hy+5,hx-3,hy+4); ctx.closePath(); ctx.fill();

  // Front bangs (above eyes)
  ctx.fillStyle=c.hair;
  ctx.beginPath();
  ctx.moveTo(hx-10,hy-5);
  ctx.bezierCurveTo(hx-8,hy-14,hx+8,hy-14,hx+11,hy-5);
  ctx.lineTo(hx+7,hy-5);
  ctx.bezierCurveTo(hx+4,hy-5,hx+0,hy-5,hx-6,hy-5);
  ctx.closePath(); ctx.fill();
  // Crown highlight
  ctx.fillStyle=c.hairHi;
  ctx.beginPath(); ctx.ellipse(hx+1,hy-9,4.5,2.5,-0.3,0,TAU); ctx.fill();

  // Earring
  ctx.fillStyle='#f0d060';
  ctx.beginPath(); ctx.arc(hx+10,hy+2,2,0,TAU); ctx.fill();
}

// ===== Main factory =====
export function createGame(canvas: HTMLCanvasElement, cb: GameCallbacks, levelId: 1|2|3|4|5 = 1, custom: CharCustom = DEFAULT_CUSTOM): GameControls {
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

  // Level-specific data (local vars shadow module-level constants where names differ)
  const platforms    = levelId === 1 ? PLATFORMS    : levelId === 4 ? FALL4_PLATFORMS    : CLOUD_PLATFORMS;
  const spikeDefs    = levelId === 1 ? SPIKE_DEFS   : levelId === 4 ? FALL4_SPIKE_DEFS   : CLOUD_SPIKE_DEFS;
  const levelCoinDefs = levelId === 1 ? COIN_DEFS   : levelId === 4 ? FALL4_COIN_DEFS    : CLOUD_COIN_DEFS;
  const scenery      = levelId === 1 ? SCENERY           : CLOUD_SCENERY;
  const stageStart   = levelId === 1 ? STAGE_START       : CLOUD_STAGE_START;
  const finishX      = levelId === 1 ? FINISH_X          : CLOUD_FINISH_X;
  const pal          = levelId === 1 ? PAL               : CLOUD_PAL;

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
    for (const p of platforms) if (wx >= p.x && wx <= p.x + p.w) return p;
    return null;
  }

  // ── State transitions ──
  function startGame() {
    if (levelId === 3) { startFlappy(); return; }
    if (levelId === 4) { startFall4(); return; }
    if (levelId === 5) { startLevel5(); return; }
    gstate = 'play'; score = 0;
    player.x = 120; player.y = 0; player.vx = MOVE_SPEED; player.vy = 0;
    player.onGround = true; player.jumps = 0; player.alive = true;
    player.winning = false; player.winT = 0;
    player.flipping = false; player.flipT = 0;
    camX = 0;
    coins = levelCoinDefs.map(c => ({ ...c, collected: false }));
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
    if (levelId === 3) { if (gstate === 'play') updateFlappy(dt); return; }
    if (levelId === 4 && fall4Phase === 'fall') { if (gstate === 'play') updateFalling(dt); return; }
    if (levelId === 5) { if (gstate === 'play') updateLevel5(dt); return; }
    // Level 4 runner phase falls through to the normal platform runner below
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

      // Level 4: walking off the last cloud → switch to fall phase instead of dying
      if (player.y < -80) {
        if (levelId === 4 && player.x > FALL4_RUN_END - 150) { switchToFallPhase(); return; }
        loseGame(); return;
      }

      // Spike collision
      for (const s of spikeDefs) {
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

      if (player.x >= stageStart + 80 && player.y >= 0) {
        gstate = 'stage'; player.winning = true; player.winT = 0;
      }
    } else if (gstate === 'stage') {
      player.winT += dt;
      const dx = finishX - player.x;
      if (dx > 2) player.x += Math.max(80, dx * 1.5) * dt;
      player.vy += GRAVITY * dt; player.y -= player.vy * dt;
      const p = platformAt(player.x);
      if (p && player.y <= p.y) { player.y = p.y; player.vy = 0; }
      if (Math.abs(player.x - finishX) < 2 && player.winT > 1.4) {
        if (Math.random() < 0.4) particles.push({
          x: finishX - camX + (Math.random() - 0.5) * 60,
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
    cb.onProgress(Math.min(1, player.x / finishX));
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

  // ── Level 5: Mic Throw arena ────────────────────────────────────────────────
  let l5PX = 0, l5PY = 0;           // player world pos
  let l5PVX = 0, l5PVY = 0;
  let l5PAngle = -Math.PI / 2;      // facing up initially
  let l5JDX = 0, l5JDY = 0;         // joystick input (-1..1)
  let l5MicX = 0, l5MicY = 0;
  let l5MicVX = 0, l5MicVY = 0;
  let l5MicOut = false;
  let l5MicPhase: 'flying' | 'returning' = 'flying';
  let l5MicDist = 0;
  let l5Enemies: L5Enemy[] = [];
  let l5Spawns: L5Spawn[] = [];     // upcoming spawn flashes
  let l5SpawnTimer = 0;
  let l5SpawnCount = 0;
  let l5ElimCount = 0;
  let l5WinPhase = false;
  let l5WinT = 0;
  let l5EnemyId = 0;

  const l5SW = () => W * 0.88;   // stage width
  const l5SH = () => H * 0.80;   // stage height
  const l5SX = () => (W - l5SW()) / 2;
  const l5SY = () => (H - l5SH()) / 2;
  const l5MicX2 = () => W / 2;   // mic stand position
  const l5MicY2 = () => l5SY() + 70;

  function spawnInterval() {
    // Continuous ramp: reaches current-end difficulty (1.1s) at 50%, then keeps going to 0.7s
    const t = Math.min(1, l5SpawnCount / L5_TOTAL);
    if (t < 0.5) return 2.4 - t * 2.6;          // 2.4s → 1.1s in first half
    return Math.max(0.7, 1.1 - (t - 0.5) * 0.8); // 1.1s → 0.7s in second half
  }
  function enemySpeed() {
    // Reaches current-end speed (185) at 50%, then up to 220 px/s
    const t = Math.min(1, l5SpawnCount / L5_TOTAL);
    return 95 + Math.min(0.5, t) * 180;           // 95 → 185 px/s, capped at 185
  }

  function startLevel5() {
    l5PX = W / 2; l5PY = H * 0.65;
    l5PVX = 0; l5PVY = 0; l5PAngle = -Math.PI / 2;
    l5JDX = 0; l5JDY = 0;
    l5MicOut = false; l5MicDist = 0;
    l5Enemies = []; l5Spawns = [];
    l5SpawnTimer = 2.0; l5SpawnCount = 0; l5ElimCount = 0;
    l5WinPhase = false; l5WinT = 0; l5EnemyId = 0;
    gstate = 'play'; score = 0;
    cb.onStateChange('play'); cb.onScore(0); cb.onProgress(0);
  }

  function throwMic(tx: number, ty: number) {
    if (l5MicOut || l5WinPhase) return;
    const dx = tx - l5PX, dy = ty - l5PY;
    const d = Math.hypot(dx, dy) || 1;
    l5MicX = l5PX; l5MicY = l5PY;
    l5MicVX = (dx / d) * L5_MIC_SPEED;
    l5MicVY = (dy / d) * L5_MIC_SPEED;
    l5MicDist = 0;
    l5MicOut = true; l5MicPhase = 'flying';
    l5PAngle = Math.atan2(dy, dx);
  }

  function updateLevel5(dt: number) {
    const sx = l5SX(), sy = l5SY(), sw = l5SW(), sh = l5SH();

    // Win walk-to-stand animation
    if (l5WinPhase) {
      l5WinT += dt;
      const tx = l5MicX2(), ty = l5MicY2() + 40;
      const dx = tx - l5PX, dy = ty - l5PY, d = Math.hypot(dx, dy);
      if (d > 6) {
        l5PX += (dx / d) * 120 * dt; l5PY += (dy / d) * 120 * dt;
        l5PAngle = Math.atan2(dy, dx);
      }
      if (l5WinT > 2.4) winGame();
      // Celebration particles
      if (Math.random() < 0.4) particles.push({
        x: l5PX + (Math.random()-0.5)*60, y: l5PY + (Math.random()-0.5)*60,
        vx: (Math.random()-0.5)*200, vy: -Math.random()*200-60,
        life: 1.0, color: L5_ENEMY_COLORS[Math.floor(Math.random()*L5_ENEMY_COLORS.length)], size: 4+Math.random()*5,
      });
      return;
    }

    // Player movement (joystick)
    const jLen = Math.hypot(l5JDX, l5JDY);
    if (jLen > 0.05) {
      l5PVX = (l5JDX / Math.max(1, jLen)) * L5_P_SPEED;
      l5PVY = (l5JDY / Math.max(1, jLen)) * L5_P_SPEED;
      l5PAngle = Math.atan2(l5JDY, l5JDX);
    } else {
      l5PVX *= 0.8; l5PVY *= 0.8;
    }
    l5PX = Math.max(sx + 22, Math.min(sx + sw - 22, l5PX + l5PVX * dt));
    l5PY = Math.max(sy + 22, Math.min(sy + sh - 22, l5PY + l5PVY * dt));

    // Mic physics
    if (l5MicOut) {
      if (l5MicPhase === 'flying') {
        l5MicX += l5MicVX * dt; l5MicY += l5MicVY * dt;
        l5MicDist += Math.hypot(l5MicVX, l5MicVY) * dt;
        if (l5MicDist >= L5_MIC_RANGE) l5MicPhase = 'returning';
      } else {
        const rdx = l5PX - l5MicX, rdy = l5PY - l5MicY;
        const rd = Math.hypot(rdx, rdy) || 1;
        if (rd < 18) { l5MicOut = false; }
        else {
          l5MicVX = (rdx / rd) * L5_MIC_RETURN;
          l5MicVY = (rdy / rd) * L5_MIC_RETURN;
          l5MicX += l5MicVX * dt; l5MicY += l5MicVY * dt;
        }
      }
      // Mic-enemy collision
      for (const e of l5Enemies) {
        if (!e.alive) continue;
        if (Math.hypot(l5MicX - e.x, l5MicY - e.y) < 26) {
          e.alive = false; e.hitT = 0;
          l5ElimCount++;
          cb.onScore(l5ElimCount);
          cb.onProgress(l5ElimCount / L5_TOTAL);
          for (let i = 0; i < 12; i++) particles.push({
            x: e.x, y: e.y,
            vx: (Math.random()-0.5)*280, vy: (Math.random()-0.5)*280,
            life: 0.7, color: e.color, size: 5+Math.random()*5,
          });
          if (l5ElimCount >= L5_TOTAL) { l5WinPhase = true; l5WinT = 0; }
          // Mic bounces back immediately after hit
          l5MicPhase = 'returning';
        }
      }
    }

    // Enemy movement & collision with player
    for (const e of l5Enemies) {
      if (!e.alive) { e.hitT += dt; continue; }
      const dx = l5PX - e.x, dy = l5PY - e.y, d = Math.hypot(dx, dy) || 1;
      e.vx += (dx / d) * enemySpeed() * dt;
      e.vy += (dy / d) * enemySpeed() * dt;
      const spd = Math.hypot(e.vx, e.vy);
      const maxSpd = enemySpeed();
      if (spd > maxSpd) { e.vx = (e.vx/spd)*maxSpd; e.vy = (e.vy/spd)*maxSpd; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.angle = Math.atan2(e.vy, e.vx);
      // Stage bounds
      e.x = Math.max(sx + 15, Math.min(sx + sw - 15, e.x));
      e.y = Math.max(sy + 15, Math.min(sy + sh - 15, e.y));
      // Reached player?
      if (d < 24) { loseGame(); return; }
    }

    // Spawn logic
    if (l5SpawnCount < L5_TOTAL) {
      l5SpawnTimer -= dt;
      if (l5SpawnTimer <= 0) {
        l5SpawnTimer = spawnInterval();
        // Create spawn flash then enemy
        const side = Math.floor(Math.random() * 4);
        let wx = 0, wy = 0;
        if (side === 0) { wx = sx + Math.random()*sw; wy = sy + 12; }
        else if (side === 1) { wx = sx + Math.random()*sw; wy = sy + sh - 12; }
        else if (side === 2) { wx = sx + 12; wy = sy + Math.random()*sh; }
        else                 { wx = sx + sw - 12; wy = sy + Math.random()*sh; }
        const col = L5_ENEMY_COLORS[l5SpawnCount % L5_ENEMY_COLORS.length];
        l5Spawns.push({ wx, wy, t: 0.9, color: col });
        l5SpawnCount++;
      }
    }

    // Spawn flashes → enemies
    for (let i = l5Spawns.length - 1; i >= 0; i--) {
      l5Spawns[i].t -= dt;
      if (l5Spawns[i].t <= 0) {
        const s = l5Spawns[i];
        l5Enemies.push({ x: s.wx, y: s.wy, vx: 0, vy: 0, color: s.color, id: l5EnemyId++, alive: true, hitT: 0, angle: 0 });
        l5Spawns.splice(i, 1);
      }
    }
  }

  function drawLevel5() {
    const sx = l5SX(), sy = l5SY(), sw = l5SW(), sh = l5SH();
    // Background
    ctx.fillStyle = '#0a0810'; ctx.fillRect(0, 0, W, H);
    // Audience silhouettes at edges
    ctx.fillStyle = '#1a1220';
    ctx.fillRect(0, 0, W, sy); ctx.fillRect(0, sy+sh, W, H-sy-sh);
    ctx.fillRect(0, sy, sx, sh); ctx.fillRect(sx+sw, sy, W-sx-sw, sh);
    // Stage floor — wooden planks (top-down)
    const stageGrad = ctx.createLinearGradient(sx, sy, sx, sy+sh);
    stageGrad.addColorStop(0, '#4a3020'); stageGrad.addColorStop(1, '#362418');
    ctx.fillStyle = stageGrad; ctx.fillRect(sx, sy, sw, sh);
    // Plank lines
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    for (let py2 = sy + 40; py2 < sy + sh; py2 += 40) {
      ctx.beginPath(); ctx.moveTo(sx, py2); ctx.lineTo(sx+sw, py2); ctx.stroke();
    }
    // Wood grain
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let py2 = sy + 20; py2 < sy + sh; py2 += 40) {
      ctx.beginPath(); ctx.moveTo(sx, py2); ctx.lineTo(sx+sw, py2); ctx.stroke();
    }
    // Stage edge highlight
    ctx.strokeStyle = '#6a4828'; ctx.lineWidth = 3;
    ctx.strokeRect(sx, sy, sw, sh);
    // Spotlights on stage
    [[W*0.25, sy+sh*0.3],[W*0.5, sy+sh*0.5],[W*0.75, sy+sh*0.3]].forEach(([lx,ly]) => {
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 120);
      lg.addColorStop(0, 'rgba(255,240,200,0.12)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = lg; ctx.fillRect(lx-130, ly-130, 260, 260);
    });

    // Mic stand (top-down: small oval + pole)
    const msx = l5MicX2(), msy = l5MicY2();
    ctx.fillStyle = '#1a1118';
    ctx.beginPath(); ctx.ellipse(msx, msy+6, 18, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2848'; ctx.fillRect(msx-2, msy-30, 4, 36);
    ctx.fillStyle = '#1f1a28';
    ctx.beginPath(); ctx.ellipse(msx, msy-34, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a5468';
    ctx.beginPath(); ctx.ellipse(msx-2, msy-36, 3, 3, 0, 0, TAU); ctx.fill();

    // Spawn flashes
    for (const s of l5Spawns) {
      const a = Math.min(1, (0.9 - s.t) * 3) * Math.abs(Math.sin(s.t * 15));
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.wx, s.wy, 16, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ── draw helper: top-down human (rot = facing direction) ──────────────────
    const drawHuman = (
      hx: number, hy: number, rot: number,
      outfitC: string, accentC: string, hairC: string,
      isMissLi = false, alpha = 1, skinC = '#f4d2b8',
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(hx, hy);
      ctx.rotate(rot + Math.PI / 2); // +90° so "forward" = up in local space

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(3, 4, 14, 11, 0, 0, TAU); ctx.fill();

      // Shoes
      ctx.fillStyle = '#1a1018';
      ctx.beginPath(); ctx.ellipse(-4, 17, 4, 6, 0.15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, 17, 4, 6, -0.15, 0, TAU); ctx.fill();

      // Outfit / dress body
      ctx.fillStyle = outfitC;
      ctx.beginPath(); ctx.ellipse(0, 4, 13, 17, 0, 0, TAU); ctx.fill();
      // Hem accent
      ctx.fillStyle = accentC;
      ctx.beginPath(); ctx.ellipse(0, 17, 13, 5, 0, 0, TAU); ctx.fill();

      // Arms (skin)
      ctx.fillStyle = skinC;
      ctx.beginPath(); ctx.ellipse(-13, 0, 4, 8, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(13, 0, 4, 8, -0.4, 0, TAU); ctx.fill();

      // Neck
      ctx.fillStyle = skinC;
      ctx.beginPath(); ctx.ellipse(0, -5, 4, 5, 0, 0, TAU); ctx.fill();

      // Hair back volume
      ctx.fillStyle = hairC;
      ctx.beginPath(); ctx.ellipse(0, -13, 12, 10, 0, 0, TAU); ctx.fill();
      if (isMissLi) {
        // Side flowing hair (left side, visible from above)
        ctx.beginPath();
        ctx.moveTo(-8, -10);
        ctx.bezierCurveTo(-19, -10, -17, 4, -10, 9);
        ctx.bezierCurveTo(-7, 3, -8, -6, -6, -10);
        ctx.closePath(); ctx.fill();
      }

      // Head (face circle)
      ctx.fillStyle = skinC;
      ctx.beginPath(); ctx.arc(0, -10, 9, 0, TAU); ctx.fill();

      // Eyes — two small dots
      ctx.fillStyle = '#1a1320';
      ctx.beginPath(); ctx.arc(-3, -13, 1.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -13, 1.5, 0, TAU); ctx.fill();

      if (isMissLi) {
        // Red lips
        ctx.fillStyle = '#c0394a';
        ctx.beginPath(); ctx.arc(0, -9, 2.2, 0.1, Math.PI - 0.1); ctx.fill();
        // Front hair / fringe over forehead
        ctx.fillStyle = hairC;
        ctx.beginPath(); ctx.ellipse(0, -18, 10, 5, 0, 0, TAU); ctx.fill();
        // Earring (right ear)
        ctx.fillStyle = '#f0d060';
        ctx.beginPath(); ctx.arc(9, -9, 2.5, 0, TAU); ctx.fill();
      } else {
        // Enemy: small mouth line
        ctx.strokeStyle = '#c08060'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-2.5, -8); ctx.lineTo(2.5, -8); ctx.stroke();
      }

      ctx.restore();
    };

    // Hair colours per enemy (cycle through palette, slightly darker than outfit)
    const HAIR_COLS = ['#8a5040','#6a4870','#4a6040','#704830','#405060','#604040','#507040','#486040'];

    // Enemies
    for (const e of l5Enemies) {
      const hIdx = e.id % HAIR_COLS.length;
      const hiColor = L5_ENEMY_COLORS[(e.id + 2) % L5_ENEMY_COLORS.length]; // lighter accent
      if (!e.alive) {
        drawHuman(e.x, e.y, e.angle, e.color, hiColor, HAIR_COLS[hIdx], false, Math.max(0, 1 - e.hitT * 3));
        continue;
      }
      drawHuman(e.x, e.y, e.angle, e.color, hiColor, HAIR_COLS[hIdx]);
    }

    // ── Microphone drawing helper (top-down, grille at top of local space) ────
    const drawMic = (mx: number, my: number, rot: number, scale = 1) => {
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(rot + Math.PI / 2);  // grille faces forward
      ctx.scale(scale, scale);

      // Handle (bottom, dark grip)
      ctx.fillStyle = '#2a1a08';
      ctx.beginPath(); ctx.roundRect(-3, 5, 6, 16, 3); ctx.fill();
      // Grip rings
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.2;
      for (let gy = 8; gy <= 18; gy += 4) {
        ctx.beginPath(); ctx.moveTo(-3, gy); ctx.lineTo(3, gy); ctx.stroke();
      }
      // Body / shaft
      ctx.fillStyle = '#b07818';
      ctx.beginPath(); ctx.roundRect(-4, -2, 8, 8, 2); ctx.fill();
      // Gold band ring
      ctx.fillStyle = '#f0d050';
      ctx.beginPath(); ctx.roundRect(-4.5, -1, 9, 2.5, 1); ctx.fill();

      // Grille capsule (dark mesh sphere — the most recognisable mic part)
      ctx.fillStyle = '#18101e';
      ctx.beginPath(); ctx.arc(0, -8, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#201628';
      ctx.beginPath(); ctx.arc(0, -9, 7, 0, TAU); ctx.fill();
      // Mesh dot grid on grille
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let gx = -5; gx <= 5; gx += 3) {
        for (let gy2 = -14; gy2 <= -3; gy2 += 3) {
          if (gx * gx + (gy2 + 8) * (gy2 + 8) < 44) {
            ctx.beginPath(); ctx.arc(gx, gy2, 1.1, 0, TAU); ctx.fill();
          }
        }
      }
      // Grille outline
      ctx.strokeStyle = 'rgba(140,100,200,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -8, 8, 0, TAU); ctx.stroke();

      ctx.restore();
    };

    // Mic (flying) — spins as it travels
    if (l5MicOut) {
      const spinAngle = Math.atan2(l5MicVY, l5MicVX) + l5MicDist * 0.06; // spin
      // Motion trail
      const trail = l5MicPhase === 'flying' ? 0.5 : 0.28;
      ctx.save();
      ctx.globalAlpha = trail;
      ctx.fillStyle = '#ffd040';
      ctx.beginPath(); ctx.arc(l5MicX - l5MicVX*0.07, l5MicY - l5MicVY*0.07, 5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(l5MicX - l5MicVX*0.14, l5MicY - l5MicVY*0.14, 3, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(255,210,60,0.9)'; ctx.restore();
      drawMic(l5MicX, l5MicY, spinAngle);
    } else {
      // Mic held — small mic in player's forward hand
      const mhx = l5PX + Math.cos(l5PAngle) * 22, mhy = l5PY + Math.sin(l5PAngle) * 22;
      drawMic(mhx, mhy, l5PAngle, 0.75);
    }

    // Player (Miss Li)
    drawHuman(l5PX, l5PY, l5PAngle, custom.dress, custom.dressAccent, custom.hair, true, 1, custom.skin);

    // Particles
    drawParticles();

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(sx, 10, 200, 32, 8); ctx.fill();
    ctx.fillStyle = '#f7efe2'; ctx.font = 'bold 14px "Inter", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Eliminated: ${l5ElimCount} / ${L5_TOTAL}`, sx + 12, 31);

    // Remaining alive count
    const alive = l5Enemies.filter(e => e.alive).length;
    if (alive > 0) {
      ctx.fillStyle = 'rgba(200,50,80,0.7)';
      ctx.beginPath(); ctx.roundRect(sx + sw - 130, 10, 120, 32, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
      ctx.fillText(`On stage: ${alive}`, sx + sw - 12, 31);
    }
  }

  // ── Level 3 (Flappy) state & logic ────────────────────────────────────────
  let flY = 0, flVY = 0, flScrollX = 0;

  function startFlappy() {
    flY = H * 0.40; flVY = 0; flScrollX = 0;
    gstate = 'play'; score = 0;
    cb.onStateChange('play'); cb.onScore(0); cb.onProgress(0);
  }

  function updateFlappy(dt: number) {
    const spd = FL_BASE_SPEED * Math.min(2, 1 + flScrollX / 4000);
    flScrollX += spd * dt;
    flVY += FL_GRAVITY * dt;
    flY  += flVY * dt;
    const PW = 30, PH = 50;
    if (flY < 0 || flY + PH > H) { loseGame(); return; }
    for (const o of FLAP_OBS_DEFS) {
      const sx = o.wx - flScrollX;
      if (sx + FL_OBS_W < 0 || sx > W) continue;
      const gapY = o.gapFrac * H;
      const px = W * 0.22;
      if (px + PW > sx && px < sx + FL_OBS_W) {
        if (flY < gapY || flY + PH > gapY + FL_GAP_H) { loseGame(); return; }
      }
    }
    score = FLAP_OBS_DEFS.filter(o => o.wx < flScrollX + W * 0.22).length;
    cb.onScore(score);
    cb.onProgress(Math.min(1, flScrollX / FL_WIN_DIST));
    if (flScrollX >= FL_WIN_DIST) winGame();
  }

  function drawFlappy() {
    const t = performance.now() / 1000;

    // Sky gradient
    const sg = ctx.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, CLOUD_PAL.skyTop); sg.addColorStop(0.55, CLOUD_PAL.skyMid); sg.addColorStop(1, CLOUD_PAL.skyBot);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

    // Moon (upper-left, drifts slowly away as level progresses)
    const moonX = W * 0.13 - flScrollX * 0.008, moonY = H * 0.11, moonR = Math.min(32, H * 0.046);
    if (moonX > -moonR * 3) {
      const mg = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 2.8);
      mg.addColorStop(0, 'rgba(255,245,220,0.50)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg; ctx.fillRect(moonX - moonR * 3, moonY - moonR * 3, moonR * 6, moonR * 6);
      ctx.fillStyle = '#fff8ee'; ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, TAU); ctx.fill();
      ctx.fillStyle = CLOUD_PAL.skyTop;
      ctx.beginPath(); ctx.arc(moonX + moonR * 0.32, moonY - moonR * 0.08, moonR * 0.87, 0, TAU); ctx.fill();
    }

    // Stars — very slow parallax, twinkling
    ctx.fillStyle = '#fff8f4';
    for (const s of FLAP_BG.stars) {
      if (s.fy > 0.46) continue;
      const twinkle = 0.38 + 0.62 * Math.sin(t * 1.6 + s.phase);
      const stx = ((s.fx - flScrollX * 0.00008) % 1 + 1) % 1 * W;
      ctx.globalAlpha = twinkle * 0.72;
      ctx.beginPath(); ctx.arc(stx, s.fy * H, s.sr, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Sun
    const sunX = W * 0.76, sunY = H * 0.14;
    const gr = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 180);
    gr.addColorStop(0, CLOUD_PAL.sunGlow); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
    ctx.fillStyle = CLOUD_PAL.sun; ctx.beginPath(); ctx.arc(sunX, sunY, 40, 0, TAU); ctx.fill();

    // Far parallax clouds (large blobs, slow)
    ctx.fillStyle = CLOUD_PAL.cloudFar;
    for (const c of FLAP_BG.clouds) {
      if (c.w <= 160) continue;
      const cx2 = c.x * 0.12 - flScrollX * 0.06;
      if (cx2 + c.w < -60 || cx2 > W + 60) continue;
      ctx.globalAlpha = c.o * 0.38;
      drawCloudBlob(cx2, c.y * H * 0.50, c.w * 0.80, c.w * 0.28);
    }
    ctx.globalAlpha = 1;

    // Mid parallax clouds (smaller, faster)
    ctx.fillStyle = CLOUD_PAL.cloudMid;
    for (const c of FLAP_BG.clouds) {
      if (c.w > 160) continue;
      const cx2 = c.x * 0.26 - flScrollX * 0.15;
      if (cx2 + c.w < -60 || cx2 > W + 60) continue;
      ctx.globalAlpha = c.o * 0.50;
      drawCloudBlob(cx2, c.y * H * 0.58 + H * 0.06, c.w * 0.65, c.w * 0.22);
    }
    ctx.globalAlpha = 1;

    // Obstacles
    for (const o of FLAP_OBS_DEFS) {
      const osx = o.wx - flScrollX;
      if (osx + FL_OBS_W < -10 || osx > W + 10) continue;
      drawFlappyObstacle(osx, o.gapFrac * H);
    }

    // Stage at end
    if (flScrollX > FL_WIN_DIST - W * 1.15) {
      drawFlappyStage(FL_WIN_DIST - flScrollX);
    }

    // Player
    const tilt = Math.max(-0.45, Math.min(0.45, flVY / 1200));
    ctx.save();
    ctx.translate(W * 0.22 + 15, flY + 25);
    ctx.rotate(tilt * 0.6);
    renderMissLi(ctx, 0, 0, 0.6, -0.5, true, false, custom);
    ctx.restore();
  }

  function drawFlappyObstacle(sx: number, gapY: number) {
    const C1 = CLOUD_PAL.platformMid, C2 = CLOUD_PAL.platformSurf;
    // Top bank
    if (gapY > 0) {
      ctx.fillStyle = C1; ctx.fillRect(sx, 0, FL_OBS_W, gapY);
      ctx.fillStyle = C2;
      const n = Math.ceil(FL_OBS_W / 22);
      for (let i = 0; i < n; i++) {
        const r = 14 + (i % 3) * 5;
        ctx.beginPath(); ctx.arc(sx + (i + 0.5) * FL_OBS_W / n, gapY, r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < n; i++) {
        const r = (14 + (i % 3) * 5) * 0.4;
        ctx.beginPath(); ctx.arc(sx + (i + 0.5) * FL_OBS_W / n - 3, gapY - (14 + (i % 3)*5)*0.55, r, 0, TAU); ctx.fill();
      }
    }
    // Bottom bank
    const botY = gapY + FL_GAP_H;
    if (botY < H) {
      ctx.fillStyle = C1; ctx.fillRect(sx, botY, FL_OBS_W, H - botY);
      ctx.fillStyle = C2;
      const n = Math.ceil(FL_OBS_W / 22);
      for (let i = 0; i < n; i++) {
        const r = 14 + (i % 3) * 5;
        ctx.beginPath(); ctx.arc(sx + (i + 0.5) * FL_OBS_W / n, botY, r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < n; i++) {
        const r = (14 + (i % 3) * 5) * 0.4;
        ctx.beginPath(); ctx.arc(sx + (i + 0.5) * FL_OBS_W / n - 3, botY + (14 + (i%3)*5)*0.55, r, 0, TAU); ctx.fill();
      }
    }
    // Side highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(sx, 0, 4, gapY);
    ctx.fillRect(sx, botY, 4, H - botY);
  }

  function drawFlappyStage(sx: number) {
    const t = performance.now() / 1000;
    const blink = (performance.now() / 260) | 0;
    const gapY  = H * 0.26;
    const botY  = gapY + FL_GAP_H;
    const gapCy = (gapY + botY) / 2;
    // Visible panel fills from sx to right edge
    const panelX = Math.max(0, sx);
    const panelW = W - panelX;
    if (panelW <= 0) return;

    // Warm glow through the gap opening
    const gbg = ctx.createRadialGradient(panelX + 50, gapCy, 0, panelX + 50, gapCy, FL_GAP_H);
    gbg.addColorStop(0, 'rgba(255,240,190,0.70)'); gbg.addColorStop(1, 'rgba(255,180,200,0)');
    ctx.fillStyle = gbg; ctx.fillRect(panelX, gapY, panelW, FL_GAP_H);

    // Spotlight beam fanning leftward from arch
    if (sx > -40 && sx < W) {
      const beamA = 0.11 + 0.04 * Math.sin(t * 0.9);
      const bg2 = ctx.createLinearGradient(sx, gapCy, 0, gapCy);
      bg2.addColorStop(0, `rgba(255,240,200,${beamA})`); bg2.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = bg2;
      ctx.beginPath();
      ctx.moveTo(sx, gapY + 12); ctx.lineTo(sx, botY - 12);
      ctx.lineTo(0, gapCy + 90); ctx.lineTo(0, gapCy - 90);
      ctx.closePath(); ctx.fill();
    }

    // Top curtain — deep burgundy with fold lines and puffy bottom edge
    ctx.fillStyle = '#7a1f3a'; ctx.fillRect(panelX, 0, panelW, gapY);
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 4;
    for (let i = 0; i < panelW; i += 28) {
      ctx.beginPath(); ctx.moveTo(panelX + i, 0); ctx.lineTo(panelX + i, gapY); ctx.stroke();
    }
    const shTop = ctx.createLinearGradient(panelX, 0, panelX + 36, 0);
    shTop.addColorStop(0, 'rgba(255,255,255,0.20)'); shTop.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shTop; ctx.fillRect(panelX, 0, panelW, gapY);
    // Puffy rose edge
    ctx.fillStyle = '#9e2845';
    const nTop = Math.ceil(panelW / 22);
    for (let i = 0; i < nTop; i++) {
      const r = 14 + (i % 3) * 5;
      ctx.beginPath(); ctx.arc(panelX + (i + 0.5) * panelW / nTop, gapY, r, 0, TAU); ctx.fill();
    }
    // Gold fringe
    const nFringe = Math.ceil(panelW / 14);
    for (let i = 0; i < nFringe; i++) {
      const fx = panelX + panelW * i / Math.max(1, nFringe - 1);
      const flen = 18 + (i % 3) * 7;
      ctx.fillStyle = '#ffd470'; ctx.fillRect(fx - 1.2, gapY - 2, 2.4, flen);
      ctx.beginPath(); ctx.arc(fx, gapY - 2 + flen, 3.2, 0, TAU); ctx.fill();
    }

    // Bottom stage floor — dark with cloud platform edge and footlights
    ctx.fillStyle = '#3a1a28'; ctx.fillRect(panelX, botY, panelW, H - botY);
    ctx.fillStyle = CLOUD_PAL.platformSurf;
    const nBot = Math.ceil(panelW / 22);
    for (let i = 0; i < nBot; i++) {
      const r = 14 + (i % 3) * 5;
      ctx.beginPath(); ctx.arc(panelX + (i + 0.5) * panelW / nBot, botY, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#7a3050'; ctx.fillRect(panelX, botY + 14, panelW, 5);
    const nLights = Math.max(1, Math.ceil(panelW / 48));
    for (let i = 0; i < nLights; i++) {
      const lx = panelX + panelW * (i + 0.5) / nLights;
      ctx.fillStyle = '#ffd470';
      ctx.globalAlpha = (blink + i) % 3 !== 0 ? 0.9 : 0.22;
      ctx.beginPath(); ctx.arc(lx, botY + 17, 4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Arch frame + bulbs at leading edge (sx)
    if (sx > -8 && sx < W) {
      ctx.fillStyle = '#c89028';
      ctx.fillRect(sx - 5, 0, 10, gapY);
      ctx.fillRect(sx - 5, botY, 10, H - botY);
      for (let i = 0; i < 10; i++) {
        const ly = gapY * i / 9;
        ctx.fillStyle = '#ffd470';
        ctx.globalAlpha = (blink + i) % 3 !== 0 ? 0.9 : 0.25;
        ctx.beginPath(); ctx.arc(sx, ly, 4, 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 8; i++) {
        const ly = botY + (H - botY) * i / 7;
        ctx.globalAlpha = (blink + i + 4) % 3 !== 0 ? 0.9 : 0.25;
        ctx.beginPath(); ctx.arc(sx, ly, 4, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Banner
      const bW = 178, bH = 56, bX = sx + 14, bY = Math.max(10, gapY - bH - 22);
      if (bY + bH < gapY - 6 && bX + bW < W - 4) {
        ctx.fillStyle = '#fff2c4'; ctx.fillRect(bX, bY, bW, bH);
        ctx.strokeStyle = '#c8a030'; ctx.lineWidth = 2; ctx.strokeRect(bX, bY, bW, bH);
        ctx.save();
        ctx.fillStyle = '#1f0e26';
        ctx.font = '700 italic 15px "Playfair Display", serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('MISS JUMP', bX + bW / 2, bY + bH * 0.40);
        ctx.font = '500 9px "Inter", sans-serif'; ctx.fillStyle = '#7a3a4a';
        ctx.fillText('LIVE TONIGHT', bX + bW / 2, bY + bH * 0.73);
        ctx.restore();
        for (let i = 0; i < 9; i++) {
          const lx2 = bX + bW * i / 8;
          ctx.fillStyle = '#ffd470';
          ctx.globalAlpha = (blink + i) % 3 !== 0 ? 0.9 : 0.28;
          ctx.beginPath(); ctx.arc(lx2, bY, 3, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(lx2, bY + bH, 3, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Mic stand on stage floor
      const mx = sx + 52;
      if (mx < W - 12 && botY < H - 20) {
        ctx.fillStyle = '#1a1118'; ctx.beginPath(); ctx.ellipse(mx, botY + 12, 16, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a2230'; ctx.fillRect(mx - 1.5, botY - 100, 3, 112);
        ctx.fillStyle = '#6a6478'; ctx.fillRect(mx - 0.5, botY - 100, 1, 112);
        ctx.fillStyle = '#3a3448'; ctx.beginPath(); ctx.ellipse(mx, botY - 102, 8, 11, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(mx - 2, botY - 106, 3, 4.5, -0.3, 0, TAU); ctx.fill();
      }
    }
  }

  // ── Level 4 (Falling) state & logic ────────────────────────────────────────
  let fall4Phase: 'run' | 'fall' = 'run';
  let fallX = 0, fallWorldY = 0;
  let fallHoldL = 0, fallHoldR = 0;

  function startFall4() {
    // Phase 1: platform runner (same init as levels 1&2)
    fall4Phase = 'run';
    gstate = 'play'; score = 0;
    player.x = 120; player.y = 0; player.vx = MOVE_SPEED; player.vy = 0;
    player.onGround = true; player.jumps = 0; player.alive = true;
    player.winning = false; player.winT = 0; player.flipping = false; player.flipT = 0;
    camX = 0; fallHoldL = 0; fallHoldR = 0;
    coins = levelCoinDefs.map(c => ({ ...c, collected: false }));
    particles = [];
    cb.onStateChange('play'); cb.onScore(0); cb.onProgress(0);
  }

  function switchToFallPhase() {
    // Preserve horizontal screen position when transitioning
    fall4Phase = 'fall';
    fallX = Math.max(60, Math.min(W - 60, player.x - camX));
    fallWorldY = 0; fallHoldL = 0; fallHoldR = 0;
    // Burst of particles to signal transition
    for (let i = 0; i < 18; i++) particles.push({
      x: player.x - camX, y: screenY(player.y, true) + 20,
      vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 200 - 50,
      life: 0.8, color: CLOUD_PAL.platformSurf, size: 4 + Math.random() * 5,
    });
  }

  function startFalling() {  // kept for direct call from startFall4 retry
    fallX = W * 0.5; fallWorldY = 0; fallHoldL = 0; fallHoldR = 0;
    gstate = 'play'; score = 0;
    cb.onStateChange('play'); cb.onScore(0); cb.onProgress(0);
  }

  function updateFalling(dt: number) {
    // Speed ramps from 300 → 560 px/s over the level
    const spd = Math.min(560, FALL_SPEED * (1 + fallWorldY / 4000));
    fallWorldY += spd * dt;
    const moveX = (fallHoldR > 0 ? 1 : 0) - (fallHoldL > 0 ? 1 : 0);
    // Lateral speed also scales up
    const latSpd = Math.min(420, FALL_SIDE_SPD * (1 + fallWorldY / 5000));
    fallX += moveX * latSpd * dt;
    fallX = Math.max(22, Math.min(W - 22, fallX));

    const PW = 28, PH = 56;
    const camY = Math.max(0, fallWorldY - H * 0.35);
    const screenY = fallWorldY - camY;  // feet position

    // Obstacle collision: player body spans [screenY-PH, screenY] (feet at screenY, head above)
    for (const o of FALL_OBS_DEFS) {
      const osy = o.wy - camY;
      if (osy + FALL_OBS_H < 0 || osy > H + 10) continue;
      if (screenY > osy && screenY - PH < osy + FALL_OBS_H) {
        const gapX = o.gapFrac * W, gapW = o.gapWFrac * W;
        const px1 = fallX - PW/2 + 5;
        const px2 = fallX + PW/2 - 5;
        if (!(px1 >= gapX && px2 <= gapX + gapW)) { loseGame(); return; }
      }
    }
    score = FALL_OBS_DEFS.filter(o => o.wy < fallWorldY).length;
    cb.onScore(score);
    cb.onProgress(Math.min(1, fallWorldY / FALL_WIN_Y));
    if (fallWorldY >= FALL_WIN_Y) winGame();
  }

  function drawFall4Runner() {
    // Identical visual style to Level 2 (pink cloud palette) but uses FALL4 platforms.
    // Sky darkens and stars appear as player approaches the edge of the clouds.
    const edgeApproach = Math.max(0, (player.x - (FALL4_RUN_END - 800)) / 800); // 0→1

    drawCloudSky();
    drawCloudBackground();

    // Stars fading in as the edge approaches
    if (edgeApproach > 0.2) {
      ctx.fillStyle = `rgba(255,255,240,${(edgeApproach - 0.2) * 0.7})`;
      const stars = [[W*0.1,H*0.08],[W*0.3,H*0.04],[W*0.55,H*0.12],[W*0.72,H*0.06],[W*0.88,H*0.09],[W*0.42,H*0.02]];
      for (const [sx,sy] of stars) { ctx.beginPath(); ctx.arc(sx,sy,2.5,0,TAU); ctx.fill(); }
    }

    // Darkness vignette approaching the edge
    if (edgeApproach > 0) {
      const dg = ctx.createLinearGradient(0,0,W,0);
      dg.addColorStop(0,'rgba(0,0,0,0)');
      dg.addColorStop(1,`rgba(10,4,20,${edgeApproach*0.55})`);
      ctx.fillStyle = dg; ctx.fillRect(0,0,W,H);
    }

    drawCloudMist();

    // Platforms as fluffy clouds
    const gy = groundY();
    for (const p of platforms) {
      const sx = p.x - camX, sy = gy - p.y;
      if (sx + p.w < -20 || sx > W + 20) continue;
      drawCloudShape(sx, sy, p.w);
    }
    drawSpikes();
    drawCoins();
    if (gstate !== 'start') drawPlayer();
    drawParticles();

    // "Edge of clouds" warning text
    if (edgeApproach > 0.5) {
      ctx.save();
      ctx.globalAlpha = (edgeApproach - 0.5) * 1.6;
      ctx.fillStyle = '#fff0f6';
      ctx.font = 'bold 15px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Clouds running out…', W/2, H * 0.14);
      ctx.restore();
    }

    drawVignette();
  }

  function drawFalling() {
    const camY = Math.max(0, fallWorldY - H * 0.35);

    // Sky gradient (deepens as player falls)
    const depth = Math.min(1, fallWorldY / 6000);
    const sg = ctx.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, `hsl(${230 - depth*40},${70-depth*20}%,${40-depth*15}%)`);
    sg.addColorStop(0.6, CLOUD_PAL.skyTop);
    sg.addColorStop(1, CLOUD_PAL.skyBot);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

    // Parallax background puffs
    for (const o of FALL_OBS_DEFS) {
      const osy = o.wy * 0.25 - camY * 0.25;
      if (osy < -80 || osy > H + 80) continue;
      ctx.fillStyle = 'rgba(255,200,225,0.14)';
      ctx.beginPath(); ctx.ellipse(o.gapFrac * W * 0.8 + W * 0.1, osy, 110, 36, 0, 0, TAU); ctx.fill();
    }

    // Obstacles — approaching from below (higher world Y = first visible at bottom of screen)
    for (const o of FALL_OBS_DEFS) {
      const osy = o.wy - camY;
      if (osy + FALL_OBS_H < -10 || osy > H + 10) continue;
      drawFallingObstacle(osy, o.gapFrac * W, o.gapWFrac * W);
    }

    // ── Stage at bottom ────────────────────────────────────────────────────
    if (fallWorldY > FALL_WIN_Y - H * 1.5) {
      const stageY = FALL_WIN_Y - camY;
      // Stage floor (cloud platform)
      ctx.fillStyle = CLOUD_PAL.platformMid; ctx.fillRect(0, stageY, W, H - stageY + 30);
      ctx.fillStyle = CLOUD_PAL.platformSurf; ctx.fillRect(0, stageY, W, 6);

      // Stage backdrop curtains
      const cW = W * 0.38;
      ctx.fillStyle = '#6a1430';
      ctx.fillRect(0, stageY - 220, cW, 220);
      ctx.fillRect(W - cW, stageY - 220, cW, 220);
      // Curtain folds
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(i * cW/4, stageY - 220, 6, 220);
        ctx.fillRect(W - cW + i * cW/4, stageY - 220, 6, 220);
      }
      // Gold valance
      ctx.fillStyle = '#c8902a';
      ctx.fillRect(0, stageY - 224, cW, 8);
      ctx.fillRect(W - cW, stageY - 224, cW, 8);

      // Center backdrop
      ctx.fillStyle = '#1a0e28';
      ctx.fillRect(cW, stageY - 240, W - cW*2, 240);
      // Sign
      ctx.fillStyle = '#fff2c4'; ctx.fillRect(W/2 - 100, stageY - 200, 200, 44);
      ctx.fillStyle = '#1f0e26'; ctx.font = '700 italic 18px "Playfair Display", serif';
      ctx.textAlign = 'center'; ctx.fillText('MISS JUMP', W/2, stageY - 172);
      ctx.font = '500 9px "Inter", sans-serif'; ctx.fillStyle = '#7a3a4a';
      ctx.fillText('LIVE TONIGHT', W/2, stageY - 161);

      // Spotlights from above
      const beamA = 0.20;
      const mx = W * 0.5;
      const bg2 = ctx.createLinearGradient(mx, stageY - 240, mx, stageY);
      bg2.addColorStop(0, `rgba(255,240,200,${beamA})`); bg2.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = bg2; ctx.beginPath();
      ctx.moveTo(mx-15,stageY-240); ctx.lineTo(mx+15,stageY-240);
      ctx.lineTo(mx+160,stageY); ctx.lineTo(mx-160,stageY); ctx.closePath(); ctx.fill();

      // Mic stand
      drawMicStand(mx, stageY);
      drawSpeaker(mx - 180, stageY);
      drawSpeaker(mx + 180, stageY);
    }

    // Player
    const playerSY = fallWorldY - camY;
    ctx.save();
    ctx.translate(fallX, playerSY);
    ctx.rotate(0.08);
    renderMissLi(ctx, 0, 0, 0.6, -0.5, true, false, custom);
    ctx.restore();

    // Left/right touch zones (subtle)
    if (gstate === 'play') {
      if (fallHoldL > 0) { ctx.fillStyle = 'rgba(255,180,210,0.10)'; ctx.fillRect(0, 0, W/2, H); }
      if (fallHoldR > 0) { ctx.fillStyle = 'rgba(255,180,210,0.10)'; ctx.fillRect(W/2, 0, W/2, H); }
      // (direction arrow hints removed)
    }
  }

  function drawFallingObstacle(sy: number, gapX: number, gapW: number) {
    const C1 = CLOUD_PAL.platformMid, C2 = CLOUD_PAL.platformSurf;
    // Left block
    if (gapX > 0) {
      ctx.fillStyle = C1; ctx.fillRect(0, sy, gapX, FALL_OBS_H);
      ctx.fillStyle = C2;
      const n = Math.ceil(gapX / 28);
      for (let i = 0; i < n; i++) {
        const r = 16 + (i % 3) * 5;
        ctx.beginPath(); ctx.arc((i + 0.5) * gapX / n, sy, r, 0, TAU); ctx.fill();
      }
    }
    // Right block
    const rx = gapX + gapW;
    if (rx < W) {
      ctx.fillStyle = C1; ctx.fillRect(rx, sy, W - rx, FALL_OBS_H);
      ctx.fillStyle = C2;
      const n = Math.ceil((W - rx) / 28);
      for (let i = 0; i < n; i++) {
        const r = 16 + (i % 3) * 5;
        ctx.beginPath(); ctx.arc(rx + (i + 0.5) * (W - rx) / n, sy, r, 0, TAU); ctx.fill();
      }
    }
    // White highlights
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, sy, gapX, 3); ctx.fillRect(rx, sy, W-rx, 3);
  }

  // ── Drawing ──
  // Draw order guarantees trees are ALWAYS rendered before ground/obstacles/player:
  // sky → sun → clouds → mountains → waterfalls → farTrees → midTrees → mist
  // → platforms → spikes → coins → stage → player → particles → foregroundGrass → vignette

  function draw() {
    if (levelId === 3) { drawFlappy(); drawVignette(); return; }
    if (levelId === 4 && fall4Phase === 'run') { drawFall4Runner(); return; }
    if (levelId === 4) { drawFalling(); drawVignette(); return; }
    if (levelId === 5) { drawLevel5(); return; }
    if (levelId === 1) {
      drawSky(); drawSun(); drawClouds(); drawMountains();
      drawWaterfalls();
      drawFarTrees();   // parallax 0.25 — always behind platforms
      drawMidTrees();   // parallax 0.45 — always behind platforms
      drawGroundMist();
    } else {
      drawCloudSky();
      drawCloudBackground();
      drawCloudMist();
    }
    // World-scale elements — always in FRONT of all background/trees:
    drawPlatforms(); drawSpikes(); drawCoins(); drawStage();
    if (gstate !== 'start') drawPlayer();
    drawParticles();
    if (levelId === 1) drawForegroundGrass();
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
    if (levelId === 2) { drawCloudPlatforms(); return; }
    const gy = groundY();
    for (const p of platforms) {
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
    const isCloud = levelId === 2 || (levelId === 4 && fall4Phase === 'run');
    for (const s of spikeDefs) {
      const sx = s.x - camX, sy = gy - s.y;
      if (sx + SPIKE_W < -10 || sx > W + 10) continue;

      // Shadow under spike
      ctx.fillStyle = isCloud ? 'rgba(80,90,120,0.22)' : 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(sx + SPIKE_W/2, sy - 1, SPIKE_W*0.55, 4, 0, 0, TAU); ctx.fill();

      // Main spike body
      ctx.fillStyle = isCloud ? '#b0bcc8' : '#e8d8a8';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx+SPIKE_W/2, sy-SPIKE_H); ctx.lineTo(sx+SPIKE_W, sy); ctx.closePath(); ctx.fill();

      // Right face (depth)
      ctx.fillStyle = isCloud ? '#7a8898' : '#c0a870';
      ctx.beginPath(); ctx.moveTo(sx+SPIKE_W/2, sy-SPIKE_H); ctx.lineTo(sx+SPIKE_W/2+5, sy-SPIKE_H+14); ctx.lineTo(sx+SPIKE_W-3, sy-2); ctx.closePath(); ctx.fill();

      // Tip highlight
      ctx.fillStyle = isCloud ? '#dce8f0' : '#fff8e0';
      ctx.beginPath(); ctx.arc(sx+SPIKE_W/2, sy-SPIKE_H+1, 2, 0, TAU); ctx.fill();

      // Outline
      ctx.strokeStyle = isCloud ? '#5a6270' : '#1a1008'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx+SPIKE_W/2, sy-SPIKE_H); ctx.lineTo(sx+SPIKE_W, sy); ctx.stroke();

      // Base embedded in platform
      ctx.fillStyle = isCloud ? '#8090a0' : '#a89060'; ctx.fillRect(sx+3, sy-5, SPIKE_W-6, 5);
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
    const sp = platforms.find(p => p.isStage);
    if (!sp) return;
    const gy = groundY(), sx = sp.x - camX, sy = gy - sp.y;
    if (sx + sp.w < 0 || sx > W) return;
    const stageTopY = sy - 8;
    ctx.fillStyle = '#3a241a'; ctx.fillRect(sx, stageTopY, sp.w, H - stageTopY);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < sp.w; i += 70) ctx.fillRect(sx+i, stageTopY, 2, H-stageTopY);
    ctx.fillStyle = '#6a4530'; ctx.fillRect(sx, stageTopY, sp.w, 6);
    ctx.fillStyle = '#9a6a48'; ctx.fillRect(sx, stageTopY, sp.w, 2);

    const drapeX = finishX - 220 - camX, drapeW = 520, drapeY = stageTopY - 240;
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

    const mx = finishX - camX;
    drawMicStand(mx, stageTopY);
    const beamA = (gstate==='stage'||gstate==='win') ? 0.3 : 0.12;
    const bg = ctx.createLinearGradient(mx, drapeY+60, mx, stageTopY);
    bg.addColorStop(0, `rgba(255,240,200,${beamA})`); bg.addColorStop(1,'rgba(255,240,200,0)');
    ctx.fillStyle = bg; ctx.beginPath();
    ctx.moveTo(mx-12,drapeY+60); ctx.lineTo(mx+12,drapeY+60);
    ctx.lineTo(mx+140,stageTopY); ctx.lineTo(mx-140,stageTopY); ctx.closePath(); ctx.fill();
    drawSpeaker(finishX-200-camX, stageTopY);
    drawSpeaker(finishX+200-camX, stageTopY);
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
    renderMissLi(ctx, cx, cy, legSwing, armSwing, inAir, gstate==='stage'||gstate==='win', custom);
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

  // ── Level 2 cloud drawing functions ──────────────────────────────────────

  function drawCloudSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, CLOUD_PAL.skyTop); g.addColorStop(0.6, CLOUD_PAL.skyMid); g.addColorStop(1, CLOUD_PAL.skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Sun (high and bright)
    const sx = W * 0.72 - camX * 0.01, sy = H * 0.14;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 220);
    sg.addColorStop(0, CLOUD_PAL.sunGlow); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 250, sy - 250, 500, 500);
    ctx.fillStyle = CLOUD_PAL.sun; ctx.beginPath(); ctx.arc(sx, sy, 44, 0, TAU); ctx.fill();
  }

  function drawCloudBlob(x: number, y: number, w: number, h: number) {
    ctx.beginPath();
    ctx.ellipse(x + w*0.50, y + h*0.62, w*0.46, h*0.36, 0, 0, TAU);
    ctx.ellipse(x + w*0.26, y + h*0.58, w*0.28, h*0.28, 0, 0, TAU);
    ctx.ellipse(x + w*0.76, y + h*0.60, w*0.22, h*0.24, 0, 0, TAU);
    ctx.fill();
  }

  function drawCloudBackground() {
    // Far cloud formations (parallax 0.06)
    ctx.fillStyle = CLOUD_PAL.cloudFar;
    for (const c of CLOUD_SCENERY.mountains) {
      const x = c.x * 0.12 - camX * 0.06;
      if (x + c.w > -80 && x < W + 80) {
        ctx.globalAlpha = 0.38;
        drawCloudBlob(x, H * 0.45 - c.h * 0.35, c.w * 0.9, c.h * 0.55);
      }
    }
    ctx.globalAlpha = 1;

    // Mid clouds (parallax 0.22)
    ctx.fillStyle = CLOUD_PAL.cloudMid;
    for (const c of CLOUD_SCENERY.clouds) {
      const x = c.x * 0.22 - camX * 0.15;
      if (x + c.w > -60 && x < W + 60) {
        ctx.globalAlpha = c.o * 0.5;
        drawCloudBlob(x, c.y, c.w, c.w * 0.34);
      }
    }
    ctx.globalAlpha = 1;

    // Closer clouds (parallax 0.40) — more opaque
    ctx.fillStyle = '#eef5ff';
    for (const c of CLOUD_SCENERY.clouds) {
      const x = c.x * 0.40 - camX * 0.30;
      if (x + c.w * 0.7 > -40 && x < W + 40) {
        ctx.globalAlpha = c.o * 0.38;
        drawCloudBlob(x, c.y + H * 0.08, c.w * 0.65, c.w * 0.22);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawCloudMist() {
    const y = groundY();
    const g = ctx.createLinearGradient(0, y - 50, 0, y + 30);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, CLOUD_PAL.mist);
    ctx.fillStyle = g; ctx.fillRect(0, y - 50, W, 80);
  }

  function drawCloudPlatforms() {
    const gy = groundY();
    for (const p of platforms) {
      if (p.isStage) {
        drawCloudStagePlatform(p, gy);
        continue;
      }
      const sx = p.x - camX, sy = gy - p.y;
      if (sx + p.w < -20 || sx > W + 20) continue;
      drawCloudShape(sx, sy, p.w);
    }
  }

  function drawCloudShape(sx: number, sy: number, w: number) {
    // Seed must use WORLD x (not screen x) so the shape is stable as the camera scrolls
    const worldX = Math.round(sx + camX);
    let s = ((worldX * 73856093) ^ (w * 19349663)) >>> 0;
    const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };

    // Two rows of overlapping circles: base row + fluffy top row
    const puffs: { x: number; r: number; up: number }[] = [];
    // Base row — dense, smaller circles giving the flat-ish bottom
    for (let x = sx + 8; x < sx + w - 4;) {
      const r = 13 + rng() * 8;
      puffs.push({ x, r, up: 0 });
      x += r * 1.2 + rng() * 5;
    }
    // Fluffy top row — bigger circles raised above the base
    for (let x = sx + 18; x < sx + w - 12;) {
      const r = 18 + rng() * 16;
      puffs.push({ x, r, up: r * 0.65 });
      x += r * 1.12 + rng() * 10;
    }

    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(50,90,190,0.15)';
    for (const p of puffs.filter(p => p.up === 0)) {
      ctx.beginPath();
      ctx.ellipse(p.x + 4, sy + 11, p.r * 0.82, p.r * 0.3, 0, 0, TAU);
      ctx.fill();
    }
    // Layer 1 — deep rose (gives cloud depth)
    ctx.fillStyle = '#f0b0c8';
    for (const p of puffs) {
      ctx.beginPath(); ctx.arc(p.x, sy - p.up, p.r, 0, TAU); ctx.fill();
    }
    // Layer 2 — medium pink
    ctx.fillStyle = '#ffd9e6';
    for (const p of puffs) {
      ctx.beginPath(); ctx.arc(p.x, sy - p.up - 2, p.r * 0.88, 0, TAU); ctx.fill();
    }
    // Layer 3 — light blush
    ctx.fillStyle = '#ffe8f2';
    for (const p of puffs) {
      ctx.beginPath(); ctx.arc(p.x - 1, sy - p.up - 4, p.r * 0.74, 0, TAU); ctx.fill();
    }
    // Layer 4 — near white with pink tint
    ctx.fillStyle = '#fff0f6';
    for (const p of puffs) {
      ctx.beginPath(); ctx.arc(p.x - 1, sy - p.up - 6, p.r * 0.60, 0, TAU); ctx.fill();
    }
    // Layer 5 — pure white highlights
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    for (const p of puffs) {
      ctx.beginPath(); ctx.arc(p.x - 3, sy - p.up - p.r * 0.55, p.r * 0.36, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawCloudStagePlatform(p: PlatformDef, gy: number) {
    const sx = p.x - camX, sy = gy - p.y;
    if (sx + p.w < 0 || sx > W) return;
    // Very large cloud for stage — draw as stretched cloud
    const stageTopY = sy - 6;
    ctx.fillStyle = '#2a3060'; ctx.fillRect(sx, stageTopY, p.w, H - stageTopY); // dark base
    // Cloud top
    ctx.save();
    ctx.fillStyle = CLOUD_PAL.platformMid;
    ctx.beginPath(); ctx.roundRect(sx, stageTopY - 12, p.w, 16, [14, 14, 4, 4]); ctx.fill();
    ctx.fillStyle = CLOUD_PAL.platformSurf;
    ctx.fillRect(sx, stageTopY - 2, p.w, 4);
    ctx.restore();
  }

  function drawVignette() {
    const gr = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.5, W/2,H/2,Math.max(W,H)*0.85);
    gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(10,6,16,0.45)');
    ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
    ctx.fillStyle=pal.ambient; ctx.fillRect(0,0,W,H);
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
    if (gstate === 'win')  { tries = 1; startGame(); return; }
    if (gstate === 'lose') { tries++; startGame(); return; }
    if (gstate !== 'play') return;
    if (levelId === 3) { flVY = FL_FLAP_V; return; }
    if (levelId === 4 && fall4Phase === 'fall') return;
    if (levelId === 5) return; // level 5 input via pointerDown
    if (!player.alive) return;
    if (player.jumps < 2) {
      player.vy = player.jumps === 0 ? JUMP_VEL : JUMP_VEL * 0.86;
      if (player.jumps === 1) {
        spawnPuff(screenX(player.x), screenY(player.y, true));
        player.flipping = true; player.flipT = 0;
      }
      player.onGround = false; player.holding = true; player.holdTime = 0; player.jumps++;
    }
  }

  function releaseJump() {
    if (levelId <= 2 || (levelId === 4 && fall4Phase === 'run')) {
      if (player.vy < 0 && player.holding) {
        const t = Math.min(1, player.holdTime / MAX_HOLD);
        player.vy *= JUMP_CUT_MIN + (1 - JUMP_CUT_MIN) * t;
      }
      player.holding = false;
    }
  }

  function pointerDown(x: number, y: number) {
    if (gstate === 'start') { startGame(); return; }
    if (gstate === 'win')  { tries = 1; startGame(); return; }
    if (gstate === 'lose') { tries++; startGame(); return; }
    if (gstate !== 'play') return;
    if (levelId === 3) { flVY = FL_FLAP_V; return; }
    if (levelId === 4 && fall4Phase === 'fall') {
      if (x < W / 2) fallHoldL++; else fallHoldR++;
      return;
    }
    if (levelId === 5) {
      // Don't throw if tapping joystick zone (bottom-left 180px)
      if (!(x < 180 && y > H - 180)) throwMic(x, y);
      return;
    }
    pressJump();
  }

  function pointerUp(x: number, y: number) {
    if (levelId === 4 && fall4Phase === 'fall') {
      if (x < W / 2) fallHoldL = Math.max(0, fallHoldL - 1);
      else            fallHoldR = Math.max(0, fallHoldR - 1);
    } else {
      releaseJump();
    }
  }

  function setJoystick(dx: number, dy: number) {
    if (levelId === 5) { l5JDX = dx; l5JDY = dy; }
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
  }

  return { pressJump, releaseJump, pointerDown, pointerUp, setJoystick, destroy };
}
