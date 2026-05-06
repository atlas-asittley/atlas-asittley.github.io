// ── Reports tab: Treasury + Resources sub-panels ──
//
// Extracted from panels.js (2026-05-06) to slim that file down. The
// two sub-panels share period toggle, trade-flow aggregation, and the
// proportional-bar / chart helpers — all gathered here.

import { sb } from './config.js';
import { state } from './state.js';
import { computeNetRates, resourceName } from './panels.js';
import { openTradeDialog } from './players.js';


// ── Resources sub-panel ──

export function renderResourcesPanel() {
  var panel = document.getElementById('panel-trade-resources');
  var period = state.tradeStatsPeriod || 'today';
  panel.innerHTML = renderPeriodToggleHtml(period) + '<div class="trade-loading">Loading…</div>';
  wirePeriodToggle(panel, function (p) { state.tradeStatsPeriod = p; renderResourcesPanel(); });

  fetchTradeFlows(period).then(function (flows) {
    var rates = computeNetRates();
    var rows = buildResourceRows(rates, flows);
    if (rows.length === 0) {
      replaceLoading(panel, '<div class="trade-empty">No resources or trade activity yet.</div>');
      return;
    }
    var html = '<div class="rsrc-table">'
      + '<div class="rsrc-tr rsrc-thead">'
      + '<span class="rsrc-icon"></span>'
      + '<span class="rsrc-name">Resource</span>'
      + '<span class="rsrc-rate">Rate</span>'
      + '<span class="rsrc-stock">Stock</span>'
      + '<span class="rsrc-net">Net $</span>'
      + '</div>';
    rows.forEach(function (row) {
      var netClass = row.net > 0 ? 'good' : row.net < 0 ? 'bad' : '';
      html += '<div class="rsrc-tr" data-resource="' + escapeHtml(row.key) + '">'
            + '<span class="rsrc-icon ' + resIconClass(row.key) + '"></span>'
            + '<span class="rsrc-name">' + escapeHtml(row.name) + '</span>'
            + '<span class="rsrc-rate">' + (row.rate ? formatRate(row.rate) : '—') + '</span>'
            + '<span class="rsrc-stock">' + row.stock + '</span>'
            + '<span class="rsrc-net ' + netClass + '">' + (row.net === 0 ? '—' : (row.net > 0 ? '+$' : '−$') + Math.abs(row.net)) + '</span>'
            + '</div>'
            + '<div class="rsrc-detail" id="rsrc-detail-' + escapeHtml(row.key) + '" style="display:none;"></div>';
    });
    html += '</div>';
    replaceLoading(panel, html);

    panel.querySelectorAll('.rsrc-tr[data-resource]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var rk = tr.dataset.resource;
        var detail = document.getElementById('rsrc-detail-' + rk);
        if (!detail) return;
        if (detail.style.display === 'none') {
          detail.innerHTML = renderResourceDrilldownHtml(rk, flows);
          detail.style.display = 'block';
          tr.classList.add('expanded');
          detail.querySelectorAll('.btn-rsrc-trade').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              openTradeDialog(btn.dataset.playerId, btn.dataset.playerName);
            });
          });
        } else {
          detail.style.display = 'none';
          tr.classList.remove('expanded');
        }
      });
    });
  }).catch(function (err) {
    replaceLoading(panel, '<div class="trade-error">Failed to load: ' + escapeHtml(err.message || err) + '</div>');
  });
}

