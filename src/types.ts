export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  elo: number;
  wins: number;
  losses: number;
  lastCharacter?: string;
  bio?: string;
  isBanned?: boolean;
}

export interface Match {
  id: string;
  player1: string;
  player2?: string;
  player1Char?: string;
  player2Char?: string;
  player1Score: number;
  player2Score: number;
  status: 'waiting' | 'playing' | 'finished';
  ballPos: { x: number; y: number; vx: number; vy: number };
  player1Pos: { x: number; y: number };
  player2Pos: { x: number; y: number };
  createdAt: any;
  updatedAt: any;
  winner?: string;
  timeRemaining?: number;
}

export interface Character {
  id: string;
  name: string;
  speed: number;
  power: number;
  size: number;
  color: string;
  imageUrl: string;
}

export interface Bot {
  id: string;
  name: string;
  elo: number;
  difficulty: 'easy' | 'medium' | 'hard';
  charId: string;
}

export const BOTS: Bot[] = [
  { id: 'bot_easy', name: 'Котик-Новичок', elo: 800, difficulty: 'easy', charId: 'karamelka' },
  { id: 'bot_medium', name: 'Котик-Мастер', elo: 1200, difficulty: 'medium', charId: 'korzhik' },
  { id: 'bot_hard', name: 'Котик-Профи', elo: 1600, difficulty: 'hard', charId: 'kompot' }
];

export const CHARACTERS: Character[] = [
  {
    id: 'korzhik',
    name: 'Коржик',
    speed: 1.3,
    power: 1.1,
    size: 1.0,
    color: '#FF9800',
    imageUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=korzhik&backgroundColor=ff9800'
  },
  {
    id: 'karamelka',
    name: 'Карамелька',
    speed: 1.1,
    power: 0.9,
    size: 0.9,
    color: '#E91E63',
    imageUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=karamelka&backgroundColor=e91e63'
  },
  {
    id: 'kompot',
    name: 'Компот',
    speed: 0.9,
    power: 1.3,
    size: 1.2,
    color: '#4CAF50',
    imageUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=kompot&backgroundColor=4caf50'
  }
];
