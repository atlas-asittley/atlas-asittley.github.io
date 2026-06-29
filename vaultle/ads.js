// ads.js — thin wrapper over the Playgama Bridge ad SDK.
//
// SAFE BY DESIGN: if the Bridge script isn't loaded (e.g. on our own
// github.io site), every call is a silent no-op, so the game is unaffected.
// It only does anything once we publish through Playgama (where the Bridge
// <script> tag + playgama-bridge-config.json are added — see ops/playgama/).
(function () {
  var ready = false;
  if (window.bridge && bridge.initialize) {
    try {
      bridge.initialize()
        .then(function () {
          ready = true;
          try { bridge.platform.sendMessage('game_ready'); } catch (e) {}
        })
        .catch(function () {});
    } catch (e) {}
  }
  var lastInterstitial = 0;
  window.AAds = {
    // Show an interstitial at a natural pause. Throttled (>=90s apart). Never
    // call at game start — platforms handle that automatically.
    interstitial: function (placement) {
      try {
        if (!ready || !window.bridge) return;
        var now = Date.now();
        if (now - lastInterstitial < 90000) return;
        lastInterstitial = now;
        bridge.advertisement.showInterstitial(placement || 'break');
      } catch (e) {}
    },
    // Optional rewarded ad. Resolves true only if the reward was actually earned.
    rewarded: function (placement) {
      return new Promise(function (resolve) {
        try {
          if (!ready || !window.bridge) return resolve(false);
          var settled = false;
          bridge.advertisement.on(bridge.EVENT_NAME.REWARDED_STATE_CHANGED, function (state) {
            if (state === 'rewarded') { settled = true; resolve(true); }
            else if ((state === 'closed' || state === 'failed') && !settled) { settled = true; resolve(false); }
          });
          bridge.advertisement.showRewarded(placement || 'reward');
        } catch (e) { resolve(false); }
      });
    },
  };
})();
