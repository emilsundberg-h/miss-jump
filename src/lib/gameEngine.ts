import { GameState, Obstacle, GroundSegment, Particle, Cloud } from "./types";
import {
  GAME_WIDTH, GAME_HEIGHT, GROUND_Y, PLAYER_X,
  GRAVITY, JUMP_VELOCITY, MAX_JUMPS,
  INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT,
  PLAYER_WIDTH, PLAYER_HEIGHT, C,
} from "./gameConstants";

const SPIKE_H = 32;
const BLOCK_H = 40;
const BLOCK_W = 40;
const SPIKE_W = 55; // cluster width

export function createInitialState(): GameState {
  return {
    status: "idle",
    score: 0,
    highScore: 0,
    speed: INITIAL_SPEED,
    playerY: GROUND_Y - PLAYER_HEIGHT,
    playerVY: 0,
    isOnGround: true,
    jumpCount: 0,
    obstacles: [],
    cameraX: 0,
    groundSegments: buildInitialGround(),
    particles: [],
    clouds: buildInitialClouds(),
    runFrame: 0,
  };
}

function buildInitialGround(): GroundSegment[] {
  const segs: GroundSegment[] = [];
  let x = 0;
  // Long safe opening
  segs.push({ x, width: 600, isGap: false });
  x += 600;
  // Generate ahead
  while (x < GAME_WIDTH * 4) {
    segs.push(...generateGroundChunk(x));
    x = segs[segs.length - 1].x + segs[segs.length - 1].width;
  }
  return segs;
}

function generateGroundChunk(x: number): GroundSegment[] {
  const result: GroundSegment[] = [];
  // Solid segment
  const solidW = 160 + Math.random() * 220;
  result.push({ x, width: solidW, isGap: false });
  x += solidW;
  // Gap
  const gapW = 60 + Math.random() * 90;
  result.push({ x, width: gapW, isGap: true });
  x += gapW;
  return result;
}

function buildInitialClouds(): Cloud[] {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * GAME_WIDTH * 2,
      y: 30 + Math.random() * 120,
      width: 80 + Math.random() * 80,
      height: 40 + Math.random() * 20,
      speed: 0.3 + Math.random() * 0.4,
    });
  }
  return clouds;
}

export function jump(state: GameState): GameState {
  if (state.jumpCount >= MAX_JUMPS) return state;
  const particles = spawnJumpParticles(state);
  return {
    ...state,
    playerVY: JUMP_VELOCITY,
    isOnGround: false,
    jumpCount: state.jumpCount + 1,
    particles: [...state.particles, ...particles],
  };
}

function spawnJumpParticles(state: GameState): Particle[] {
  const px = PLAYER_X + PLAYER_WIDTH / 2;
  const py = state.playerY + PLAYER_HEIGHT;
  return Array.from({ length: 8 }, () => ({
    x: px + (Math.random() - 0.5) * 20,
    y: py,
    vx: (Math.random() - 0.5) * 3,
    vy: -(Math.random() * 3 + 1),
    alpha: 1,
    color: C.particle[Math.floor(Math.random() * C.particle.length)],
    size: 3 + Math.random() * 4,
  }));
}

export function startGame(state: GameState): GameState {
  return {
    ...createInitialState(),
    highScore: state.highScore,
    status: "running",
  };
}

