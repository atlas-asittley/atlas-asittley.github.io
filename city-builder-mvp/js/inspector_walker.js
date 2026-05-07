// ── Walker Inspector ──
// Tap-on-walker info panel. Read-only — no actions, just flavor text
// describing who the walker is, where they came from, and what they're
// up to. Walkers are purely cosmetic so this never affects production.

const JOB_TITLES = {
  citizen: 'Citizen',
  timber: 'Lumberjack', sawmill: 'Sawyer',
  stone: 'Stonemason', clay: 'Potter', iron: 'Ironworker',
  grain: 'Miller', orchard: 'Fruit Picker', fish: 'Fisher', garden: 'Gardener',
  tavern: 'Barkeep', bathhouse: 'Bath Attendant', school: 'Scholar', temple: 'Priest',
  civic: 'Tax Clerk'
};

const WALKER_TIER_LABELS = {
  0: 'Shanty dweller',
  1: 'Villager',
  2: 'Cottage resident',
  3: 'Townhouse resident',
  4: 'Villa resident',
  5: 'Manor estate resident'
};

export function renderWalkerInspector(walkerInfo) {
  var titleEl = document.getElementById('inspector-title');
  var bodyEl = document.getElementById('inspector-body');
  var actionsEl = document.getElementById('inspector-actions');

  var jobType = walkerInfo.sourceType || 'citizen';

  // Citizen walkers display their persona flavor name (Happy Couple,
  // Well-Fed Citizen, Fancy Citizen, etc.); job walkers fall back to
  // the job title.
  if (jobType === 'citizen' && walkerInfo.personaName) {
    titleEl.textContent = walkerInfo.personaName;
  } else {
    titleEl.textContent = JOB_TITLES[jobType] || 'Citizen';
  }

  var typeLabel;
  if (jobType === 'citizen') {
    typeLabel = walkerInfo.personaName || WALKER_TIER_LABELS[walkerInfo.sourceTier] || 'Citizen';
  } else {
    typeLabel = JOB_TITLES[jobType] || 'Worker';
  }

  var stepsLeft = walkerInfo.maxSteps - walkerInfo.steps;
  var jobActivities = {
    citizen: stepsLeft > 4 ? 'Strolling' : 'Heading home',
    timber: stepsLeft > 4 ? 'Hauling timber' : 'Returning to camp',
    sawmill: stepsLeft > 4 ? 'Carrying planks' : 'Returning to mill',
    stone: stepsLeft > 4 ? 'Hauling stone' : 'Returning to quarry',
    clay: stepsLeft > 4 ? 'Carrying pottery' : 'Returning to the works',
    iron: stepsLeft > 4 ? 'Hauling ore' : 'Returning to the mine',
    grain: stepsLeft > 4 ? 'Delivering grain' : 'Returning to farm',
    orchard: stepsLeft > 4 ? 'Picking fruit' : 'Returning with the basket',
    fish: stepsLeft > 4 ? 'Heading to the water' : 'Returning with the catch',
    garden: stepsLeft > 4 ? 'Tending the garden' : 'Returning with vegetables',
    civic: stepsLeft > 4 ? 'Doing the rounds' : 'Returning to the office'
  };
  var activity = jobActivities[jobType] || (stepsLeft > 4 ? 'Working' : 'Heading back');

  var html = '';
  html += '<div class="insp-row"><span class="insp-label">Type</span><span class="insp-value">' + typeLabel + '</span></div>';
  html += '<div class="insp-row"><span class="insp-label">Activity</span><span class="insp-value">' + activity + '</span></div>';
  var originLabel = jobType === 'citizen' ? 'Home' : 'Workplace';
  html += '<div class="insp-row"><span class="insp-label">' + originLabel + '</span><span class="insp-value">' + walkerInfo.sourceName + '</span></div>';
  html += '<div class="insp-row"><span class="insp-label">Steps</span><span class="insp-value">' + walkerInfo.steps + ' / ' + walkerInfo.maxSteps + '</span></div>';
  html += '<div class="insp-hint">Walkers wander along roads from their buildings. They are purely cosmetic and don\'t affect production.</div>';

  bodyEl.innerHTML = html;
  actionsEl.innerHTML = '';
}
