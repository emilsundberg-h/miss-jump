import { GameState, GroundSegment, Obstacle, Particle, Cloud } from "./types";
import { C, GAME_WIDTH, GAME_HEIGHT, GROUND_Y, PLAYER_X, PLAYER_WIDTH, PLAYER_HEIGHT } from "./gameConstants";

export function render(ctx: CanvasRenderingContext2D, state: GameState) {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawSky(ctx);
  drawClouds(ctx, state.clouds, state.cameraX);
  drawGround(ctx, state.groundSegments, state.cameraX);
  drawObstacles(ctx, state.obstacles, state.cameraX);
  drawPlayer(ctx, state);
  drawParticles(ctx, state.particles);
  drawHUD(ctx, state);
  if (state.status === "idle") drawStartScreen(ctx);
  if (state.status === "dead") drawDeadScreen(ctx, state);
}

function drawSky(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  grad.addColorStop(0, "#EEE4FA");
  grad.addColorStop(1, "#FAE8F0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function drawClouds(ctx: CanvasRenderingContext2D, clouds: Cloud[], cameraX: number) {
  for (const c of clouds) {
    const x = c.x - cameraX * 0.28;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    drawCloudShape(ctx, x + 3, c.y + 4, c.width, c.height);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    drawCloudShape(ctx, x, c.y, c.width, c.height);
    ctx.restore();
  }
}

function drawCloudShape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.62, w * 0.46, h * 0.38, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.28, y + h * 0.58, w * 0.26, h * 0.32, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.74, y + h * 0.6, w * 0.22, h * 0.30, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround(ctx: CanvasRenderingContext2D, segments: GroundSegment[], cameraX: number) {
  const groundH = GAME_HEIGHT - GROUND_Y;
  const DOT_STEP = 36;
  const DOT_R = 2.2;

  for (const seg of segments) {
    if (seg.isGap) continue;
    const sx = seg.x - cameraX;
    if (sx + seg.width < 0 || sx > GAME_WIDTH) continue;

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, GROUND_Y, seg.width, groundH);
    ctx.clip();

    // Body gradient
    const grad = ctx.createLinearGradient(0, GROUND_Y, 0, GAME_HEIGHT);
    grad.addColorStop(0, "#EDAFC4");
    grad.addColorStop(1, "#D898AE");
    ctx.fillStyle = grad;
    ctx.fillRect(sx, GROUND_Y, seg.width, groundH);

    // Fixed dot grid in world coords
    ctx.fillStyle = "rgba(255,230,240,0.45)";
    const c0 = Math.floor(seg.x / DOT_STEP);
    const c1 = Math.ceil((seg.x + seg.width) / DOT_STEP);
    const r0 = Math.floor((GROUND_Y + 14) / DOT_STEP);
    const r1 = Math.ceil(GAME_HEIGHT / DOT_STEP);
    for (let col = c0; col <= c1; col++) {
      for (let row = r0; row <= r1; row++) {
        ctx.beginPath();
        ctx.arc(col * DOT_STEP - cameraX, row * DOT_STEP, DOT_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Top surface line
    ctx.fillStyle = "#F8D0E0";
    ctx.fillRect(sx, GROUND_Y, seg.width, 3);

    // Right-edge shadow
    ctx.fillStyle = "rgba(180,100,130,0.25)";
    ctx.fillRect(sx + seg.width - 4, GROUND_Y, 4, groundH);

    ctx.restore();
  }
}

function drawObstacles(ctx: CanvasRenderingContext2D, obstacles: Obstacle[], cameraX: number) {
  for (const obs of obstacles) {
    const sx = obs.x - cameraX;
    if (sx + obs.width < 0 || sx > GAME_WIDTH) continue;
    if (obs.kind === "spike") drawSpike(ctx, sx, obs.width, obs.height);
    if (obs.kind === "block") drawBlock(ctx, sx, GROUND_Y - obs.height, obs.width, obs.height);
  }
}

function drawSpike(ctx: CanvasRenderingContext2D, x: number, w: number, h: number) {
  const count = Math.round(w / 20);
  const sw = w / count;
  // Base sits 3px into the ground so there's never a floating gap
  const base = GROUND_Y + 3;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const sx = x + i * sw;
    ctx.beginPath();
    ctx.moveTo(sx + 1, base);
    ctx.lineTo(sx + sw / 2, GROUND_Y - h);
    ctx.lineTo(sx + sw - 1, base);
    ctx.closePath();
    const grad = ctx.createLinearGradient(sx, GROUND_Y - h, sx, base);
    grad.addColorStop(0, "#E8A0B8");
    grad.addColorStop(1, "#C05878");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#A83C60";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  // Drop shadow
  ctx.fillStyle = "rgba(120,80,160,0.12)";
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 4, w, h, 5);
  ctx.fill();
  // Body
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#C8B8E8");
  grad.addColorStop(0.5, "#B0A0D4");
  grad.addColorStop(1, "#9888C0");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  // Top landing surface (lighter, clearly walkable)
  ctx.fillStyle = "#DCCEF8";
  ctx.beginPath();
  ctx.roundRect(x, y, w, 7, [5, 5, 0, 0]);
  ctx.fill();
  // Subtle edge
  ctx.strokeStyle = "#8870B8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState) {
  const x = PLAYER_X;
  const y = state.playerY;
  const frame = state.runFrame;
  const dead = state.status === "dead";
  const airborne = !state.isOnGround;

  ctx.save();
  if (dead) {
    ctx.globalAlpha = 0.75;
    ctx.translate(x + PLAYER_WIDTH / 2, y + PLAYER_HEIGHT / 2);
    ctx.rotate(0.4);
    ctx.translate(-(x + PLAYER_WIDTH / 2), -(y + PLAYER_HEIGHT / 2));
  }
  drawMissLi(ctx, x, y, frame, airborne);
  ctx.restore();
}

function drawMissLi(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, airborne: boolean) {
  const cx = x + PLAYER_WIDTH / 2;

  // Animation
  const t = frame * 0.36;
  const leg1 = airborne ? 16 : Math.sin(t) * 16;
  const leg2 = airborne ? -16 : Math.sin(t + Math.PI) * 16;
  const arm1 = airborne ? -12 : Math.sin(t + 0.9) * 10;

  // Ground shadow
  ctx.save();
  ctx.fillStyle = "rgba(160,70,110,0.13)";
  ctx.beginPath();
  ctx.ellipse(cx, y + PLAYER_HEIGHT + 2, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── HAIR (back layer — behind everything) ──────────────────────────────
  ctx.save();

  // Left side: large volume, flows past shoulders
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.moveTo(cx - 6, y + 2);
  ctx.bezierCurveTo(cx - 22, y - 6, cx - 28, y + 8, cx - 26, y + 22);
  ctx.bezierCurveTo(cx - 24, y + 36, cx - 20, y + 50, cx - 15, y + 58);
  ctx.bezierCurveTo(cx - 10, y + 52, cx - 8, y + 36, cx - 10, y + 22);
  ctx.bezierCurveTo(cx - 14, y + 10, cx - 8, y + 2, cx - 6, y + 2);
  ctx.fill();

  // Left inner shadow for depth
  ctx.fillStyle = C.hairShadow;
  ctx.beginPath();
  ctx.moveTo(cx - 10, y + 8);
  ctx.bezierCurveTo(cx - 20, y + 10, cx - 22, y + 24, cx - 18, y + 38);
  ctx.bezierCurveTo(cx - 14, y + 50, cx - 12, y + 54, cx - 12, y + 54);
  ctx.bezierCurveTo(cx - 10, y + 48, cx - 10, y + 34, cx - 12, y + 20);
  ctx.bezierCurveTo(cx - 14, y + 10, cx - 10, y + 8, cx - 10, y + 8);
  ctx.fill();

  // Right side: smaller, visible behind right cheek
  ctx.fillStyle = C.hairMid;
  ctx.beginPath();
  ctx.moveTo(cx + 7, y + 2);
  ctx.bezierCurveTo(cx + 18, y - 2, cx + 20, y + 10, cx + 18, y + 24);
  ctx.bezierCurveTo(cx + 14, y + 38, cx + 11, y + 50, cx + 10, y + 56);
  ctx.bezierCurveTo(cx + 6, y + 48, cx + 8, y + 34, cx + 10, y + 20);
  ctx.bezierCurveTo(cx + 13, y + 8, cx + 9, y + 0, cx + 7, y + 2);
  ctx.fill();

  ctx.restore();

  // ── BACK ARM ──────────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = C.skinShadow;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 8, y + 26);
  ctx.quadraticCurveTo(cx - 14, y + 34 + arm1, cx - 12, y + 42 + arm1 * 0.5);
  ctx.stroke();
  ctx.restore();

  // ── LEGS ──────────────────────────────────────────────────────────────
  ctx.save();
  ctx.lineCap = "round";
  // Back leg (dress colour, darker)
  ctx.strokeStyle = C.dressDark;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx - 2, y + 46);
  ctx.lineTo(cx - 2 - leg2 * 0.3, y + PLAYER_HEIGHT - 2);
  ctx.stroke();
  // Front leg
  ctx.strokeStyle = C.dress;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx + 2, y + 46);
  ctx.lineTo(cx + 2 - leg1 * 0.3, y + PLAYER_HEIGHT - 2);
  ctx.stroke();
  ctx.restore();

  // ── SHOES ──────────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = C.shoe;
  ctx.beginPath();
  ctx.ellipse(cx - 2 - leg2 * 0.3, y + PLAYER_HEIGHT + 1, 7, 3.5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 2 - leg1 * 0.3, y + PLAYER_HEIGHT + 1, 7, 3.5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── DRESS ──────────────────────────────────────────────────────────────
  ctx.save();
  // Flared skirt bottom (y+38 to y+48)
  const dressGrad = ctx.createLinearGradient(cx - 14, y + 22, cx + 14, y + 48);
  dressGrad.addColorStop(0, C.dressShine);
  dressGrad.addColorStop(0.35, C.dress);
  dressGrad.addColorStop(1, C.dressDark);
  ctx.fillStyle = dressGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 10, y + 24);
  ctx.lineTo(cx + 10, y + 24);
  ctx.lineTo(cx + 14, y + 48);
  ctx.lineTo(cx - 14, y + 48);
  ctx.closePath();
  ctx.fill();

  // Sequin sparkles
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  const sparkles: [number, number][] = [
    [cx - 4, y + 28], [cx + 5, y + 30], [cx + 1, y + 36],
    [cx - 6, y + 39], [cx + 7, y + 40], [cx - 1, y + 44],
    [cx + 4, y + 25],
  ];
  for (const [sx, sy] of sparkles) {
    ctx.beginPath();
    ctx.arc(sx, sy, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ── NECK ──────────────────────────────────────────────────────────────
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.roundRect(cx - 3, y + 18, 6, 7, 2);
  ctx.fill();

  // ── HEAD ──────────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = C.skin;
  ctx.beginPath();
  ctx.ellipse(cx, y + 10, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Jawline shade
  ctx.fillStyle = C.skinShadow;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(cx + 1, y + 15, 7, 5, 0.1, 0, Math.PI);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── HAIR (top / front layer — over face) ──────────────────────────────
  ctx.save();
  // Top crown mass
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.ellipse(cx - 1, y + 4, 11, 8, -0.05, 0, Math.PI * 2);
  ctx.fill();

  // Forehead sweep (natural parting, sweeps to right)
  ctx.beginPath();
  ctx.moveTo(cx - 10, y + 4);
  ctx.bezierCurveTo(cx - 4, y - 3, cx + 6, y - 2, cx + 10, y + 5);
  ctx.bezierCurveTo(cx + 6, y + 3, cx - 2, y + 2, cx - 8, y + 7);
  ctx.closePath();
  ctx.fill();

  // Hair highlight streak
  ctx.fillStyle = C.hairLight;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.ellipse(cx + 2, y + 1, 5, 3.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Small right-side strand framing cheek
  ctx.fillStyle = C.hairMid;
  ctx.beginPath();
  ctx.moveTo(cx + 9, y + 6);
  ctx.bezierCurveTo(cx + 14, y + 10, cx + 13, y + 20, cx + 10, y + 24);
  ctx.bezierCurveTo(cx + 7, y + 18, cx + 9, y + 10, cx + 10, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── BLUSH ─────────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = C.blush;
  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  ctx.ellipse(cx - 5.5, y + 12, 3.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 5.5, y + 12, 3.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── BROWS ─────────────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = C.brow;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 7, y + 6.5);
  ctx.bezierCurveTo(cx - 5, y + 5, cx - 2, y + 5.5, cx - 1, y + 6.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 2, y + 6.5);
  ctx.bezierCurveTo(cx + 3, y + 5.5, cx + 5.5, y + 5.5, cx + 7, y + 6.5);
  ctx.stroke();
  ctx.restore();

  // ── EYES ──────────────────────────────────────────────────────────────
  ctx.save();
  // Eyeliner — thin, with a flick
  ctx.strokeStyle = C.eyeLine;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 7.5, y + 9);
  ctx.lineTo(cx - 1.5, y + 8.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 1.5, y + 8.2);
  ctx.lineTo(cx + 7, y + 9);
  ctx.lineTo(cx + 8.5, y + 7.5); // flick
  ctx.stroke();

  // Iris
  ctx.fillStyle = C.eye;
  ctx.beginPath();
  ctx.ellipse(cx - 4.5, y + 10, 2.6, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 4.5, y + 10, 2.6, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pupil
  ctx.fillStyle = "#182830";
  ctx.beginPath();
  ctx.ellipse(cx - 4.5, y + 10.3, 1.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 4.5, y + 10.3, 1.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Catchlight
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(cx - 3.6, y + 9.2, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5.4, y + 9.2, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── LIPS ──────────────────────────────────────────────────────────────
  ctx.save();
  // Upper lip (Cupid's bow)
  ctx.fillStyle = C.mouth;
  ctx.beginPath();
  ctx.moveTo(cx - 4, y + 15.5);
  ctx.bezierCurveTo(cx - 2.5, y + 14, cx - 1, y + 14.8, cx, y + 14.3);
  ctx.bezierCurveTo(cx + 1, y + 14.8, cx + 2.5, y + 14, cx + 4, y + 15.5);
  ctx.bezierCurveTo(cx + 2, y + 15, cx - 2, y + 15, cx - 4, y + 15.5);
  ctx.fill();
  // Lower lip
  ctx.beginPath();
  ctx.moveTo(cx - 3.8, y + 15.5);
  ctx.bezierCurveTo(cx - 2, y + 18, cx + 2, y + 18, cx + 3.8, y + 15.5);
  ctx.bezierCurveTo(cx + 2, y + 16.5, cx - 2, y + 16.5, cx - 3.8, y + 15.5);
  ctx.fill();
  // Lip shine
  ctx.fillStyle = "rgba(255,200,210,0.5)";
  ctx.beginPath();
  ctx.ellipse(cx + 1, y + 16.5, 2, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── EARRING ────────────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = C.earring;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx + 9.5, y + 11, 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.earring;
  ctx.beginPath();
  ctx.arc(cx + 9.5, y + 11, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 9.5, y + 13);
  ctx.lineTo(cx + 9.5, y + 17);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 9.5, y + 18.2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── FRONT ARM ─────────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = C.skin;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + 8, y + 26);
  ctx.quadraticCurveTo(cx + 15, y + 34 - arm1, cx + 13, y + 42 - arm1 * 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState) {
  if (state.status === "idle" || state.status === "dead") return;
  ctx.save();
  ctx.fillStyle = C.hudText;
  ctx.font = "bold 20px 'Georgia', serif";
  ctx.textAlign = "right";
  ctx.fillText(`${Math.floor(state.score)} m`, GAME_WIDTH - 18, 34);
  if (state.score < 5) {
    ctx.font = "15px 'Georgia', serif";
    ctx.fillStyle = C.tapHint;
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.65;
    ctx.fillText("tryck för att hoppa", GAME_WIDTH / 2, GAME_HEIGHT - 22);
  }
  ctx.restore();
}

function drawStartScreen(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = "rgba(240,228,255,0.88)";
  ctx.beginPath();
  ctx.roundRect(GAME_WIDTH / 2 - 155, GAME_HEIGHT / 2 - 64, 310, 130, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(180,140,220,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#5A2A82";
  ctx.font = "bold 34px 'Georgia', serif";
  ctx.fillText("Miss Jump", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 18);

  ctx.font = "17px 'Georgia', serif";
  ctx.fillStyle = C.tapHint;
  ctx.fillText("tryck för att starta", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16);

  ctx.font = "13px 'Georgia', serif";
  ctx.fillStyle = "#A878CC";
  ctx.fillText("dubbeltryck = dubbelhopp", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
  ctx.restore();
}

function drawDeadScreen(ctx: CanvasRenderingContext2D, state: GameState) {
  ctx.save();
  ctx.fillStyle = "rgba(255,210,225,0.9)";
  ctx.beginPath();
  ctx.roundRect(GAME_WIDTH / 2 - 155, GAME_HEIGHT / 2 - 76, 310, 154, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(200,100,140,0.25)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#A02848";
  ctx.font = "bold 30px 'Georgia', serif";
  ctx.fillText("Hoppsan!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 28);

  ctx.font = "20px 'Georgia', serif";
  ctx.fillStyle = C.hudText;
  ctx.fillText(`${Math.floor(state.score)} meter`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 6);

  if (state.highScore > 0) {
    ctx.font = "13px 'Georgia', serif";
    ctx.fillStyle = "#9060C0";
    ctx.fillText(`Rekord: ${Math.floor(state.highScore)} m`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
  }

  ctx.font = "15px 'Georgia', serif";
  ctx.fillStyle = C.tapHint;
  ctx.fillText("tryck för att försöka igen", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 58);
  ctx.restore();
}
