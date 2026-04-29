import { BUILDINGS, HOUSING_LEVELS } from './config.js';

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
}

// ── Update HUD every frame ──────────────────────────────────
export function updateHUD(state) {
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

  // Update build buttons affordability
  document.querySelectorAll('.build-btn').forEach(btn => {
    const def = BUILDINGS[btn.dataset.type];
    if (def) {
      btn.classList.toggle('cant-afford', state.treasury.gold < def.cost);
    }
  });

  // Info panel
  updateInfoPanel(state);
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
    html += `<div class="info-row"><span>Level:</span><span>${level.name}</span></div>`;
    html += `<div class="info-row"><span>Residents:</span><span>${b.currentResidents} / ${level.residents}</span></div>`;
    // Show what's needed for next level
    if (b.level + 1 < HOUSING_LEVELS.length) {
      const next = HOUSING_LEVELS[b.level + 1];
      html += `<div class="info-next">Next: ${next.name}</div>`;
      html += `<ul class="info-reqs">`;
      for (const [key] of Object.entries(next.requires)) {
        const has = state.grid[b.y][b.x][key];
        html += `<li class="${has ? 'met' : 'unmet'}">${formatReq(key)}</li>`;
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
  if (def.maintenance > 0) {
    html += `<div class="info-row"><span>Maintenance:</span><span>${def.maintenance}g/tick</span></div>`;
  }

  html += `<button id="demolish-btn" class="demolish-btn">Demolish (+${Math.floor(def.cost/2)}g)</button>`;

  panel.innerHTML = html;

  document.getElementById('demolish-btn').addEventListener('click', () => {
    const { removeBuilding } = state._buildingModule;
    removeBuilding(state, b);
    state.selectedBuilding = null;
  });
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
