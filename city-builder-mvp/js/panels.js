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
      timber_camp: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='tcr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23f0d070'/%3E%3Cstop offset='.5' stop-color='%23c8a040'/%3E%3Cstop offset='1' stop-color='%238a6020'/%3E%3C/linearGradient%3E%3ClinearGradient id='tcw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a07848'/%3E%3Cstop offset='.5' stop-color='%23785828'/%3E%3Cstop offset='1' stop-color='%23503818'/%3E%3C/linearGradient%3E%3ClinearGradient id='tcs' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23503818'/%3E%3Cstop offset='1' stop-color='%23785828'/%3E%3C/linearGradient%3E%3ClinearGradient id='tcl' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23c8a060'/%3E%3Cstop offset='1' stop-color='%2390683a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='28' ry='4' fill='%232a1808' opacity='.45'/%3E%3Cellipse cx='32' cy='42' rx='22' ry='14' fill='%231a0e04' opacity='.2'/%3E%3Cpolygon points='32,6 6,26 58,26' fill='url(%23tcr)'/%3E%3Cg stroke='%23a07028' stroke-width='.4' opacity='.5' fill='none'%3E%3Cpath d='M12,25 L14,12'/%3E%3Cpath d='M16,25 L17,10'/%3E%3Cpath d='M20,25 L20.5,9'/%3E%3Cpath d='M24,25 L24,8'/%3E%3Cpath d='M28,25 L28,7'/%3E%3Cpath d='M32,25 L32,6'/%3E%3Cpath d='M36,25 L36,7'/%3E%3Cpath d='M40,25 L40,8'/%3E%3Cpath d='M44,25 L43.5,9'/%3E%3Cpath d='M48,25 L47,10'/%3E%3Cpath d='M52,25 L50,12'/%3E%3C/g%3E%3Cg stroke='%23f0d890' stroke-width='.3' opacity='.45' fill='none'%3E%3Cpath d='M14,20 L13,16'/%3E%3Cpath d='M22,18 L22,12'/%3E%3Cpath d='M30,16 L30,10'/%3E%3Cpath d='M38,18 L38,12'/%3E%3Cpath d='M46,20 L46,16'/%3E%3Cpath d='M50,22 L48.5,18'/%3E%3C/g%3E%3Cpath d='M6,26 Q7,28 9,27 Q12,29 14,27 Q17,29 19,27 Q22,29 24,27 Q27,29 29,27 Q32,29 35,27 Q38,29 40,27 Q43,29 45,27 Q48,29 50,27 Q53,29 55,27 Q57,28 58,26' fill='%238a6020' opacity='.65'/%3E%3Crect x='9' y='26' width='46' height='30' rx='.5' fill='url(%23tcw)'/%3E%3Crect x='9' y='26' width='6' height='30' fill='url(%23tcs)' opacity='.5'/%3E%3Cg stroke='%233a2010' stroke-width='.4' opacity='.6'%3E%3Cline x1='9' y1='32' x2='55' y2='32'/%3E%3Cline x1='9' y1='38' x2='55' y2='38'/%3E%3Cline x1='9' y1='44' x2='55' y2='44'/%3E%3Cline x1='9' y1='50' x2='55' y2='50'/%3E%3C/g%3E%3Cg stroke='%23a07848' stroke-width='.25' opacity='.4'%3E%3Cline x1='10' y1='28' x2='54' y2='28'/%3E%3Cline x1='10' y1='34' x2='54' y2='34'/%3E%3Cline x1='10' y1='40' x2='54' y2='40'/%3E%3Cline x1='10' y1='46' x2='54' y2='46'/%3E%3Cline x1='10' y1='52' x2='54' y2='52'/%3E%3C/g%3E%3Cg%3E%3Cellipse cx='9' cy='29' rx='1.4' ry='2.2' fill='%23c8a060'/%3E%3Cellipse cx='9' cy='29' rx='.7' ry='1.2' fill='%23a07840' opacity='.7'/%3E%3Ccircle cx='9' cy='29' r='.3' fill='%23704020'/%3E%3Cellipse cx='9' cy='35' rx='1.4' ry='2.2' fill='%23c8a060'/%3E%3Cellipse cx='9' cy='35' rx='.7' ry='1.2' fill='%23a07840' opacity='.7'/%3E%3Ccircle cx='9' cy='35' r='.3' fill='%23704020'/%3E%3Cellipse cx='9' cy='41' rx='1.4' ry='2.2' fill='%23c8a060'/%3E%3Cellipse cx='9' cy='41' rx='.7' ry='1.2' fill='%23a07840' opacity='.7'/%3E%3Ccircle cx='9' cy='41' r='.3' fill='%23704020'/%3E%3Cellipse cx='9' cy='47' rx='1.4' ry='2.2' fill='%23c8a060'/%3E%3Cellipse cx='9' cy='47' rx='.7' ry='1.2' fill='%23a07840' opacity='.7'/%3E%3Ccircle cx='9' cy='47' r='.3' fill='%23704020'/%3E%3Cellipse cx='9' cy='53' rx='1.4' ry='2.2' fill='%23c8a060'/%3E%3Cellipse cx='9' cy='53' rx='.7' ry='1.2' fill='%23a07840' opacity='.7'/%3E%3Ccircle cx='9' cy='53' r='.3' fill='%23704020'/%3E%3C/g%3E%3Cg%3E%3Cellipse cx='55' cy='29' rx='1.4' ry='2.2' fill='%23b89858'/%3E%3Cellipse cx='55' cy='29' rx='.7' ry='1.2' fill='%2390683a' opacity='.7'/%3E%3Ccircle cx='55' cy='29' r='.3' fill='%23603810'/%3E%3Cellipse cx='55' cy='35' rx='1.4' ry='2.2' fill='%23b89858'/%3E%3Cellipse cx='55' cy='35' rx='.7' ry='1.2' fill='%2390683a' opacity='.7'/%3E%3Ccircle cx='55' cy='35' r='.3' fill='%23603810'/%3E%3Cellipse cx='55' cy='41' rx='1.4' ry='2.2' fill='%23b89858'/%3E%3Cellipse cx='55' cy='41' rx='.7' ry='1.2' fill='%2390683a' opacity='.7'/%3E%3Ccircle cx='55' cy='41' r='.3' fill='%23603810'/%3E%3Cellipse cx='55' cy='47' rx='1.4' ry='2.2' fill='%23b89858'/%3E%3Cellipse cx='55' cy='47' rx='.7' ry='1.2' fill='%2390683a' opacity='.7'/%3E%3Ccircle cx='55' cy='47' r='.3' fill='%23603810'/%3E%3Cellipse cx='55' cy='53' rx='1.4' ry='2.2' fill='%23b89858'/%3E%3Cellipse cx='55' cy='53' rx='.7' ry='1.2' fill='%2390683a' opacity='.7'/%3E%3Ccircle cx='55' cy='53' r='.3' fill='%23603810'/%3E%3C/g%3E%3Crect x='22' y='40' width='10' height='16' rx='.4' fill='%231a0e04'/%3E%3Crect x='22.5' y='40.5' width='9' height='15' rx='.3' fill='%232a1810' opacity='.6'/%3E%3Crect x='21.5' y='39.5' width='11' height='1' fill='%233a2008'/%3E%3Ccircle cx='30.5' cy='48' r='.4' fill='%23b08858'/%3E%3Crect x='38' y='34' width='8' height='6' rx='.5' fill='%231a1208'/%3E%3Crect x='38.4' y='34.4' width='7.2' height='5.2' rx='.3' fill='%23a0b0a0' opacity='.3'/%3E%3Cline x1='42' y1='34' x2='42' y2='40' stroke='%233a2008' stroke-width='.3'/%3E%3Cline x1='38' y1='37' x2='46' y2='37' stroke='%233a2008' stroke-width='.3'/%3E%3Crect x='37' y='34' width='1.5' height='6' rx='.2' fill='%23604028'/%3E%3Crect x='45.5' y='34' width='1.5' height='6' rx='.2' fill='%23604028'/%3E%3Cg transform='translate(50,54)'%3E%3Cellipse cx='0' cy='3.5' rx='4.5' ry='1.5' fill='%23604020' opacity='.7'/%3E%3Cellipse cx='0' cy='-1' rx='4' ry='1.4' fill='%23a07848'/%3E%3Crect x='-4' y='-1' width='8' height='4.5' fill='url(%23tcl)'/%3E%3Cellipse cx='0' cy='3.5' rx='4' ry='1.4' fill='%23704020' opacity='.4'/%3E%3Cellipse cx='0' cy='-1' rx='2.8' ry='1' fill='none' stroke='%23704020' stroke-width='.2'/%3E%3Cellipse cx='0' cy='-1' rx='1.6' ry='.6' fill='none' stroke='%23704020' stroke-width='.2'/%3E%3Cellipse cx='0' cy='-1' rx='.6' ry='.25' fill='%23603810'/%3E%3Cline x1='-.5' y1='-1' x2='-3.5' y2='-8' stroke='%23604028' stroke-width='1.2' stroke-linecap='round'/%3E%3Cpath d='M-4.5,-9 L-1.5,-10 L-1,-7.5 L-5,-6.5 Z' fill='%23999'/%3E%3Cpath d='M-4.5,-9 L-1.5,-10 L-1,-7.5 Z' fill='%23ccc' opacity='.6'/%3E%3C/g%3E%3Cg transform='translate(38,57)'%3E%3Cellipse cx='0' cy='1' rx='8' ry='1.4' fill='%23502810' opacity='.5'/%3E%3Crect x='-7' y='-.5' width='14' height='2' rx='.4' fill='url(%23tcl)'/%3E%3Cellipse cx='-7' cy='.5' rx='.8' ry='1' fill='%23a07848'/%3E%3Ccircle cx='-7' cy='.5' r='.3' fill='%23603810'/%3E%3Cellipse cx='7' cy='.5' rx='.8' ry='1' fill='%23b89860'/%3E%3Ccircle cx='7' cy='.5' r='.3' fill='%23603810'/%3E%3C/g%3E%3C/svg%3E",
      sawmill: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='smw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a07840'/%3E%3Cstop offset='.5' stop-color='%237a5828'/%3E%3Cstop offset='1' stop-color='%23503818'/%3E%3C/linearGradient%3E%3ClinearGradient id='sms' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23503818'/%3E%3Cstop offset='1' stop-color='%237a5828'/%3E%3C/linearGradient%3E%3ClinearGradient id='smr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23704028'/%3E%3Cstop offset='.5' stop-color='%23502818'/%3E%3Cstop offset='1' stop-color='%23301808'/%3E%3C/linearGradient%3E%3ClinearGradient id='sml' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23c8a060'/%3E%3Cstop offset='1' stop-color='%2390683a'/%3E%3C/linearGradient%3E%3ClinearGradient id='smd' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23e0c080'/%3E%3Cstop offset='1' stop-color='%23a08850'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='26' ry='4' fill='%233a2418' opacity='.45'/%3E%3Cg transform='translate(46,40)'%3E%3Crect x='-2' y='6' width='16' height='3' rx='.4' fill='url(%23sml)'/%3E%3Cellipse cx='-2' cy='7.5' rx='1.2' ry='1.5' fill='%2390683a'/%3E%3Ccircle cx='-2' cy='7.5' r='.7' fill='%23603a18'/%3E%3Ccircle cx='-2' cy='7.5' r='.3' fill='%23806020' opacity='.6'/%3E%3Crect x='-2' y='2' width='16' height='3' rx='.4' fill='url(%23sml)' opacity='.95'/%3E%3Cellipse cx='-2' cy='3.5' rx='1.2' ry='1.5' fill='%23a07848'/%3E%3Ccircle cx='-2' cy='3.5' r='.7' fill='%23704020'/%3E%3Ccircle cx='-2' cy='3.5' r='.3' fill='%23906028' opacity='.6'/%3E%3Crect x='-2' y='-2' width='16' height='3' rx='.4' fill='url(%23sml)' opacity='.9'/%3E%3Cellipse cx='-2' cy='-.5' rx='1.2' ry='1.5' fill='%23b08858'/%3E%3Ccircle cx='-2' cy='-.5' r='.7' fill='%23704020'/%3E%3Ccircle cx='-2' cy='-.5' r='.3' fill='%23906028' opacity='.6'/%3E%3C/g%3E%3Cellipse cx='32' cy='40' rx='24' ry='14' fill='%231a0e04' opacity='.2'/%3E%3Cpolygon points='32,8 8,28 56,28' fill='url(%23smr)'/%3E%3Cg stroke='%231a0e04' stroke-width='.4' opacity='.55' fill='none'%3E%3Cpath d='M14,24 L50,24'/%3E%3Cpath d='M11,26 L53,26'/%3E%3Cpath d='M17,21 L47,21'/%3E%3C/g%3E%3Cpolygon points='32,8 56,28 50,28 38,16' fill='%23604030' opacity='.4'/%3E%3Crect x='6' y='27' width='52' height='2' rx='.3' fill='%231a0a04'/%3E%3Crect x='10' y='28' width='44' height='28' rx='.5' fill='url(%23smw)'/%3E%3Crect x='10' y='28' width='6' height='28' fill='url(%23sms)' opacity='.5'/%3E%3Cg stroke='%233a2008' stroke-width='.4' opacity='.55'%3E%3Cline x1='16' y1='28' x2='16' y2='56'/%3E%3Cline x1='22' y1='28' x2='22' y2='56'/%3E%3Cline x1='28' y1='28' x2='28' y2='56'/%3E%3Cline x1='34' y1='28' x2='34' y2='56'/%3E%3Cline x1='40' y1='28' x2='40' y2='56'/%3E%3Cline x1='46' y1='28' x2='46' y2='56'/%3E%3Cline x1='52' y1='28' x2='52' y2='56'/%3E%3C/g%3E%3Cg stroke='%235a3818' stroke-width='.25' fill='none' opacity='.45'%3E%3Cpath d='M11,33 Q13,32 16,33'/%3E%3Cpath d='M17,38 Q19,37 22,38'/%3E%3Cpath d='M23,42 Q25,41 28,42'/%3E%3Cpath d='M11,46 Q13,45 16,46'/%3E%3Cpath d='M17,50 Q19,49 22,50'/%3E%3Cpath d='M40,32 Q43,31 46,32'/%3E%3Cpath d='M47,38 Q49,37 52,38'/%3E%3Cpath d='M40,46 Q43,45 46,46'/%3E%3Cpath d='M47,50 Q49,49 52,50'/%3E%3C/g%3E%3Crect x='48' y='28' width='6' height='28' fill='%23d4a060' opacity='.15'/%3E%3Crect x='36' y='30' width='16' height='14' rx='.5' fill='%230a0a0a'/%3E%3Crect x='36.5' y='30.5' width='15' height='13' rx='.4' fill='%231a1208' opacity='.7'/%3E%3Crect x='35.5' y='29.5' width='17' height='1' rx='.2' fill='%233a2008'/%3E%3Crect x='35.5' y='43.5' width='17' height='1' rx='.2' fill='%233a2008'/%3E%3Cline x1='39' y1='37' x2='49' y2='37' stroke='%23604020' stroke-width='.4' opacity='.6'/%3E%3Cpath d='M14 56 L14 42 Q21 36 28 42 L28 56 Z' fill='%231a0e04'/%3E%3Cpath d='M14.5 55.5 L14.5 42.5 Q21 37 27.5 42.5 L27.5 55.5 Z' fill='%232a1810' opacity='.7'/%3E%3Cpath d='M13.5 56 L13.5 42 Q21 35 28.5 42 L28.5 56' stroke='%233a2008' stroke-width='.5' fill='none'/%3E%3Ccircle cx='27' cy='49' r='.4' fill='%23b08858'/%3E%3Crect x='18' y='32' width='6' height='5' rx='.5' fill='%231a1208'/%3E%3Crect x='18.4' y='32.4' width='5.2' height='4.2' rx='.3' fill='%23a0b0a0' opacity='.3'/%3E%3Cline x1='21' y1='32' x2='21' y2='37' stroke='%233a2008' stroke-width='.3'/%3E%3Cline x1='18' y1='34.5' x2='24' y2='34.5' stroke='%233a2008' stroke-width='.3'/%3E%3Cellipse cx='32' cy='58' rx='6' ry='1.5' fill='url(%23smd)' opacity='.85'/%3E%3Cellipse cx='33' cy='57.5' rx='3.5' ry='.8' fill='%23f0d090' opacity='.7'/%3E%3Ccircle cx='36' cy='58.5' r='.4' fill='%23e0c080'/%3E%3Ccircle cx='38' cy='58' r='.3' fill='%23d0b070'/%3E%3Ccircle cx='28' cy='58.7' r='.35' fill='%23e0c080'/%3E%3Ccircle cx='26' cy='58.2' r='.3' fill='%23d0b070'/%3E%3Cg fill='%23604030' opacity='.5'%3E%3Cellipse cx='8' cy='58' rx='2' ry='.8'/%3E%3Cellipse cx='56' cy='58' rx='1.8' ry='.7'/%3E%3C/g%3E%3C/svg%3E",
      stone_quarry: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='qrock' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23c8c8d4'/%3E%3Cstop offset='.5' stop-color='%2390909c'/%3E%3Cstop offset='1' stop-color='%23585864'/%3E%3C/linearGradient%3E%3ClinearGradient id='qrockd' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%237a7a88'/%3E%3Cstop offset='.5' stop-color='%2354545c'/%3E%3Cstop offset='1' stop-color='%2334343c'/%3E%3C/linearGradient%3E%3ClinearGradient id='qrocks' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%2334343c'/%3E%3Cstop offset='1' stop-color='%237a7a88'/%3E%3C/linearGradient%3E%3ClinearGradient id='qwood' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a07848'/%3E%3Cstop offset='1' stop-color='%23604020'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='28' ry='4' fill='%232a2a32' opacity='.5'/%3E%3Cellipse cx='28' cy='40' rx='28' ry='22' fill='%231a1a22' opacity='.25'/%3E%3Cpath d='M2 60 L2 22 L6 16 L10 18 L14 12 L18 14 L22 8 L26 10 L30 14 L34 11 L40 18 L46 14 L52 20 L56 16 L60 22 L60 60 Z' fill='url(%23qrockd)'/%3E%3Cpath d='M2 60 L2 22 L6 16 L10 18 L8 60 Z' fill='url(%23qrocks)' opacity='.5'/%3E%3Cg%3E%3Crect x='4' y='30' width='10' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='14' y='28' width='12' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='26' y='32' width='10' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='36' y='30' width='10' height='6' rx='.4' fill='url(%23qrock)' opacity='.92'/%3E%3Crect x='46' y='34' width='10' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='5' y='38' width='10' height='6' rx='.4' fill='url(%23qrock)' opacity='.95'/%3E%3Crect x='15' y='36' width='12' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='27' y='40' width='10' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='37' y='38' width='10' height='6' rx='.4' fill='url(%23qrock)' opacity='.95'/%3E%3Crect x='47' y='42' width='10' height='6' rx='.4' fill='url(%23qrock)' opacity='.92'/%3E%3Crect x='4' y='46' width='12' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='16' y='44' width='12' height='6' rx='.4' fill='url(%23qrock)' opacity='.95'/%3E%3Crect x='28' y='48' width='10' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='38' y='46' width='12' height='6' rx='.4' fill='url(%23qrock)'/%3E%3Crect x='50' y='50' width='8' height='6' rx='.4' fill='url(%23qrock)' opacity='.92'/%3E%3C/g%3E%3Cg stroke='%23404048' stroke-width='.3' opacity='.55' fill='none'%3E%3Cpath d='M4,36 L57,36'/%3E%3Cpath d='M5,44 L57,44'/%3E%3Cpath d='M4,52 L58,52'/%3E%3Cline x1='9' y1='30' x2='9' y2='52'/%3E%3Cline x1='20' y1='28' x2='20' y2='52'/%3E%3Cline x1='32' y1='32' x2='32' y2='54'/%3E%3Cline x1='42' y1='30' x2='42' y2='52'/%3E%3Cline x1='52' y1='34' x2='52' y2='56'/%3E%3C/g%3E%3Cg stroke='%23e0e0e8' stroke-width='.25' opacity='.45'%3E%3Cline x1='6' y1='30' x2='13' y2='30'/%3E%3Cline x1='15' y1='28' x2='25' y2='28'/%3E%3Cline x1='27' y1='32' x2='35' y2='32'/%3E%3Cline x1='37' y1='30' x2='45' y2='30'/%3E%3Cline x1='47' y1='34' x2='55' y2='34'/%3E%3Cline x1='6' y1='38' x2='14' y2='38'/%3E%3Cline x1='17' y1='36' x2='26' y2='36'/%3E%3Cline x1='29' y1='40' x2='36' y2='40'/%3E%3C/g%3E%3Cg%3E%3Crect x='44' y='6' width='1.5' height='28' fill='url(%23qwood)'/%3E%3Crect x='54' y='6' width='1.5' height='28' fill='url(%23qwood)'/%3E%3Crect x='42' y='6' width='15' height='1.5' fill='%23704020'/%3E%3Crect x='43' y='14' width='13' height='1' fill='%23604018'/%3E%3Cline x1='44.5' y1='14' x2='55' y2='6.5' stroke='%23604018' stroke-width='.6'/%3E%3Ccircle cx='49.5' cy='8' r='1.8' fill='%23604018'/%3E%3Ccircle cx='49.5' cy='8' r='1.2' fill='%23888' opacity='.7'/%3E%3Ccircle cx='49.5' cy='8' r='.4' fill='%23222'/%3E%3Cline x1='49.5' y1='9.5' x2='49.5' y2='22' stroke='%23a08850' stroke-width='.5'/%3E%3Crect x='47.5' y='22' width='4' height='3' rx='.2' fill='%23604018'/%3E%3Cellipse cx='49.5' cy='25' rx='2' ry='.5' fill='%23403018'/%3E%3Cline x1='47.5' y1='22' x2='49.5' y2='21' stroke='%23a08850' stroke-width='.4'/%3E%3Cline x1='51.5' y1='22' x2='49.5' y2='21' stroke='%23a08850' stroke-width='.4'/%3E%3Cellipse cx='48.5' cy='22.8' rx='.6' ry='.4' fill='%23a0a0aa'/%3E%3Cellipse cx='50.5' cy='22.5' rx='.5' ry='.4' fill='%23b0b0ba'/%3E%3C/g%3E%3Cg transform='translate(10,53)'%3E%3Cline x1='0' y1='5' x2='5' y2='-8' stroke='%23604018' stroke-width='1' stroke-linecap='round'/%3E%3Cpath d='M3,-9 L8,-10 L9,-7 L4,-6 Z' fill='%23888'/%3E%3Cpath d='M3,-9 L8,-10 L9,-7 Z' fill='%23bbb' opacity='.7'/%3E%3C/g%3E%3Cg fill='%23a0a0aa' opacity='.55'%3E%3Ccircle cx='10' cy='58' r='.5'/%3E%3Ccircle cx='14' cy='59' r='.4'/%3E%3Ccircle cx='20' cy='58' r='.4'/%3E%3Ccircle cx='26' cy='59' r='.4'/%3E%3Ccircle cx='34' cy='58' r='.5'/%3E%3Ccircle cx='40' cy='59' r='.4'/%3E%3C/g%3E%3Cellipse cx='32' cy='57' rx='16' ry='1.6' fill='%23c0c0cc' opacity='.2'/%3E%3C/svg%3E",
      mason_workshop: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='mws' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23b8a898'/%3E%3Cstop offset='.5' stop-color='%238a7a68'/%3E%3Cstop offset='1' stop-color='%23605448'/%3E%3C/linearGradient%3E%3ClinearGradient id='mwss' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23605448'/%3E%3Cstop offset='1' stop-color='%238a7a68'/%3E%3C/linearGradient%3E%3ClinearGradient id='mwr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23d87838'/%3E%3Cstop offset='.5' stop-color='%23a04818'/%3E%3Cstop offset='1' stop-color='%23682810'/%3E%3C/linearGradient%3E%3ClinearGradient id='mwc' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%2390483a'/%3E%3Cstop offset='.5' stop-color='%23603018'/%3E%3Cstop offset='1' stop-color='%233a1808'/%3E%3C/linearGradient%3E%3CradialGradient id='mwf' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0' stop-color='%23ffe080'/%3E%3Cstop offset='.4' stop-color='%23f08020'/%3E%3Cstop offset='1' stop-color='%23682010' stop-opacity='0'/%3E%3C/radialGradient%3E%3ClinearGradient id='mwst' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23d8d0c4'/%3E%3Cstop offset='1' stop-color='%239a9080'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='28' ry='4' fill='%233a2818' opacity='.45'/%3E%3Cellipse cx='30' cy='42' rx='24' ry='15' fill='%231a1208' opacity='.2'/%3E%3Cpolygon points='28,8 4,28 52,28' fill='url(%23mwr)'/%3E%3Cg stroke='%23682810' stroke-width='.4' opacity='.55' fill='none'%3E%3Cpath d='M8,26 Q28,24 48,26'/%3E%3Cpath d='M11,23 Q28,21 45,23'/%3E%3Cpath d='M14,20 Q28,18 42,20'/%3E%3Cpath d='M17,17 Q28,15 39,17'/%3E%3Cpath d='M20,14 Q28,12 36,14'/%3E%3Cpath d='M23,11 Q28,10 33,11'/%3E%3C/g%3E%3Cg stroke='%23682810' stroke-width='.3' opacity='.5'%3E%3Cline x1='12' y1='28' x2='14' y2='25'/%3E%3Cline x1='17' y1='28' x2='18' y2='22'/%3E%3Cline x1='22' y1='28' x2='23' y2='17'/%3E%3Cline x1='27' y1='28' x2='28' y2='10'/%3E%3Cline x1='32' y1='28' x2='33' y2='17'/%3E%3Cline x1='37' y1='28' x2='38' y2='22'/%3E%3Cline x1='42' y1='28' x2='44' y2='25'/%3E%3C/g%3E%3Cpolygon points='28,8 52,28 46,28 36,16' fill='%23f0a060' opacity='.3'/%3E%3Crect x='3' y='28' width='50' height='1.5' fill='%233a1808'/%3E%3Crect x='6' y='29' width='44' height='28' rx='.5' fill='url(%23mws)'/%3E%3Crect x='6' y='29' width='6' height='28' fill='url(%23mwss)' opacity='.5'/%3E%3Cg stroke='%23403828' stroke-width='.4' opacity='.6' fill='none'%3E%3Cpath d='M6,34 Q28,33 50,34'/%3E%3Cpath d='M6,40 Q28,38.5 50,40'/%3E%3Cpath d='M6,46 Q28,44.5 50,46'/%3E%3Cpath d='M6,52 Q28,51 50,52'/%3E%3C/g%3E%3Cg stroke='%23403828' stroke-width='.3' opacity='.55'%3E%3Cline x1='14' y1='29' x2='14' y2='34'/%3E%3Cline x1='22' y1='29' x2='22' y2='34'/%3E%3Cline x1='30' y1='29' x2='30' y2='34'/%3E%3Cline x1='38' y1='29' x2='38' y2='34'/%3E%3Cline x1='46' y1='29' x2='46' y2='34'/%3E%3Cline x1='10' y1='34' x2='10' y2='40'/%3E%3Cline x1='18' y1='34' x2='18' y2='40'/%3E%3Cline x1='26' y1='34' x2='26' y2='40'/%3E%3Cline x1='34' y1='34' x2='34' y2='40'/%3E%3Cline x1='42' y1='34' x2='42' y2='40'/%3E%3Cline x1='14' y1='40' x2='14' y2='46'/%3E%3Cline x1='22' y1='40' x2='22' y2='46'/%3E%3Cline x1='30' y1='40' x2='30' y2='46'/%3E%3Cline x1='38' y1='40' x2='38' y2='46'/%3E%3Cline x1='46' y1='40' x2='46' y2='46'/%3E%3Cline x1='10' y1='46' x2='10' y2='52'/%3E%3Cline x1='18' y1='46' x2='18' y2='52'/%3E%3Cline x1='26' y1='46' x2='26' y2='52'/%3E%3Cline x1='34' y1='46' x2='34' y2='52'/%3E%3Cline x1='42' y1='46' x2='42' y2='52'/%3E%3Cline x1='14' y1='52' x2='14' y2='57'/%3E%3Cline x1='22' y1='52' x2='22' y2='57'/%3E%3Cline x1='30' y1='52' x2='30' y2='57'/%3E%3Cline x1='38' y1='52' x2='38' y2='57'/%3E%3Cline x1='46' y1='52' x2='46' y2='57'/%3E%3C/g%3E%3Cg stroke='%23c8b8a8' stroke-width='.25' opacity='.35'%3E%3Cline x1='8' y1='30' x2='12' y2='30'/%3E%3Cline x1='16' y1='30' x2='20' y2='30'/%3E%3Cline x1='32' y1='30' x2='36' y2='30'/%3E%3Cline x1='12' y1='35' x2='16' y2='35'/%3E%3Cline x1='28' y1='35' x2='32' y2='35'/%3E%3Cline x1='40' y1='35' x2='44' y2='35'/%3E%3C/g%3E%3Crect x='44' y='29' width='6' height='28' fill='%23e0c890' opacity='.18'/%3E%3Cpath d='M16 57 L16 42 Q22 36 28 42 L28 57 Z' fill='%231a0e04'/%3E%3Cellipse cx='22' cy='49' rx='5' ry='4' fill='url(%23mwf)' opacity='.85'/%3E%3Ccircle cx='20' cy='52' r='.6' fill='%23ffe080'/%3E%3Ccircle cx='24' cy='51' r='.5' fill='%23ffd060'/%3E%3Ccircle cx='22' cy='54' r='.4' fill='%23ff9020'/%3E%3Ccircle cx='25' cy='54.5' r='.35' fill='%23ffb040'/%3E%3Cpath d='M15.5 57 L15.5 42 Q22 35 28.5 42 L28.5 57' stroke='%233a2008' stroke-width='.5' fill='none'/%3E%3Crect x='34' y='34' width='6' height='5' rx='.5' fill='%231a1208'/%3E%3Crect x='34.4' y='34.4' width='5.2' height='4.2' rx='.3' fill='%23a0b0a0' opacity='.3'/%3E%3Cline x1='37' y1='34' x2='37' y2='39' stroke='%233a2008' stroke-width='.3'/%3E%3Cline x1='34' y1='36.5' x2='40' y2='36.5' stroke='%233a2008' stroke-width='.3'/%3E%3Crect x='48' y='6' width='10' height='52' rx='.4' fill='url(%23mwc)'/%3E%3Crect x='47' y='5' width='12' height='2' rx='.3' fill='%23502810'/%3E%3Cg stroke='%233a1808' stroke-width='.3' opacity='.6' fill='none'%3E%3Cline x1='48' y1='10' x2='58' y2='10'/%3E%3Cline x1='48' y1='14' x2='58' y2='14'/%3E%3Cline x1='48' y1='18' x2='58' y2='18'/%3E%3Cline x1='48' y1='22' x2='58' y2='22'/%3E%3Cline x1='48' y1='26' x2='58' y2='26'/%3E%3Cline x1='48' y1='30' x2='58' y2='30'/%3E%3Cline x1='48' y1='34' x2='58' y2='34'/%3E%3Cline x1='48' y1='38' x2='58' y2='38'/%3E%3Cline x1='48' y1='42' x2='58' y2='42'/%3E%3Cline x1='48' y1='46' x2='58' y2='46'/%3E%3Cline x1='48' y1='50' x2='58' y2='50'/%3E%3Cline x1='48' y1='54' x2='58' y2='54'/%3E%3Cline x1='51' y1='10' x2='51' y2='14'/%3E%3Cline x1='55' y1='10' x2='55' y2='14'/%3E%3Cline x1='49.5' y1='14' x2='49.5' y2='18'/%3E%3Cline x1='53' y1='14' x2='53' y2='18'/%3E%3Cline x1='56.5' y1='14' x2='56.5' y2='18'/%3E%3Cline x1='51' y1='18' x2='51' y2='22'/%3E%3Cline x1='55' y1='18' x2='55' y2='22'/%3E%3Cline x1='49.5' y1='22' x2='49.5' y2='26'/%3E%3Cline x1='53' y1='22' x2='53' y2='26'/%3E%3Cline x1='56.5' y1='22' x2='56.5' y2='26'/%3E%3Cline x1='51' y1='26' x2='51' y2='30'/%3E%3Cline x1='55' y1='26' x2='55' y2='30'/%3E%3Cline x1='49.5' y1='30' x2='49.5' y2='34'/%3E%3Cline x1='53' y1='30' x2='53' y2='34'/%3E%3Cline x1='56.5' y1='30' x2='56.5' y2='34'/%3E%3Cline x1='51' y1='34' x2='51' y2='38'/%3E%3Cline x1='55' y1='34' x2='55' y2='38'/%3E%3Cline x1='49.5' y1='38' x2='49.5' y2='42'/%3E%3Cline x1='53' y1='38' x2='53' y2='42'/%3E%3Cline x1='56.5' y1='38' x2='56.5' y2='42'/%3E%3Cline x1='51' y1='42' x2='51' y2='46'/%3E%3Cline x1='55' y1='42' x2='55' y2='46'/%3E%3Cline x1='49.5' y1='46' x2='49.5' y2='50'/%3E%3Cline x1='53' y1='46' x2='53' y2='50'/%3E%3Cline x1='56.5' y1='46' x2='56.5' y2='50'/%3E%3Cline x1='51' y1='50' x2='51' y2='54'/%3E%3Cline x1='55' y1='50' x2='55' y2='54'/%3E%3Cline x1='49.5' y1='54' x2='49.5' y2='58'/%3E%3Cline x1='53' y1='54' x2='53' y2='58'/%3E%3Cline x1='56.5' y1='54' x2='56.5' y2='58'/%3E%3C/g%3E%3Crect x='56' y='6' width='2' height='52' fill='%23a06030' opacity='.25'/%3E%3Cellipse cx='52' cy='4' rx='3' ry='1.5' fill='%23aaa' opacity='.4'/%3E%3Cellipse cx='54' cy='2' rx='2' ry='1' fill='%23bbb' opacity='.3'/%3E%3Cg transform='translate(36,49)'%3E%3Crect x='-2' y='5' width='4' height='3' rx='.3' fill='url(%23mwst)'/%3E%3Crect x='-2.5' y='4.5' width='5' height='1' rx='.2' fill='%23888078'/%3E%3Crect x='-1.5' y='-3' width='3' height='8' rx='.5' fill='url(%23mwst)'/%3E%3Crect x='-2' y='-4' width='4' height='1' rx='.2' fill='%23a0988c'/%3E%3Cellipse cx='0' cy='-5' rx='1.4' ry='1.4' fill='url(%23mwst)'/%3E%3Cellipse cx='-.4' cy='-5' rx='.5' ry='.7' fill='%23807870' opacity='.4'/%3E%3C/g%3E%3Cg fill='%23705f4a' opacity='.55'%3E%3Cellipse cx='8' cy='58' rx='2' ry='.7'/%3E%3Cellipse cx='44' cy='58' rx='1.6' ry='.6'/%3E%3C/g%3E%3C/svg%3E",
      grain_farm: 'assets/sprites/grain_farm.svg',
      mill: 'assets/sprites/mill.svg',
      clay_pit: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3CradialGradient id='cpit' cx='50%25' cy='65%25' r='55%25'%3E%3Cstop offset='0' stop-color='%233a2010'/%3E%3Cstop offset='.4' stop-color='%23604028'/%3E%3Cstop offset='.7' stop-color='%23a06840'/%3E%3Cstop offset='1' stop-color='%23c08858'/%3E%3C/radialGradient%3E%3ClinearGradient id='cwater' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%235a8898'/%3E%3Cstop offset='1' stop-color='%233a5868'/%3E%3C/linearGradient%3E%3ClinearGradient id='crim' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a07848'/%3E%3Cstop offset='1' stop-color='%23604018'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='38' rx='30' ry='14' fill='url(%23crim)'/%3E%3Cellipse cx='32' cy='38' rx='30' ry='14' fill='none' stroke='%233a2010' stroke-width='.8' opacity='.5'/%3E%3Cellipse cx='32' cy='40' rx='24' ry='12' fill='url(%23cpit)'/%3E%3Cellipse cx='32' cy='44' rx='15' ry='4' fill='url(%23cwater)'/%3E%3Cellipse cx='30' cy='43' rx='4' ry='.8' fill='%2390b8c8' opacity='.5'/%3E%3Cellipse cx='35' cy='44' rx='3' ry='.6' fill='%23a0c8d8' opacity='.4'/%3E%3Cline x1='28' y1='42.5' x2='32' y2='42.5' stroke='%23a0c8d8' stroke-width='.3' opacity='.6'/%3E%3Cg stroke='%233a2010' stroke-width='.4' opacity='.6' fill='none'%3E%3Cellipse cx='32' cy='34' rx='22' ry='4'/%3E%3Cellipse cx='32' cy='38' rx='20' ry='5'/%3E%3Cellipse cx='32' cy='42' rx='17' ry='5.5'/%3E%3C/g%3E%3Cg fill='%23a06840' opacity='.4'%3E%3Cellipse cx='14' cy='38' rx='2' ry='.6'/%3E%3Cellipse cx='50' cy='38' rx='2' ry='.6'/%3E%3Cellipse cx='20' cy='42' rx='1.5' ry='.5'/%3E%3Cellipse cx='44' cy='42' rx='1.5' ry='.5'/%3E%3C/g%3E%3Cg fill='%23806838' opacity='.6'%3E%3Ccircle cx='8' cy='34' r='.4'/%3E%3Ccircle cx='12' cy='32' r='.4'/%3E%3Ccircle cx='52' cy='34' r='.4'/%3E%3Ccircle cx='56' cy='32' r='.4'/%3E%3Ccircle cx='10' cy='44' r='.4'/%3E%3Ccircle cx='54' cy='44' r='.4'/%3E%3Ccircle cx='8' cy='40' r='.3'/%3E%3Ccircle cx='56' cy='40' r='.3'/%3E%3C/g%3E%3Cg%3E%3Crect x='52' y='14' width='2' height='22' fill='%23604028'/%3E%3Crect x='42' y='14' width='14' height='1.5' fill='%23503018'/%3E%3Cline x1='53' y1='22' x2='46' y2='15' stroke='%23503018' stroke-width='.6'/%3E%3Ccircle cx='44' cy='17' r='1.6' fill='%233a2008'/%3E%3Ccircle cx='44' cy='17' r='1.1' fill='%23777' opacity='.6'/%3E%3Ccircle cx='44' cy='17' r='.4' fill='%23222'/%3E%3Cline x1='44' y1='18.5' x2='44' y2='40' stroke='%23a08850' stroke-width='.5'/%3E%3Crect x='42' y='40' width='4' height='3.5' rx='.2' fill='%23604018'/%3E%3Cellipse cx='44' cy='43.5' rx='2' ry='.5' fill='%233a2008'/%3E%3Cellipse cx='44' cy='40' rx='2' ry='.6' fill='%23503018'/%3E%3Cellipse cx='44' cy='40' rx='1.6' ry='.4' fill='%233a2008'/%3E%3Cline x1='42' y1='40' x2='44' y2='38.5' stroke='%23a08850' stroke-width='.4'/%3E%3Cline x1='46' y1='40' x2='44' y2='38.5' stroke='%23a08850' stroke-width='.4'/%3E%3Cellipse cx='43.5' cy='40.7' rx='.6' ry='.3' fill='%23c08858'/%3E%3C/g%3E%3Cg transform='translate(8,30)'%3E%3Cline x1='0' y1='-2' x2='3' y2='-12' stroke='%23604028' stroke-width='.7' stroke-linecap='round'/%3E%3Cpath d='M-1 -2 L1 -1 L1.5 1 L-.5 1 Z' fill='%23888'/%3E%3Cpath d='M-1 -2 L1 -1 L1.5 1 L-.5 1 Z' fill='%23bbb' opacity='.4'/%3E%3C/g%3E%3Cg transform='translate(58,30)'%3E%3Cline x1='0' y1='-2' x2='-3' y2='-12' stroke='%23604028' stroke-width='.7' stroke-linecap='round'/%3E%3Cpath d='M-2 -2 L1 -3 L2 -.5 L-1 .5 Z' fill='%23888'/%3E%3Cpath d='M-2 -2 L1 -3 L2 -.5 Z' fill='%23bbb' opacity='.5'/%3E%3C/g%3E%3Cg fill='%235a3818' opacity='.45'%3E%3Cellipse cx='12' cy='52' rx='.7' ry='.4'/%3E%3Cellipse cx='15' cy='53' rx='.6' ry='.4'/%3E%3Cellipse cx='18' cy='52' rx='.7' ry='.4'/%3E%3Cellipse cx='21' cy='53' rx='.6' ry='.4'/%3E%3Cellipse cx='49' cy='52' rx='.7' ry='.4'/%3E%3Cellipse cx='52' cy='53' rx='.6' ry='.4'/%3E%3C/g%3E%3Cg%3E%3Cellipse cx='14' cy='32' rx='3' ry='.8' fill='%233a2010' opacity='.6'/%3E%3Cpath d='M11 32 Q14 28 17 32 Z' fill='%23a06840'/%3E%3Cpath d='M11.5 32 Q14 29 16.5 32' stroke='%23604018' stroke-width='.3' fill='none' opacity='.6'/%3E%3C/g%3E%3C/svg%3E",
      pottery_kiln: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='pkd' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a05a40'/%3E%3Cstop offset='.5' stop-color='%23704028'/%3E%3Cstop offset='1' stop-color='%233a2010'/%3E%3C/linearGradient%3E%3ClinearGradient id='pkds' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%233a2010'/%3E%3Cstop offset='1' stop-color='%23704028'/%3E%3C/linearGradient%3E%3CradialGradient id='pkf' cx='50%25' cy='40%25' r='50%25'%3E%3Cstop offset='0' stop-color='%23fff080'/%3E%3Cstop offset='.4' stop-color='%23f08020'/%3E%3Cstop offset='1' stop-color='%23682010' stop-opacity='0'/%3E%3C/radialGradient%3E%3ClinearGradient id='pkpot' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23c87850'/%3E%3Cstop offset='1' stop-color='%23704028'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='28' ry='4' fill='%233a2010' opacity='.5'/%3E%3Cpath d='M14 56 L14 36 Q14 14 32 12 Q50 14 50 36 L50 56 Z' fill='url(%23pkd)'/%3E%3Cpath d='M14 56 L14 36 Q14 14 18 12 Q22 16 22 36 L22 56 Z' fill='url(%23pkds)' opacity='.5'/%3E%3Cg stroke='%231a0e04' stroke-width='.4' opacity='.6' fill='none'%3E%3Cpath d='M14,18 Q32,11 50,18'/%3E%3Cpath d='M14,24 Q32,18 50,24'/%3E%3Cpath d='M14,30 Q32,25 50,30'/%3E%3Cpath d='M14,36 Q32,32 50,36'/%3E%3Cpath d='M14,42 L50,42'/%3E%3Cpath d='M14,48 L50,48'/%3E%3Cpath d='M14,54 L50,54'/%3E%3C/g%3E%3Cg stroke='%231a0e04' stroke-width='.3' opacity='.55' fill='none'%3E%3Cpath d='M22,18 L21,12'/%3E%3Cpath d='M32,18 L32,11'/%3E%3Cpath d='M42,18 L43,12'/%3E%3Cpath d='M18,24 L17,18'/%3E%3Cpath d='M27,24 L27,18'/%3E%3Cpath d='M37,24 L37,18'/%3E%3Cpath d='M46,24 L47,18'/%3E%3Cpath d='M16,30 L16,24'/%3E%3Cpath d='M24,30 L24,24'/%3E%3Cpath d='M32,30 L32,24'/%3E%3Cpath d='M40,30 L40,24'/%3E%3Cpath d='M48,30 L48,24'/%3E%3Cpath d='M19,36 L19,30'/%3E%3Cpath d='M28,36 L28,30'/%3E%3Cpath d='M36,36 L36,30'/%3E%3Cpath d='M45,36 L45,30'/%3E%3Cpath d='M16,42 L16,36'/%3E%3Cpath d='M22,42 L22,36'/%3E%3Cpath d='M28,42 L28,36'/%3E%3Cpath d='M40,42 L40,36'/%3E%3Cpath d='M48,42 L48,36'/%3E%3Cpath d='M20,48 L20,42'/%3E%3Cpath d='M28,48 L28,42'/%3E%3Cpath d='M36,48 L36,42'/%3E%3Cpath d='M44,48 L44,42'/%3E%3Cpath d='M16,54 L16,48'/%3E%3Cpath d='M24,54 L24,48'/%3E%3Cpath d='M32,54 L32,48'/%3E%3Cpath d='M40,54 L40,48'/%3E%3Cpath d='M48,54 L48,48'/%3E%3C/g%3E%3Cg stroke='%23c08060' stroke-width='.3' opacity='.35' fill='none'%3E%3Cpath d='M18,18 Q24,15 28,16'/%3E%3Cpath d='M28,28 Q34,25 38,28'/%3E%3Cpath d='M38,40 Q42,38 46,40'/%3E%3C/g%3E%3Cpath d='M44 12 Q50 14 50 36 L50 56 L46 56 L46 36 Q46 16 44 12 Z' fill='%23e0a060' opacity='.18'/%3E%3Crect x='24' y='44' width='16' height='12' rx='.5' fill='%231a0a04'/%3E%3Cellipse cx='32' cy='50' rx='7' ry='4' fill='url(%23pkf)' opacity='.95'/%3E%3Ccircle cx='28' cy='52' r='.7' fill='%23ffe080'/%3E%3Ccircle cx='34' cy='51' r='.6' fill='%23ffd060'/%3E%3Ccircle cx='30' cy='54' r='.5' fill='%23ff9020'/%3E%3Ccircle cx='35' cy='54' r='.5' fill='%23ffb040'/%3E%3Ccircle cx='32' cy='53' r='.4' fill='%23fff0a0'/%3E%3Crect x='23.5' y='43.5' width='17' height='1' rx='.2' fill='%233a2008'/%3E%3Cellipse cx='32' cy='12' rx='3' ry='1' fill='%231a0a04'/%3E%3Cellipse cx='32' cy='12' rx='2' ry='.7' fill='%23502010'/%3E%3Cg transform='translate(7,52)'%3E%3Cellipse cx='0' cy='4' rx='3.5' ry='1' fill='%233a2010' opacity='.6'/%3E%3Cpath d='M-3 4 Q-3.5 -1 0 -2 Q3.5 -1 3 4 Z' fill='url(%23pkpot)'/%3E%3Cellipse cx='0' cy='-2' rx='2.8' ry='.8' fill='%23a06848'/%3E%3Cellipse cx='0' cy='-2' rx='2.2' ry='.5' fill='%23704028'/%3E%3Cpath d='M-3 0 Q0 .3 3 0' stroke='%233a2010' stroke-width='.3' fill='none' opacity='.7'/%3E%3C/g%3E%3Cg transform='translate(11,55)'%3E%3Cellipse cx='0' cy='2.5' rx='2' ry='.6' fill='%233a2010' opacity='.6'/%3E%3Cpath d='M-1.7 2.5 Q-2 -.5 0 -1.2 Q2 -.5 1.7 2.5 Z' fill='url(%23pkpot)'/%3E%3Cellipse cx='0' cy='-1.2' rx='1.6' ry='.5' fill='%23a06848'/%3E%3Cellipse cx='0' cy='-1.2' rx='1.2' ry='.3' fill='%23704028'/%3E%3C/g%3E%3Cg transform='translate(56,53)'%3E%3Cellipse cx='0' cy='3' rx='3' ry='.8' fill='%233a2010' opacity='.6'/%3E%3Cpath d='M-2.5 3 Q-3 -1 0 -1.8 Q3 -1 2.5 3 Z' fill='url(%23pkpot)'/%3E%3Cellipse cx='0' cy='-1.8' rx='2.4' ry='.6' fill='%23a06848'/%3E%3Cellipse cx='0' cy='-1.8' rx='1.8' ry='.4' fill='%23704028'/%3E%3Cpath d='M2.5 0 Q3.5 0 3.3 -.5' stroke='%23704028' stroke-width='.3' fill='none'/%3E%3C/g%3E%3C/svg%3E",
      bakery: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='bkw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23a0683a'/%3E%3Cstop offset='.5' stop-color='%23704018'/%3E%3Cstop offset='1' stop-color='%23502810'/%3E%3C/linearGradient%3E%3ClinearGradient id='bks' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23502810'/%3E%3Cstop offset='1' stop-color='%23704018'/%3E%3C/linearGradient%3E%3ClinearGradient id='bkr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23806038'/%3E%3Cstop offset='.5' stop-color='%23503018'/%3E%3Cstop offset='1' stop-color='%23301808'/%3E%3C/linearGradient%3E%3CradialGradient id='bkg' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0' stop-color='%23fff0a0'/%3E%3Cstop offset='.5' stop-color='%23f0a040'/%3E%3Cstop offset='1' stop-color='%23682010' stop-opacity='0'/%3E%3C/radialGradient%3E%3ClinearGradient id='bkl' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23e0b878'/%3E%3Cstop offset='1' stop-color='%23a07840'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='28' ry='4' fill='%233a2010' opacity='.5'/%3E%3Cellipse cx='30' cy='42' rx='24' ry='14' fill='%231a0e04' opacity='.2'/%3E%3Cpolygon points='32,8 6,28 50,28' fill='url(%23bkr)'/%3E%3Cg stroke='%23a07028' stroke-width='.4' opacity='.45' fill='none'%3E%3Cpath d='M11,25 L14,15'/%3E%3Cpath d='M16,25 L18,12'/%3E%3Cpath d='M21,25 L22,9'/%3E%3Cpath d='M27,25 L28,8'/%3E%3Cpath d='M32,25 L32,7'/%3E%3Cpath d='M37,25 L37,8'/%3E%3Cpath d='M42,25 L42,9'/%3E%3Cpath d='M47,25 L46,12'/%3E%3C/g%3E%3Crect x='5' y='27.5' width='46' height='1.5' fill='%231a0e04'/%3E%3Crect x='8' y='28' width='40' height='28' rx='.4' fill='url(%23bkw)'/%3E%3Crect x='8' y='28' width='6' height='28' fill='url(%23bks)' opacity='.5'/%3E%3Cg stroke='%233a1808' stroke-width='.3' opacity='.6' fill='none'%3E%3Cpath d='M8,32 Q28,31.5 48,32'/%3E%3Cpath d='M8,36 Q28,35.5 48,36'/%3E%3Cpath d='M8,40 Q28,39.5 48,40'/%3E%3Cpath d='M8,44 Q28,43.5 48,44'/%3E%3Cpath d='M8,48 Q28,47.5 48,48'/%3E%3Cpath d='M8,52 Q28,51.5 48,52'/%3E%3C/g%3E%3Cg stroke='%233a1808' stroke-width='.3' opacity='.55'%3E%3Cline x1='12' y1='28' x2='12' y2='32'/%3E%3Cline x1='20' y1='28' x2='20' y2='32'/%3E%3Cline x1='28' y1='28' x2='28' y2='32'/%3E%3Cline x1='36' y1='28' x2='36' y2='32'/%3E%3Cline x1='44' y1='28' x2='44' y2='32'/%3E%3Cline x1='16' y1='32' x2='16' y2='36'/%3E%3Cline x1='24' y1='32' x2='24' y2='36'/%3E%3Cline x1='32' y1='32' x2='32' y2='36'/%3E%3Cline x1='40' y1='32' x2='40' y2='36'/%3E%3Cline x1='12' y1='36' x2='12' y2='40'/%3E%3Cline x1='20' y1='36' x2='20' y2='40'/%3E%3Cline x1='28' y1='36' x2='28' y2='40'/%3E%3Cline x1='36' y1='36' x2='36' y2='40'/%3E%3Cline x1='44' y1='36' x2='44' y2='40'/%3E%3Cline x1='16' y1='40' x2='16' y2='44'/%3E%3Cline x1='24' y1='40' x2='24' y2='44'/%3E%3Cline x1='32' y1='40' x2='32' y2='44'/%3E%3Cline x1='40' y1='40' x2='40' y2='44'/%3E%3Cline x1='12' y1='44' x2='12' y2='48'/%3E%3Cline x1='20' y1='44' x2='20' y2='48'/%3E%3Cline x1='40' y1='44' x2='40' y2='48'/%3E%3Cline x1='44' y1='44' x2='44' y2='48'/%3E%3Cline x1='16' y1='48' x2='16' y2='52'/%3E%3Cline x1='24' y1='48' x2='24' y2='52'/%3E%3Cline x1='32' y1='48' x2='32' y2='52'/%3E%3Cline x1='40' y1='48' x2='40' y2='52'/%3E%3Cline x1='12' y1='52' x2='12' y2='56'/%3E%3Cline x1='20' y1='52' x2='20' y2='56'/%3E%3Cline x1='28' y1='52' x2='28' y2='56'/%3E%3Cline x1='36' y1='52' x2='36' y2='56'/%3E%3Cline x1='44' y1='52' x2='44' y2='56'/%3E%3C/g%3E%3Cg stroke='%23c08868' stroke-width='.25' opacity='.35'%3E%3Cline x1='16' y1='30' x2='20' y2='30'/%3E%3Cline x1='32' y1='30' x2='36' y2='30'/%3E%3Cline x1='28' y1='38' x2='32' y2='38'/%3E%3Cline x1='40' y1='42' x2='44' y2='42'/%3E%3C/g%3E%3Crect x='42' y='28' width='6' height='28' fill='%23e0b890' opacity='.18'/%3E%3Cpath d='M20 56 L20 44 Q20 36 28 36 Q36 36 36 44 L36 56 Z' fill='%231a0a04'/%3E%3Cellipse cx='28' cy='46' rx='7' ry='6' fill='url(%23bkg)' opacity='.9'/%3E%3Ccircle cx='25' cy='48' r='.6' fill='%23ffe080'/%3E%3Ccircle cx='30' cy='48' r='.5' fill='%23ffd060'/%3E%3Ccircle cx='28' cy='51' r='.5' fill='%23ff9020'/%3E%3Ccircle cx='32' cy='50' r='.4' fill='%23ffb040'/%3E%3Cpath d='M19.5 56 L19.5 44 Q19.5 35 28 35 Q36.5 35 36.5 44 L36.5 56' stroke='%233a1808' stroke-width='.5' fill='none'/%3E%3Crect x='38' y='38' width='10' height='1' fill='%235a3018'/%3E%3Cellipse cx='40' cy='37.5' rx='1.4' ry='1' fill='url(%23bkl)'/%3E%3Cellipse cx='40' cy='37' rx='1.2' ry='.7' fill='%23e8c490' opacity='.7'/%3E%3Cline x1='39.5' y1='37' x2='40.5' y2='37' stroke='%23704028' stroke-width='.2'/%3E%3Cellipse cx='43' cy='37.5' rx='1.7' ry='.8' fill='url(%23bkl)'/%3E%3Cellipse cx='43' cy='37' rx='1.4' ry='.5' fill='%23e8c490' opacity='.7'/%3E%3Cline x1='42' y1='37' x2='44' y2='37' stroke='%23704028' stroke-width='.2'/%3E%3Cellipse cx='46' cy='37.5' rx='1.2' ry='.9' fill='url(%23bkl)'/%3E%3Cellipse cx='46' cy='37' rx='1' ry='.5' fill='%23e8c490' opacity='.7'/%3E%3Cline x1='45.5' y1='37' x2='46.5' y2='37' stroke='%23704028' stroke-width='.2'/%3E%3Crect x='38' y='30' width='10' height='6' rx='.3' fill='%231a0e04'/%3E%3Crect x='38.4' y='30.4' width='9.2' height='5.2' rx='.2' fill='%23a0b8c8' opacity='.3'/%3E%3Cline x1='43' y1='30' x2='43' y2='36' stroke='%233a1808' stroke-width='.4'/%3E%3Cline x1='38' y1='33' x2='48' y2='33' stroke='%233a1808' stroke-width='.4'/%3E%3Crect x='45' y='14' width='4' height='14' rx='.2' fill='%23502810'/%3E%3Crect x='44.5' y='13' width='5' height='1.5' rx='.2' fill='%233a1808'/%3E%3Cg stroke='%233a1808' stroke-width='.3'%3E%3Cline x1='45' y1='18' x2='49' y2='18'/%3E%3Cline x1='45' y1='23' x2='49' y2='23'/%3E%3C/g%3E%3Cellipse cx='47' cy='10' rx='2.5' ry='1.2' fill='%23aaa' opacity='.4'/%3E%3Cellipse cx='49' cy='7' rx='2' ry='.8' fill='%23bbb' opacity='.3'/%3E%3C/svg%3E",
      woodcarver: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='wcw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23788838'/%3E%3Cstop offset='.5' stop-color='%23506830'/%3E%3Cstop offset='1' stop-color='%23384818'/%3E%3C/linearGradient%3E%3ClinearGradient id='wcs' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23384818'/%3E%3Cstop offset='1' stop-color='%23506830'/%3E%3C/linearGradient%3E%3ClinearGradient id='wcr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%235a6a30'/%3E%3Cstop offset='.5' stop-color='%23384a18'/%3E%3Cstop offset='1' stop-color='%231a2808'/%3E%3C/linearGradient%3E%3ClinearGradient id='wcwood' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23c8a060'/%3E%3Cstop offset='1' stop-color='%2390683a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='28' ry='4' fill='%233a2818' opacity='.45'/%3E%3Cellipse cx='30' cy='42' rx='24' ry='14' fill='%231a1a08' opacity='.2'/%3E%3Cpolygon points='32,8 6,28 50,28' fill='url(%23wcr)'/%3E%3Cg stroke='%231a2808' stroke-width='.4' opacity='.55' fill='none'%3E%3Cpath d='M9,26 Q28,24 47,26'/%3E%3Cpath d='M12,22 Q28,20 44,22'/%3E%3Cpath d='M15,18 Q28,16 41,18'/%3E%3Cpath d='M19,14 Q28,12 37,14'/%3E%3C/g%3E%3Cpolygon points='32,8 50,28 44,28 36,16' fill='%23a0b860' opacity='.3'/%3E%3Crect x='5' y='27.5' width='46' height='1.5' fill='%231a2808'/%3E%3Crect x='8' y='28' width='40' height='28' rx='.4' fill='url(%23wcw)'/%3E%3Crect x='8' y='28' width='6' height='28' fill='url(%23wcs)' opacity='.5'/%3E%3Cg stroke='%23283818' stroke-width='.4' opacity='.55'%3E%3Cline x1='14' y1='28' x2='14' y2='56'/%3E%3Cline x1='20' y1='28' x2='20' y2='56'/%3E%3Cline x1='26' y1='28' x2='26' y2='56'/%3E%3Cline x1='32' y1='28' x2='32' y2='56'/%3E%3Cline x1='38' y1='28' x2='38' y2='56'/%3E%3Cline x1='44' y1='28' x2='44' y2='56'/%3E%3C/g%3E%3Cg stroke='%23384a18' stroke-width='.25' fill='none' opacity='.4'%3E%3Cpath d='M10,34 Q12,33 14,34'/%3E%3Cpath d='M22,38 Q24,37 26,38'/%3E%3Cpath d='M34,42 Q36,41 38,42'/%3E%3Cpath d='M16,46 Q18,45 20,46'/%3E%3Cpath d='M40,50 Q42,49 44,50'/%3E%3C/g%3E%3Crect x='42' y='28' width='6' height='28' fill='%23c0d088' opacity='.18'/%3E%3Cpath d='M22 56 L22 36 Q26 32 30 32 Q34 32 38 36 L38 56 Z' fill='%231a1808'/%3E%3Cpath d='M23 56 L23 36 Q26 33 30 33 Q34 33 37 36 L37 56 Z' fill='%23283018' opacity='.6'/%3E%3Cpath d='M21.5 56 L21.5 36 Q26 31 30 31 Q34 31 38.5 36 L38.5 56' stroke='%23283018' stroke-width='.5' fill='none'/%3E%3Crect x='27' y='52' width='6' height='4' fill='url(%23wcwood)'/%3E%3Cellipse cx='30' cy='52' rx='3' ry='1' fill='%23a07848'/%3E%3Cellipse cx='30' cy='56' rx='3' ry='1' fill='%235a3818'/%3E%3Crect x='28' y='42' width='4' height='10' rx='.5' fill='url(%23wcwood)'/%3E%3Cellipse cx='30' cy='40' rx='2' ry='2.2' fill='url(%23wcwood)'/%3E%3Cg stroke='%23704020' stroke-width='.25' opacity='.5'%3E%3Cline x1='28.5' y1='44' x2='29.5' y2='45.5'/%3E%3Cline x1='30.5' y1='46' x2='31.5' y2='47.5'/%3E%3Cline x1='28.5' y1='49' x2='29.5' y2='50.5'/%3E%3Cline x1='29' y1='39' x2='30' y2='39.5'/%3E%3Cline x1='30.5' y1='40' x2='31' y2='41'/%3E%3C/g%3E%3Cellipse cx='30.5' cy='46' rx='.8' ry='3' fill='%23e0b878' opacity='.35'/%3E%3Crect x='40' y='34' width='6' height='6' rx='.3' fill='%231a1808'/%3E%3Crect x='40.4' y='34.4' width='5.2' height='5.2' rx='.2' fill='%23a0b890' opacity='.3'/%3E%3Cline x1='43' y1='34' x2='43' y2='40' stroke='%23283018' stroke-width='.4'/%3E%3Cline x1='40' y1='37' x2='46' y2='37' stroke='%23283018' stroke-width='.4'/%3E%3Cg fill='%23604018' opacity='.7'%3E%3Ccircle cx='40.3' cy='34.3' r='.3'/%3E%3Ccircle cx='45.7' cy='34.3' r='.3'/%3E%3C/g%3E%3Cg%3E%3Crect x='4' y='48' width='8' height='3' rx='.3' fill='url(%23wcwood)'/%3E%3Cellipse cx='4' cy='49.5' rx='.7' ry='1.4' fill='%23a07848'/%3E%3Ccircle cx='4' cy='49.5' r='.4' fill='%23603810'/%3E%3Crect x='5' y='44' width='6' height='3' rx='.3' fill='url(%23wcwood)' opacity='.95'/%3E%3Cellipse cx='5' cy='45.5' rx='.7' ry='1.4' fill='%23b08858'/%3E%3Ccircle cx='5' cy='45.5' r='.4' fill='%23603810'/%3E%3Crect x='6' y='40' width='5' height='3' rx='.3' fill='url(%23wcwood)' opacity='.9'/%3E%3Cellipse cx='6' cy='41.5' rx='.7' ry='1.4' fill='%23a07848'/%3E%3Ccircle cx='6' cy='41.5' r='.4' fill='%23603810'/%3E%3C/g%3E%3Cg fill='%23c0a060' opacity='.7'%3E%3Cpath d='M16 58 L18 57.5 L17 59 Z'/%3E%3Cpath d='M22 59 L24 58 L23 59.5 Z'/%3E%3Cpath d='M40 59 L42 58 L41 59.5 Z'/%3E%3Cpath d='M48 58 L50 57.5 L49 59 Z'/%3E%3C/g%3E%3Cg fill='%23a08040' opacity='.6'%3E%3Cpath d='M14 59 L16 58 L15.5 59.5 Z'/%3E%3Cpath d='M44 59.5 L46 58.5 L45 60 Z'/%3E%3Cpath d='M52 58 L54 57 L53 58.5 Z'/%3E%3C/g%3E%3C/svg%3E",
      sculptor: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='scw' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%238a7898'/%3E%3Cstop offset='.5' stop-color='%235a4870'/%3E%3Cstop offset='1' stop-color='%23382c50'/%3E%3C/linearGradient%3E%3ClinearGradient id='scs' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23382c50'/%3E%3Cstop offset='1' stop-color='%235a4870'/%3E%3C/linearGradient%3E%3ClinearGradient id='scr' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%235a4870'/%3E%3Cstop offset='.5' stop-color='%233a2c50'/%3E%3Cstop offset='1' stop-color='%231a1428'/%3E%3C/linearGradient%3E%3ClinearGradient id='scstone' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23e8e0e8'/%3E%3Cstop offset='1' stop-color='%23a8a0b0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='60' rx='28' ry='4' fill='%232a2030' opacity='.45'/%3E%3Cellipse cx='34' cy='42' rx='24' ry='14' fill='%231a1428' opacity='.2'/%3E%3Cpolygon points='32,8 6,28 50,28' fill='url(%23scr)'/%3E%3Cg stroke='%231a1428' stroke-width='.4' opacity='.55' fill='none'%3E%3Cpath d='M9,26 Q28,24 47,26'/%3E%3Cpath d='M12,22 Q28,20 44,22'/%3E%3Cpath d='M15,18 Q28,16 41,18'/%3E%3Cpath d='M19,14 Q28,12 37,14'/%3E%3C/g%3E%3Cpolygon points='32,8 50,28 44,28 36,16' fill='%23a090b8' opacity='.3'/%3E%3Crect x='5' y='27.5' width='46' height='1.5' fill='%231a1428'/%3E%3Crect x='8' y='28' width='40' height='28' rx='.4' fill='url(%23scw)'/%3E%3Crect x='8' y='28' width='6' height='28' fill='url(%23scs)' opacity='.5'/%3E%3Cg stroke='%2328203a' stroke-width='.4' opacity='.6' fill='none'%3E%3Cpath d='M8,34 Q28,33.5 48,34'/%3E%3Cpath d='M8,40 Q28,39.5 48,40'/%3E%3Cpath d='M8,46 Q28,45.5 48,46'/%3E%3Cpath d='M8,52 Q28,51.5 48,52'/%3E%3C/g%3E%3Cg stroke='%2328203a' stroke-width='.3' opacity='.55'%3E%3Cline x1='14' y1='28' x2='14' y2='34'/%3E%3Cline x1='22' y1='28' x2='22' y2='34'/%3E%3Cline x1='30' y1='28' x2='30' y2='34'/%3E%3Cline x1='38' y1='28' x2='38' y2='34'/%3E%3Cline x1='44' y1='28' x2='44' y2='34'/%3E%3Cline x1='10' y1='34' x2='10' y2='40'/%3E%3Cline x1='18' y1='34' x2='18' y2='40'/%3E%3Cline x1='26' y1='34' x2='26' y2='40'/%3E%3Cline x1='34' y1='34' x2='34' y2='40'/%3E%3Cline x1='42' y1='34' x2='42' y2='40'/%3E%3Cline x1='14' y1='40' x2='14' y2='46'/%3E%3Cline x1='22' y1='40' x2='22' y2='46'/%3E%3Cline x1='30' y1='40' x2='30' y2='46'/%3E%3Cline x1='38' y1='40' x2='38' y2='46'/%3E%3Cline x1='44' y1='40' x2='44' y2='46'/%3E%3Cline x1='10' y1='46' x2='10' y2='52'/%3E%3Cline x1='18' y1='46' x2='18' y2='52'/%3E%3Cline x1='26' y1='46' x2='26' y2='52'/%3E%3Cline x1='34' y1='46' x2='34' y2='52'/%3E%3Cline x1='42' y1='46' x2='42' y2='52'/%3E%3Cline x1='14' y1='52' x2='14' y2='56'/%3E%3Cline x1='22' y1='52' x2='22' y2='56'/%3E%3Cline x1='30' y1='52' x2='30' y2='56'/%3E%3Cline x1='38' y1='52' x2='38' y2='56'/%3E%3Cline x1='44' y1='52' x2='44' y2='56'/%3E%3C/g%3E%3Cg stroke='%23a898c0' stroke-width='.25' opacity='.35'%3E%3Cline x1='10' y1='30' x2='14' y2='30'/%3E%3Cline x1='30' y1='30' x2='34' y2='30'/%3E%3Cline x1='18' y1='36' x2='22' y2='36'/%3E%3Cline x1='38' y1='42' x2='42' y2='42'/%3E%3C/g%3E%3Crect x='42' y='28' width='6' height='28' fill='%23d8c8e0' opacity='.18'/%3E%3Cpath d='M22 56 L22 36 Q26 32 30 32 Q34 32 38 36 L38 56 Z' fill='%231a1428'/%3E%3Cpath d='M23 56 L23 36 Q26 33 30 33 Q34 33 37 36 L37 56 Z' fill='%2328203a' opacity='.6'/%3E%3Cpath d='M21.5 56 L21.5 36 Q26 31 30 31 Q34 31 38.5 36 L38.5 56' stroke='%2328203a' stroke-width='.5' fill='none'/%3E%3Crect x='27' y='38' width='6' height='14' rx='.3' fill='url(%23scstone)'/%3E%3Cellipse cx='30' cy='42' rx='1.6' ry='2' fill='%23c0b8c8' opacity='.7'/%3E%3Cg stroke='%23706080' stroke-width='.25' opacity='.5'%3E%3Cline x1='27.5' y1='40' x2='28' y2='41'/%3E%3Cline x1='32' y1='40' x2='32.5' y2='41'/%3E%3Cline x1='28' y1='44' x2='28.5' y2='45'/%3E%3Cline x1='32' y1='44' x2='32.5' y2='45'/%3E%3Cline x1='27.5' y1='48' x2='28' y2='49'/%3E%3Cline x1='32' y1='48' x2='32.5' y2='49'/%3E%3Cline x1='28' y1='50' x2='28.5' y2='51'/%3E%3Cline x1='32' y1='50' x2='32.5' y2='51'/%3E%3C/g%3E%3Cellipse cx='32' cy='46' rx='.6' ry='5' fill='%23f0e8f0' opacity='.4'/%3E%3Crect x='40' y='34' width='6' height='6' rx='.3' fill='%231a1428'/%3E%3Crect x='40.4' y='34.4' width='5.2' height='5.2' rx='.2' fill='%23a8a0b8' opacity='.3'/%3E%3Cline x1='43' y1='34' x2='43' y2='40' stroke='%2328203a' stroke-width='.4'/%3E%3Cline x1='40' y1='37' x2='46' y2='37' stroke='%2328203a' stroke-width='.4'/%3E%3Cg transform='translate(54,46)'%3E%3Crect x='-3' y='8' width='6' height='3' rx='.2' fill='%23a89cb0'/%3E%3Crect x='-3.5' y='7' width='7' height='1.5' rx='.2' fill='%23c0b4c8'/%3E%3Crect x='-3.5' y='10' width='7' height='1.5' rx='.2' fill='%2388809a'/%3E%3Cpath d='M-2 7 Q-2.5 0 0 -3 Q2.5 0 2 7 Z' fill='url(%23scstone)'/%3E%3Cpath d='M-1.5 6 Q-1.6 1 0 -1' stroke='%2388809a' stroke-width='.2' fill='none' opacity='.6'/%3E%3Cpath d='M1.5 6 Q1.6 1 0 -1' stroke='%2388809a' stroke-width='.2' fill='none' opacity='.6'/%3E%3Cellipse cx='0' cy='-4.5' rx='1.5' ry='1.7' fill='url(%23scstone)'/%3E%3Cellipse cx='-.3' cy='-4.5' rx='.5' ry='.7' fill='%2388809a' opacity='.4'/%3E%3Cellipse cx='1.2' cy='2' rx='.4' ry='3.5' fill='%23f0e8f0' opacity='.4'/%3E%3C/g%3E%3Cg fill='%23e0d8e8' opacity='.7'%3E%3Cpath d='M16 58 L18 57.5 L17 59 Z'/%3E%3Cpath d='M22 59 L24 58 L23 59.5 Z'/%3E%3Cpath d='M40 59 L42 58 L41 59.5 Z'/%3E%3Cpath d='M48 58 L50 57.5 L49 59 Z'/%3E%3C/g%3E%3Cg fill='%23a8a0b0' opacity='.7'%3E%3Ccircle cx='14' cy='59' r='.4'/%3E%3Ccircle cx='44' cy='59' r='.4'/%3E%3C/g%3E%3C/svg%3E",
      house: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='h1w' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23b88858'/%3E%3Cstop offset='.5' stop-color='%238a6038'/%3E%3Cstop offset='1' stop-color='%235a3a18'/%3E%3C/linearGradient%3E%3ClinearGradient id='h1ws' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%235a3a18'/%3E%3Cstop offset='1' stop-color='%238a6038'/%3E%3C/linearGradient%3E%3ClinearGradient id='h1r' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23785030'/%3E%3Cstop offset='.5' stop-color='%23503018'/%3E%3Cstop offset='1' stop-color='%23301808'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cellipse cx='32' cy='58' rx='30' ry='4' fill='%233a2818' opacity='.4'/%3E%3Cg stroke='%23506830' stroke-width='.5' opacity='.7' fill='none'%3E%3Cpath d='M3,58 L4,55'/%3E%3Cpath d='M5,58 L6,56'/%3E%3Cpath d='M58,58 L57,55'/%3E%3Cpath d='M60,58 L59,56'/%3E%3C/g%3E%3Cellipse cx='30' cy='42' rx='22' ry='14' fill='%231a0e04' opacity='.22'/%3E%3Cpolygon points='32,8 8,28 56,28' fill='url(%23h1r)'/%3E%3Cpath d='M9,28 Q12,26 15,28 Q18,26 21,28 Q24,26 27,28 Q30,26 33,28 Q36,26 39,28 Q42,26 45,28 Q48,26 51,28 Q54,26 55,28 L55,29 L9,29 Z' fill='%23684030' stroke='%231a0e04' stroke-width='.3'/%3E%3Cpath d='M11,25 Q14,23 17,25 Q20,23 23,25 Q26,23 29,25 Q32,23 35,25 Q38,23 41,25 Q44,23 47,25 Q50,23 53,25 L53,26 L11,26 Z' fill='%23704830' stroke='%231a0e04' stroke-width='.3'/%3E%3Cpath d='M13,22 Q16,20 19,22 Q22,20 25,22 Q28,20 31,22 Q34,20 37,22 Q40,20 43,22 Q46,20 49,22 Q52,20 51,22 L51,23 L13,23 Z' fill='%23785030' stroke='%231a0e04' stroke-width='.3'/%3E%3Cpath d='M16,18 Q20,16 24,18 Q28,16 32,18 Q36,16 40,18 Q44,16 48,18 L48,19 L16,19 Z' fill='%23785838' stroke='%231a0e04' stroke-width='.3'/%3E%3Cpath d='M20,14 Q26,13 32,14 Q38,13 44,14 L44,15 L20,15 Z' fill='%2380583a' stroke='%231a0e04' stroke-width='.3'/%3E%3Crect x='6' y='28' width='52' height='1.5' fill='%231a0e04'/%3E%3Crect x='10' y='29' width='44' height='27' rx='.4' fill='url(%23h1w)'/%3E%3Crect x='10' y='29' width='6' height='27' fill='url(%23h1ws)' opacity='.5'/%3E%3Cg stroke='%233a2010' stroke-width='.4' opacity='.6'%3E%3Cline x1='16' y1='29' x2='16' y2='56'/%3E%3Cline x1='22' y1='29' x2='22' y2='56'/%3E%3Cline x1='28' y1='29' x2='28' y2='56'/%3E%3Cline x1='34' y1='29' x2='34' y2='56'/%3E%3Cline x1='40' y1='29' x2='40' y2='56'/%3E%3Cline x1='46' y1='29' x2='46' y2='56'/%3E%3Cline x1='52' y1='29' x2='52' y2='56'/%3E%3C/g%3E%3Cg stroke='%235a3818' stroke-width='.25' fill='none' opacity='.4'%3E%3Cpath d='M12,33 Q14,32 16,33'/%3E%3Cpath d='M22,38 Q25,37 28,38'/%3E%3Cpath d='M34,42 Q37,41 40,42'/%3E%3Cpath d='M46,46 Q49,45 52,46'/%3E%3Cpath d='M16,48 Q19,47 22,48'/%3E%3C/g%3E%3Crect x='48' y='29' width='6' height='27' fill='%23d4a060' opacity='.18'/%3E%3Cpath d='M22 56 L22 40 Q26 36 30 40 L30 56 Z' fill='%233a2008'/%3E%3Cpath d='M22.5 55.5 L22.5 40.5 Q26 37 29.5 40.5 L29.5 55.5 Z' fill='%23502810' opacity='.7'/%3E%3Ccircle cx='29' cy='48' r='.5' fill='%23a08858'/%3E%3Cpath d='M21.5 56 L21.5 40 Q26 35 30.5 40 L30.5 56' stroke='%231a0e04' stroke-width='.4' fill='none'/%3E%3Crect x='38' y='34' width='8' height='6' rx='.3' fill='%231a0e04'/%3E%3Crect x='38.5' y='34.5' width='7' height='5' rx='.2' fill='%23ffd080' opacity='.65'/%3E%3Cline x1='42' y1='34' x2='42' y2='40' stroke='%233a2008' stroke-width='.5'/%3E%3Cline x1='38' y1='37' x2='46' y2='37' stroke='%233a2008' stroke-width='.5'/%3E%3Crect x='36' y='34' width='2' height='6' rx='.2' fill='%23604028'/%3E%3Crect x='36.3' y='34.5' width='1.4' height='5' rx='.1' fill='%23503018'/%3E%3Cg stroke='%231a0e04' stroke-width='.2'%3E%3Cline x1='37' y1='35.5' x2='37.5' y2='35.5'/%3E%3Cline x1='37' y1='36.5' x2='37.5' y2='36.5'/%3E%3Cline x1='37' y1='37.5' x2='37.5' y2='37.5'/%3E%3Cline x1='37' y1='38.5' x2='37.5' y2='38.5'/%3E%3C/g%3E%3Crect x='46' y='34' width='2' height='6' rx='.2' fill='%23604028'/%3E%3Crect x='46.3' y='34.5' width='1.4' height='5' rx='.1' fill='%23503018'/%3E%3Cg stroke='%231a0e04' stroke-width='.2'%3E%3Cline x1='46.5' y1='35.5' x2='47' y2='35.5'/%3E%3Cline x1='46.5' y1='36.5' x2='47' y2='36.5'/%3E%3Cline x1='46.5' y1='37.5' x2='47' y2='37.5'/%3E%3Cline x1='46.5' y1='38.5' x2='47' y2='38.5'/%3E%3C/g%3E%3Crect x='37' y='40' width='10' height='2' rx='.2' fill='%23604028'/%3E%3Ccircle cx='39' cy='40.5' r='.5' fill='%23e06060' opacity='.8'/%3E%3Ccircle cx='42' cy='40.5' r='.5' fill='%23f0c040' opacity='.8'/%3E%3Ccircle cx='45' cy='40.5' r='.5' fill='%23e08060' opacity='.8'/%3E%3Crect x='44' y='9' width='4' height='20' rx='.2' fill='%23604028'/%3E%3Crect x='43.5' y='8' width='5' height='1.5' rx='.2' fill='%233a2008'/%3E%3Cg stroke='%233a1a08' stroke-width='.3'%3E%3Cline x1='44' y1='14' x2='48' y2='14'/%3E%3Cline x1='44' y1='19' x2='48' y2='19'/%3E%3Cline x1='44' y1='24' x2='48' y2='24'/%3E%3C/g%3E%3Cellipse cx='46' cy='5' rx='3' ry='1.5' fill='%23aaa' opacity='.5'/%3E%3Cellipse cx='49' cy='2' rx='2.5' ry='1.2' fill='%23bbb' opacity='.4'/%3E%3Cellipse cx='52' cy='0' rx='2' ry='.8' fill='%23ccc' opacity='.3'/%3E%3Cg%3E%3Crect x='2' y='52' width='1' height='6' fill='%23604028'/%3E%3Crect x='5' y='51' width='1' height='7' fill='%23604028'/%3E%3Crect x='8' y='52' width='1' height='6' fill='%23604028'/%3E%3Cline x1='2' y1='53.5' x2='9' y2='53' stroke='%235a3018' stroke-width='.5'/%3E%3Cline x1='2' y1='56' x2='9' y2='55.5' stroke='%235a3018' stroke-width='.5'/%3E%3Cpolygon points='2,52 2.5,51 3,52' fill='%233a2008'/%3E%3Cpolygon points='5,51 5.5,50 6,51' fill='%233a2008'/%3E%3Cpolygon points='8,52 8.5,51 9,52' fill='%233a2008'/%3E%3C/g%3E%3Cg fill='%235a4030' opacity='.55'%3E%3Cellipse cx='26' cy='58' rx='2' ry='.6'/%3E%3Cellipse cx='22' cy='59' rx='1.6' ry='.5'/%3E%3Cellipse cx='30' cy='59' rx='1.4' ry='.5'/%3E%3C/g%3E%3C/svg%3E",
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
