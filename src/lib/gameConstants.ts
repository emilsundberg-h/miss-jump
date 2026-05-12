// Logical game resolution - scaled to fit screen
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 450;

export const GROUND_Y = 330; // ground surface y in logical coords
export const PLAYER_X = 110;

export const GRAVITY = 0.55;
export const JUMP_VELOCITY = -13.5;
export const MAX_JUMPS = 2; // double jump like Mr Jump

export const INITIAL_SPEED = 4.2;
export const MAX_SPEED = 10;
export const SPEED_INCREMENT = 0.0006;

export const PLAYER_WIDTH = 32;
export const PLAYER_HEIGHT = 62;

// Pastel palette - Miss Li vibes
export const C = {
  sky1: "#F5EEFF",
  sky2: "#FFE8F3",
  ground: "#F8C4D6",
  groundShade: "#F2A0BD",
  groundDot: "#FDDCE8",       // fixed dot pattern colour
  spike: "#FF85AD",
  spikeStroke: "#D95F8A",
  block: "#C9ADEE",
  blockTop: "#DDD0F8",
  blockStroke: "#9A6FCC",
  // Miss Li: strawberry-auburn hair, pale skin, light eyes
  hair: "#C8694A",            // deep strawberry auburn
  hairMid: "#D8835E",         // mid tone
  hairLight: "#E8A87A",       // highlight
  hairShadow: "#A04828",
  skin: "#F5DDD0",            // pale porcelain
  skinShadow: "#DFC0A8",
  // Outfit: sparkly teal/green sequined dress
  dress: "#6ECAB6",
  dressDark: "#48B09A",
  dressShine: "#A8EAD8",
  shoe: "#3A7868",
  eye: "#6A9FB0",             // slate blue
  eyeLine: "#1E3A48",
  brow: "#8A4830",
  mouth: "#C85068",
  blush: "#EEBCB0",
  earring: "#F0D060",
  particle: ["#FFB8D4", "#C9ADEE", "#7DD4C0", "#F5E0D0", "#FF85AD"],
  cloud: "#FFFFFF",
  cloudShadow: "#EDD8F5",
  hudText: "#7A4A9A",
  deadBg: "rgba(255,200,220,0.88)",
  tapHint: "#B080D0",
};
