// ── Player-to-player trades panel ──
//
// Three sections:
//   1. Other players list — pick someone to trade with.
//   2. Inbox — pending offers FROM others (Accept / Reject).
//   3. Outbox — pending offers FROM you (Cancel).
//
// Trade dialog supports money + arbitrary resources on both sides plus
// an optional message. The server validates everything; we mirror the
// validation client-side for fast feedback but the source of truth is
// the propose_trade / accept_trade / reject_trade / cancel_trade RPCs.

import { sb } from './config.js';
import { state } from './state.js';
import { showToast, updateMoney } from './ui.js';
import { renderInventory } from './panels.js';

var otherPlayers = [];     // [{id, display_name, industry_key, color_hex}]
var myOffers = [];         // both incoming and outgoing — filtered for render

function resName(key) {
  if (state.resources && state.resources[key]) return state.resources[key].name;
  return key;
}

function fmtMoney(n) {
  return '$' + (n || 0).toLocaleString();
}

function fmtSide(money, resources) {
  var parts = [];
  if (money && money > 0) parts.push(fmtMoney(money));
  if (resources) {
    Object.keys(resources).forEach(function (k) {
      parts.push(resources[k] + ' ' + resName(k));
    });
  }
  return parts.length ? parts.join(', ') : 'nothing';
}

