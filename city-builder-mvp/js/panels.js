// ── Build, Inventory, and Trade panels ──
import { sb } from './config.js';
import { state, computeTraderUnlocks } from './state.js';
import { showToast, updateMoney } from './ui.js';
import { BLDG_LABELS, renderMap } from './map.js';

function resourceName(key) {
  if (state.resources[key]) return state.resources[key].name;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

// ── Build panel ──
export function renderBuildPanel() {
  var panel = document.getElementById('panel-build');
  var html = '';

  var available = Object.keys(state.buildingTypes).filter(function (k) {
    var bt = state.buildingTypes[k];
    return bt.industry_key === state.profile.industry_key || bt.industry_key === 'common';
  }).sort(function (a, b) {
    var btA = state.buildingTypes[a];
    var btB = state.buildingTypes[b];
    // Roads first, then housing, then by tier
    var order = { road: 0, housing: 1 };
    var oa = order[btA.category] !== undefined ? order[btA.category] : 2;
    var ob = order[btB.category] !== undefined ? order[btB.category] : 2;
    if (oa !== ob) return oa - ob;
    return btA.tier - btB.tier;
  });

  if (available.length === 0) {
    html = '<div style="color:#7a8a9e;text-align:center;padding:20px;">No buildings available for your industry.</div>';
    panel.innerHTML = html;
    return;
  }

  var li = state.laborInfo;

  available.forEach(function (key) {
    var bt = state.buildingTypes[key];
    var canAfford = state.profile.money >= bt.build_cost;
    // Only money blocks placement now — workers are soft constraint
    var disabled = !canAfford;
    var selected = state.selectedBuildType === key;

    var colors = {
      timber_camp: '#3a7a4a', sawmill: '#7a5a2a',
      stone_quarry: '#5a5a7a', mason_workshop: '#7a4a3a',
      grain_farm: '#5a7a3a', mill: '#6a5a4a',
      clay_pit: '#8a5a3a', pottery_kiln: '#7a4a4a',
      bakery: '#8a7a3a', woodcarver: '#5a6a3a', sculptor: '#6a5a7a',
      house: '#4a6a8a', road: '#6a6a5a'
    };
    var spriteIcons = {
      timber_camp: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='tcr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23e0b450'/%3E%3Cstop offset='1' stop-color='%23a07828'/%3E%3C/linearGradient%3E%3ClinearGradient id='tcw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%2388603a'/%3E%3Cstop offset='1' stop-color='%23503018'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpolygon points='16,4 3,15 29,15' fill='url(%23tcr)'/%3E%3Cline x1='8' y1='14' x2='10' y2='9' stroke='%23806020' stroke-width='0.4' opacity='0.5'/%3E%3Cline x1='13' y1='14' x2='14' y2='7' stroke='%23806020' stroke-width='0.4' opacity='0.5'/%3E%3Cline x1='18' y1='14' x2='17' y2='7' stroke='%23806020' stroke-width='0.4' opacity='0.5'/%3E%3Cline x1='23' y1='14' x2='21' y2='9' stroke='%23806020' stroke-width='0.4' opacity='0.5'/%3E%3Crect x='4' y='14.5' width='24' height='1' fill='%233a2010' opacity='0.4'/%3E%3Crect x='7' y='15' width='14' height='15' rx='0.5' fill='url(%23tcw)'/%3E%3Cline x1='7' y1='19' x2='21' y2='19' stroke='%233a2010' stroke-width='0.4' opacity='0.5'/%3E%3Cline x1='7' y1='23' x2='21' y2='23' stroke='%233a2010' stroke-width='0.4' opacity='0.5'/%3E%3Cline x1='7' y1='27' x2='21' y2='27' stroke='%233a2010' stroke-width='0.4' opacity='0.5'/%3E%3Crect x='9' y='20' width='6' height='10' rx='0.5' fill='%232a1810' opacity='0.9'/%3E%3Crect x='21' y='25' width='10' height='5' rx='0.4' fill='%23604028'/%3E%3Ccircle cx='22.5' cy='27.5' r='1.4' fill='%23c89060'/%3E%3Ccircle cx='22.5' cy='27.5' r='0.5' fill='%23603820'/%3E%3Ccircle cx='25.5' cy='27.5' r='1.4' fill='%23b88050'/%3E%3Ccircle cx='25.5' cy='27.5' r='0.5' fill='%23603820'/%3E%3Ccircle cx='28.5' cy='27.5' r='1.4' fill='%23c89060'/%3E%3Ccircle cx='28.5' cy='27.5' r='0.5' fill='%23603820'/%3E%3Crect x='22' y='21' width='8' height='4' rx='0.4' fill='%23503818'/%3E%3Ccircle cx='24' cy='23' r='1.2' fill='%23b88050'/%3E%3Ccircle cx='24' cy='23' r='0.4' fill='%23603820'/%3E%3Ccircle cx='27' cy='23' r='1.2' fill='%23c89060'/%3E%3Ccircle cx='27' cy='23' r='0.4' fill='%23603820'/%3E%3C/svg%3E",
      sawmill: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='smw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a07840'/%3E%3Cstop offset='.5' stop-color='%237a5828'/%3E%3Cstop offset='1' stop-color='%23503818'/%3E%3C/linearGradient%3E%3ClinearGradient id='sms' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23503818'/%3E%3Cstop offset='1' stop-color='%237a5828'/%3E%3C/linearGradient%3E%3ClinearGradient id='smr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23704028'/%3E%3Cstop offset='.5' stop-color='%23502818'/%3E%3Cstop offset='1' stop-color='%23301808'/%3E%3C/linearGradient%3E%3ClinearGradient id='sml' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23c8a060'/%3E%3Cstop offset='1' stop-color='%2390683a'/%3E%3C/linearGradient%3E%3ClinearGradient id='smd' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23e0c080'/%3E%3Cstop offset='1' stop-color='%23a08850'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='26' ry='4' fill='%233a2418' opacity='.45'/%3E%3Cg transform='translate(46,40)'%3E%3Crect x='-2' y='6' width='16' height='3' rx='.4' fill='url(%23sml)'/%3E%3Cellipse cx='-2' cy='7.5' rx='1.2' ry='1.5' fill='%2390683a'/%3E%3Ccircle cx='-2' cy='7.5' r='.7' fill='%23603a18'/%3E%3Ccircle cx='-2' cy='7.5' r='.3' fill='%23806020' opacity='.6'/%3E%3Crect x='-2' y='2' width='16' height='3' rx='.4' fill='url(%23sml)' opacity='.95'/%3E%3Cellipse cx='-2' cy='3.5' rx='1.2' ry='1.5' fill='%23a07848'/%3E%3Ccircle cx='-2' cy='3.5' r='.7' fill='%23704020'/%3E%3Ccircle cx='-2' cy='3.5' r='.3' fill='%23906028' opacity='.6'/%3E%3Crect x='-2' y='-2' width='16' height='3' rx='.4' fill='url(%23sml)' opacity='.9'/%3E%3Cellipse cx='-2' cy='-.5' rx='1.2' ry='1.5' fill='%23b08858'/%3E%3Ccircle cx='-2' cy='-.5' r='.7' fill='%23704020'/%3E%3Ccircle cx='-2' cy='-.5' r='.3' fill='%23906028' opacity='.6'/%3E%3C/g%3E%3Cellipse cx='32' cy='40' rx='24' ry='14' fill='%231a0e04' opacity='.2'/%3E%3Cpolygon points='32,8 8,28 56,28' fill='url(%23smr)'/%3E%3Cg stroke='%231a0e04' stroke-width='.4' opacity='.55' fill='none'%3E%3Cpath d='M14,24 L50,24'/%3E%3Cpath d='M11,26 L53,26'/%3E%3Cpath d='M17,21 L47,21'/%3E%3C/g%3E%3Cpolygon points='32,8 56,28 50,28 38,16' fill='%23604030' opacity='.4'/%3E%3Crect x='6' y='27' width='52' height='2' rx='.3' fill='%231a0a04'/%3E%3Crect x='10' y='28' width='44' height='28' rx='.5' fill='url(%23smw)'/%3E%3Crect x='10' y='28' width='6' height='28' fill='url(%23sms)' opacity='.5'/%3E%3Cg stroke='%233a2008' stroke-width='.4' opacity='.55'%3E%3Cline x1='16' y1='28' x2='16' y2='56'/%3E%3Cline x1='22' y1='28' x2='22' y2='56'/%3E%3Cline x1='28' y1='28' x2='28' y2='56'/%3E%3Cline x1='34' y1='28' x2='34' y2='56'/%3E%3Cline x1='40' y1='28' x2='40' y2='56'/%3E%3Cline x1='46' y1='28' x2='46' y2='56'/%3E%3Cline x1='52' y1='28' x2='52' y2='56'/%3E%3C/g%3E%3Cg stroke='%235a3818' stroke-width='.25' fill='none' opacity='.45'%3E%3Cpath d='M11,33 Q13,32 16,33'/%3E%3Cpath d='M17,38 Q19,37 22,38'/%3E%3Cpath d='M23,42 Q25,41 28,42'/%3E%3Cpath d='M11,46 Q13,45 16,46'/%3E%3Cpath d='M17,50 Q19,49 22,50'/%3E%3Cpath d='M40,32 Q43,31 46,32'/%3E%3Cpath d='M47,38 Q49,37 52,38'/%3E%3Cpath d='M40,46 Q43,45 46,46'/%3E%3Cpath d='M47,50 Q49,49 52,50'/%3E%3C/g%3E%3Crect x='48' y='28' width='6' height='28' fill='%23d4a060' opacity='.15'/%3E%3Crect x='36' y='30' width='16' height='14' rx='.5' fill='%230a0a0a'/%3E%3Crect x='36.5' y='30.5' width='15' height='13' rx='.4' fill='%231a1208' opacity='.7'/%3E%3Crect x='35.5' y='29.5' width='17' height='1' rx='.2' fill='%233a2008'/%3E%3Crect x='35.5' y='43.5' width='17' height='1' rx='.2' fill='%233a2008'/%3E%3Cline x1='39' y1='37' x2='49' y2='37' stroke='%23604020' stroke-width='.4' opacity='.6'/%3E%3Cpath d='M14 56 L14 42 Q21 36 28 42 L28 56 Z' fill='%231a0e04'/%3E%3Cpath d='M14.5 55.5 L14.5 42.5 Q21 37 27.5 42.5 L27.5 55.5 Z' fill='%232a1810' opacity='.7'/%3E%3Cpath d='M13.5 56 L13.5 42 Q21 35 28.5 42 L28.5 56' stroke='%233a2008' stroke-width='.5' fill='none'/%3E%3Ccircle cx='27' cy='49' r='.4' fill='%23b08858'/%3E%3Crect x='18' y='32' width='6' height='5' rx='.5' fill='%231a1208'/%3E%3Crect x='18.4' y='32.4' width='5.2' height='4.2' rx='.3' fill='%23a0b0a0' opacity='.3'/%3E%3Cline x1='21' y1='32' x2='21' y2='37' stroke='%233a2008' stroke-width='.3'/%3E%3Cline x1='18' y1='34.5' x2='24' y2='34.5' stroke='%233a2008' stroke-width='.3'/%3E%3Cellipse cx='32' cy='58' rx='6' ry='1.5' fill='url(%23smd)' opacity='.85'/%3E%3Cellipse cx='33' cy='57.5' rx='3.5' ry='.8' fill='%23f0d090' opacity='.7'/%3E%3Ccircle cx='36' cy='58.5' r='.4' fill='%23e0c080'/%3E%3Ccircle cx='38' cy='58' r='.3' fill='%23d0b070'/%3E%3Ccircle cx='28' cy='58.7' r='.35' fill='%23e0c080'/%3E%3Ccircle cx='26' cy='58.2' r='.3' fill='%23d0b070'/%3E%3Cg fill='%23604030' opacity='.5'%3E%3Cellipse cx='8' cy='58' rx='2' ry='.8'/%3E%3Cellipse cx='56' cy='58' rx='1.8' ry='.7'/%3E%3C/g%3E%3C/svg%3E",
      stone_quarry: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='stq' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23b8b8c4'/%3E%3Cstop offset='1' stop-color='%23707080'/%3E%3C/linearGradient%3E%3ClinearGradient id='stqd' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23585864'/%3E%3Cstop offset='1' stop-color='%232a2a32'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='16' cy='30' rx='14' ry='2' fill='%233a3a44' opacity='0.7'/%3E%3Cpath d='M3 28 Q3 10 8 8 L14 6 L22 7 Q27 9 29 12 L29 28 Z' fill='url(%23stqd)'/%3E%3Crect x='5' y='12' width='7' height='5' rx='0.5' fill='url(%23stq)'/%3E%3Crect x='14' y='10' width='8' height='5' rx='0.5' fill='url(%23stq)'/%3E%3Crect x='4' y='17' width='9' height='6' rx='0.5' fill='url(%23stq)'/%3E%3Crect x='14' y='15' width='8' height='6' rx='0.5' fill='url(%23stq)'/%3E%3Crect x='5' y='23' width='10' height='5' rx='0.5' fill='url(%23stq)'/%3E%3Crect x='15' y='21' width='8' height='5' rx='0.5' fill='url(%23stq)'/%3E%3Cline x1='8' y1='12' x2='8' y2='17' stroke='%234a4a54' stroke-width='0.3' opacity='0.5'/%3E%3Cline x1='18' y1='10' x2='18' y2='15' stroke='%234a4a54' stroke-width='0.3' opacity='0.5'/%3E%3Cline x1='9' y1='17' x2='9' y2='23' stroke='%234a4a54' stroke-width='0.3' opacity='0.5'/%3E%3Cline x1='10' y1='23' x2='10' y2='28' stroke='%234a4a54' stroke-width='0.3' opacity='0.5'/%3E%3Cline x1='3.5' y1='28' x2='5' y2='10' stroke='%23604028' stroke-width='0.6'/%3E%3Cline x1='6.5' y1='28' x2='5' y2='10' stroke='%23604028' stroke-width='0.6'/%3E%3Cline x1='4' y1='20' x2='6' y2='20' stroke='%23604028' stroke-width='0.4'/%3E%3Cline x1='4.5' y1='15' x2='5.5' y2='15' stroke='%23604028' stroke-width='0.4'/%3E%3Cline x1='14' y1='27' x2='17' y2='22' stroke='%23503018' stroke-width='0.5' stroke-linecap='round'/%3E%3Cpolygon points='16.5,22 18.5,21.3 19,22.3 17,23' fill='%23888'/%3E%3C/svg%3E",
      mason_workshop: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='msw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a09484'/%3E%3Cstop offset='1' stop-color='%23605448'/%3E%3C/linearGradient%3E%3ClinearGradient id='msr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23c4683c'/%3E%3Cstop offset='1' stop-color='%237a3a1c'/%3E%3C/linearGradient%3E%3ClinearGradient id='msc' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%2380503a'/%3E%3Cstop offset='1' stop-color='%234a2818'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='16' cy='30' rx='14' ry='1.5' fill='%23807060' opacity='0.3'/%3E%3Cpolygon points='14,4 3,14 24,14' fill='url(%23msr)'/%3E%3Cline x1='5' y1='13' x2='8' y2='9' stroke='%235a2818' stroke-width='0.3' opacity='0.5'/%3E%3Cline x1='10' y1='13' x2='12' y2='7' stroke='%235a2818' stroke-width='0.3' opacity='0.5'/%3E%3Cline x1='15' y1='13' x2='14' y2='5' stroke='%235a2818' stroke-width='0.3' opacity='0.5'/%3E%3Cline x1='20' y1='13' x2='17' y2='8' stroke='%235a2818' stroke-width='0.3' opacity='0.5'/%3E%3Crect x='3' y='13.5' width='21' height='1' fill='%233a1810' opacity='0.5'/%3E%3Crect x='5' y='14' width='18' height='16' rx='0.5' fill='url(%23msw)'/%3E%3Cline x1='5' y1='18' x2='23' y2='18' stroke='%234a3a30' stroke-width='0.3' opacity='0.4'/%3E%3Cline x1='5' y1='22' x2='23' y2='22' stroke='%234a3a30' stroke-width='0.3' opacity='0.4'/%3E%3Cline x1='5' y1='26' x2='23' y2='26' stroke='%234a3a30' stroke-width='0.3' opacity='0.4'/%3E%3Cline x1='9' y1='14' x2='9' y2='18' stroke='%234a3a30' stroke-width='0.3' opacity='0.4'/%3E%3Cline x1='14' y1='18' x2='14' y2='22' stroke='%234a3a30' stroke-width='0.3' opacity='0.4'/%3E%3Cline x1='19' y1='22' x2='19' y2='26' stroke='%234a3a30' stroke-width='0.3' opacity='0.4'/%3E%3Cline x1='13' y1='26' x2='13' y2='30' stroke='%234a3a30' stroke-width='0.3' opacity='0.4'/%3E%3Cpath d='M11 30 L11 22 Q11 19 14 19 Q17 19 17 22 L17 30 Z' fill='%231a0e08'/%3E%3Cellipse cx='14' cy='25' rx='2' ry='1.5' fill='%23c47030' opacity='0.4'/%3E%3Crect x='18' y='27' width='4' height='3' rx='0.3' fill='%23a09484'/%3E%3Crect x='19' y='25' width='3' height='2.5' rx='0.3' fill='%23b0a494'/%3E%3Cline x1='20' y1='25' x2='20' y2='30' stroke='%235a4a3a' stroke-width='0.2' opacity='0.5'/%3E%3Crect x='24' y='6' width='5' height='24' rx='0.3' fill='url(%23msc)'/%3E%3Crect x='23.5' y='5' width='6' height='2' rx='0.3' fill='%235a3818'/%3E%3Crect x='25' y='23' width='3' height='4' rx='0.3' fill='%231a0e04'/%3E%3Cellipse cx='26.5' cy='25' rx='1' ry='0.8' fill='%23f08020' opacity='0.7'/%3E%3Cline x1='24' y1='10' x2='29' y2='10' stroke='%233a1808' stroke-width='0.25' opacity='0.5'/%3E%3Cline x1='24' y1='14' x2='29' y2='14' stroke='%233a1808' stroke-width='0.25' opacity='0.5'/%3E%3Cline x1='24' y1='18' x2='29' y2='18' stroke='%233a1808' stroke-width='0.25' opacity='0.5'/%3E%3Cline x1='24' y1='22' x2='29' y2='22' stroke='%233a1808' stroke-width='0.25' opacity='0.5'/%3E%3Cellipse cx='26' cy='4' rx='2' ry='1.2' fill='%23888' opacity='0.5'/%3E%3Cellipse cx='27' cy='1.5' rx='1.5' ry='0.8' fill='%23999' opacity='0.3'/%3E%3C/svg%3E",
      house: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='s1w' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%239a7048'/%3E%3Cstop offset='1' stop-color='%23583820'/%3E%3C/linearGradient%3E%3ClinearGradient id='s1r' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23684028'/%3E%3Cstop offset='1' stop-color='%233a2010'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='16' cy='30' rx='13' ry='2' fill='%23a0784c' opacity='0.35'/%3E%3Cpolygon points='16,6 4,15 28,15' fill='url(%23s1r)'/%3E%3Crect x='4' y='14.5' width='24' height='1' fill='%231a0a04' opacity='0.5'/%3E%3Crect x='7' y='15' width='18' height='14' rx='0.4' fill='url(%23s1w)'/%3E%3Cline x1='7' y1='19' x2='25' y2='19' stroke='%233a2010' stroke-width='0.4' opacity='0.5'/%3E%3Cline x1='7' y1='23' x2='25' y2='23' stroke='%233a2010' stroke-width='0.4' opacity='0.5'/%3E%3Cline x1='7' y1='27' x2='25' y2='27' stroke='%233a2010' stroke-width='0.4' opacity='0.5'/%3E%3Crect x='13' y='21' width='5' height='8' rx='0.4' fill='%233a2010'/%3E%3Crect x='20' y='18' width='3' height='3' rx='0.3' fill='%23ffd080' opacity='0.7'/%3E%3Crect x='22' y='5' width='2.5' height='10' rx='0.3' fill='%23605040'/%3E%3Cellipse cx='23.2' cy='4' rx='2' ry='1' fill='%23888' opacity='0.4'/%3E%3Cellipse cx='27' cy='29' rx='1.5' ry='0.5' fill='%23704028'/%3E%3Crect x='26.2' y='27.5' width='1.6' height='1.5' rx='0.4' fill='%23805030'/%3E%3C/svg%3E",
      road: 'assets/sprites/icons/road.png'
    };
    var bgColor = colors[key] || '#4a4a6a';
    var spriteUrl = spriteIcons[key] || null;
    var label = BLDG_LABELS[key] || '?';

    var desc;
    if (bt.category === 'road') {
      desc = 'Connects buildings to the city. Housing and processors need road access.';
    } else if (bt.category === 'housing') {
      desc = 'Shanty \u2192 Hut \u2192 Cottage \u2192 Townhouse \u2192 Villa \u2192 Manor Estate. Workers: 2\u201334 as conditions improve.';
    } else if (bt.category === 'extractor') {
      desc = 'Produces ' + bt.output_rate + ' ' + resourceName(bt.output_resource_key).toLowerCase() + '/min';
    } else {
      desc = bt.input_rate + ' ' + resourceName(bt.input_resource_key).toLowerCase() + ' \u2192 ' + bt.output_rate + ' ' + resourceName(bt.output_resource_key).toLowerCase() + '/min (road required)';
    }

    var costStr;
    var costClass = 'build-cost';
    if (bt.category === 'road') {
      costStr = '$' + bt.build_cost + ' | no workers';
    } else if (bt.category === 'housing') {
      costStr = '$' + bt.build_cost + ' | +2\u201334 workers (evolves with conditions)';
    } else {
      costStr = '$' + bt.build_cost + ' | ' + bt.worker_cost + ' worker';
    }

    if (!canAfford) {
      costStr = '$' + bt.build_cost + ' (need $' + (bt.build_cost - state.profile.money) + ' more)';
      costClass += ' warn';
    } else if (bt.category !== 'housing' && bt.category !== 'road' && li.workerSupply - li.workersNeeded < bt.worker_cost) {
      costStr += ' (no workers — will be inactive)';
      costClass += ' warn';
    }

    var showTier = bt.category !== 'housing' && bt.category !== 'road';
    html += '<div class="build-item' + (disabled ? ' disabled' : '') + (selected ? ' selected' : '') + '" data-bt="' + key + '">';
    if (spriteUrl) {
      html += '<div class="build-icon" data-sprite="1" style="background-image:url(' + spriteUrl + ');background-color:' + bgColor + '"></div>';
    } else {
      html += '<div class="build-icon" style="background:' + bgColor + '">' + label + '</div>';
    }
    html += '<div class="build-info">';
    html += '<div class="build-name">' + bt.name + (showTier ? ' <small>Tier ' + bt.tier + '</small>' : '') + '</div>';
    html += '<div class="' + costClass + '">' + costStr + '</div>';
    html += '<div class="build-desc">' + desc + '</div>';
    html += '</div></div>';
  });

  // Hint about inspection/demolition
  html += '<div class="build-hint">Tap any building or citizen on the map to inspect it. Demolish from the inspector.</div>';

  panel.innerHTML = html;

  panel.querySelectorAll('.build-item:not(.disabled)').forEach(function (item) {
    item.addEventListener('click', function () {
      selectBuildingType(item.dataset.bt);
    });
  });
}

function selectBuildingType(key) {
  state.selectedBuildType = key;
  var bt = state.buildingTypes[key];
  var text = bt.category === 'road'
    ? 'Drag to paint roads, or tap to place one'
    : 'Tap a tile to place ' + bt.name;
  document.getElementById('placement-text').textContent = text;
  document.getElementById('placement-bar').classList.add('active');
  renderMap();
  renderBuildPanel();
}

// ── Inventory panel ──
function computeNetRates() {
  var rates = {};
  if (!state.currentUser) return rates;
  var myBuildings = state.allBuildings.filter(function (b) {
    return b.player_id === state.currentUser.id;
  });
  myBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || bt.category === 'road' || bt.category === 'housing') return;
    // Only staffed buildings produce
    if (state.laborInfo.unstaffedIds[b.id]) return;
    // Processors need road access
    if (bt.category === 'processor' && state.noRoadAccessIds[b.id]) return;
    if (bt.output_resource_key && bt.output_rate) {
      rates[bt.output_resource_key] = (rates[bt.output_resource_key] || 0) + bt.output_rate;
    }
    if (bt.input_resource_key && bt.input_rate) {
      rates[bt.input_resource_key] = (rates[bt.input_resource_key] || 0) - bt.input_rate;
    }
  });
  return rates;
}

