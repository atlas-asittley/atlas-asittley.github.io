import { BUILDINGS, HOUSING_LEVELS } from './config.js';
import { removeBuilding } from './buildings.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { addMessage } from './messages.js';
import { goalProgress } from './scenario.js';

// ── Build menu setup ────────────────────────────────────────
export function initUI(state) {
  const menu = document.getElementById('build-menu');
  const categories = {};

  // Group buildings by category
  for (const [key, def] of Object.entries(BUILDINGS)) {
    if (!categories[def.category]) categories[def.category] = [];
    categories[def.category].push({ key, ...def });
  }

  // Render menu
  for (const [cat, items] of Object.entries(categories)) {
    const catDiv = document.createElement('div');
    catDiv.className = 'build-category';

    const catLabel = document.createElement('div');
    catLabel.className = 'category-label';
    catLabel.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    catDiv.appendChild(catLabel);

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.dataset.type = item.key;
      btn.innerHTML = `
        <span class="build-symbol">${item.symbol}</span>
        <span class="build-name">${item.name}</span>
        <span class="build-cost">${item.cost}g</span>
      `;
      btn.title = `${item.name} - ${item.description}\nCost: ${item.cost}g | Workers: ${item.workers} | Maintenance: ${item.maintenance}g/tick`;

      btn.addEventListener('click', () => {
        // Deselect previous
        document.querySelectorAll('.build-btn.active').forEach(b => b.classList.remove('active'));
        if (state.selectedBuildType === item.key) {
          state.selectedBuildType = null;
          state.selectedBuilding = null;
        } else {
          state.selectedBuildType = item.key;
          state.selectedBuilding = null;
          btn.classList.add('active');
        }
      });

      catDiv.appendChild(btn);
    }
    menu.appendChild(catDiv);
  }

  // Speed controls
  document.getElementById('speed-pause').addEventListener('click', () => state.speed = 0);
  document.getElementById('speed-1').addEventListener('click', () => state.speed = 1);
  document.getElementById('speed-2').addEventListener('click', () => state.speed = 2);
  document.getElementById('speed-3').addEventListener('click', () => state.speed = 3);

  // Save/Load buttons
  document.getElementById('btn-save').addEventListener('click', () => {
    if (saveGame(state)) {
      addMessage(state, 'Game saved', 'success');
    } else {
      addMessage(state, 'Save failed!', 'danger');
    }
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    if (!hasSave()) {
      addMessage(state, 'No saved game found', 'warning');
      return;
    }
    if (loadGame(state)) {
      state._resetTiming();
      addMessage(state, 'Game loaded', 'info');
    } else {
      addMessage(state, 'Load failed!', 'danger');
    }
  });

  document.getElementById('btn-menu').addEventListener('click', () => {
    state.screen = 'menu';
  });
}

// ── Update HUD every frame ──────────────────────────────────
export function updateHUD(state) {
  // Hide game UI on menu screen
  const hudBar = document.getElementById('hud-bar');
  const gameOverlay = document.getElementById('game-ui-overlay');
  if (state.screen === 'menu') {
    hudBar.classList.add('hidden');
    gameOverlay.classList.add('hidden');
    return;
  }
  hudBar.classList.remove('hidden');
  gameOverlay.classList.remove('hidden');

  document.getElementById('hud-gold').textContent = state.treasury.gold;
  document.getElementById('hud-income').textContent = `+${state.treasury.income}`;
  document.getElementById('hud-expenses').textContent = `-${state.treasury.expenses}`;
  document.getElementById('hud-population').textContent = state.population.total;
  document.getElementById('hud-pop-capacity').textContent = state.population.capacity;
  document.getElementById('hud-employed').textContent = state.population.employed;
  document.getElementById('hud-food').textContent = state.food.stored;
  document.getElementById('hud-food-capacity').textContent = state.food.capacity;
  document.getElementById('hud-year').textContent = state.time.year;
  document.getElementById('hud-month').textContent = state.time.month;

  // Speed indicator
  const speeds = ['speed-pause', 'speed-1', 'speed-2', 'speed-3'];
  speeds.forEach((id, i) => {
    const el = document.getElementById(id);
    el.classList.toggle('active', i === state.speed);
  });

  // Overlay indicator
  const overlayEl = document.getElementById('overlay-indicator');
  if (state.overlay) {
    overlayEl.classList.remove('hidden');
    const names = { desirability: 'Desirability Overlay', fire: 'Fire Risk Overlay', collapse: 'Collapse Risk Overlay' };
    overlayEl.textContent = names[state.overlay] || state.overlay;
  } else {
    overlayEl.classList.add('hidden');
  }

  // Update build buttons affordability
  document.querySelectorAll('.build-btn').forEach(btn => {
    const def = BUILDINGS[btn.dataset.type];
    if (def) {
      btn.classList.toggle('cant-afford', state.treasury.gold < def.cost);
    }
  });

  // Info panel
  updateInfoPanel(state);

  // Objectives panel
  updateObjectivesPanel(state);
}

