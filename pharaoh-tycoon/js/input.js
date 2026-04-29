import { TILE_SIZE, MAP_W, MAP_H, BUILDINGS } from './config.js';
import { canPlace, placeBuilding, getBuildingAt, removeBuilding } from './buildings.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { addMessage } from './messages.js';
import { initScenario } from './scenario.js';

const EDGE_SCROLL_ZONE = 30;
const SCROLL_SPEED = 8;
let mouseOverCanvas = false;

// ── Initialize input handlers ───────────────────────────────
export function initInput(state, canvas) {
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let camStartX = 0, camStartY = 0;
  let isDraggingBuild = false;

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = e.clientX - rect.left;
    state.mouse.y = e.clientY - rect.top;

    // Menu hover detection
    if (state.screen === 'menu' && state._menuButtons) {
      state._menuHover = -1;
      for (let i = 0; i < state._menuButtons.length; i++) {
        const b = state._menuButtons[i];
        if (state.mouse.x >= b.x && state.mouse.x <= b.x + b.w &&
            state.mouse.y >= b.y && state.mouse.y <= b.y + b.h) {
          state._menuHover = i;
          break;
        }
      }
      return;
    }

    // Update grid position
    state.mouseGrid.x = Math.floor((state.mouse.x + state.camera.x) / TILE_SIZE);
    state.mouseGrid.y = Math.floor((state.mouse.y + state.camera.y) / TILE_SIZE);

    // Update placement preview validity
    if (state.selectedBuildType) {
      state.canPlacePreview = canPlace(state, state.selectedBuildType, state.mouseGrid.x, state.mouseGrid.y);
    }

    // Camera panning with middle/right mouse
    if (isPanning) {
      state.camera.x = camStartX + (panStartX - e.clientX);
      state.camera.y = camStartY + (panStartY - e.clientY);
      clampCamera(state, canvas);
    }

    // Road drag-building
    if (isDraggingBuild && state.selectedBuildType === 'road') {
      if (canPlace(state, 'road', state.mouseGrid.x, state.mouseGrid.y)) {
        placeBuilding(state, 'road', state.mouseGrid.x, state.mouseGrid.y);
      }
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Menu click handling
    if (state.screen === 'menu' && state._menuButtons && e.button === 0) {
      for (const btn of state._menuButtons) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          if (btn.key === '_load') {
            if (loadGame(state)) {
              state.screen = state.scenario && state.scenario.won ? 'won' : 'playing';
              state._resetTiming();
              addMessage(state, 'Game loaded', 'info');
            }
          } else {
            state._resetState();
            initScenario(state, btn.key);
            state.screen = 'playing';
            state._resetTiming();
            if (btn.key !== 'sandbox') {
              addMessage(state, `Scenario: ${state.scenario.name}`, 'info');
            }
          }
          return;
        }
      }
      return;
    }

    // Check minimap click
    const mmW = 150, mmH = 100;
    const mmX = canvas.width - mmW - 10;
    const mmY = canvas.height - mmH - 10;
    if (mx >= mmX && mx <= mmX + mmW && my >= mmY && my <= mmY + mmH) {
      const mapX = ((mx - mmX) / mmW) * MAP_W * TILE_SIZE - canvas.width / 2;
      const mapY = ((my - mmY) / mmH) * MAP_H * TILE_SIZE - canvas.height / 2;
      state.camera.x = mapX;
      state.camera.y = mapY;
      clampCamera(state, canvas);
      return;
    }

    if (e.button === 1 || e.button === 2) {
      // Middle or right click → pan
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      camStartX = state.camera.x;
      camStartY = state.camera.y;
      e.preventDefault();
    } else if (e.button === 0) {
      const gx = state.mouseGrid.x;
      const gy = state.mouseGrid.y;

      if (state.selectedBuildType) {
        // Place building
        if (canPlace(state, state.selectedBuildType, gx, gy)) {
          placeBuilding(state, state.selectedBuildType, gx, gy);
          isDraggingBuild = true;
        }
      } else {
        // Select building
        const building = getBuildingAt(state, gx, gy);
        state.selectedBuilding = building;
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 1 || e.button === 2) isPanning = false;
    if (e.button === 0) isDraggingBuild = false;
  });

  canvas.addEventListener('mouseenter', () => { mouseOverCanvas = true; });
  canvas.addEventListener('mouseleave', () => { mouseOverCanvas = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Keyboard
  document.addEventListener('keydown', (e) => {
    // Don't process game keys on menu
    if (state.screen === 'menu') return;

    switch (e.key) {
      case 'Escape':
        state.selectedBuildType = null;
        state.selectedBuilding = null;
        document.querySelectorAll('.build-btn.active').forEach(b => b.classList.remove('active'));
        break;
      case 'Delete':
      case 'Backspace':
        if (state.selectedBuilding) {
          removeBuilding(state, state.selectedBuilding);
          state.selectedBuilding = null;
        }
        break;
      case 'g':
        state.showGrid = !state.showGrid;
        break;
      case 'v': case 'V': {
        // Cycle overlays: none → desirability → fire → collapse → none
        const cycle = [null, 'desirability', 'fire', 'collapse'];
        const idx = cycle.indexOf(state.overlay);
        state.overlay = cycle[(idx + 1) % cycle.length];
        break;
      }
      case '1': state.speed = 1; break;
      case '2': state.speed = 2; break;
      case '3': state.speed = 3; break;
      case ' ':
        state.speed = state.speed === 0 ? 1 : 0;
        e.preventDefault();
        break;
      // WASD camera
      case 'w': case 'W': state.keys.up = true; break;
      case 's': case 'S':
        // Ctrl+S = save, S alone = scroll
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (saveGame(state)) {
            addMessage(state, 'Game saved', 'success');
          } else {
            addMessage(state, 'Save failed!', 'danger');
          }
        } else {
          state.keys.down = true;
        }
        break;
      case 'a': case 'A': state.keys.left = true; break;
      case 'd': case 'D': state.keys.right = true; break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'w': case 'W': state.keys.up = false; break;
      case 's': case 'S': state.keys.down = false; break;
      case 'a': case 'A': state.keys.left = false; break;
      case 'd': case 'D': state.keys.right = false; break;
    }
  });
}