function timeAgo(ts) {
  var diffMs = Date.now() - new Date(ts).getTime();
  var s = Math.floor(diffMs / 1000);
  if (s < 60) return s + 's ago';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ── Data loading ──

export function loadOtherPlayers() {
  if (!state.currentUser) return Promise.resolve();
  return sb.from('player_profiles')
    .select('id, display_name, industry_key, color_hex')
    .neq('id', state.currentUser.id)
    .then(function (r) {
      otherPlayers = r.data || [];
    });
}

export function loadTradeOffers() {
  if (!state.currentUser) return Promise.resolve();
  return sb.from('player_trade_offers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
    .then(function (r) {
      myOffers = r.data || [];
      updateInboxBadge();
    });
}

function updateInboxBadge() {
  var pending = myOffers.filter(function (o) {
    return o.status === 'pending' && o.to_player_id === state.currentUser.id;
  }).length;
  var badge = document.getElementById('players-badge');
  if (!badge) return;
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ── Render ──

export function renderPlayersPanel() {
  var panel = document.getElementById('panel-players');
  if (!panel) return;
  if (!state.currentUser) { panel.innerHTML = ''; return; }

  // Lazy-load on first render and when switching back.
  Promise.all([loadOtherPlayers(), loadTradeOffers()]).then(function () {
    var html = '';

    // Other players list.
    html += '<div class="players-section">';
    html += '<div class="players-section-title">Other Players</div>';
    if (otherPlayers.length === 0) {
      html += '<div class="players-empty">No other players yet.</div>';
    } else {
      otherPlayers.forEach(function (p) {
        var color = p.color_hex || '#666';
        var industryLabel = p.industry_key ? ' • ' + p.industry_key : '';
        html += '<div class="player-row" data-player-id="' + p.id + '" data-player-name="' + escapeAttr(p.display_name) + '">'
              + '<span class="player-swatch" style="background:' + color + ';"></span>'
              + '<span class="player-name">' + escapeHtml(p.display_name) + '</span>'
              + '<span class="player-industry">' + industryLabel + '</span>'
              + '<button class="btn-trade-offer" data-player-id="' + p.id + '" data-player-name="' + escapeAttr(p.display_name) + '">Trade</button>'
              + '</div>';
      });
    }
    html += '</div>';

    // Inbox.
    var inbox = myOffers.filter(function (o) {
      return o.status === 'pending' && o.to_player_id === state.currentUser.id;
    });
    html += '<div class="players-section">';
    html += '<div class="players-section-title">Incoming Offers' + (inbox.length ? ' (' + inbox.length + ')' : '') + '</div>';
    if (inbox.length === 0) {
      html += '<div class="players-empty">No pending offers.</div>';
    } else {
      inbox.forEach(function (o) { html += renderOfferCard(o, 'inbox'); });
    }
    html += '</div>';

    // Outbox.
    var outbox = myOffers.filter(function (o) {
      return o.status === 'pending' && o.from_player_id === state.currentUser.id;
    });
    html += '<div class="players-section">';
    html += '<div class="players-section-title">Sent Offers' + (outbox.length ? ' (' + outbox.length + ')' : '') + '</div>';
    if (outbox.length === 0) {
      html += '<div class="players-empty">You haven\'t sent any offers.</div>';
    } else {
      outbox.forEach(function (o) { html += renderOfferCard(o, 'outbox'); });
    }
    html += '</div>';

    panel.innerHTML = html;
    bindPlayersPanelEvents();
  });
}

function renderOfferCard(o, mode) {
  var otherId = mode === 'inbox' ? o.from_player_id : o.to_player_id;
  var other = otherPlayers.find(function (p) { return p.id === otherId; });
  var otherName = other ? other.display_name : 'Unknown';
  // The DB stores trade offers from the SENDER's perspective:
  //   give_*    = what the sender gives
  //   receive_* = what the sender receives in exchange
  // The card labels both sides from the VIEWER's perspective ("you'd give"
  // / "you'd receive"), so we map the columns based on whether the viewer
  // is the sender (outbox) or the recipient (inbox).
  var youGiveMoney, youGiveRes, youGetMoney, youGetRes;
  if (mode === 'inbox') {
    // Viewer would give what the sender wants (receive_*) and get what
    // the sender offers (give_*).
    youGiveMoney = o.receive_money; youGiveRes = o.receive_resources;
    youGetMoney  = o.give_money;    youGetRes  = o.give_resources;
  } else {
    // Outbox: viewer is the sender. They put up give_*, expect receive_*
    // from the counterparty.
    youGiveMoney = o.give_money;    youGiveRes = o.give_resources;
    youGetMoney  = o.receive_money; youGetRes  = o.receive_resources;
  }

  // Inbox-only pre-check: can the viewer actually fulfill this offer?
  // Server re-validates at accept time, but surfacing the reason up front
  // beats a generic toast. Outbox doesn't need this — at most you'd be
  // flagging that the counterparty has changed inventory.
  var blockers = [];
  if (mode === 'inbox') {
    var have = (state.profile && state.profile.money) || 0;
    if (youGiveMoney > have) {
      blockers.push('$' + (youGiveMoney - have) + ' more');
    }
    Object.keys(youGiveRes || {}).forEach(function (k) {
      var need = Number(youGiveRes[k]) || 0;
      var got  = Math.floor((state.inventory && state.inventory[k]) || 0);
      if (got < need) {
        blockers.push((need - got) + ' ' + resName(k));
      }
    });
  }
  var blockerNotice = blockers.length
    ? '<div class="offer-warn">Can’t accept: missing ' + escapeHtml(blockers.join(', ')) + '</div>'
    : '';

  var actions = '';
  if (mode === 'inbox') {
    var disabledAttr = blockers.length ? ' disabled' : '';
    actions = '<button class="btn-offer-reject" data-offer-id="' + o.id + '">Reject</button>'
            + '<button class="btn-offer-accept" data-offer-id="' + o.id + '"' + disabledAttr + '>Accept</button>';
  } else {
    actions = '<button class="btn-offer-cancel" data-offer-id="' + o.id + '">Cancel</button>';
  }

  var directionLabel = mode === 'inbox' ? 'From ' : 'To ';
  var msg = o.message ? '<div class="offer-msg">' + escapeHtml(o.message) + '</div>' : '';
  return '<div class="offer-card">'
       + '<div class="offer-header"><span class="offer-other">' + directionLabel + escapeHtml(otherName) + '</span>'
       + '<span class="offer-time">' + timeAgo(o.created_at) + '</span></div>'
       + '<div class="offer-body">'
       + '<div class="offer-line"><span class="offer-label">You’d give:</span><span class="offer-value">' + fmtSide(youGiveMoney, youGiveRes) + '</span></div>'
       + '<div class="offer-line"><span class="offer-label">You’d receive:</span><span class="offer-value">' + fmtSide(youGetMoney, youGetRes) + '</span></div>'
       + blockerNotice
       + msg
       + '</div>'
       + '<div class="offer-actions">' + actions + '</div>'
       + '</div>';
}

function bindPlayersPanelEvents() {
  document.querySelectorAll('.btn-trade-offer').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openTradeDialog(btn.dataset.playerId, btn.dataset.playerName);
    });
  });
  document.querySelectorAll('.btn-offer-accept').forEach(function (btn) {
    btn.addEventListener('click', function () { acceptOffer(btn.dataset.offerId); });
  });
  document.querySelectorAll('.btn-offer-reject').forEach(function (btn) {
    btn.addEventListener('click', function () { rejectOffer(btn.dataset.offerId); });
  });
  document.querySelectorAll('.btn-offer-cancel').forEach(function (btn) {
    btn.addEventListener('click', function () { cancelOffer(btn.dataset.offerId); });
  });
}

