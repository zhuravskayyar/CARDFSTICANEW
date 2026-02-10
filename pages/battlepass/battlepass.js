(() => {
  "use strict";

  const BP_STATE_KEY = "cardastika:bp:state:v1";
  const BP_ITEMS_KEY = "cardastika:magicItems";
  const MAX_PROGRESS = 400;
  const MAX_CYCLE = 4;
  const DEFAULT_CYCLE = 1;
  const VIP_PRICE = 1250;
  const SEASON_DURATION_MS = 28 * 24 * 60 * 60 * 1000;
  const DIAMOND_SYMBOL = "\uD83D\uDC8E";

  const dom = {
    vipBtn: null,
    progressText: null,
    progressValue: null,
    progressFill: null,
    progressBar: null,
    progressNext: null,
    claimAllBtn: null,
    timerValue: null,
    exchangeButtons: [],
  };

  let bpState = null;
  let tiers = [];
  const rewardsByKey = new Map();

  function asInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeParse(raw, fallback = null) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function formatNumber(value) {
    return Math.max(0, asInt(value, 0)).toLocaleString("uk-UA");
  }

  function showToast(message, type = "info") {
    const host = document.getElementById("toastHost") || document.body;
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.textContent = String(message || "");
    host.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("is-show");
    });

    setTimeout(() => {
      toast.classList.remove("is-show");
      setTimeout(() => toast.remove(), 260);
    }, 2400);
  }

  function readWallet() {
    const silver = asInt(localStorage.getItem("cardastika:silver"), asInt(localStorage.getItem("cardastika:gems"), 0));
    const gold = asInt(localStorage.getItem("cardastika:gold"), 0);
    const diamonds = asInt(localStorage.getItem("cardastika:diamonds"), 0);
    return {
      silver: Math.max(0, silver),
      gold: Math.max(0, gold),
      diamonds: Math.max(0, diamonds),
    };
  }

  function writeWallet(next) {
    const silver = Math.max(0, asInt(next?.silver, 0));
    const gold = Math.max(0, asInt(next?.gold, 0));
    const diamonds = Math.max(0, asInt(next?.diamonds, 0));

    localStorage.setItem("cardastika:silver", String(silver));
    localStorage.setItem("cardastika:gems", String(silver));
    localStorage.setItem("cardastika:gold", String(gold));
    localStorage.setItem("cardastika:diamonds", String(diamonds));

    try {
      const account = window.AccountSystem;
      if (account?.getActive && account?.updateActive && account.getActive()) {
        account.updateActive((acc) => {
          acc.silver = silver;
          acc.gold = gold;
          acc.diamonds = diamonds;
        });
      }
    } catch {
      // ignore account sync errors
    }

    refreshHUD();
  }

  function refreshHUD() {
    try {
      if (typeof window.updateGlobalHUD === "function") {
        window.updateGlobalHUD();
      }
    } catch {
      // ignore hud update errors
    }
  }

  function defaultState(walletDiamonds) {
    return {
      version: 1,
      cycle: DEFAULT_CYCLE,
      progress: 6,
      vip: false,
      claimed: {},
      trackedDiamonds: Math.max(0, asInt(walletDiamonds, 0)),
      seasonEndsAt: Date.now() + SEASON_DURATION_MS,
    };
  }

  function loadState(walletDiamonds) {
    const base = defaultState(walletDiamonds);
    const raw = safeParse(localStorage.getItem(BP_STATE_KEY), null);

    if (!raw || typeof raw !== "object") {
      return base;
    }

    const state = {
      version: 1,
      cycle: clamp(asInt(raw.cycle, base.cycle), 1, MAX_CYCLE),
      progress: clamp(asInt(raw.progress, base.progress), 0, MAX_PROGRESS),
      vip: Boolean(raw.vip),
      claimed: raw.claimed && typeof raw.claimed === "object" ? { ...raw.claimed } : {},
      trackedDiamonds: Math.max(0, asInt(raw.trackedDiamonds, base.trackedDiamonds)),
      seasonEndsAt: Math.max(0, asInt(raw.seasonEndsAt, base.seasonEndsAt)),
    };

    if (state.seasonEndsAt <= Date.now()) {
      state.cycle = DEFAULT_CYCLE;
      state.progress = 0;
      state.vip = false;
      state.claimed = {};
      state.seasonEndsAt = Date.now() + SEASON_DURATION_MS;
      state.trackedDiamonds = Math.max(0, asInt(walletDiamonds, 0));
    }

    return state;
  }

  function saveState() {
    localStorage.setItem(BP_STATE_KEY, JSON.stringify(bpState));
  }

  function readMagicItems() {
    const raw = safeParse(localStorage.getItem(BP_ITEMS_KEY), null);
    if (!raw || typeof raw !== "object") return {};
    return raw;
  }

  function toItemId(name) {
    const n = String(name || "").trim().toLowerCase();
    if (!n) return "bp_item";
    return n
      .replace(/[\s\-/]+/g, "_")
      .replace(/[^a-z0-9_а-яіїєґ]/gi, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "bp_item";
  }

  function addMagicItem(itemId, itemName, amount) {
    const id = String(itemId || "").trim() || toItemId(itemName);
    const name = String(itemName || id).trim();
    const qty = Math.max(1, asInt(amount, 1));

    const items = readMagicItems();
    const current = items[id];

    let prevCount = 0;
    if (typeof current === "number") {
      prevCount = Math.max(0, asInt(current, 0));
    } else if (current && typeof current === "object") {
      prevCount = Math.max(0, asInt(current.count, 0));
    }

    items[id] = {
      name,
      count: prevCount + qty,
      updatedAt: Date.now(),
    };

    localStorage.setItem(BP_ITEMS_KEY, JSON.stringify(items));
  }

  function claimKey(tier, track) {
    return `${track}:${tier}`;
  }

  function isClaimed(tier, track) {
    return Boolean(bpState.claimed[claimKey(tier, track)]);
  }

  function getRewardPreview(reward) {
    if (!reward) return "";
    if (reward.type === "silver") return `+${formatNumber(reward.amount)} срібла`;
    if (reward.type === "gold") return `+${formatNumber(reward.amount)} золота`;
    if (reward.type === "diamonds") return `+${formatNumber(reward.amount)} алмазів`;
    if (reward.type === "item") return `${reward.itemName} ?${reward.amount}`;
    return "Нагорода";
  }

  function applyReward(reward) {
    if (!reward) return "";

    if (reward.type === "item") {
      addMagicItem(reward.itemId, reward.itemName, reward.amount);
      return `${reward.itemName} ?${reward.amount}`;
    }

    const wallet = readWallet();
    if (reward.type === "silver") wallet.silver += reward.amount;
    if (reward.type === "gold") wallet.gold += reward.amount;
    if (reward.type === "diamonds") wallet.diamonds += reward.amount;
    writeWallet(wallet);

    if (reward.type === "diamonds") {
      bpState.trackedDiamonds = wallet.diamonds;
    }

    return getRewardPreview(reward);
  }

  function syncProgressFromDiamonds(options = {}) {
    const silent = Boolean(options.silent);
    const wallet = readWallet();
    const tracked = Math.max(0, asInt(bpState.trackedDiamonds, wallet.diamonds));
    const delta = wallet.diamonds - tracked;

    let changed = false;

    if (delta > 0) {
      const nextProgress = Math.min(MAX_PROGRESS, bpState.progress + delta);
      if (nextProgress !== bpState.progress) {
        bpState.progress = nextProgress;
        changed = true;
        if (!silent) {
          showToast(`+${formatNumber(delta)} сезонного прогресу за отримані алмази.`, "success");
        }
      }
    }

    if (bpState.trackedDiamonds !== wallet.diamonds) {
      bpState.trackedDiamonds = wallet.diamonds;
      changed = true;
    }

    if (changed) saveState();
    return changed;
  }

  function parseReward(levelEl, track, tier) {
    const rewardEl = levelEl.querySelector(`.bp-reward[data-track="${track}"]`);
    if (!rewardEl) return null;

    const rewardType = String(rewardEl.dataset.rewardType || "").trim().toLowerCase();
    if (!rewardType) {
      rewardEl.classList.add("bp-reward--empty");
      if (!rewardEl.querySelector(".bp-reward-empty")) {
        const empty = document.createElement("span");
        empty.className = "bp-reward-empty";
        empty.textContent = "Немає нагороди";
        rewardEl.appendChild(empty);
      }
      return null;
    }

    const amount = Math.max(1, asInt(rewardEl.dataset.amount, 1));
    const itemId = String(rewardEl.dataset.itemId || "").trim();
    const itemNameRaw = String(rewardEl.dataset.itemName || "").trim();
    const itemNameFromUi = String(rewardEl.querySelector(".bp-reward-name")?.textContent || "").trim();
    const itemName = itemNameRaw || itemNameFromUi || "Магічний предмет";

    const footer = document.createElement("div");
    footer.className = "bp-reward-footer";

    const claimBtn = document.createElement("button");
    claimBtn.type = "button";
    claimBtn.className = "bp-claim-btn";

    const stateLine = document.createElement("span");
    stateLine.className = "bp-reward-state";

    footer.append(claimBtn, stateLine);
    rewardEl.appendChild(footer);

    const reward = {
      tier,
      track,
      type: rewardType,
      amount,
      itemId,
      itemName,
      el: rewardEl,
      btn: claimBtn,
      state: stateLine,
    };

    const key = claimKey(tier, track);
    rewardsByKey.set(key, reward);

    claimBtn.addEventListener("click", () => {
      claimOne(reward);
    });

    return reward;
  }

  function collectTiers() {
    const levelEls = Array.from(document.querySelectorAll(".bp-level[data-tier]"));
    const out = [];

    for (const levelEl of levelEls) {
      const tier = asInt(levelEl.dataset.tier, 0);
      if (!tier) continue;

      const badge = levelEl.querySelector(".bp-milestone-badge");
      const freeReward = parseReward(levelEl, "free", tier);
      const vipReward = parseReward(levelEl, "vip", tier);

      out.push({
        tier,
        levelEl,
        badge,
        rewards: {
          free: freeReward,
          vip: vipReward,
        },
      });
    }

    out.sort((a, b) => a.tier - b.tier);
    return out;
  }

  function isRewardClaimable(reward) {
    if (!reward) return false;
    if (isClaimed(reward.tier, reward.track)) return false;
    if (bpState.progress < reward.tier) return false;
    if (reward.track === "vip" && !bpState.vip) return false;
    return true;
  }

  function claimOne(reward, options = {}) {
    const silent = Boolean(options.silent);
    if (!reward) return false;

    if (!isRewardClaimable(reward)) {
      if (!silent) showToast("Нагорода ще недоступна.", "warning");
      return false;
    }

    const granted = applyReward(reward);
    bpState.claimed[claimKey(reward.tier, reward.track)] = true;
    saveState();
    render();

    if (!silent) {
      const trackName = reward.track === "vip" ? "VIP" : "Базова";
      showToast(`${trackName}: ${granted}`, "success");
    }

    return true;
  }

  function claimAllAvailable() {
    const claimable = Array.from(rewardsByKey.values()).filter(isRewardClaimable);
    if (!claimable.length) {
      showToast("Немає доступних нагород.", "warning");
      return;
    }

    const granted = [];
    for (const reward of claimable) {
      const ok = claimOne(reward, { silent: true });
      if (!ok) continue;
      granted.push(getRewardPreview(reward));
    }

    render();
    if (granted.length) {
      showToast(`Отримано нагород: ${granted.length}.`, "success");
    }
  }

  function buyVip() {
    if (bpState.vip) return;

    const wallet = readWallet();
    if (wallet.diamonds < VIP_PRICE) {
      showToast(`Потрібно ${formatNumber(VIP_PRICE)} алмазів для VIP.`, "error");
      return;
    }

    const allow = window.confirm(`Купити VIP-доступ за ${VIP_PRICE} алмазів?`);
    if (!allow) return;

    wallet.diamonds -= VIP_PRICE;
    writeWallet(wallet);

    bpState.vip = true;
    bpState.trackedDiamonds = wallet.diamonds;
    saveState();

    render();
    showToast("VIP-доступ активовано.", "success");
  }

  function exchangeDiamonds(amount) {
    const cost = Math.max(1, asInt(amount, 0));
    if (!cost) return;

    if (bpState.progress >= MAX_PROGRESS) {
      showToast("Поточне коло вже заповнено.", "warning");
      return;
    }

    const wallet = readWallet();
    if (wallet.diamonds < cost) {
      showToast("Недостатньо алмазів для обміну.", "error");
      return;
    }

    wallet.diamonds -= cost;
    writeWallet(wallet);

    bpState.progress = Math.min(MAX_PROGRESS, bpState.progress + cost);
    bpState.trackedDiamonds = wallet.diamonds;
    saveState();

    render();
    showToast(`Обмін успішний: +${formatNumber(cost)} сезонного прогресу.`, "success");
  }

  function updateTimer() {
    if (!dom.timerValue) return;

    const left = Math.max(0, bpState.seasonEndsAt - Date.now());
    if (left <= 0) {
      dom.timerValue.textContent = "сезон завершено";
      return;
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const hourMs = 60 * 60 * 1000;
    const days = Math.floor(left / dayMs);
    const hours = Math.floor((left % dayMs) / hourMs);
    dom.timerValue.textContent = `${days} д ${hours} г`;
  }

  function renderProgress() {
    if (!dom.progressText || !dom.progressValue || !dom.progressFill || !dom.progressNext) return;

    dom.progressText.textContent = `Зібрано алмазів (йде ${bpState.cycle} круг сезону з ${MAX_CYCLE})`;
    dom.progressValue.textContent = `${DIAMOND_SYMBOL} ${formatNumber(bpState.progress)} / ${MAX_PROGRESS}`;

    const pct = clamp(Math.round((bpState.progress / MAX_PROGRESS) * 100), 0, 100);
    dom.progressFill.style.width = `${pct}%`;
    dom.progressBar?.setAttribute("aria-valuenow", String(bpState.progress));

    const nextTier = tiers.find((tier) => tier.tier > bpState.progress);
    if (!nextTier) {
      dom.progressNext.textContent = "Усі нагороди цього кола відкриті.";
      return;
    }

    const need = Math.max(0, nextTier.tier - bpState.progress);
    dom.progressNext.textContent = `До наступної нагороди: ${formatNumber(need)} ${DIAMOND_SYMBOL}`;
  }

  function renderVip() {
    if (!dom.vipBtn) return;

    const wallet = readWallet();

    if (bpState.vip) {
      dom.vipBtn.disabled = true;
      dom.vipBtn.classList.add("is-owned");
      dom.vipBtn.classList.remove("is-disabled");
      dom.vipBtn.innerHTML = `VIP активовано <span class="bp-vip-price">OK</span>`;
      return;
    }

    dom.vipBtn.classList.remove("is-owned");
    dom.vipBtn.innerHTML = `Купити за <span id="bpVipPrice" class="bp-vip-price">${DIAMOND_SYMBOL} ${formatNumber(VIP_PRICE)}</span>`;

    const canBuy = wallet.diamonds >= VIP_PRICE;
    dom.vipBtn.disabled = !canBuy;
    dom.vipBtn.classList.toggle("is-disabled", !canBuy);
  }

  function renderRewards() {
    const nextTier = tiers.find((tier) => tier.tier > bpState.progress)?.tier ?? null;

    for (const tier of tiers) {
      const unlocked = bpState.progress >= tier.tier;
      const isNext = nextTier === tier.tier;

      tier.levelEl.classList.toggle("is-unlocked", unlocked);
      tier.levelEl.classList.toggle("is-next", isNext);

      if (tier.badge) {
        tier.badge.classList.toggle("is-unlocked", unlocked);
        tier.badge.classList.toggle("is-next", isNext);
      }

      for (const track of ["free", "vip"]) {
        const reward = tier.rewards[track];
        if (!reward) continue;

        const claimed = isClaimed(tier.tier, track);
        const vipLocked = track === "vip" && !bpState.vip;
        const available = unlocked && !claimed && !vipLocked;

        reward.el.classList.toggle("is-locked", !unlocked);
        reward.el.classList.toggle("is-ready", available);
        reward.el.classList.toggle("is-claimed", claimed);
        reward.el.classList.toggle("is-vip-locked", unlocked && vipLocked && !claimed);

        if (claimed) {
          reward.btn.disabled = true;
          reward.btn.textContent = "Отримано";
          reward.state.textContent = "Вже забрано";
          continue;
        }

        if (!unlocked) {
          reward.btn.disabled = true;
          reward.btn.textContent = `Потрібно ${tier.tier}`;
          reward.state.textContent = `Відкривається на ${tier.tier} ${DIAMOND_SYMBOL}`;
          continue;
        }

        if (vipLocked) {
          reward.btn.disabled = true;
          reward.btn.textContent = "VIP";
          reward.state.textContent = "Купіть VIP-доступ";
          continue;
        }

        reward.btn.disabled = false;
        reward.btn.textContent = "Забрати";
        reward.state.textContent = `Доступно: ${getRewardPreview(reward)}`;
      }
    }
  }

  function renderClaimAll() {
    if (!dom.claimAllBtn) return;

    const claimableCount = Array.from(rewardsByKey.values()).filter(isRewardClaimable).length;
    dom.claimAllBtn.disabled = claimableCount < 1;
    dom.claimAllBtn.textContent = claimableCount > 0
      ? `Забрати все доступне (${claimableCount})`
      : "Немає доступних нагород";
  }

  function renderExchange() {
    const wallet = readWallet();
    const passFull = bpState.progress >= MAX_PROGRESS;

    for (const btn of dom.exchangeButtons) {
      const cost = Math.max(1, asInt(btn.dataset.exchange, 0));
      const disabled = passFull || wallet.diamonds < cost;
      btn.disabled = disabled;
      btn.classList.toggle("is-disabled", disabled);
    }
  }

  function render() {
    renderProgress();
    renderVip();
    renderRewards();
    renderClaimAll();
    renderExchange();
    updateTimer();
    refreshHUD();
  }

  function bindDom() {
    dom.vipBtn = document.getElementById("bpVipBtn");
    dom.progressText = document.getElementById("bpProgressText");
    dom.progressValue = document.getElementById("bpProgressValue");
    dom.progressFill = document.getElementById("bpProgressFill");
    dom.progressBar = document.getElementById("bpProgressBar");
    dom.progressNext = document.getElementById("bpProgressNext");
    dom.claimAllBtn = document.getElementById("bpClaimAllBtn");
    dom.timerValue = document.getElementById("bpTimerValue");
    dom.exchangeButtons = Array.from(document.querySelectorAll(".bp-exchange-item[data-exchange]"));

    dom.vipBtn?.addEventListener("click", buyVip);
    dom.claimAllBtn?.addEventListener("click", claimAllAvailable);

    for (const btn of dom.exchangeButtons) {
      btn.addEventListener("click", () => {
        const amount = asInt(btn.dataset.exchange, 0);
        exchangeDiamonds(amount);
      });
    }
  }

  function setupStorageListener() {
    window.addEventListener("storage", (event) => {
      if (!event.key) return;
      const watched = new Set([
        BP_STATE_KEY,
        "cardastika:diamonds",
        "cardastika:gold",
        "cardastika:silver",
      ]);
      if (!watched.has(event.key)) return;

      const wallet = readWallet();
      bpState = loadState(wallet.diamonds);
      syncProgressFromDiamonds({ silent: true });
      render();
    });
  }

  function init() {
    bindDom();

    const wallet = readWallet();
    bpState = loadState(wallet.diamonds);

    tiers = collectTiers();

    const changedBySync = syncProgressFromDiamonds({ silent: true });
    if (!changedBySync) saveState();

    render();
    setupStorageListener();

    setInterval(() => {
      const changed = syncProgressFromDiamonds({ silent: true });
      if (changed) render();
      else updateTimer();
    }, 3000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