export function tick(state: GameState): GameState {
  if (state.status !== "running") return state;

  const speed = Math.min(MAX_SPEED, state.speed + SPEED_INCREMENT);
  const cameraX = state.cameraX + speed;
  const score = state.score + speed * 0.03;
  const runFrame = state.runFrame + 1;

  // Physics
  const prevPlayerBottom = state.playerY + PLAYER_HEIGHT; // before this tick
  let playerVY = state.playerVY + GRAVITY;
  let playerY = state.playerY + playerVY;
  let isOnGround = false;
  let jumpCount = state.jumpCount;

  // Shared hitbox values
  const worldLeft = PLAYER_X + 4 + cameraX;
  const worldRight = PLAYER_X + PLAYER_WIDTH - 4 + cameraX;
  const worldHitLeft = PLAYER_X + 7 + cameraX;
  const worldHitRight = PLAYER_X + PLAYER_WIDTH - 7 + cameraX;

  // Ground collision
  for (const seg of state.groundSegments) {
    if (seg.isGap) continue;
    if (seg.x > worldRight || seg.x + seg.width < worldLeft) continue;
    const pBottom = playerY + PLAYER_HEIGHT;
    if (pBottom >= GROUND_Y && prevPlayerBottom <= GROUND_Y + 4) {
      playerY = GROUND_Y - PLAYER_HEIGHT;
      playerVY = 0;
      isOnGround = true;
      jumpCount = 0;
      break;
    }
  }

  // Check death by falling into gap
  if (playerY > GAME_HEIGHT + 60) {
    return die(state, score);
  }

  // Block collision — player can land on top
  for (const obs of state.obstacles) {
    if (obs.kind !== "block") continue;
    if (worldHitRight < obs.x || worldHitLeft > obs.x + obs.width) continue;
    const obsTop = GROUND_Y - obs.height;
    const pBottom = playerY + PLAYER_HEIGHT;
    // Landing on top: was above, now at or past the surface, moving down
    if (playerVY >= 0 && prevPlayerBottom <= obsTop + 4 && pBottom >= obsTop) {
      playerY = obsTop - PLAYER_HEIGHT;
      playerVY = 0;
      isOnGround = true;
      jumpCount = 0;
    } else if (pBottom > obsTop + 10 && playerY + 8 < GROUND_Y) {
      return die(state, score);
    }
  }

  // Spike collision
  for (const obs of state.obstacles) {
    if (obs.kind !== "spike") continue;
    if (worldHitRight < obs.x || worldHitLeft > obs.x + obs.width) continue;
    const obsTop = GROUND_Y - obs.height;
    if (playerY + PLAYER_HEIGHT - 4 > obsTop + 6 && playerY + 8 < GROUND_Y) {
      return die(state, score);
    }
  }

  // Extend ground ahead
  let groundSegments = state.groundSegments;
  const lastSeg = groundSegments[groundSegments.length - 1];
  if (lastSeg.x + lastSeg.width < cameraX + GAME_WIDTH * 2.5) {
    const newX = lastSeg.x + lastSeg.width;
    groundSegments = [...groundSegments, ...generateGroundChunk(newX)];
  }
  // Remove old segments
  groundSegments = groundSegments.filter(s => s.x + s.width > cameraX - 200);

  // Extend obstacles ahead
  let obstacles = state.obstacles;
  const lastObs = obstacles[obstacles.length - 1];
  const spawnX = cameraX + GAME_WIDTH + 200;
  if (!lastObs || lastObs.x < spawnX - 400) {
    const newObs = spawnObstacle(spawnX, groundSegments, score);
    if (newObs) obstacles = [...obstacles, newObs];
  }
  obstacles = obstacles.filter(o => o.x + o.width > cameraX - 100);

  // Clouds
  let clouds = state.clouds.map(c => ({
    ...c,
    x: c.x - c.speed,
  }));
  clouds = clouds.filter(c => c.x + c.width > -100);
  while (clouds.length < 6) {
    clouds.push({
      x: GAME_WIDTH + 100 + Math.random() * 200,
      y: 30 + Math.random() * 120,
      width: 80 + Math.random() * 80,
      height: 40 + Math.random() * 20,
      speed: 0.3 + Math.random() * 0.4,
    });
  }

  // Particles
  const particles = state.particles
    .map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + 0.15,
      alpha: p.alpha - 0.04,
    }))
    .filter(p => p.alpha > 0);

  return {
    ...state,
    speed,
    cameraX,
    score,
    runFrame,
    playerY,
    playerVY,
    isOnGround,
    jumpCount,
    obstacles,
    groundSegments,
    clouds,
    particles,
  };
}

function spawnObstacle(x: number, groundSegments: GroundSegment[], score: number): Obstacle | null {
  const r = Math.random();
  const difficulty = Math.min(1, score / 300);
  const obsWidth = r < 0.55 + difficulty * 0.1 ? SPIKE_W : BLOCK_W;

  // Entire obstacle footprint must be on solid ground
  const fullyOnSolid = groundSegments.some(
    s => !s.isGap && s.x <= x && s.x + s.width >= x + obsWidth
  );
  if (!fullyOnSolid) return null;

  if (r < 0.55 + difficulty * 0.1) {
    return { kind: "spike", x, width: SPIKE_W, height: SPIKE_H };
  }
  return { kind: "block", x, width: BLOCK_W, height: BLOCK_H + Math.random() * 20 };
}

function die(state: GameState, score: number): GameState {
  const highScore = Math.max(state.highScore, score);
  return {
    ...state,
    status: "dead",
    score,
    highScore,
    playerVY: JUMP_VELOCITY * 0.5,
  };
}
