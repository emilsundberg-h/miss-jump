export interface Obstacle {
  kind: "spike" | "block" | "gap";
  x: number;
  width: number;
  height: number;
}

export interface GroundSegment {
  x: number;
  width: number;
  isGap: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
}

export interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

export interface GameState {
  status: "idle" | "running" | "dead";
  score: number;
  highScore: number;
  speed: number;
  playerY: number;
  playerVY: number;
  isOnGround: boolean;
  jumpCount: number;
  obstacles: Obstacle[];
  cameraX: number;
  groundSegments: GroundSegment[];
  particles: Particle[];
  clouds: Cloud[];
  runFrame: number;
}
