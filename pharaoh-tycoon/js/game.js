import { SIM_INTERVAL_MS, WALKER_STEP_MS } from './config.js';
import { createGrid } from './grid.js';
import { tick } from './simulation.js';
import { stepWalkers } from './walkers.js';
import { render } from './renderer.js';
import { renderMenuScreen } from './menu.js';
import { initInput, updateCamera } from './input.js';
import { initUI, updateHUD } from './ui.js';
import { updateScenario } from './scenario.js';
import { initMessages, addMessage, tickMessages } from './messages.js';

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
    overlay: null,   // null, 'desirability', 'fire', 'collapse'
    speed: 1,    // 0=paused, 1-3 = speed multiplier
    tick: 0,
    time: { year: 1, month: 1 },
    walkers: [],
    walkerProgress: 0,
    messages: [],
    scenario: null,
    // screen: 'menu' | 'playing' | 'won'
    screen: 'menu',
    _resetState: null, // set after creation
  };
}

// ── Main entry point ────────────────────────────────────────
export function startGame() {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const state = createState();

  // Resize canvas to fill viewport
  function resize() {
    canvas.width = window.innerWidth;
    // On menu screen, use full height; during gameplay, leave room for HUD
    canvas.height = state.screen === 'menu'
      ? window.innerHeight
      : window.innerHeight - 40;
  }
  resize();
  window.addEventListener('resize', resize);
  initMessages(state);
  initInput(state, canvas);
  initUI(state);

  let lastSim = performance.now();
  let lastWalkerStep = performance.now();
  let lastScreen = state.screen;

  // ── Game loop ───────────────────────────────────────────
  function loop(now) {
    // Resize canvas on screen transitions
    if (state.screen !== lastScreen) {
      resize();
      lastScreen = state.screen;
    }

    if (state.screen === 'menu') {
      // Menu screen — hide game UI, render menu
      updateHUD(state); // applies hidden classes
      renderMenuScreen(ctx, canvas, state);
      requestAnimationFrame(loop);
      return;
    }

    // Camera
    updateCamera(state, canvas);

    // Simulation ticks (speed-adjusted)
    if (state.speed > 0) {
      const interval = SIM_INTERVAL_MS / state.speed;
      while (now - lastSim >= interval) {
        tick(state);
        updateScenario(state);
        lastSim += interval;
      }

      // Walker stepping (faster than sim ticks for fluid movement)
      const walkerInterval = WALKER_STEP_MS / state.speed;
      while (now - lastWalkerStep >= walkerInterval) {
        stepWalkers(state);
        lastWalkerStep += walkerInterval;
      }
      state.walkerProgress = (now - lastWalkerStep) / walkerInterval;
    } else {
      lastSim = now;
      lastWalkerStep = now;
    }

    // Check for win
    if (state.scenario && state.scenario.won && state.screen !== 'won') {
      state.screen = 'won';
      addMessage(state, 'All objectives complete! You have pleased Pharaoh!', 'success');
    }

    // Tick messages (frame-based, not sim-based)
    tickMessages(state);

    // Render
    render(ctx, state);

    // HUD
    updateHUD(state);

    requestAnimationFrame(loop);
  }

  // Reset sim timing when transitioning from menu to playing
  state._resetTiming = function() {
    lastSim = performance.now();
    lastWalkerStep = performance.now();
    resize(); // re-adjust canvas height for gameplay
  };

  // Reset game state for new game (preserves module refs and screen)
  state._resetState = function() {
    state.grid = createGrid();
    state.buildings = [];
    state.nextBuildingId = 1;
    state.population = { total: 0, employed: 0, unemployed: 0, capacity: 0 };
    state.treasury = { gold: 1000, income: 0, expenses: 0 };
    state.food = { stored: 0, capacity: 0 };
    state.camera = { x: 800, y: 400 };
    state.selectedBuildType = null;
    state.selectedBuilding = null;
    state.canPlacePreview = false;
    state.showGrid = true;
    state.overlay = null;
    state.speed = 1;
    state.tick = 0;
    state.time = { year: 1, month: 1 };
    state.walkers = [];
    state.walkerProgress = 0;
    state.messages = [];
  };

  requestAnimationFrame(loop);
}