function rateLabel(rate) {
  if (!rate) return '';
  var sign = rate > 0 ? '+' : '';
  var color = rate > 0 ? '#5ec49e' : '#f0a0a0';
  var val = Math.round(rate * 100) / 100;
  return ' <span style="font-size:0.68rem;color:' + color + '">' + sign + val + '/m</span>';
}

export function renderInventory() {
  var panel = document.getElementById('panel-inventory');
  var html = '';
  var rates = computeNetRates();

  // Build resource lists dynamically from loaded resources
  var rawKeys = [];
  var processedKeys = [];
  Object.keys(state.resources).forEach(function (k) {
    var r = state.resources[k];
    if (r.kind === 'raw') rawKeys.push(k);
    else if (r.kind === 'processed') processedKeys.push(k);
  });

  html += '<div class="inv-section">Raw Materials</div>';
  rawKeys.forEach(function (k) {
    var qty = Math.floor(state.inventory[k] || 0);
    html += '<div class="inv-row"><span class="inv-name">' + resourceName(k) + rateLabel(rates[k]) + '</span><span class="inv-qty' + (qty === 0 ? ' zero' : '') + '">' + qty + '</span></div>';
  });

  html += '<div class="inv-section">Processed Goods</div>';
  processedKeys.forEach(function (k) {
    var qty = Math.floor(state.inventory[k] || 0);
    html += '<div class="inv-row"><span class="inv-name">' + resourceName(k) + rateLabel(rates[k]) + '</span><span class="inv-qty' + (qty === 0 ? ' zero' : '') + '">' + qty + '</span></div>';
  });

  html += '<div class="inv-section">Economy</div>';
  html += '<div class="inv-row"><span class="inv-name">Money</span><span class="inv-qty" style="color:#e6c65a;">$' + state.profile.money + '</span></div>';

  var myBldgs = state.allBuildings.filter(function (b) { return b.player_id === state.currentUser.id; });
  html += '<div class="inv-row"><span class="inv-name">Your Buildings</span><span class="inv-qty">' + myBldgs.length + '</span></div>';

  // ── Housing tiers section ──
  var tierCounts = {};
  var totalHouses = 0;
  myBldgs.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'housing') {
      var t = b.housing_tier !== undefined ? b.housing_tier : 1;
      tierCounts[t] = (tierCounts[t] || 0) + 1;
      totalHouses++;
    }
  });
  if (totalHouses > 0) {
    html += '<div class="inv-section">Housing</div>';
    Object.keys(tierCounts).sort().forEach(function (t) {
      var cfg = state.housingTierConfig[t];
      var tierName = cfg ? cfg.name : 'Tier ' + t;
      var tierWorkers = cfg ? cfg.workers : '?';
      html += '<div class="inv-row"><span class="inv-name">' + tierName + ' (' + tierWorkers + 'w each)</span><span class="inv-qty">' + tierCounts[t] + '</span></div>';
    });
  }

  // ── Roads section ──
  var disconnectedCount = Object.keys(state.noRoadAccessIds).length;
  if (disconnectedCount > 0) {
    html += '<div class="inv-section">Roads</div>';
    html += '<div class="inv-row labor-shortage-row"><span class="inv-name" style="color:#d4a040;">Disconnected Buildings</span><span class="inv-qty" style="color:#d4a040;">' + disconnectedCount + '</span></div>';
    html += '<div class="labor-shortage-hint" style="color:#8a7a5a;">Place roads next to buildings that need them.</div>';
  }

  // ── Labor section ──
  var li = state.laborInfo;
  html += '<div class="inv-section">Labor</div>';
  html += '<div class="inv-row"><span class="inv-name">Worker Supply</span><span class="inv-qty" style="color:#5ec49e;">' + li.workerSupply + '</span></div>';
  html += '<div class="inv-row"><span class="inv-name">Workers Needed</span><span class="inv-qty">' + li.workersNeeded + '</span></div>';
  html += '<div class="inv-row"><span class="inv-name">Employed</span><span class="inv-qty">' + li.workersUsed + '</span></div>';
  if (li.workersIdle > 0) {
    html += '<div class="inv-row"><span class="inv-name">Idle</span><span class="inv-qty" style="color:#e6c65a;">' + li.workersIdle + '</span></div>';
  }
  if (li.laborShortage) {
    var shortage = li.workersNeeded - li.workerSupply;
    html += '<div class="inv-row labor-shortage-row"><span class="inv-name" style="color:#f06060;">Labor Shortage!</span><span class="inv-qty" style="color:#f06060;">' + shortage + ' workers short</span></div>';
    html += '<div class="labor-shortage-hint">Build housing to increase worker supply.</div>';
  }

  panel.innerHTML = html;
}