// ── Trade dialog ──

var dialogState = null;  // { targetId, targetName, give: {money, resources}, receive: {money, resources} }

function openTradeDialog(targetId, targetName) {
  dialogState = {
    targetId: targetId,
    targetName: targetName,
    giveMoney: 0,
    giveResources: {},
    receiveMoney: 0,
    receiveResources: {},
    message: '',
    targetMoney: null,        // populated async by get_player_trade_view
    targetInventory: null
  };
  renderTradeDialog();
  // Fetch the counterparty's tradeable inventory so the "they give"
  // side can annotate availability. Re-render once it lands.
  sb.rpc('get_player_trade_view', { p_player_id: targetId }).then(function (r) {
    if (!dialogState || dialogState.targetId !== targetId) return; // dialog closed / swapped
    if (r.error || !r.data) return;
    dialogState.targetMoney = r.data.money;
    dialogState.targetInventory = r.data.inventory || {};
    persistDialogInputs();  // keep any qtys the user already typed
    renderTradeDialog();
  });
}

function closeTradeDialog() {
  var overlay = document.getElementById('trade-dialog-overlay');
  if (overlay) overlay.remove();
  dialogState = null;
}

function renderTradeDialog() {
  var existing = document.getElementById('trade-dialog-overlay');
  if (existing) existing.remove();
  if (!dialogState) return;

  var targetInv = dialogState.targetInventory;  // null while loading
  var targetMoney = dialogState.targetMoney;    // null while loading
  var targetLoaded = targetInv !== null && targetInv !== undefined;

  // "You give" side: only resources you actually hold.
  var myResources = [];
  Object.keys(state.inventory || {}).forEach(function (k) {
    if ((state.inventory[k] || 0) > 0) myResources.push(k);
  });
  myResources.sort();
  // "They give" side: only resources the counterparty actually has.
  // Until the target's inventory loads, fall back to the full non-terrain
  // catalogue so the dialog isn't empty during the round-trip.
  var theirResources = [];
  if (targetLoaded) {
    Object.keys(targetInv).forEach(function (k) {
      if ((targetInv[k] || 0) > 0) theirResources.push(k);
    });
  } else {
    Object.keys(state.resources || {}).forEach(function (k) {
      var r = state.resources[k];
      if (r && r.kind !== 'terrain') theirResources.push(k);
    });
  }
  theirResources.sort();

  function rowHtml(k, qty, prefix) {
    var avail, availLabel, exceeds;
    if (prefix === 'give') {
      avail = Math.floor((state.inventory && state.inventory[k]) || 0);
      availLabel = 'you have ' + avail;
      exceeds = qty > avail;
    } else {
      if (targetLoaded) {
        avail = Math.floor((targetInv && targetInv[k]) || 0);
        availLabel = 'they have ' + avail;
        exceeds = qty > avail;
      } else {
        avail = null;
        availLabel = 'loading…';
        exceeds = false;
      }
    }
    var availClass = exceeds ? 'trade-res-avail trade-res-avail-bad' : 'trade-res-avail';
    return '<div class="trade-res-row" data-key="' + k + '">'
         + '<span class="trade-res-name">' + resName(k) + '</span>'
         + '<input type="number" min="1" step="1" value="' + qty + '" data-' + prefix + '-res="' + k + '" class="trade-res-qty">'
         + '<span class="' + availClass + '">' + availLabel + '</span>'
         + '<button class="trade-res-remove" data-' + prefix + '-remove="' + k + '">×</button>'
         + '</div>';
  }

  function sideHtml(side, label, resourceList, prefix) {
    var rows = '';
    Object.keys(side.resources).forEach(function (k) {
      rows += rowHtml(k, side.resources[k], prefix);
    });
    var moneyAvailLabel;
    if (prefix === 'give') {
      moneyAvailLabel = 'you have $' + ((state.profile && state.profile.money) || 0);
    } else {
      moneyAvailLabel = targetLoaded ? 'they have $' + (targetMoney || 0) : 'loading…';
    }
    var moneyAvailClass = (prefix === 'give' && side.money > ((state.profile && state.profile.money) || 0))
      || (prefix === 'recv' && targetLoaded && side.money > (targetMoney || 0))
      ? 'trade-res-avail trade-res-avail-bad' : 'trade-res-avail';
    var availOptions = '<option value="">+ Add resource…</option>'
      + resourceList.filter(function (k) { return !side.resources[k]; })
        .map(function (k) {
          var have = prefix === 'give'
            ? Math.floor((state.inventory && state.inventory[k]) || 0)
            : (targetLoaded ? Math.floor(targetInv[k] || 0) : null);
          var note = (have !== null && have > 0) ? ' (' + have + ')' : '';
          return '<option value="' + k + '">' + resName(k) + note + '</option>';
        }).join('');
    return '<div class="trade-side">'
         + '<div class="trade-side-label">' + label + '</div>'
         + '<div class="trade-money-row"><span class="trade-money-label">Money:</span>'
         + '<input type="number" min="0" step="1" value="' + side.money + '" data-' + prefix + '-money class="trade-money-qty">'
         + '<span class="' + moneyAvailClass + '">' + moneyAvailLabel + '</span></div>'
         + '<div class="trade-res-list">' + rows + '</div>'
         + '<select class="trade-res-add" data-' + prefix + '-add>' + availOptions + '</select>'
         + '</div>';
  }

  var giveSide = { money: dialogState.giveMoney, resources: dialogState.giveResources };
  var receiveSide = { money: dialogState.receiveMoney, resources: dialogState.receiveResources };

  var html = '<div class="trade-dialog" role="dialog" aria-modal="true">'
    + '<div class="trade-dialog-header">'
    + '<span class="trade-dialog-title">Trade with ' + escapeHtml(dialogState.targetName) + '</span>'
    + '<button class="trade-dialog-close" id="trade-dialog-close">×</button>'
    + '</div>'
    + '<div class="trade-dialog-body">'
    + sideHtml(giveSide, 'You give', myResources, 'give')
    + sideHtml(receiveSide, 'They give', theirResources, 'recv')
    + '<div class="trade-msg-row"><label class="trade-msg-label">Message (optional):</label>'
    + '<input type="text" maxlength="120" value="' + escapeAttr(dialogState.message) + '" id="trade-msg-input" class="trade-msg-input"></div>'
    + '</div>'
    + '<div class="trade-dialog-actions">'
    + '<button class="btn-trade-cancel" id="btn-trade-cancel">Cancel</button>'
    + '<button class="btn-trade-send" id="btn-trade-send">Send Offer</button>'
    + '</div>'
    + '</div>';

  var overlay = document.createElement('div');
  overlay.id = 'trade-dialog-overlay';
  overlay.className = 'trade-dialog-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  bindDialogEvents();
}

