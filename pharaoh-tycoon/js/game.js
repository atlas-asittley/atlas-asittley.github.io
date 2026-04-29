import { SIM_INTERVAL_MS } from './config.js';
import { createGrid } from './grid.js';
import { canPlace, placeBuilding, removeBuilding } from './buildings.js';
import { tick } from './simulation.js';
import { render } from './renderer.js';
import { initInput, updateCamera } from './input.js';
import { initUI, updateHUD } from './ui.js';

// ── Create initial game state ───────────────────────────────
function createState() {
  return {
    grid: createGrid(),
    buildings: [],
    nextBuildingId: 1,
    population: { total: 0, employed: 0, unemployed: 0, capacity: 0 },
    treasury: { gold: 1000, income: 0, expenses: 0 },
    food: { stored: 0, capacity: 0 },
    camera: { x: 800, y: 400 },  // start roughly center
    mouse: { x: 400, y: 300 },
    mouseGrid: { x: -1, y: -1 },
    keys: { up: false, down: false, left: false, right: false },
    selectedBuildType: null,
    selectedBuilding: null,
    canPlacePreview: false,
    showGrid: true,
    speed: 1,    // 0=paused, 1-3 = speed multiplier
    tick: 0,
    time: { year: 1, month: 1 },
    // Module reference for UI demolish button
    _buildingModule: { removeBuilding },
  };
}

// ── Main entry point ────────────────────────────────────────
export function startGame() {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  // Resize canvas to fill viewport
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 40; // leave room for top HUD
  }
  resize();
  window.addEventListener('resize', resize);

  const state = createState();
  initInput(state, canvas);
  initUI(state);

  let lastSim = performance.now();

  // ── Game loop ───────────────────────────────────────────
  function loop(now) {
    // Camera
    updateCamera(state, canvas);

    // Simulation ticks (speed-adjusted)
    if (state.speed > 0) {
      const interval = SIM_INTERVAL_MS / state.speed;
      while (now - lastSim >= interval) {
        tick(state);
        lastSim += interval;
      }
    } else {
      lastSim = now; // don't accumulate ticks while paused
    }

    // Render
    render(ctx, state);

    // HUD
    updateHUD(state);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
