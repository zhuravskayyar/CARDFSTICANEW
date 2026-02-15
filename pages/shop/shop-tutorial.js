(function () {
  "use strict";

  const STAGE_KEY = "cardastika:tutorialStage";
  const params = new URLSearchParams(window.location.search);
  if (params.get("tutorial") !== "1") return;
  if (localStorage.getItem(STAGE_KEY) !== "buy") return;

  let targetBtn = null;
  let tipEl = null;
  let timer = null;
  let placeTickQueued = false;
  const SCROLL_LISTENER_OPTS = { capture: true, passive: true };
  const SYNC_INTERVAL_MS = 500;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("aside");
    tipEl.className = "shop-tutorial-tip";
    tipEl.textContent = "Крок 5: купи будь-яку карту. Після покупки відкриються завдання.";
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function placeTip() {
    if (!targetBtn || !tipEl) return;
    const rect = targetBtn.getBoundingClientRect();
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
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (targetBtn) {
      targetBtn.classList.remove("shop-tutorial-target");
      targetBtn = null;
    }
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
    }
    window.removeEventListener("resize", schedulePlaceTip);
    window.removeEventListener("scroll", schedulePlaceTip, SCROLL_LISTENER_OPTS);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }

  function schedulePlaceTip() {
    if (placeTickQueued) return;
    placeTickQueued = true;
    requestAnimationFrame(() => {
      placeTickQueued = false;
      placeTip();
    });
  }

  function handleVisibilityChange() {
    if (!document.hidden) sync();
  }

  function sync() {
    const btn = document.querySelector(".shop-card .shop-card__btn");
    if (!btn) return;

    if (targetBtn && targetBtn !== btn) {
      targetBtn.classList.remove("shop-tutorial-target");
    }
    targetBtn = btn;
    targetBtn.classList.add("shop-tutorial-target");
    if (targetBtn.dataset.tutorialBound !== "1") {
      targetBtn.dataset.tutorialBound = "1";
      targetBtn.addEventListener("click", cleanup, { once: true });
    }

    ensureTip();
    placeTip();
  }

  window.addEventListener("resize", schedulePlaceTip);
  window.addEventListener("scroll", schedulePlaceTip, SCROLL_LISTENER_OPTS);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  sync();
  timer = setInterval(() => {
    if (document.hidden) return;
    sync();
  }, SYNC_INTERVAL_MS);
})();
