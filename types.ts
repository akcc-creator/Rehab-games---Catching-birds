
export interface Point {
  x: number;
  y: number;
}

export interface HandData {
  x: number;
  y: number;
  side: 'Left' | 'Right';
}

export enum GameObjectType {
  BIRD = 'BIRD',
  BOMB = 'BOMB',
}

export interface GameObject {
  id: string;
  type: GameObjectType;
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  color: string;
  caught: boolean;
  emoji: string;
  flapPhase: number; // For animation timing
}

export interface GameState {
  score: number;
  isPlaying: boolean;
  gameOver: boolean;
  lives: number;
  highScore: number;
}

// New Visual Effects Types
export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0 to 1
  color: string;
  size: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  life: number; // 0 to 1
  color: string;
}

export interface Cloud {
  x: number;
  y: number;
  speed: number;
  scale: number;
  opacity: number;
}