// ── Per-frame camera update (edge scroll + WASD) ────────────
export function updateCamera(state, canvas) {
  const { mouse, camera, keys } = state;
  let dx = 0, dy = 0;

  // Edge scrolling (only when mouse is over canvas)
  if (mouseOverCanvas) {
    if (mouse.x < EDGE_SCROLL_ZONE) dx -= SCROLL_SPEED;
    if (mouse.x > canvas.width - EDGE_SCROLL_ZONE) dx += SCROLL_SPEED;
    if (mouse.y < EDGE_SCROLL_ZONE) dy -= SCROLL_SPEED;
    if (mouse.y > canvas.height - EDGE_SCROLL_ZONE) dy += SCROLL_SPEED;
  }

  // WASD
  if (keys.up) dy -= SCROLL_SPEED;
  if (keys.down) dy += SCROLL_SPEED;
  if (keys.left) dx -= SCROLL_SPEED;
  if (keys.right) dx += SCROLL_SPEED;

  if (dx || dy) {
    camera.x += dx;
    camera.y += dy;
    clampCamera(state, canvas);

    // Update grid position after camera move
    state.mouseGrid.x = Math.floor((state.mouse.x + camera.x) / TILE_SIZE);
    state.mouseGrid.y = Math.floor((state.mouse.y + camera.y) / TILE_SIZE);
  }
}

// ── Clamp camera to map bounds ──────────────────────────────
function clampCamera(state, canvas) {
  state.camera.x = Math.max(0, Math.min(MAP_W * TILE_SIZE - canvas.width, state.camera.x));
  state.camera.y = Math.max(0, Math.min(MAP_H * TILE_SIZE - canvas.height, state.camera.y));
}