function buildResourceRows(rates, flows) {
  // Build the full set of resources that the player either has, produces,
  // consumes, or has traded recently. Skip terrain.
  var seen = {};
  Object.keys(state.resources || {}).forEach(function (k) {
    var r = state.resources[k];
    if (r && r.kind !== 'terrain') seen[k] = true;
  });
  var rows = Object.keys(seen).map(function (k) {
    var r = state.resources[k] || {};
    var stock = Math.floor((state.inventory && state.inventory[k]) || 0);
    var rate = rates[k] || 0;
    var f = flows.byResource[k] || { import_qty: 0, import_money: 0, export_qty: 0, export_money: 0 };
    return {
      key: k,
      name: resourceName(k),
      stock: stock,
      rate: rate,
      import_qty: f.import_qty,
      import_money: f.import_money,
      export_qty: f.export_qty,
      export_money: f.export_money,
      net: (f.export_money || 0) - (f.import_money || 0),
      kind: r.kind || 'other'
    };
  });
  rows.sort(function (a, b) {
    var aActive = a.stock > 0 || a.rate !== 0 || a.import_qty > 0 || a.export_qty > 0;
    var bActive = b.stock > 0 || b.rate !== 0 || b.import_qty > 0 || b.export_qty > 0;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function renderResourceDrilldownHtml(resourceKey, flows) {
  var byPartner = (flows.byPartner[resourceKey] || []).slice();
  byPartner.sort(function (a, b) { return (b.export_qty + b.import_qty) - (a.export_qty + a.import_qty); });
  if (byPartner.length === 0) {
    return '<div class="rsrc-detail-empty">No trade activity for this resource in the selected period.</div>';
  }
  var html = '<div class="rsrc-detail-table">';
  html += '<div class="rsrc-detail-tr rsrc-detail-thead"><span>Partner</span><span>You sent</span><span>You got</span><span class="rsrc-detail-act"></span></div>';
  byPartner.forEach(function (p) {
    var act = '';
    if (p.kind === 'player' && p.player_id) {
      act = '<button class="btn-rsrc-trade" data-player-id="' + escapeHtml(p.player_id) + '" data-player-name="' + escapeHtml(p.name) + '">Trade</button>';
    }
    var sent = p.export_qty > 0 ? p.export_qty + ' (+$' + p.export_money + ')' : '—';
    var got = p.import_qty > 0 ? p.import_qty + ' (−$' + p.import_money + ')' : '—';
    html += '<div class="rsrc-detail-tr"><span>' + escapeHtml(p.name) + '</span><span class="good">' + sent + '</span><span class="bad">' + got + '</span><span class="rsrc-detail-act">' + act + '</span></div>';
  });
  html += '</div>';
  return html;
}


// ── Treasury sub-panel ──

export function renderTreasuryPanel() {
  var panel = document.getElementById('panel-trade-treasury');
  var period = state.tradeStatsPeriod || 'today';
  panel.innerHTML = renderPeriodToggleHtml(period) + '<div class="trade-loading">Loading…</div>';
  wirePeriodToggle(panel, function (p) { state.tradeStatsPeriod = p; renderTreasuryPanel(); });

  Promise.all([fetchTradeFlows(period), fetchCashLedger(period), fetchDailySeries(7)]).then(function (results) {
    var flows = results[0];
    var ledger = results[1];
    var weekDays = results[2];
    var earnedBySource = Object.assign({}, flows.earnedBySource);
    var spentByDest = Object.assign({}, flows.spentByDest);
    Object.keys(ledger.bySource).forEach(function (s) {
      var amt = ledger.bySource[s];
      if (amt > 0) earnedBySource[s] = (earnedBySource[s] || 0) + amt;
      else if (amt < 0) spentByDest[s] = (spentByDest[s] || 0) + (-amt);
    });
    var totalIn = Object.keys(earnedBySource).reduce(function (s, k) { return s + earnedBySource[k]; }, 0);
    var totalOut = Object.keys(spentByDest).reduce(function (s, k) { return s + spentByDest[k]; }, 0);

    var html = renderTreasuryAdvisor(weekDays);
    html += '<div class="stats-summary">';
    html += '<div class="stats-row"><span class="stats-label">Earned</span><span class="stats-val good">$' + totalIn + '</span></div>';
    html += '<div class="stats-row"><span class="stats-label">Spent</span><span class="stats-val bad">$' + totalOut + '</span></div>';
    html += '<div class="stats-row"><span class="stats-label">Net</span><span class="stats-val ' + ((totalIn - totalOut) >= 0 ? 'good' : 'bad') + '">$' + (totalIn - totalOut) + '</span></div>';
    html += '</div>';

    if (Object.keys(earnedBySource).length) {
      html += '<div class="stats-section-title">Income sources</div>';
      html += renderFlowBars(earnedBySource, 'good');
    }
    if (Object.keys(spentByDest).length) {
      html += '<div class="stats-section-title">Spending</div>';
      html += renderFlowBars(spentByDest, 'bad');
    }
    if (totalIn === 0 && totalOut === 0) {
      html += '<div class="trade-empty">No money has moved in this period.</div>';
    }
    replaceLoading(panel, html);
  }).catch(function (err) {
    replaceLoading(panel, '<div class="trade-error">Failed to load: ' + escapeHtml(err.message || err) + '</div>');
  });
}


// ── Treasury Advisor: 7-day burn rate / chart / chips ──

function fetchDailySeries(days) {
  var since = new Date(Date.now() - days * 86400000).toISOString();
  return Promise.all([
    sb.from('cash_transactions').select('source, amount, created_at').gte('created_at', since),
    sb.from('trade_transactions').select('total_price, transaction_type, trader_key, created_at').gte('created_at', since)
  ]).then(function (results) {
    var buckets = {};
    var dayKeys = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(Date.now() - i * 86400000);
      var k = d.toISOString().slice(0, 10);
      dayKeys.push(k);
      buckets[k] = { date: k, earned: 0, spent: 0, sources: {}, sinks: {} };
    }
    (results[0].data || []).forEach(function (row) {
      var k = row.created_at.slice(0, 10);
      if (!buckets[k]) return;
      var amt = row.amount;
      if (amt > 0) {
        buckets[k].earned += amt;
        buckets[k].sources[row.source] = (buckets[k].sources[row.source] || 0) + amt;
      } else if (amt < 0) {
        buckets[k].spent += -amt;
        buckets[k].sinks[row.source] = (buckets[k].sinks[row.source] || 0) + (-amt);
      }
    });
    (results[1].data || []).forEach(function (row) {
      var k = row.created_at.slice(0, 10);
      if (!buckets[k]) return;
      var amt = row.total_price;
      if (row.transaction_type === 'sell') {
        buckets[k].earned += amt;
        buckets[k].sources[row.trader_key] = (buckets[k].sources[row.trader_key] || 0) + amt;
      } else {
        buckets[k].spent += amt;
        buckets[k].sinks[row.trader_key] = (buckets[k].sinks[row.trader_key] || 0) + amt;
      }
    });
    return dayKeys.map(function (k) {
      var b = buckets[k];
      b.net = b.earned - b.spent;
      return b;
    });
  });
}

function renderTreasuryAdvisor(days) {
  var hasActivity = days.some(function (d) { return d.earned > 0 || d.spent > 0; });
  if (!hasActivity) return '';

  var weekNet = days.reduce(function (s, d) { return s + d.net; }, 0);
  var avgDailyNet = weekNet / days.length;
  var money = (state.profile && state.profile.money) || 0;

  var rateText, projText, rateClass;
  if (avgDailyNet > 0.5) {
    rateText = '+$' + Math.round(avgDailyNet) + '/day';
    projText = '';
    rateClass = 'good';
  } else if (avgDailyNet < -0.5) {
    var burn = -avgDailyNet;
    rateText = '-$' + Math.round(burn) + '/day';
    rateClass = 'bad';
    if (money > 0) {
      var runway = Math.floor(money / burn);
      projText = 'cash runs out in ~' + runway + ' day' + (runway === 1 ? '' : 's') + ' at this rate';
    } else {
      projText = 'currently in deficit';
    }
  } else {
    rateText = 'break-even';
    projText = '';
    rateClass = 'neutral';
  }

  var sources = {}, sinks = {};
  days.forEach(function (d) {
    Object.keys(d.sources).forEach(function (k) { sources[k] = (sources[k] || 0) + d.sources[k]; });
    Object.keys(d.sinks).forEach(function (k) { sinks[k] = (sinks[k] || 0) + d.sinks[k]; });
  });
  var topSource = Object.keys(sources).sort(function (a, b) { return sources[b] - sources[a]; })[0];
  var topSink = Object.keys(sinks).sort(function (a, b) { return sinks[b] - sinks[a]; })[0];

  var html = '<div class="advisor-section">';
  html += '<div class="advisor-title">Treasury Advisor — last 7 days</div>';
  html += '<div class="burn-rate-row">';
  html += '<span class="burn-rate-value ' + rateClass + '">' + rateText + '</span>';
  if (projText) html += '<span class="burn-rate-projection">· ' + escapeHtml(projText) + '</span>';
  html += '</div>';

  if (topSource || topSink) {
    html += '<div class="advisor-chips">';
    if (topSource) {
      html += '<span class="advisor-chip good">↑ ' + escapeHtml(prettySource(topSource)) + ' $' + sources[topSource] + '</span>';
    }
    if (topSink) {
      html += '<span class="advisor-chip bad">↓ ' + escapeHtml(prettySource(topSink)) + ' $' + sinks[topSink] + '</span>';
    }
    html += '</div>';
  }

  html += '<div class="advisor-chart-label">Daily net</div>';
  html += renderDailyBars(days);
  html += '<div class="advisor-chart-label">Cash balance</div>';
  html += renderBalanceLine(days, money);
  html += '</div>';
  return html;
}

function renderDailyBars(days) {
  var maxAbs = days.reduce(function (m, d) { return Math.max(m, Math.abs(d.net)); }, 1);
  var n = days.length;
  var pad = 0.6;
  var slot = 100 / n;
  var midY = 28;
  var maxBar = 22;
  var bars = days.map(function (d, i) {
    var h = Math.abs(d.net) / maxAbs * maxBar;
    var y = d.net >= 0 ? midY - h : midY;
    var color = d.net >= 0 ? '#5ec49e' : '#e0707a';
    return '<rect x="' + (i * slot + pad) + '" y="' + y + '" width="' + (slot - 2 * pad) + '" height="' + Math.max(0.4, h) + '" fill="' + color + '" rx="0.5"/>';
  }).join('');
  return '<svg class="cashflow-chart" viewBox="0 0 100 56" preserveAspectRatio="none">' +
         '<line x1="0" y1="' + midY + '" x2="100" y2="' + midY + '" stroke="#3a4a5e" stroke-width="0.3"/>' +
         bars +
         '</svg>';
}

function renderBalanceLine(days, currentMoney) {
  var startBalance = currentMoney;
  for (var i = 0; i < days.length; i++) startBalance -= days[i].net;
  var balances = [];
  var b = startBalance;
  for (var j = 0; j < days.length; j++) {
    b += days[j].net;
    balances.push(b);
  }
  var minB = Math.min.apply(null, balances);
  var maxB = Math.max.apply(null, balances);
  if (maxB === minB) { maxB = minB + 1; }
  var range = maxB - minB;
  var pts = balances.map(function (v, i) {
    var x = i / Math.max(1, balances.length - 1) * 100;
    var y = 50 - ((v - minB) / range * 40 + 4);
    return x.toFixed(2) + ',' + y.toFixed(2);
  });
  var stroke = balances[balances.length - 1] >= balances[0] ? '#5ec49e' : '#e0707a';
  var areaPts = pts.slice();
  areaPts.push('100,56');
  areaPts.push('0,56');
  return '<svg class="cashflow-chart" viewBox="0 0 100 56" preserveAspectRatio="none">' +
         '<polygon points="' + areaPts.join(' ') + '" fill="' + stroke + '" fill-opacity="0.12"/>' +
         '<polyline points="' + pts.join(' ') + '" stroke="' + stroke + '" stroke-width="0.7" fill="none" stroke-linejoin="round" stroke-linecap="round"/>' +
         '</svg>';
}


// ── Horizontal proportional-bar table for income / spending breakdowns ──

function renderFlowBars(byKey, kind) {
  var keys = Object.keys(byKey).sort(function (a, b) { return byKey[b] - byKey[a]; });
  if (keys.length === 0) return '';
  var max = byKey[keys[0]];
  if (!max || max <= 0) max = 1;
  var html = '<div class="stats-flow">';
  keys.forEach(function (k) {
    var v = byKey[k];
    var pct = Math.max(2, Math.round(v / max * 100));
    html += '<div class="stats-flow-row stats-flow-' + kind + '" style="--bar-width:' + pct + '%">'
         +    '<span class="stats-flow-bar"></span>'
         +    '<span class="stats-flow-name">' + escapeHtml(prettySource(k)) + '</span>'
         +    '<span class="stats-flow-val ' + kind + '">$' + v + '</span>'
         +  '</div>';
  });
  html += '</div>';
  return html;
}

function prettySource(k) {
  if (k === 'black_market') return 'Black Market';
  if (k === 'player_trade') return 'Player Trade';
  if (k === 'tax_revenue') return 'Tax Revenue';
  if (k === 'build_cost') return 'Building Construction';
  if (k === 'expansion_cost') return 'District Expansion';
  if (k === 'starting_grant') return 'Starting Grant';
  if (k === 'demolish_refund') return 'Demolish Refund';
  if (k === 'upkeep') return 'Upkeep';
  return (state.traders && state.traders[k] && state.traders[k].name) || k;
}


// ── Cash ledger fetch ──

function fetchCashLedger(period) {
  var since;
  if (period === 'today') {
    var d = new Date(); d.setHours(0, 0, 0, 0); since = d.toISOString();
  } else if (period === 'week') {
    since = new Date(Date.now() - 7 * 86400000).toISOString();
  } else {
    since = '1970-01-01T00:00:00Z';
  }
  return sb.from('cash_transactions')
    .select('source, amount').gte('created_at', since)
    .then(function (r) {
      var bySource = {};
      (r.data || []).forEach(function (row) {
        bySource[row.source] = (bySource[row.source] || 0) + row.amount;
      });
      return { bySource: bySource };
    });
}


// ── Display helpers ──

function resIconClass(key) { return 'res-icon-' + key; }

function formatRate(r) {
  var sign = r > 0 ? '+' : '−';
  var abs = Math.abs(r);
  var disp = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return sign + disp + '/min';
}


// ── Period toggle (shared by Resources + Treasury) ──

function renderPeriodToggleHtml(period) {
  return '<div class="stats-period-row">'
    + ['today','week','all'].map(function (p) {
        var label = p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'All time';
        return '<button class="stats-period-btn' + (period === p ? ' active' : '') + '" data-period="' + p + '">' + label + '</button>';
      }).join('')
    + '</div>';
}

function wirePeriodToggle(panel, onChange) {
  panel.querySelectorAll('.stats-period-btn').forEach(function (b) {
    b.addEventListener('click', function () { onChange(b.dataset.period); });
  });
}

function replaceLoading(panel, newHtml) {
  var ex = panel.querySelector('.trade-loading') || panel.querySelector('.trade-error');
  if (ex) ex.outerHTML = newHtml;
  else {
    var body = document.createElement('div');
    body.innerHTML = newHtml;
    panel.appendChild(body);
  }
}


// ── Trade-flow aggregation ──
// Walks the player's trade_transactions + accepted player_trade_offers
// in the period and rolls up per-resource and per-partner numbers.

function fetchTradeFlows(period) {
  var since;
  if (period === 'today') {
    var d = new Date(); d.setHours(0, 0, 0, 0); since = d.toISOString();
  } else if (period === 'week') {
    since = new Date(Date.now() - 7 * 86400000).toISOString();
  } else {
    since = '1970-01-01T00:00:00Z';
  }
  var uid = state.currentUser.id;

  var pTrans = sb.from('trade_transactions')
    .select('*').eq('player_id', uid).gte('created_at', since);
  var pOffers = sb.from('player_trade_offers')
    .select('*').eq('status', 'accepted').gte('resolved_at', since)
    .or('from_player_id.eq.' + uid + ',to_player_id.eq.' + uid);

  return Promise.all([pTrans, pOffers]).then(function (results) {
    var allOffers = results[1].data || [];
    var ids = {};
    allOffers.forEach(function (o) {
      if (o.from_player_id !== uid) ids[o.from_player_id] = true;
      if (o.to_player_id !== uid) ids[o.to_player_id] = true;
    });
    var idList = Object.keys(ids);
    var pNames = idList.length > 0
      ? sb.from('player_profiles').select('id, display_name').in('id', idList)
      : Promise.resolve({ data: [] });

    return pNames.then(function (np) {
      var nameMap = {};
      (np.data || []).forEach(function (p) { nameMap[p.id] = p.display_name; });
      return aggregateTradeFlows(uid, results[0].data || [], allOffers, nameMap);
    });
  });
}

function aggregateTradeFlows(uid, transactions, offers, nameMap) {
  var byResource = {};
  var byPartner = {};
  var earnedBySource = {};
  var spentByDest = {};

  function bumpResource(rk, dir, qty, money) {
    var b = byResource[rk] = byResource[rk] || { import_qty: 0, import_money: 0, export_qty: 0, export_money: 0 };
    if (dir === 'import') { b.import_qty += qty; b.import_money += money; }
    else { b.export_qty += qty; b.export_money += money; }
  }
  function bumpPartner(rk, partnerKey, partnerName, kind, playerId, dir, qty, money) {
    byPartner[rk] = byPartner[rk] || [];
    var existing = byPartner[rk].find(function (p) { return p.partnerKey === partnerKey; });
    if (!existing) {
      existing = { partnerKey: partnerKey, name: partnerName, kind: kind, player_id: playerId,
                   import_qty: 0, import_money: 0, export_qty: 0, export_money: 0 };
      byPartner[rk].push(existing);
    }
    if (dir === 'import') { existing.import_qty += qty; existing.import_money += money; }
    else { existing.export_qty += qty; existing.export_money += money; }
  }
  function bumpCash(target, partnerKey, amount) {
    target[partnerKey] = (target[partnerKey] || 0) + amount;
  }

  transactions.forEach(function (t) {
    var isExport = t.transaction_type === 'sell';
    var dir = isExport ? 'export' : 'import';
    bumpResource(t.resource_key, dir, t.quantity, t.total_price);
    var traderName = (state.traders && state.traders[t.trader_key] && state.traders[t.trader_key].name)
                   || prettySource(t.trader_key);
    bumpPartner(t.resource_key, t.trader_key, traderName, 'npc', null, dir, t.quantity, t.total_price);
    if (isExport) bumpCash(earnedBySource, t.trader_key, t.total_price);
    else bumpCash(spentByDest, t.trader_key, t.total_price);
  });

  offers.forEach(function (o) {
    var iAmSender = o.from_player_id === uid;
    var counterpartyId = iAmSender ? o.to_player_id : o.from_player_id;
    var counterpartyKey = 'player:' + counterpartyId;
    var counterpartyName = nameMap[counterpartyId] || 'Player';

    var giveRes = o.give_resources || {};
    var recvRes = o.receive_resources || {};
    var myExports = iAmSender ? giveRes : recvRes;
    var myImports = iAmSender ? recvRes : giveRes;
    var myCashOut = iAmSender ? (o.give_money || 0) : (o.receive_money || 0);
    var myCashIn  = iAmSender ? (o.receive_money || 0) : (o.give_money || 0);

    Object.keys(myExports).forEach(function (rk) {
      var qty = parseInt(myExports[rk], 10) || 0;
      if (qty <= 0) return;
      bumpResource(rk, 'export', qty, 0);
      bumpPartner(rk, counterpartyKey, counterpartyName, 'player', counterpartyId, 'export', qty, 0);
    });
    Object.keys(myImports).forEach(function (rk) {
      var qty = parseInt(myImports[rk], 10) || 0;
      if (qty <= 0) return;
      bumpResource(rk, 'import', qty, 0);
      bumpPartner(rk, counterpartyKey, counterpartyName, 'player', counterpartyId, 'import', qty, 0);
    });
    if (myCashIn > 0) bumpCash(earnedBySource, 'player_trade', myCashIn);
    if (myCashOut > 0) bumpCash(spentByDest, 'player_trade', myCashOut);
  });

  return { byResource: byResource, byPartner: byPartner,
           earnedBySource: earnedBySource, spentByDest: spentByDest };
}


// Local copy — escapeHtml is dirt simple and lives in panels.js too;
// duplicating avoids a circular import for one tiny utility.
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