function bindDialogEvents() {
  document.getElementById('trade-dialog-close').addEventListener('click', closeTradeDialog);
  document.getElementById('btn-trade-cancel').addEventListener('click', closeTradeDialog);
  document.getElementById('btn-trade-send').addEventListener('click', sendOffer);

  var giveAdd = document.querySelector('[data-give-add]');
  giveAdd.addEventListener('change', function () {
    if (!giveAdd.value) return;
    dialogState.giveResources[giveAdd.value] = 1;
    persistDialogInputs();
    renderTradeDialog();
  });
  var recvAdd = document.querySelector('[data-recv-add]');
  recvAdd.addEventListener('change', function () {
    if (!recvAdd.value) return;
    dialogState.receiveResources[recvAdd.value] = 1;
    persistDialogInputs();
    renderTradeDialog();
  });

  document.querySelectorAll('[data-give-remove]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      delete dialogState.giveResources[btn.dataset.giveRemove];
      persistDialogInputs();
      renderTradeDialog();
    });
  });
  document.querySelectorAll('[data-recv-remove]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      delete dialogState.receiveResources[btn.dataset.recvRemove];
      persistDialogInputs();
      renderTradeDialog();
    });
  });
}

function persistDialogInputs() {
  // Pull current input values into dialogState (we re-render from state).
  var gMoney = document.querySelector('[data-give-money]');
  if (gMoney) dialogState.giveMoney = Math.max(0, parseInt(gMoney.value, 10) || 0);
  var rMoney = document.querySelector('[data-recv-money]');
  if (rMoney) dialogState.receiveMoney = Math.max(0, parseInt(rMoney.value, 10) || 0);
  document.querySelectorAll('[data-give-res]').forEach(function (i) {
    dialogState.giveResources[i.dataset.giveRes] = Math.max(1, parseInt(i.value, 10) || 1);
  });
  document.querySelectorAll('[data-recv-res]').forEach(function (i) {
    dialogState.receiveResources[i.dataset.recvRes] = Math.max(1, parseInt(i.value, 10) || 1);
  });
  var msg = document.getElementById('trade-msg-input');
  if (msg) dialogState.message = msg.value;
}

