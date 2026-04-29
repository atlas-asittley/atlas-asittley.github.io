import { startGame } from './game.js';

// Boot when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startGame);
} else {
  startGame();
}
