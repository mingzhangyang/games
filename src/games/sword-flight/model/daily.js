/** The game-local names for the shared UTC+8 daily clock. */
export const getDailyDateKey = todayKey;
export const getDailyDateString = todayKeyDisplay;
export const getDailyLeaderboardKey = (dateKey = todayKey()) => `sword-flight-d${dateKey}`;
import { todayKey, todayKeyDisplay } from '../../../platform/daily.js';
