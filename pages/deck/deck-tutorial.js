(function () {
  "use strict";

  const STAGE_KEY = "cardastika:tutorialStage";
  const REWARD_UID_KEY = "cardastika:tutorial:rewardUid";

  const params = new URLSearchParams(window.location.search);
  if (params.get("tutorial") !== "1") return;
  if (localStorage.getItem(STAGE_KEY) !== "upgrade") return;

  let tipEl = null;
  let currentTarget = null;
  let pollTimer = null;
  let viewportTickQueued = false;
  const SCROLL_LISTENER_OPTS = { capture: true, passive: true };
  const SYNC_INTERVAL_MS = 500;

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
  }

  function findTargetCard() {
    const rewardUid = String(localStorage.getItem(REWARD_UID_KEY) || "").trim();
    if (rewardUid) {
      const byUid = document.querySelector(`.deck-grid .ref-card[data-card-uid="${cssEscape(rewardUid)}"]`);
      if (byUid) return byUid;
    }
    return (
      document.querySelector('.deck-grid .ref-card[data-card-id="tutorial_reward_dragon"]') ||
      document.querySelector(".deck-grid .ref-card")
    );
  }

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("aside");
    tipEl.className = "deck-tutorial-tip";
    tipEl.innerHTML = 'Відкрий <b>Дракон Навчання</b>: натисни на карту, щоб перейти до її прокачки.';
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function placeTip(target) {
    if (!tipEl || !target) return;
    const rect = target.getBoundingClientRect();
    const tipRect = tipEl.getBoundingClientRect();
    const margin = 10;

    let top = rect.top - tipRect.height - margin;
    if (top < 8) top = rect.bottom + margin;

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

    tipEl.style.top = `${top}px`;
    tipEl.style.left = `${left}px`;
  }

  function cleanup() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (currentTarget) {
      currentTarget.classList.remove("deck-tutorial-highlight");
      currentTarget = null;
    }
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
    }
    window.removeEventListener("resize", handleViewportChange);
    window.removeEventListener("scroll", handleViewportChange, SCROLL_LISTENER_OPTS);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  function handleViewportChange() {
    if (viewportTickQueued) return;
    viewportTickQueued = true;
    requestAnimationFrame(() => {
      viewportTickQueued = false;
      if (currentTarget) placeTip(currentTarget);
    });
  }

  function handleVisibilityChange() {
    if (!document.hidden) sync();
  }

  function sync() {
    const target = findTargetCard();
    if (!target) return;

    if (currentTarget && currentTarget !== target) {
      currentTarget.classList.remove("deck-tutorial-highlight");
    }

    currentTarget = target;
    currentTarget.classList.add("deck-tutorial-highlight");
    if (currentTarget.dataset.tutorialBound !== "1") {
      currentTarget.dataset.tutorialBound = "1";
      currentTarget.addEventListener("click", cleanup, { once: true });
    }

    ensureTip();
    placeTip(currentTarget);
  }

  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("scroll", handleViewportChange, SCROLL_LISTENER_OPTS);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  sync();
  pollTimer = setInterval(() => {
    if (document.hidden) return;
    sync();
  }, SYNC_INTERVAL_MS);
})();