function sendOffer() {
  persistDialogInputs();
  var d = dialogState;
  var nonempty = d.giveMoney > 0 || d.receiveMoney > 0
    || Object.keys(d.giveResources).length > 0
    || Object.keys(d.receiveResources).length > 0;
  if (!nonempty) {
    showToast('Trade offer must include something', 'error');
    return;
  }
  if (d.giveMoney > (state.profile.money || 0)) {
    showToast('You only have ' + fmtMoney(state.profile.money), 'error');
    return;
  }
  // Spot-check inventory client-side (server re-validates at accept time anyway).
  for (var k in d.giveResources) {
    var have = Math.floor(state.inventory[k] || 0);
    if (d.giveResources[k] > have) {
      showToast('You only have ' + have + ' ' + resName(k), 'error');
      return;
    }
  }
  // If we've fetched the counterparty's tradeable view, refuse to ask
  // for more than they actually have. (If still loading, skip — the
  // server validates again at accept time.)
  if (d.targetInventory) {
    if (d.receiveMoney > (d.targetMoney || 0)) {
      showToast(d.targetName + ' only has $' + (d.targetMoney || 0), 'error');
      return;
    }
    for (var rk in d.receiveResources) {
      var theyHave = Math.floor(d.targetInventory[rk] || 0);
      if (d.receiveResources[rk] > theyHave) {
        showToast(d.targetName + ' only has ' + theyHave + ' ' + resName(rk), 'error');
        return;
      }
    }
  }
  var btn = document.getElementById('btn-trade-send');
  btn.disabled = true; btn.textContent = 'Sending…';
  sb.rpc('propose_trade', {
    p_to_player_id: d.targetId,
    p_give_money: d.giveMoney,
    p_give_resources: d.giveResources,
    p_receive_money: d.receiveMoney,
    p_receive_resources: d.receiveResources,
    p_message: d.message || null
  }).then(function (r) {
    if (r.error) {
      showToast('Trade offer failed: ' + r.error.message, 'error');
      btn.disabled = false; btn.textContent = 'Send Offer';
      return;
    }
    showToast('Offer sent to ' + d.targetName, 'success');
    closeTradeDialog();
    renderPlayersPanel();
  });
}

function acceptOffer(offerId) {
  sb.rpc('accept_trade', { p_offer_id: offerId }).then(function (r) {
    if (r.error) {
      showToast('Accept failed: ' + r.error.message, 'error');
      return;
    }
    showToast('Trade accepted', 'success');
    // Reload money + inventory locally.
    sb.from('player_profiles').select('money').eq('id', state.currentUser.id).maybeSingle()
      .then(function (rr) {
        if (rr.data) { state.profile.money = rr.data.money; updateMoney(); }
      });
    sb.from('inventories').select('resource_key, quantity').eq('player_id', state.currentUser.id)
      .then(function (rr) {
        state.inventory = {};
        (rr.data || []).forEach(function (row) { state.inventory[row.resource_key] = parseFloat(row.quantity); });
        renderInventory();
      });
    renderPlayersPanel();
  });
}

function rejectOffer(offerId) {
  sb.rpc('reject_trade', { p_offer_id: offerId }).then(function (r) {
    if (r.error) {
      showToast('Reject failed: ' + r.error.message, 'error');
      return;
    }
    renderPlayersPanel();
  });
}

function cancelOffer(offerId) {
  sb.rpc('cancel_trade', { p_offer_id: offerId }).then(function (r) {
    if (r.error) {
      showToast('Cancel failed: ' + r.error.message, 'error');
      return;
    }
    renderPlayersPanel();
  });
}

// Called from realtime: refresh offers + render.
export function onTradeOfferChange() {
  loadTradeOffers().then(function () {
    var pending = myOffers.filter(function (o) {
      return o.status === 'pending' && o.to_player_id === state.currentUser.id;
    });
    if (pending.length > 0) {
      // Lightweight ping for new incoming offers
      var newest = pending[0];
      // Show a toast for offers we haven't seen yet (created in last 5s).
      if (Date.now() - new Date(newest.created_at).getTime() < 5000) {
        var fromP = otherPlayers.find(function (p) { return p.id === newest.from_player_id; });
        showToast('New trade offer from ' + (fromP ? fromP.display_name : 'a player'), 'success');
      }
    }
    renderPlayersPanel();
  });
}

// ── Helpers ──

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function escapeAttr(s) { return escapeHtml(s); }
