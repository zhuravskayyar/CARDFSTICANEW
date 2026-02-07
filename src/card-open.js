// src/card-open.js
(function () {
  function $(id) { return document.getElementById(id); }

  function getPath(path) {
    const isInPages = location.pathname.toLowerCase().includes("/pages/");
    return isInPages ? `../../${path}` : `./${path}`;
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value);
  }

  function asNum(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function showToast(message) {
    const host = document.getElementById("toastHost") || document.body;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = String(message || "");
    host.appendChild(toast);
    setTimeout(() => toast.classList.add("is-show"), 10);
    setTimeout(() => {
      toast.classList.remove("is-show");
      setTimeout(() => toast.remove(), 250);
    }, 2200);
  }

  let _activeModalClose = null;
  function closeModal() {
    if (typeof _activeModalClose === "function") {
      try { _activeModalClose(); } catch { /* ignore */ }
    }
    _activeModalClose = null;
  }

  function confirmUpgrade({ costGold, gainPower, onYes } = {}) {
    const host = document.getElementById("modalHost");
    if (!host) return false;

    closeModal();

    host.classList.add("is-open");
    host.setAttribute("aria-hidden", "false");
    host.innerHTML = "";

    const overlay = document.createElement("div");
    overlay.className = "confirm-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Подтверждение");

    const panel = document.createElement("div");
    panel.className = "confirm-modal__panel";

    const actions = document.createElement("div");
    actions.className = "confirm-modal__actions";

    const yesBtn = document.createElement("button");
    yesBtn.type = "button";
    yesBtn.className = "confirm-modal__btn confirm-modal__btn--yes";
    yesBtn.innerHTML = "<span>Да!</span>";

    const noBtn = document.createElement("button");
    noBtn.type = "button";
    noBtn.className = "confirm-modal__btn confirm-modal__btn--no";
    noBtn.innerHTML = "<span>Нет</span>";

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);

    const body = document.createElement("div");
    body.className = "confirm-modal__body";

    const line1 = document.createElement("div");
    line1.className = "confirm-modal__line";
    line1.appendChild(document.createTextNode("Поднять уровень за "));
    const coin = document.createElement("img");
    coin.className = "confirm-modal__coin";
    coin.src = getPath("assets/icons/coin-gold.svg");
    coin.alt = "";
    coin.setAttribute("aria-hidden", "true");
    line1.appendChild(coin);
    line1.appendChild(document.createTextNode(` ${Math.max(0, Math.round(asNum(costGold, 0)))}?`));

    const line2 = document.createElement("div");
    line2.className = "confirm-modal__line";
    line2.textContent = `Сила вырастет на ${Math.max(0, Math.round(asNum(gainPower, 0)))}`;

    body.appendChild(line1);
    body.appendChild(line2);

    panel.appendChild(actions);
    panel.appendChild(body);
    overlay.appendChild(panel);
    host.appendChild(overlay);

    const prevFocus = document.activeElement;

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const active = document.activeElement;
        if (active === noBtn) noBtn.click();
        else yesBtn.click();
      }
    };

    const close = () => {
      host.classList.remove("is-open");
      host.setAttribute("aria-hidden", "true");
      host.innerHTML = "";

      try { document.removeEventListener("keydown", onKey, true); } catch { /* ignore */ }
      try { prevFocus?.focus?.(); } catch { /* ignore */ }

      _activeModalClose = null;
    };

    _activeModalClose = close;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    noBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });

    yesBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
      try { if (typeof onYes === "function") onYes(); } catch { /* ignore */ }
    });

    try { document.addEventListener("keydown", onKey, true); } catch { /* ignore */ }
    try { setTimeout(() => yesBtn.focus(), 0); } catch { /* ignore */ }

    return true;
  }

  let _levelsPromise = null;
  async function loadCardLevelsData() {
    if (_levelsPromise) return _levelsPromise;
    _levelsPromise = (async () => {
      const r = await fetch(getPath("data/cardLevels.json"), { cache: "no-store" });
      if (!r.ok) throw new Error(`cardLevels.json fetch failed: ${r.status}`);
      const json = await r.json();
      const levels = json?.cardLevels?.levels;
      const maxLevel = Math.max(1, Math.round(asNum(json?.cardLevels?.maxLevel, 180)));
      if (!Array.isArray(levels)) throw new Error("cardLevels.json: levels must be array");

      const byLevel = new Map();
      for (const row of levels) {
        const lvl = Math.round(asNum(row?.level, 0));
        if (!lvl) continue;
        byLevel.set(lvl, {
          level: lvl,
          basePower: asNum(row?.basePower, 0),
          elements: asNum(row?.elements, 0),
          upgradeCost: asNum(row?.upgradeCost, 0),
          minGoldCost: row?.minGoldCost == null ? null : asNum(row?.minGoldCost, 0),
          isGolden: !!row?.isGolden,
        });
      }

      return { byLevel, maxLevel };
    })();
    return _levelsPromise;
  }

  async function ensureAccountSystem() {
    if (window.AccountSystem?.getActive) return true;
    try {
      await import(getPath("src/account.js"));
    } catch {
      // ignore
    }
    return !!window.AccountSystem?.getActive;
  }

  function newUid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function loadStateFallback() {
    const deck = safeParse(localStorage.getItem("cardastika:deck") || "null");
    const inventory = safeParse(localStorage.getItem("cardastika:inventory") || "null");
    const gold = asNum(localStorage.getItem("cardastika:gold"), 0);
    return {
      deck: Array.isArray(deck) ? deck : [],
      inventory: Array.isArray(inventory) ? inventory : [],
      gold: Math.max(0, Math.round(gold)),
    };
  }

  function saveStateFallback(st) {
    try {
      localStorage.setItem("cardastika:deck", JSON.stringify(st.deck || []));
      localStorage.setItem("cardastika:inventory", JSON.stringify(st.inventory || []));
      localStorage.setItem("cardastika:gold", String(Math.max(0, Math.round(asNum(st.gold, 0)))));
    } catch {
      // ignore
    }
  }

  function normalizeBioText(raw) {
    const s = String(raw ?? "")
      .replaceAll("\r\n", "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/\s+[-–—]\s+/g, " — ")
      .trim();
    return s;
  }

  function renderBioText(el, raw) {
    if (!el) return;
    const normalized = normalizeBioText(raw);
    el.textContent = "";

    if (!normalized) {
      const p = document.createElement("p");
      p.className = "card-bio__p is-muted";
      p.textContent = "Опис ще не додано.";
      el.appendChild(p);
      return;
    }

    const parts = normalized.split(/\n\s*\n/g).map((x) => x.trim()).filter(Boolean);
    for (const part of parts.length ? parts : [normalized]) {
      const p = document.createElement("p");
      p.className = "card-bio__p";
      p.textContent = part;
      el.appendChild(p);
    }
  }

  let collectionsRichCache = null;
  let cardBioMapCache = null;
  let titleBioMapCache = null;

  function escapeXml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function buildPlaceholderArt(element, title = "") {
    const el = String(element || "").toLowerCase().trim();
    const palette = {
      fire: ["#ff6a4a", "#2a0c05"],
      water: ["#4aa3ff", "#061122"],
      earth: ["#4ee07a", "#05140b"],
      air: ["#f6c35c", "#1a1406"],
    }[el] || ["#8fb6ff", "#0b0b12"];

    const safeTitle = String(title || "").slice(0, 40);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">` +
      `<defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${palette[0]}"/>` +
      `<stop offset="1" stop-color="${palette[1]}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="600" height="800" fill="url(#g)"/>` +
      `<circle cx="470" cy="170" r="140" fill="rgba(255,255,255,0.10)"/>` +
      `<circle cx="110" cy="640" r="180" fill="rgba(0,0,0,0.18)"/>` +
      `<text x="40" y="740" font-size="34" font-family="serif" fill="rgba(255,255,255,0.85)">${escapeXml(
        safeTitle,
      )}</text>` +
      `</svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function loadCardBioMap() {
    if (cardBioMapCache) return cardBioMapCache;
    try {
      const url = getPath("data/card-bio.json");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`card-bio.json fetch failed: ${r.status}`);
      const json = await r.json();
      const bios = json && typeof json === "object" && json.bios && typeof json.bios === "object" ? json.bios : {};
      cardBioMapCache = bios;
      return bios;
    } catch (err) {
      console.warn("[card-open] card-bio.json unavailable", err);
      cardBioMapCache = {};
      return cardBioMapCache;
    }
  }

  function normTitle(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  async function loadTitleBioMap() {
    if (titleBioMapCache) return titleBioMapCache;

    const bios = await loadCardBioMap();
    const byTitle = new Map();

    // Helper to attach title->bio for ids that exist in bios map.
    const attach = (id, title) => {
      const bio = bios?.[String(id)];
      if (!bio) return;
      const key = normTitle(title);
      if (!key) return;
      if (!byTitle.has(key)) byTitle.set(key, String(bio));
    };

    // Source A: collections.json cards
    try {
      const collections = await loadCollectionsRich();
      for (const col of collections || []) {
        const cards = Array.isArray(col?.cards) ? col.cards : [];
        for (const c of cards) attach(c?.id, c?.title ?? c?.name ?? c?.id);
      }
    } catch (err) {
      console.warn("[card-open] collections.json for bio index failed", err);
    }

    // Source B: cards.json cards (covers shop/deck ids)
    try {
      const url = getPath("data/cards.json");
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) {
        const json = await r.json();
        const cards = Array.isArray(json?.cards) ? json.cards : [];
        for (const c of cards) attach(c?.id, c?.title ?? c?.name ?? c?.id);
      }
    } catch (err) {
      console.warn("[card-open] cards.json for bio index failed", err);
    }

    titleBioMapCache = byTitle;
    return byTitle;
  }

  function applyCard(card) {
    setText("cardTitle", card.title);
    setText("cardPower", card.power);
    setText("cardLevel", card.level);
    if (card?.title) document.title = `${String(card.title)} — Cardastika`;

    const bioWrap = $("cardBioWrap");
    const bioEl = $("cardBio");
    if (bioEl) {
      renderBioText(bioEl, card?.bio || "");
      if (bioWrap) bioWrap.style.display = "";
    }

    const frame = $("cardFrame");
    if (frame) {
      frame.classList.remove(
        "elem-fire",
        "elem-water",
        "elem-earth",
        "elem-air",
        "rarity-1",
        "rarity-2",
        "rarity-3",
        "rarity-4",
        "rarity-5",
        "rarity-6",
      );
      frame.classList.add("card-frame", "elem-" + (card.element || "earth"));
      if (card.rarity) frame.classList.add(card.rarity);
    }

    const powerIcon = $("cardPowerIcon");
    if (powerIcon) {
      powerIcon.classList.remove("rarity-1", "rarity-2", "rarity-3", "rarity-4", "rarity-5", "rarity-6");
      powerIcon.classList.add(card.rarity || "rarity-1");
    }

    const art = $("cardArt");
    if (art) {
      const url = String(card?.art || "").trim() || buildPlaceholderArt(card?.element, card?.title);
      art.style.backgroundImage = url ? `url('${url}')` : "";
    }

    const titleElem = $("cardTitleElem");
    if (titleElem) {
      titleElem.classList.remove("elem-fire", "elem-water", "elem-earth", "elem-air");
      titleElem.classList.add("card-titlebar__elem");
      titleElem.classList.add("elem-" + (card.element || "earth"));
    }

    const titlebar = titleElem?.closest(".card-titlebar");
    if (titlebar) {
      titlebar.classList.remove("elem-fire", "elem-water", "elem-earth", "elem-air");
      titlebar.classList.add("elem-" + (card.element || "earth"));
    }

    const inDeckRow = $("cardInDeckRow");
    if (inDeckRow) inDeckRow.style.display = card.inDeck ? "" : "none";

    const protRow = $("cardProtectedRow");
    if (protRow) {
      protRow.classList.toggle("is-muted", !card.protected);
      const label = protRow.querySelector(".card-stat__label");
      if (label) label.textContent = card.protected ? "Захищена" : "Не захищена";
    }
  }

  const RARITY_TO_CLASS = {
    common: "rarity-1",
    uncommon: "rarity-2",
    rare: "rarity-3",
    epic: "rarity-4",
    legendary: "rarity-5",
    mythic: "rarity-6",
  };

  function normalizeRarityClass(raw) {
    if (!raw) return "";

    if (typeof raw === "number" && Number.isFinite(raw)) {
      const n = Math.max(1, Math.min(6, Math.round(raw)));
      return `rarity-${n}`;
    }

    const s = String(raw).toLowerCase().trim();
    if (/^rarity-[1-6]$/.test(s)) return s;
    return RARITY_TO_CLASS[s] || "";
  }

  function cardUid(card) {
    const u = String(card?.uid || "").trim();
    return u || "";
  }

  function migrateCardsInPlace(levelsData, list) {
    if (!Array.isArray(list)) return false;
    let changed = false;
    for (const c of list) {
      if (!c || typeof c !== "object") continue;

      if (!c.uid) {
        c.uid = newUid();
        changed = true;
      }

      const lvl = Math.max(1, Math.round(asNum(c.level, 1)));
      const row = levelsData.byLevel.get(lvl) || null;

      if (!Number.isFinite(Number(c.elementsStored)) && !Number.isFinite(Number(c.elements))) {
        if (row) {
          c.elementsStored = row.elements;
          changed = true;
        }
      } else if (!Number.isFinite(Number(c.elementsStored)) && Number.isFinite(Number(c.elements))) {
        c.elementsStored = Math.max(0, Number(c.elements));
        changed = true;
      }

      if (!Number.isFinite(Number(c.bonusFixed))) c.bonusFixed = 0;

      if (!Number.isFinite(Number(c.basePower)) && row) {
        c.basePower = Math.round(asNum(row.basePower, 0));
        changed = true;
      }

      if (row) {
        const want = Math.max(0, Math.round(asNum(row.basePower, 0) + asNum(c.bonusFixed, 0)));
        if (!Number.isFinite(Number(c.power)) || Math.round(Number(c.power)) <= 0) {
          c.power = want;
          changed = true;
        }
      }
    }
    return changed;
  }

  function findCardRef({ deck = [], inventory = [] } = {}, payload) {
    const wantUid = String(payload?.uid || payload?.cardUid || payload?.cardUID || "").trim();
    const wantId = String(payload?.id || "").trim();

    const byUid = (list) => {
      if (!wantUid) return null;
      const idx = list.findIndex((c) => c && typeof c === "object" && String(c.uid || "").trim() === wantUid);
      return idx >= 0 ? { list, idx, card: list[idx] } : null;
    };
    const byLooseMatch = (list) => {
      if (!wantId) return null;
      const wantLvl = Math.max(1, Math.round(asNum(payload?.level, 1)));
      const wantPow = Math.round(asNum(payload?.power, 0));
      const wantEl = String(payload?.element || "").trim();
      const idx = list.findIndex((c) => {
        if (!c || typeof c !== "object") return false;
        if (String(c.id || "") !== wantId) return false;
        if (wantEl && String(c.element || "") !== wantEl) return false;
        if (Math.max(1, Math.round(asNum(c.level, 1))) !== wantLvl) return false;
        if (wantPow && Math.round(asNum(c.power, 0)) !== wantPow) return false;
        return true;
      });
      return idx >= 0 ? { list, idx, card: list[idx] } : null;
    };

    return byUid(deck) || byUid(inventory) || byLooseMatch(deck) || byLooseMatch(inventory) || null;
  }

  function computeUpgrade(levelsData, card, gold) {
    const lvl = Math.max(1, Math.round(asNum(card?.level, 1)));
    const nextLvl = lvl + 1;
    const cur = levelsData.byLevel.get(lvl) || null;
    const next = levelsData.byLevel.get(nextLvl) || null;
    if (!next || !cur) return null;

    const stored = Number.isFinite(Number(card?.elementsStored))
      ? Math.max(0, Number(card.elementsStored))
      : Math.max(0, asNum(cur.elements, 0));

    const segNeed = Math.max(0, asNum(next.elements, 0) - asNum(cur.elements, 0));
    const segHave = segNeed > 0 ? Math.max(0, Math.min(segNeed, stored - asNum(cur.elements, 0))) : segNeed;
    const progressPct = segNeed > 0 ? Math.max(0, Math.min(1, segHave / segNeed)) : 1;

    const costMax = Math.max(0, Math.round(asNum(next.upgradeCost, 0)));
    const minCost = next.minGoldCost == null ? 0 : Math.max(0, Math.round(asNum(next.minGoldCost, 0)));
    const isGolden = !!next.isGolden || next.minGoldCost != null;

    const costNowRaw = isGolden
      ? costMax - (costMax - minCost) * progressPct
      : costMax * (1 - progressPct);
    const costNow = Math.max(0, Math.ceil(costNowRaw));

    const gainPower = Math.max(0, Math.round(asNum(next.basePower, 0) - asNum(cur.basePower, 0)));

    return {
      level: lvl,
      nextLevel: nextLvl,
      progressPct,
      progressHave: segHave,
      progressNeed: segNeed,
      storedElements: stored,
      costNow,
      costMax,
      minCost,
      isGolden,
      gainPower,
      canLevel: Math.round(asNum(gold, 0)) >= costNow,
    };
  }

  function listAbsorbCandidates({ st, target }) {
    const deckUidSet = new Set((st?.deck || []).map((c) => String(c?.uid || "")).filter(Boolean));
    const deckFpCounts = new Map();
    const fp = (c) => `${String(c?.id || "")}|${String(c?.element || "")}|${Math.max(1, Math.round(asNum(c?.level, 1)))}|${Math.round(asNum(c?.power ?? c?.basePower, 0))}`;
    for (const c of st?.deck || []) {
      const k = fp(c);
      deckFpCounts.set(k, (deckFpCounts.get(k) || 0) + 1);
    }
    const targetUid = String(target?.uid || "").trim();
    const targetEl = String(target?.element || "");

    const candidates = (st?.inventory || [])
      .filter((c) => c && typeof c === "object")
      .filter((c) => String(c.uid || "").trim())
      .filter((c) => {
        const uid = String(c.uid || "").trim();
        if (uid && deckUidSet.has(uid)) return false;
        const k = fp(c);
        const left = deckFpCounts.get(k) || 0;
        if (left > 0) {
          deckFpCounts.set(k, left - 1);
          return false;
        }
        return true;
      })
      .filter((c) => String(c.element || "") === targetEl)
      .filter((c) => !c.protected)
      .filter((c) => String(c.uid || "").trim() !== targetUid);

    candidates.sort((a, b) => (asNum(b.elementsStored, 0) - asNum(a.elementsStored, 0)) || (asNum(b.power, 0) - asNum(a.power, 0)));
    return candidates;
  }

  function elementGenitiveRu(raw) {
    const el = String(raw || "").toLowerCase().trim();
    if (el === "fire") return "огня";
    if (el === "water") return "воды";
    if (el === "air") return "воздуха";
    if (el === "earth") return "земли";
    return "";
  }

  function renderUpgradeUI({ st, cardRef, upgrade, candidates }) {
    const actionBtn = document.getElementById("cardActionBtn");
    const actionText = document.getElementById("cardActionText") || actionBtn?.querySelector?.("span");
    const meta = document.getElementById("cardUpgradeMeta");
    const gainEl = document.getElementById("cardUpgradeGain");
    const costEl = document.getElementById("cardUpgradeCost");
    const note = document.getElementById("cardNote");

    if (!actionBtn) return;

    const target = cardRef?.card || null;
    if (!target || !upgrade) {
      actionBtn.disabled = true;
      if (actionText) actionText.textContent = "Макс. уровень";
      if (meta) meta.style.display = "none";
      if (note) note.style.display = "none";
      return;
    }

    if (meta) meta.style.display = "";
    if (gainEl) gainEl.textContent = `+${Math.max(0, Math.round(asNum(upgrade.gainPower, 0)))}`;
    if (costEl) costEl.textContent = String(Math.max(0, Math.round(asNum(upgrade.costNow, 0))));

    actionBtn.disabled = !upgrade.canLevel;
    if (actionText) actionText.textContent = "Поднять уровень";

    const hasWeak = Array.isArray(candidates) && candidates.length > 0;
    if (note) {
      note.style.display = hasWeak ? "none" : "";
      if (!hasWeak) {
        const gen = elementGenitiveRu(target.element);
        note.textContent = gen ? `У вас нет слабых карт стихии ${gen}.` : "У вас нет слабых карт этой стихии.";
      }
    }
  }

  function renderWeakCards({ levelsData, st, cardRef, upgrade, candidates }) {
    const wrap = document.getElementById("weakCardsWrap");
    const grid = document.getElementById("weakCardsGrid");

    if (!wrap || !grid) return;
    const target = cardRef?.card || null;
    if (!target) {
      wrap.style.display = "none";
      return;
    }

    const u = upgrade || computeUpgrade(levelsData, target, st.gold);
    const nextElems = u ? asNum(levelsData.byLevel.get(u.nextLevel)?.elements, 0) : 0;
    const remaining = u ? Math.max(0, nextElems - asNum(target.elementsStored, 0)) : 0;
    const list = Array.isArray(candidates) ? candidates : listAbsorbCandidates({ st, target });

    if (!list.length) {
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "";

    grid.innerHTML = "";

    const show = list.slice(0, 6);
    for (const c of show) {
      const item = document.createElement("div");
      item.className = "weak-card";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ref-card elem-${String(c.element || "earth")} ${normalizeRarityClass(c.rarity) || "rarity-1"}`;
      btn.dataset.uid = String(c.uid || "");
      btn.setAttribute("aria-label", String(c.title || c.name || c.id || "Карта"));

      btn.innerHTML = `
        <div class="ref-card__top">
          <span class="ref-card__type" aria-hidden="true"></span>
          <span class="ref-card__power">${Math.round(asNum(c.power ?? c.basePower, 0))}</span>
        </div>
        <div class="ref-card__art"></div>
        <div class="ref-card__elem" aria-hidden="true"></div>
      `;

      const artEl = btn.querySelector(".ref-card__art");
      if (artEl) {
        const url = String(c.art || "").trim();
        if (url) artEl.style.backgroundImage = `url('${url}')`;
      }

      const absorb = document.createElement("button");
      absorb.type = "button";
      absorb.className = "weak-card__absorb";
      absorb.textContent = "Поглотить";

      const elems = Math.max(0, asNum(c.elementsStored, 0));
      const pct = remaining > 0 ? Math.min(100, Math.round((elems / remaining) * 100)) : 100;
      const pctEl = document.createElement("div");
      pctEl.className = "weak-card__pct";
      pctEl.textContent = `+${pct}%`;

      const absorbOne = () => {
        const uid = String(c.uid || "").trim();
        if (!uid) return;

        if (window.AccountSystem?.updateActive) {
          window.AccountSystem.updateActive((acc) => {
            const stAcc = { deck: acc.deck || [], inventory: acc.inventory || [], gold: acc.gold || 0 };
            const ref = findCardRef(stAcc, { uid: target.uid, id: target.id, level: target.level, power: target.power, element: target.element });
            const t = ref?.card || null;
            if (!t) return null;

            let gain = 0;
            acc.inventory = (acc.inventory || []).filter((x) => {
              const u2 = String(x?.uid || "").trim();
              if (!u2) return true;
              if (u2 !== uid) return true;
              gain += asNum(x?.elementsStored, 0);
              return false;
            });
            t.elementsStored = Math.max(0, asNum(t.elementsStored, 0) + gain);
            return null;
          });
        } else {
          const st2 = loadStateFallback();
          let gain = 0;
          st2.inventory = (st2.inventory || []).filter((x) => {
            const u2 = String(x?.uid || "").trim();
            if (!u2) return true;
            if (u2 !== uid) return true;
            gain += asNum(x?.elementsStored, 0);
            return false;
          });
          const ref2 = findCardRef(st2, { uid: target.uid, id: target.id, level: target.level, power: target.power, element: target.element });
          if (ref2?.card) ref2.card.elementsStored = Math.max(0, asNum(ref2.card.elementsStored, 0) + gain);
          saveStateFallback(st2);
        }

        // No confirmations: click consumes immediately.
        try { document.dispatchEvent(new Event("card-open:rerender")); } catch { /* ignore */ }
      };

      absorb.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        absorbOne();
      });

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        absorbOne();
      });

      item.appendChild(btn);
      item.appendChild(absorb);
      item.appendChild(pctEl);
      grid.appendChild(item);
    }
  }

  function parseCollectionIndexFromCardId(id) {
    const m = String(id || "").match(/^(.*)_([0-9]{2})$/);
    if (!m) return null;
    const idx = Number(m[2]);
    if (!Number.isInteger(idx) || idx < 1) return null;
    return { collectionId: m[1], index: idx };
  }

  async function loadCollectionsRich() {
    if (collectionsRichCache) return collectionsRichCache;

    const url = getPath("data/collections.json");
    const r = await fetch(url);
    if (!r.ok) throw new Error(`collections.json fetch failed: ${r.status}`);
    const json = await r.json();
    const collections = json && Array.isArray(json.collections) ? json.collections : [];
    collectionsRichCache = collections;
    return collections;
  }

  function normalizeCardFromRich(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id ?? "");
    if (!id) return null;

    const power = Number(raw.power ?? raw.basePower ?? 0);
    return {
      id,
      title: String(raw.title ?? raw.name ?? raw.id ?? "Карта"),
      power: Number.isFinite(power) ? power : 0,
      level: Number(raw.level ?? 1) || 1,
      element: String(raw.element ?? "earth"),
      rarity: normalizeRarityClass(raw.rarity),
      inDeck: false,
      protected: false,
      art: String(raw.art ?? "").trim(),
      bio: String(raw.bio ?? "").trim(),
    };
  }

  async function loadCardFromCollectionsRichById(id) {
    const collections = await loadCollectionsRich();
    const want = String(id);
    for (const col of collections) {
      const cards = Array.isArray(col?.cards) ? col.cards : [];
      const raw = cards.find((c) => c && String(c.id) === want);
      if (!raw) continue;
      return normalizeCardFromRich(raw);
    }
    return null;
  }

  async function tryApplyRichTitle(card) {
    const parsed = parseCollectionIndexFromCardId(card?.id);
    if (!parsed) return card;

    const collections = await loadCollectionsRich();
    const col = collections.find((c) => c && c.id === parsed.collectionId);
    const richCard = col?.cards?.[parsed.index - 1] || null;
    if (richCard?.title) card.title = String(richCard.title);
    return card;
  }

  async function loadCardFromBase(id) {
    const url = getPath("assets/data/cards.base.json");
    const r = await fetch(url);
    if (!r.ok) throw new Error(`cards.base.json fetch failed: ${r.status}`);

    const list = await r.json();
    if (!Array.isArray(list)) throw new Error("cards.base.json must be an array");

    const raw = list.find((c) => c && String(c.id) === String(id));
    if (!raw) return null;

    const rarityKey = String(raw.rarity || "").toLowerCase();
    const power = Number(raw.power ?? raw.basePower ?? 0);

    return {
      id: String(raw.id ?? ""),
      title: String(raw.name ?? raw.title ?? raw.id ?? "Card"),
      power: Number.isFinite(power) ? power : 0,
      level: Number(raw.level ?? 1) || 1,
      element: String(raw.element ?? "earth"),
      rarity: normalizeRarityClass(rarityKey),
      inDeck: false,
      protected: false,
      art: String(raw.art ?? "").trim(),
      bio: String(raw.bio ?? "").trim(),
    };
  }

  async function loadCardFromCardsJson(id) {
    const url = getPath("data/cards.json");
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`cards.json fetch failed: ${r.status}`);
    const json = await r.json();
    const cards = Array.isArray(json?.cards) ? json.cards : [];
    const raw = cards.find((c) => c && String(c.id) === String(id));
    if (!raw) return null;

    const power = Number(raw.power ?? raw.basePower ?? 0);
    return {
      id: String(raw.id ?? ""),
      title: String(raw.title ?? raw.name ?? raw.id ?? "Карта"),
      power: Number.isFinite(power) ? power : 0,
      level: Number(raw.level ?? 1) || 1,
      element: String(raw.element ?? "earth"),
      rarity: normalizeRarityClass(raw.rarity),
      inDeck: false,
      protected: false,
      art: String(raw.art ?? "").trim(),
      bio: String(raw.bio ?? "").trim(),
    };
  }

  let cardsJsonCache = null;
  async function loadCardsJsonMetaById(id) {
    if (!id) return null;
    if (!cardsJsonCache) {
      const url = getPath("data/cards.json");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`cards.json fetch failed: ${r.status}`);
      const json = await r.json();
      const cards = Array.isArray(json?.cards) ? json.cards : [];
      cardsJsonCache = new Map(cards.filter(Boolean).map((c) => [String(c.id), c]));
    }
    return cardsJsonCache.get(String(id)) || null;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    let card = null;

    try {
      const raw = sessionStorage.getItem("openCard");
      if (raw) card = JSON.parse(raw);
    } catch (error) {
      console.error("Failed to load card data:", error);
    }

    // Even if card came from sessionStorage (shop/deck), always prefer the canonical meta from data/cards.json.
    if (card && typeof card === "object" && card.id) {
      try {
        const meta = await loadCardsJsonMetaById(card.id);
        if (meta?.title) card.title = String(meta.title);
        if (meta?.element) card.element = String(meta.element);
        if (meta?.rarity && !card.rarity) card.rarity = normalizeRarityClass(meta.rarity);
        if (meta?.art && !card.art) card.art = String(meta.art);
        if (meta?.bio && !card.bio) card.bio = String(meta.bio);
      } catch (error) {
        console.warn("Failed to apply cards.json title:", error);
      }
    }

    // Fallback: collection cards may live only in data/collections.json
    if (card && typeof card === "object" && card.id) {
      try {
        const rich = await loadCardFromCollectionsRichById(card.id);
        if (rich?.title) card.title = rich.title;
        if (rich?.element) card.element = rich.element;
        if (rich?.rarity && !card.rarity) card.rarity = rich.rarity;
        if (Number.isFinite(rich?.power) && (!Number.isFinite(Number(card.power)) || Number(card.power) <= 0)) card.power = rich.power;
        if (rich?.bio && !card.bio) card.bio = rich.bio;
      } catch (error) {
        console.warn("Failed to apply collections.json meta:", error);
      }
    }

    if (!card) {
      const id = qs("id");
      if (id) {
        try {
          card = await loadCardFromCardsJson(id);
          if (!card) card = await loadCardFromCollectionsRichById(id);
          if (!card) card = await loadCardFromBase(id);
          if (card) {
            try {
              card = await tryApplyRichTitle(card);
            } catch (error) {
              console.warn("Failed to apply rich title:", error);
            }
          }
        } catch (error) {
          console.warn("Failed to load card by id:", id, error);
        }
      }
    }

    if (!card) {
      card = {
        id: "",
        title: "Карта",
        power: 0,
        level: 1,
        element: "earth",
        inDeck: false,
        protected: false,
        art: "",
        bio: "",
      };
    }

    if (card && card.id) {
      try {
        const bios = await loadCardBioMap();
        const b = bios?.[String(card.id)];
        if (b && !card.bio) card.bio = String(b);
        if (!card.bio && card.title) {
          const byTitle = await loadTitleBioMap();
          const tBio = byTitle.get(normTitle(card.title));
          if (tBio) card.bio = String(tBio);
        }
      } catch (error) {
        console.warn("Failed to apply card-bio map:", error);
      }
    }

    applyCard(card);

    // Card leveling (upgrade) UI
    try {
      const weakWrap = document.getElementById("weakCardsWrap");
      if (!weakWrap) return;

      const levelsData = await loadCardLevelsData();
      await ensureAccountSystem();

      const loadState = () => {
        if (window.AccountSystem?.getActive) {
          const acc = window.AccountSystem.getActive() || null;
          if (acc) {
            return {
              source: "account",
              deck: Array.isArray(acc.deck) ? acc.deck : [],
              inventory: Array.isArray(acc.inventory) ? acc.inventory : [],
              gold: Math.max(0, Math.round(asNum(acc.gold, 0))),
            };
          }
        }
        const st = loadStateFallback();
        return { source: "storage", ...st };
      };

      const migrateAndPersist = () => {
        if (window.AccountSystem?.updateActive) {
          window.AccountSystem.updateActive((acc) => {
            migrateCardsInPlace(levelsData, acc.deck);
            migrateCardsInPlace(levelsData, acc.inventory);
            return null;
          });
        } else {
          const st = loadStateFallback();
          const changed = migrateCardsInPlace(levelsData, st.deck) || migrateCardsInPlace(levelsData, st.inventory);
          if (changed) saveStateFallback(st);
        }
      };

      migrateAndPersist();

      let st = loadState();
      let cardRef = findCardRef(st, card);
      if (cardRef?.card) {
        // Prefer the canonical stored card object (has uid/elementsStored, etc).
        card = { ...card, ...cardRef.card };
        applyCard(card);
      }

      const rerender = () => {
        st = loadState();
        cardRef = findCardRef(st, card);

        const target = cardRef?.card || null;
        if (target) {
          card = { ...card, ...target };
          applyCard(card);
        }

        const candidates = target ? listAbsorbCandidates({ st, target }) : [];
        const upgrade = target ? computeUpgrade(levelsData, target, st.gold) : null;

        renderUpgradeUI({ st, cardRef, upgrade, candidates });
        renderWeakCards({ levelsData, st, cardRef, upgrade, candidates });

        try {
          const hudGold = document.getElementById("hudGold");
          if (hudGold) hudGold.textContent = String(Math.max(0, Math.round(asNum(st.gold, 0))));

          const hudPower = document.getElementById("hudPower");
          if (hudPower && Array.isArray(st?.deck)) {
            const sum = st.deck.reduce((s, c) => s + asNum(c?.power ?? c?.basePower, 0), 0);
            if (Number.isFinite(sum) && sum > 0) hudPower.textContent = String(Math.round(sum));
          }
        } catch {
          // ignore
        }
      };

      document.addEventListener("card-open:rerender", rerender);

      document.getElementById("cardActionBtn")?.addEventListener("click", () => {
        const stNow = loadState();
        const refNow = findCardRef(stNow, card);
        const target = refNow?.card || null;
        if (!target) return;

        const u = computeUpgrade(levelsData, target, stNow.gold);
        if (!u) return showToast("Максимальный уровень.");
        if (!u.canLevel) return showToast("Не хватает золота.");

        confirmUpgrade({
          costGold: u.costNow,
          gainPower: u.gainPower,
          onYes: () => {
            const stNow2 = loadState();
            const refNow2 = findCardRef(stNow2, card);
            const target2 = refNow2?.card || null;
            if (!target2) return;

            const u2 = computeUpgrade(levelsData, target2, stNow2.gold);
            if (!u2) return showToast("Максимальный уровень.");
            if (!u2.canLevel) return showToast("Не хватает золота.");

            const applyUpgrade = (t, goldContainer, upgrade) => {
              const curRow = levelsData.byLevel.get(upgrade.level) || null;
              const nextRow = levelsData.byLevel.get(upgrade.nextLevel) || null;

              const curBase = Number.isFinite(Number(t?.basePower))
                ? Math.round(Number(t.basePower))
                : Math.round(asNum(curRow?.basePower, 0));
              const bonus = Number.isFinite(Number(t?.bonusFixed)) ? Number(t.bonusFixed) : 0;

              t.level = upgrade.nextLevel;
              t.basePower = Math.max(0, Math.round(curBase + upgrade.gainPower));
              t.bonusFixed = bonus;
              t.power = Math.max(0, Math.round(t.basePower + bonus));

              const nextElems = Math.max(0, asNum(nextRow?.elements, 0));
              t.elementsStored = Math.max(0, Math.max(asNum(t.elementsStored, 0), nextElems));

              goldContainer.gold = Math.max(0, Math.round(asNum(goldContainer.gold, 0)) - Math.max(0, Math.round(upgrade.costNow)));
            };

            if (window.AccountSystem?.updateActive) {
              window.AccountSystem.updateActive((acc) => {
                const refAcc = findCardRef(
                  { deck: Array.isArray(acc.deck) ? acc.deck : [], inventory: Array.isArray(acc.inventory) ? acc.inventory : [] },
                  { uid: target2.uid, id: target2.id, level: target2.level, power: target2.power, element: target2.element },
                );
                const t = refAcc?.card || null;
                if (!t) return null;

                applyUpgrade(t, acc, u2);
                return null;
              });
            } else {
              const st2 = loadStateFallback();
              const ref2 = findCardRef(st2, { uid: target2.uid, id: target2.id, level: target2.level, power: target2.power, element: target2.element });
              if (!ref2?.card) return;
              applyUpgrade(ref2.card, st2, u2);
              saveStateFallback(st2);
            }

            try {
              import("./campaign/campaign-events.js")
                .then((m) => m.emitCampaignEvent?.("card_upgraded", { count: 1 }))
                .catch(() => {});
            } catch {
              // ignore
            }

            showToast(`Уровень повышен до ${u2.nextLevel}.`);
            try { document.dispatchEvent(new Event("card-open:rerender")); } catch { /* ignore */ }
          },
        });
      });

      rerender();
    } catch (e) {
      console.warn("[card-open] upgrade UI init failed", e);
    }
  });
})();