// ── Trade panel (Phase 2B: multi-partner trade) ──
export function renderTradePanel() {
  var panel = document.getElementById('panel-trade');
  var html = '';

  var traderKeys = Object.keys(state.traders);

  // Fallback if no traders loaded
  if (traderKeys.length === 0) {
    html = '<div style="color:#7a8a9e;text-align:center;padding:16px;">No trade partners loaded. Run the Phase 2B migration first.</div>';
    panel.innerHTML = html;
    return;
  }

  // Phase 2C: recompute unlocks (buildings may have changed)
  computeTraderUnlocks();

  // Ensure selected trader is valid and unlocked
  if (!state.selectedTrader || !state.traders[state.selectedTrader] ||
      (state.unlockedTraders[state.selectedTrader] && !state.unlockedTraders[state.selectedTrader].unlocked)) {
    var firstUnlocked = traderKeys.filter(function (tk) {
      return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
    })[0];
    state.selectedTrader = firstUnlocked || traderKeys[0];
  }
  state.traderPrices = state.allTraderPrices[state.selectedTrader] || {};

  var trader = state.traders[state.selectedTrader];

  // ── Partner selector tabs (Phase 2C: locked/unlocked) ──
  html += '<div class="partner-tabs">';
  traderKeys.forEach(function (tk) {
    var t = state.traders[tk];
    var selected = tk === state.selectedTrader;
    var unlockInfo = state.unlockedTraders[tk] || { unlocked: true, hint: '' };
    var isLocked = !unlockInfo.unlocked;

    if (isLocked) {
      html += '<button class="partner-tab locked" data-trader="' + tk + '" data-locked="1" title="' + unlockInfo.hint.replace(/"/g, '&quot;') + '">';
      html += '<div class="partner-tab-name"><span class="lock-icon">&#x1f512;</span> ' + t.name + '</div>';
      html += '<div class="partner-tab-hint">' + unlockInfo.hint + '</div>';
      html += '</button>';
    } else {
      var nextVisit = state.nextVisitAts[tk];
      var visitLabel = '';
      if (nextVisit) {
        var diff = nextVisit.getTime() - Date.now();
        if (diff <= 0) {
          visitLabel = '<span class="partner-tab-due">Due!</span>';
        } else {
          visitLabel = '<span class="partner-tab-timer">~' + Math.ceil(diff / 60000) + 'm</span>';
        }
      }
      html += '<button class="partner-tab' + (selected ? ' selected' : '') + '" data-trader="' + tk + '">';
      html += '<div class="partner-tab-name">' + t.name + '</div>';
      html += '<div class="partner-tab-meta">Cap ' + t.visit_capacity + ' &middot; ' + t.visit_interval_minutes + 'm</div>';
      if (visitLabel) {
        html += '<div class="partner-tab-visit">' + visitLabel + '</div>';
      }
      html += '</button>';
    }
  });
  html += '</div>';

  // ── Check All Visits button (only unlocked traders) ──
  var unlockedKeys = traderKeys.filter(function (tk) {
    return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
  });
  html += '<div class="visit-status">';
  var anyDue = unlockedKeys.some(function (tk) {
    var nv = state.nextVisitAts[tk];
    return nv && nv.getTime() <= Date.now();
  });
  if (anyDue) {
    html += '<span class="visit-due">Trade visits available!</span>';
  } else {
    // Show time until next visit across unlocked traders
    var soonest = null;
    unlockedKeys.forEach(function (tk) {
      var nv = state.nextVisitAts[tk];
      if (nv && (!soonest || nv.getTime() < soonest)) {
        soonest = nv.getTime();
      }
    });
    if (soonest) {
      var mins = Math.ceil((soonest - Date.now()) / 60000);
      html += '<span class="visit-timer">Next visit in ~' + mins + ' min</span>';
    } else {
      html += '<span class="visit-timer">Next visit: soon</span>';
    }
  }
  html += ' <button class="btn-check-visit" id="btn-check-visit">Check All</button>';
  html += '</div>';

  // ── Selected partner detail ──
  html += '<div class="partner-detail">';
  html += '<div class="trader-header">' + trader.name + '</div>';
  html += '<div class="trader-desc">' + (trader.description || '') + '</div>';

  // Visit status for selected partner
  var selectedNextVisit = state.nextVisitAts[state.selectedTrader];
  if (selectedNextVisit) {
    var sdiff = selectedNextVisit.getTime() - Date.now();
    html += '<div class="partner-visit-info">';
    if (sdiff <= 0) {
      html += '<span class="visit-due">Visit due now!</span>';
    } else {
      html += '<span class="visit-timer">Next visit in ~' + Math.ceil(sdiff / 60000) + ' min</span>';
    }
    html += '</div>';
  }

  // Last visit summary for selected partner
  html += renderVisitSummary(state.selectedTrader);

  // Goods this partner trades
  html += renderPartnerGoods(state.selectedTrader);

  html += '</div>';

  // ── Trade Policies (global, with selected partner prices) ──
  html += '<div class="trade-section-label">Trade Policies</div>';
  html += '<div class="trade-policy-note">Policies apply to all partners. Each partner only trades goods they support.</div>';
  var tradeResources = ['timber', 'lumber', 'stone', 'brick', 'grain', 'flour'];
  tradeResources.forEach(function (rk) {
    var stock = Math.floor(state.inventory[rk] || 0);
    var policy = state.tradePolicies[rk] || { mode: 'keep', reserve_target: 0 };
    var supportingPartners = [];
    var bestBuyPrice = null;   // what a partner pays player
    var bestSellPrice = null;  // what a partner charges player

    // Only count unlocked partners for best prices and "Handled by"
    unlockedKeys.forEach(function (tk) {
      var partnerPrices = state.allTraderPrices[tk] || {};
      var partnerPrice = partnerPrices[rk];
      if (!partnerPrice) return;

      supportingPartners.push(state.traders[tk] ? state.traders[tk].name : tk);

      if (partnerPrice.buy_price && (bestBuyPrice === null || partnerPrice.buy_price > bestBuyPrice)) {
        bestBuyPrice = partnerPrice.buy_price;
      }
      if (partnerPrice.sell_price && (bestSellPrice === null || partnerPrice.sell_price < bestSellPrice)) {
        bestSellPrice = partnerPrice.sell_price;
      }
    });

    html += '<div class="policy-row" data-resource="' + rk + '">';
    html += '<div class="policy-header">';
    html += '<span class="policy-res">' + resourceName(rk) + '</span>';
    html += '<span class="policy-stock">Stock: ' + stock + '</span>';
    html += '</div>';

    html += '<div class="policy-prices">';
    if (bestBuyPrice !== null) html += '<span class="policy-price sell-price">Best partner buy: ' + bestBuyPrice + 'g</span>';
    if (bestSellPrice !== null) html += '<span class="policy-price buy-price">Best partner sell: ' + bestSellPrice + 'g</span>';
    if (supportingPartners.length === 0) {
      html += '<span class="policy-price not-traded-label">No active partner currently trades this</span>';
    }
    html += '</div>';

    if (supportingPartners.length > 0) {
      html += '<div class="policy-prices"><span class="policy-price not-traded-label">Handled by: ' + supportingPartners.join(', ') + '</span></div>';
    }

    html += '<div class="policy-controls">';
    html += '<select class="policy-mode-select" data-resource="' + rk + '">';
    html += '<option value="keep"' + (policy.mode === 'keep' ? ' selected' : '') + '>Keep</option>';
    html += '<option value="sell_surplus"' + (policy.mode === 'sell_surplus' ? ' selected' : '') + '>Sell Surplus</option>';
    html += '<option value="buy_to_reserve"' + (policy.mode === 'buy_to_reserve' ? ' selected' : '') + '>Buy to Reserve</option>';
    html += '</select>';
    html += '<div class="policy-reserve-wrap">';
    html += '<label class="policy-reserve-label">Reserve:</label>';
    html += '<input type="number" class="policy-reserve-input" data-resource="' + rk + '" min="0" max="999" value="' + policy.reserve_target + '"' + (policy.mode === 'keep' ? ' disabled' : '') + '>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });

  // ── Black Market section (separate from partner trade) ──
  html += '<div class="bm-section">';
  html += '<div class="bm-header">';
  html += '<span class="bm-title">Black Market</span>';
  html += '</div>';
  html += '<div class="bm-warning">Instant trade for emergencies. Always available, but the rates are terrible.</div>';

  var bmPrices = {
    timber: { buy: 2, sell: 10 },
    stone:  { buy: 2, sell: 11 },
    lumber: { buy: 5, sell: 18 },
    brick:  { buy: 6, sell: 20 },
    grain:  { buy: 2, sell: 9 },
    flour:  { buy: 5, sell: 16 }
  };

  tradeResources.forEach(function (rk) {
    var bmp = bmPrices[rk];
    var stock = Math.floor(state.inventory[rk] || 0);
    var sellKey = 'bm-sell-' + rk;
    var buyKey = 'bm-buy-' + rk;
    var sellAmt = state.blackMarketAmounts[sellKey] || 0;
    var buyAmt = state.blackMarketAmounts[buyKey] || 0;
    var maxBuy = bmp.sell > 0 ? Math.floor(state.profile.money / bmp.sell) : 0;

    html += '<div class="bm-row">';
    html += '<div class="bm-row-header">';
    html += '<span class="bm-res-name">' + resourceName(rk) + '</span>';
    html += '<span class="bm-res-stock">Stock: ' + stock + '</span>';
    html += '</div>';
    html += '<div class="bm-prices">';
    html += '<span class="bm-price bm-price-sell">Sell at ' + bmp.buy + 'g</span>';
    html += '<span class="bm-price bm-price-buy">Buy at ' + bmp.sell + 'g</span>';
    html += '</div>';

    // Sell to black market row
    html += '<div class="bm-trade-row">';
    html += '<span class="bm-trade-label">Sell:</span>';
    html += '<div class="trade-controls">';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + sellKey + '" data-dir="dec">-</button>';
    html += '<span class="trade-amt" id="bma-' + sellKey + '">' + sellAmt + '</span>';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + sellKey + '" data-dir="inc" data-max="' + stock + '">+</button>';
    html += '<button class="btn-bm-sell" data-resource="' + rk + '" data-bmkey="' + sellKey + '"' + (sellAmt < 1 ? ' disabled' : '') + '>Sell</button>';
    html += '</div>';
    html += '</div>';

    // Buy from black market row
    html += '<div class="bm-trade-row">';
    html += '<span class="bm-trade-label">Buy:</span>';
    html += '<div class="trade-controls">';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + buyKey + '" data-dir="dec">-</button>';
    html += '<span class="trade-amt" id="bma-' + buyKey + '">' + buyAmt + '</span>';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + buyKey + '" data-dir="inc" data-max="' + maxBuy + '">+</button>';
    html += '<button class="btn-bm-buy" data-resource="' + rk + '" data-bmkey="' + buyKey + '"' + (buyAmt < 1 ? ' disabled' : '') + '>Buy</button>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
  });
  html += '</div>';

  panel.innerHTML = html;

  // ── Wire partner tab clicks (skip locked partners) ──
  panel.querySelectorAll('.partner-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.dataset.locked === '1') {
        var tk = tab.dataset.trader;
        var hint = state.unlockedTraders[tk] ? state.unlockedTraders[tk].hint : 'Locked';
        showToast(hint, 'info');
        return;
      }
      state.selectedTrader = tab.dataset.trader;
      state.traderPrices = state.allTraderPrices[state.selectedTrader] || {};
      renderTradePanel();
    });
  });

  // ── Wire policy mode selects ──
  panel.querySelectorAll('.policy-mode-select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var rk = sel.dataset.resource;
      var mode = sel.value;
      var row = sel.closest('.policy-row');
      var reserveInput = row.querySelector('.policy-reserve-input');
      reserveInput.disabled = (mode === 'keep');
      var reserve = parseInt(reserveInput.value) || 0;
      saveTradePolicy(rk, mode, reserve);
    });
  });

  // ── Wire reserve inputs ──
  panel.querySelectorAll('.policy-reserve-input').forEach(function (inp) {
    var debounceTimer = null;
    inp.addEventListener('input', function () {
      var rk = inp.dataset.resource;
      var reserve = Math.max(0, parseInt(inp.value) || 0);
      var row = inp.closest('.policy-row');
      var mode = row.querySelector('.policy-mode-select').value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        saveTradePolicy(rk, mode, reserve);
      }, 600);
    });
  });

  // ── Wire check-all button ──
  var checkBtn = document.getElementById('btn-check-visit');
  if (checkBtn) {
    checkBtn.addEventListener('click', function () {
      checkBtn.disabled = true;
      checkBtn.textContent = '...';
      checkAllTraderVisits();
    });
  }

  // ── Wire Black Market amount buttons ──
  panel.querySelectorAll('.bm-amt-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.bmkey;
      var dir = btn.dataset.dir;
      var max = parseInt(btn.dataset.max || '999');
      var current = state.blackMarketAmounts[key] || 0;

      if (dir === 'inc' && current < max) current++;
      else if (dir === 'dec' && current > 0) current--;
      state.blackMarketAmounts[key] = current;

      var el = document.getElementById('bma-' + key);
      if (el) el.textContent = current;

      var row = btn.closest('.bm-trade-row');
      var actionBtn = row.querySelector('.btn-bm-sell, .btn-bm-buy');
      if (actionBtn) actionBtn.disabled = current < 1;
    });
  });

  // ── Wire Black Market sell buttons ──
  panel.querySelectorAll('.btn-bm-sell').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rk = btn.dataset.resource;
      var key = btn.dataset.bmkey;
      var amt = state.blackMarketAmounts[key] || 0;
      if (amt < 1) return;
      blackMarketTrade(rk, amt, 'sell', btn);
    });
  });

  // ── Wire Black Market buy buttons ──
  panel.querySelectorAll('.btn-bm-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rk = btn.dataset.resource;
      var key = btn.dataset.bmkey;
      var amt = state.blackMarketAmounts[key] || 0;
      if (amt < 1) return;
      blackMarketTrade(rk, amt, 'buy', btn);
    });
  });
}