// ── Info panel for selected building ────────────────────────
function updateInfoPanel(state) {
  const panel = document.getElementById('info-panel');
  const b = state.selectedBuilding;

  if (!b) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  const def = BUILDINGS[b.type];

  let html = `<h3>${def.name}</h3>`;
  html += `<p class="info-desc">${def.description}</p>`;

  if (b.type === 'housing') {
    const level = HOUSING_LEVELS[b.level];
    const tile = state.grid[b.y][b.x];
    html += `<div class="info-row"><span>Level:</span><span>${level.name}</span></div>`;
    html += `<div class="info-row"><span>Residents:</span><span>${b.currentResidents} / ${level.residents}</span></div>`;
    html += `<div class="info-row"><span>Desirability:</span><span>${Math.round(tile.desirability)}</span></div>`;
    // Show what's needed for next level
    if (b.level + 1 < HOUSING_LEVELS.length) {
      const next = HOUSING_LEVELS[b.level + 1];
      html += `<div class="info-next">Next: ${next.name}</div>`;
      html += `<ul class="info-reqs">`;
      for (const [key] of Object.entries(next.requires)) {
        const has = tile[key];
        html += `<li class="${has ? 'met' : 'unmet'}">${formatReq(key)}</li>`;
      }
      if (next.desirability > 0) {
        const hasDes = tile.desirability >= next.desirability;
        html += `<li class="${hasDes ? 'met' : 'unmet'}">Desirability ${next.desirability}+</li>`;
      }
      html += `</ul>`;
    }
  }

  if (b.workersNeeded > 0) {
    html += `<div class="info-row"><span>Workers:</span><span>${b.currentWorkers} / ${b.workersNeeded}</span></div>`;
  }
  if (b.type === 'farm') {
    html += `<div class="info-row"><span>Grain ready:</span><span>${b.production}</span></div>`;
  }
  if (b.type === 'granary') {
    html += `<div class="info-row"><span>Stored:</span><span>${b.storage} / ${BUILDINGS.granary.capacity}</span></div>`;
  }
  if (b.type === 'bazaar') {
    html += `<div class="info-row"><span>Food stock:</span><span>${b.storage}</span></div>`;
  }
  // Walker count for service buildings
  if (['bazaar', 'well', 'temple', 'taxCollector', 'architect', 'firehouse'].includes(b.type) && state.walkers) {
    const active = state.walkers.filter(w => w.buildingId === b.id).length;
    html += `<div class="info-row"><span>Walkers:</span><span>${active}</span></div>`;
  }
  if (def.maintenance > 0) {
    html += `<div class="info-row"><span>Maintenance:</span><span>${def.maintenance}g/tick</span></div>`;
  }
  // Hazard info
  if (b.type !== 'road' && b.type !== 'garden') {
    if (b.onFire) {
      html += `<div class="info-row" style="color:#e74c3c"><span>ON FIRE!</span><span>${b.fireTicks} ticks</span></div>`;
    } else {
      const fireLevel = b.fireRisk > 36 ? 'high' : b.fireRisk > 18 ? 'med' : 'low';
      const collapseLevel = b.collapseRisk > 36 ? 'high' : b.collapseRisk > 18 ? 'med' : 'low';
      const fireColor = fireLevel === 'high' ? '#e74c3c' : fireLevel === 'med' ? '#f39c12' : '#6aaa50';
      const collapseColor = collapseLevel === 'high' ? '#e74c3c' : collapseLevel === 'med' ? '#f39c12' : '#6aaa50';
      html += `<div class="info-row"><span>Fire risk:</span><span style="color:${fireColor}">${fireLevel}</span></div>`;
      html += `<div class="info-row"><span>Collapse risk:</span><span style="color:${collapseColor}">${collapseLevel}</span></div>`;
    }
  }

  html += `<button id="demolish-btn" class="demolish-btn">Demolish (+${Math.floor(def.cost/2)}g)</button>`;

  panel.innerHTML = html;

  document.getElementById('demolish-btn').addEventListener('click', () => {
    removeBuilding(state, b);
    state.selectedBuilding = null;
  });
}

// ── Objectives panel ────────────────────────────────────────
function updateObjectivesPanel(state) {
  const panel = document.getElementById('objectives-panel');
  const sc = state.scenario;

  if (!sc || sc.key === 'sandbox' || !sc.goals || sc.goals.length === 0) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');

  let html = `<h3>${sc.name}</h3>`;
  if (sc.won) {
    html += `<div class="obj-won">Victory!</div>`;
  }
  html += `<ul class="obj-list">`;

  for (const goal of sc.goals) {
    const p = goalProgress(goal);
    const pct = Math.min(100, Math.round((p.current / p.target) * 100));
    const done = goal.completed;
    html += `<li class="${done ? 'obj-done' : 'obj-pending'}">`;
    html += `<span class="obj-label">${goal.label}</span>`;
    html += `<div class="obj-bar-bg"><div class="obj-bar-fill${done ? ' obj-bar-complete' : ''}" style="width:${pct}%"></div></div>`;
    html += `<span class="obj-progress">${p.current} / ${p.target}</span>`;
    html += `</li>`;
  }
  html += `</ul>`;

  panel.innerHTML = html;
}

function formatReq(key) {
  const map = {
    roadAccess: 'Road Access',
    waterAccess: 'Water (Well)',
    foodAccess: 'Food (Bazaar)',
    religionAccess: 'Religion (Temple)',
    taxed: 'Tax Office',
  };
  return map[key] || key;
}