function renderVisitSummary(traderKey) {
  var html = '';
  var lastVisit = state.lastVisits[traderKey];
  if (lastVisit && lastVisit.summary) {
    var summary = lastVisit.summary;
    if (typeof summary === 'string') {
      try { summary = JSON.parse(summary); } catch (e) { summary = []; }
    }
    html += '<div class="visit-summary">';
    html += '<div class="visit-summary-title">Last Visit</div>';
    if (summary.length === 0) {
      html += '<div class="visit-summary-item empty">Visited — no trades matched your policy.</div>';
    } else {
      summary.forEach(function (item) {
        if (item.type === 'sell') {
          html += '<div class="visit-summary-item sold">Sold ' + item.quantity + ' ' + resourceName(item.resource) + ' for ' + item.total + 'g</div>';
        } else if (item.type === 'buy') {
          html += '<div class="visit-summary-item bought">Bought ' + item.quantity + ' ' + resourceName(item.resource) + ' for ' + item.total + 'g</div>';
        }
      });
    }
    var usedLabel = lastVisit.capacity_used + '/' + lastVisit.capacity_total + ' capacity used';
    html += '<div class="visit-summary-cap">' + usedLabel + '</div>';
    html += '</div>';
  }
  return html;
}

function renderPartnerGoods(traderKey) {
  var prices = state.allTraderPrices[traderKey] || {};
  var resources = Object.keys(prices);
  if (resources.length === 0) return '';

  var html = '<div class="partner-goods">';
  html += '<div class="partner-goods-title">Traded Goods</div>';
  resources.forEach(function (rk) {
    var p = prices[rk];
    var parts = [];
    if (p.buy_price) parts.push('<span class="pg-sell">Buys at ' + p.buy_price + 'g</span>');
    if (p.sell_price) parts.push('<span class="pg-buy">Sells at ' + p.sell_price + 'g</span>');
    html += '<div class="partner-goods-item">';
    html += '<span class="partner-goods-name">' + resourceName(rk) + '</span>';
    html += '<span class="partner-goods-prices">' + parts.join(' &middot; ') + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function saveTradePolicy(resourceKey, mode, reserveTarget) {
  state.tradePolicies[resourceKey] = { mode: mode, reserve_target: reserveTarget };
  sb.rpc('save_trade_policy', {
    p_resource_key: resourceKey,
    p_mode: mode,
    p_reserve_target: reserveTarget
  }).then(function (r) {
    if (r.error) {
      showToast('Policy save failed: ' + r.error.message, 'error');
      return;
    }
    showToast(resourceName(resourceKey) + ' policy updated', 'success');
  }).catch(function (err) {
    showToast('Policy save failed', 'error');
  });
}

// ── Check all trader visits sequentially (only unlocked) ──
export function checkAllTraderVisits() {
  // Phase 2C: only resolve visits for unlocked traders
  var traderKeys = Object.keys(state.traders).filter(function (tk) {
    return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
  });
  if (traderKeys.length === 0) return;

  var idx = 0;
  var totalEarned = 0;
  var totalSpent = 0;
  var anyResolved = false;
  var resolvedNames = [];

  function resolveNext() {
    if (idx >= traderKeys.length) {
      // All traders processed — show results
      if (anyResolved) {
        var msg = resolvedNames.join(', ') + ' visited!';
        if (totalEarned > 0) msg += ' Earned $' + totalEarned + '.';
        if (totalSpent > 0) msg += ' Spent $' + totalSpent + '.';
        if (totalEarned === 0 && totalSpent === 0) msg += ' No trades this round.';
        showToast(msg, 'success');
      }
      updateMoney();
      renderInventory();
      renderTradePanel();
      state.visitChecked = true;
      return;
    }

    var tk = traderKeys[idx];
    idx++;

    sb.rpc('resolve_trader_visit', { p_trader_key: tk }).then(function (r) {
      if (r.error) {
        console.warn('Trader visit check (' + tk + '):', r.error.message);
        resolveNext();
        return;
      }
      var data = r.data;
      if (!data) { resolveNext(); return; }

      if (data.visit_resolved) {
        anyResolved = true;
        totalEarned += data.total_earned || 0;
        totalSpent += data.total_spent || 0;
        resolvedNames.push(state.traders[tk] ? state.traders[tk].name : tk);

        state.lastVisits[tk] = {
          capacity_total: data.capacity_total,
          capacity_used: data.capacity_used,
          summary: data.summary,
          visited_at: new Date().toISOString(),
          trader_key: tk
        };
      }

      if (data.next_visit_at) {
        state.nextVisitAts[tk] = new Date(data.next_visit_at);
      }

      // Update inventory/money from each resolved visit (last one has latest state)
      if (data.money !== undefined) {
        state.profile.money = data.money;
      }
      if (data.inventory) {
        state.inventory = {};
        Object.keys(data.inventory).forEach(function (k) {
          state.inventory[k] = Number(data.inventory[k]);
        });
      }

      resolveNext();
    }).catch(function (err) {
      console.warn('Trader visit check failed (' + tk + '):', err);
      resolveNext();
    });
  }

  resolveNext();
}

function blackMarketTrade(resourceKey, quantity, direction, btn) {
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';

  sb.rpc('black_market_trade', {
    p_resource_key: resourceKey,
    p_quantity: quantity,
    p_direction: direction
  }).then(function (r) {
    if (r.error) {
      showToast(r.error.message, 'error');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }
    var data = r.data;
    state.profile.money = data.money;
    if (data.inventory) {
      state.inventory = {};
      Object.keys(data.inventory).forEach(function (k) {
        state.inventory[k] = Number(data.inventory[k]);
      });
    }

    updateMoney();

    var bmKey = 'bm-' + direction + '-' + resourceKey;
    state.blackMarketAmounts[bmKey] = 0;

    renderInventory();
    renderTradePanel();

    var verb = direction === 'sell' ? 'Sold' : 'Bought';
    var preposition = direction === 'sell' ? 'for' : 'for';
    showToast(verb + ' ' + quantity + ' ' + resourceName(resourceKey) + ' on Black Market ' + preposition + ' $' + data.total_price, 'success');
  }).catch(function (err) {
    showToast(err.message || 'Black Market trade failed', 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  });
}

// ── Panel collapse toggle ──
export function initPanelCollapse() {
  var btn = document.getElementById('panel-collapse');
  var panel = document.getElementById('bottom-panel');
  if (!btn || !panel) return;

  function syncLabel() {
    btn.textContent = panel.classList.contains('collapsed') ? 'Show panel ▴' : 'Hide panel ▾';
  }

  syncLabel();
  btn.addEventListener('click', function () {
    panel.classList.toggle('collapsed');
    syncLabel();
  });
}

// ── Tab system ──
export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.panel-content').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var tabId = 'panel-' + btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');

      if (btn.dataset.tab === 'inventory') renderInventory();
      else if (btn.dataset.tab === 'trade') renderTradePanel();
      else if (btn.dataset.tab === 'build') renderBuildPanel();
    });
  });
}
