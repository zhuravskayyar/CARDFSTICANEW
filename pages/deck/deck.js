// pages/deck/deck.js — render deck from active account / storage
import "../../src/account.js";
import { CARD_BELONGS_TO, decorateCard, ensureCardCatalogLoaded } from "../../src/core/card.js";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function asNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

let _levelsPromise = null;
async function loadCardLevelsData() {
  if (_levelsPromise) return _levelsPromise;
  _levelsPromise = (async () => {
    const r = await fetch("../../data/cardLevels.json", { cache: "no-store" });
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

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["fire", "water", "air", "earth"].includes(s)) return s;
  if (s === "wind") return "air";
  return "earth";
}

function normalizeRarity(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return clamp(Math.round(raw), 1, 6);
  const s = String(raw || "").toLowerCase().trim();
  const m = s.match(/^rarity-([1-6])$/);
  if (m) return Number(m[1]);
  if (s === "common") return 1;
  if (s === "uncommon") return 2;
  if (s === "rare") return 3;
  if (s === "epic") return 4;
  if (s === "legendary") return 5;
  if (s === "mythic") return 6;
  return 1;
}

function normalizeCard(raw, idx) {
  if (!raw || typeof raw !== "object") return null;
  const uid = String(raw.uid || raw.cardUid || raw.cardUID || "").trim();
  const id = String(raw.id || raw.cardId || `card_${idx + 1}`);
  const title = String(raw.name || raw.title || raw.cardTitle || id);

  const element = normalizeElement(raw.element || raw.elem || raw.type);
  const powerCandidate = Number(raw.power ?? raw.basePower ?? raw.str ?? raw.attack ?? raw.value ?? 0);
  const power = Number.isFinite(powerCandidate) ? Math.max(0, Math.round(powerCandidate)) : 0;

  const levelCandidate = Number(raw.level ?? raw.lvl ?? 1);
  const level = Number.isFinite(levelCandidate) ? Math.max(1, Math.round(levelCandidate)) : 1;

  const basePower = Number.isFinite(Number(raw.basePower)) ? Math.max(0, Math.round(Number(raw.basePower))) : null;
  const bonusFixed = Number.isFinite(Number(raw.bonusFixed)) ? Math.round(Number(raw.bonusFixed)) : 0;
  const elementsStored = Number.isFinite(Number(raw.elementsStored))
    ? Math.max(0, Number(raw.elementsStored))
    : Number.isFinite(Number(raw.elements))
      ? Math.max(0, Number(raw.elements))
      : null;

  const rarity = normalizeRarity(raw.rarity ?? raw.quality ?? raw.rarityClass ?? 1);
  const art = raw.art || raw.image || raw.img || raw.cover || "";
  const protectedFlag = !!(raw.protected ?? raw.isProtected ?? raw.locked ?? false);

  return {
    uid,
    id,
    title,
    element,
    power,
    basePower,
    bonusFixed,
    elementsStored,
    protected: protectedFlag,
    level,
    rarity,
    art: art ? String(art) : "",
  };
}

function readDeck() {
  const acc = window.AccountSystem?.getActive?.() || null;
  if (acc?.deck && Array.isArray(acc.deck) && acc.deck.length) return acc.deck;

  const raw = localStorage.getItem("cardastika:deck");
  const parsed = raw ? safeParse(raw) : null;
  return Array.isArray(parsed) ? parsed : [];
}

function readInventory() {
  const acc = window.AccountSystem?.getActive?.() || null;
  if (acc?.inventory && Array.isArray(acc.inventory) && acc.inventory.length) return acc.inventory;

  const raw = localStorage.getItem("cardastika:inventory");
  const parsed = raw ? safeParse(raw) : null;
  return Array.isArray(parsed) ? parsed : [];
}

function deckPower(deck) {
  if (!Array.isArray(deck)) return 0;
  return deck.reduce((s, c) => s + Number(c?.power ?? c?.basePower ?? 0), 0);
}

function setElemRarityClasses(btn, element, rarity) {
  [...btn.classList].forEach((c) => {
    if (c.startsWith("elem-") || c.startsWith("rarity-") || c === "is-upgradable") btn.classList.remove(c);
  });
  btn.classList.add(`elem-${element}`);
  btn.classList.add(`rarity-${rarity}`);
}

function newUid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function migrateActiveCards(levelsData) {
  if (!window.AccountSystem?.updateActive) return null;
  return window.AccountSystem.updateActive((acc) => {
    let changed = false;
    const fixCard = (c) => {
      if (!c || typeof c !== "object") return;

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

      // Keep power in sync if it looks unset/stale.
      if (row) {
        const want = Math.max(0, Math.round(asNum(row.basePower, 0) + asNum(c.bonusFixed, 0)));
        if (!Number.isFinite(Number(c.power)) || Math.round(Number(c.power)) <= 0) {
          c.power = want;
          changed = true;
        }
      }
    };

    if (Array.isArray(acc.deck)) acc.deck.forEach(fixCard);
    if (Array.isArray(acc.inventory)) acc.inventory.forEach(fixCard);
    return changed ? acc : null;
  });
}

function canReachNextLevelByAbsorb({ levelsData, card, candidatesTotalElements }) {
  const lvl = Math.max(1, Math.round(asNum(card?.level, 1)));
  const nextLvl = lvl + 1;
  const next = levelsData.byLevel.get(nextLvl) || null;
  const cur = levelsData.byLevel.get(lvl) || null;
  if (!next || !cur) return false;

  // Upgrade arrow should indicate a free upgrade (non-golden level reachable by absorption).
  // Golden levels always require gold, even at 100% progress.
  const isGolden = !!next.isGolden || next.minGoldCost != null;
  if (isGolden) return false;

  // No weak cards to absorb — no arrow.
  const weakTotal = Math.max(0, asNum(candidatesTotalElements, 0));
  if (weakTotal <= 0) return false;

  const curElems = asNum(card?.elementsStored, cur.elements);
  const canReach = curElems + weakTotal >= next.elements;
  return canReach;
}

async function render() {
  let levelsData = { byLevel: new Map(), maxLevel: 180 };
  try {
    await ensureCardCatalogLoaded();
  } catch (e) {
    console.warn("[deck] card catalog unavailable, fallback to local data", e);
  }
  try {
    levelsData = await loadCardLevelsData();
  } catch (e) {
    console.warn("[deck] cardLevels unavailable, fallback to local deck render", e);
  }
  try {
    migrateActiveCards(levelsData);
  } catch (e) {
    console.warn("[deck] migrateActiveCards failed", e);
  }
  const buttons = Array.from(document.querySelectorAll(".deck-grid .ref-card"));
  if (!buttons.length) return;

  const rawDeck = readDeck();
  const rawInventory = readInventory();

  const deck = rawDeck
    .slice(0, 9)
    .map(normalizeCard)
    .filter(Boolean)
    .map((c) => decorateCard({ ...c, inDeck: true }, CARD_BELONGS_TO.deck));

  // Stronger cards first (descending power), then by level/rarity for stability.
  deck.sort((a, b) =>
    (Number(b?.power ?? 0) - Number(a?.power ?? 0)) ||
    (Number(b?.level ?? 0) - Number(a?.level ?? 0)) ||
    (Number(b?.rarity ?? 0) - Number(a?.rarity ?? 0)) ||
    String(a?.title ?? "").localeCompare(String(b?.title ?? "")),
  );

  const deckUids = new Set(deck.map((c) => String(c?.uid || "")).filter(Boolean));
  const invCards = rawInventory
    .map(normalizeCard)
    .filter(Boolean)
    .map((c) => decorateCard({ ...c, inDeck: deckUids.has(String(c.uid)) }, CARD_BELONGS_TO.player));

  const weakTotalsByElement = { fire: 0, water: 0, air: 0, earth: 0 };
  for (const c of invCards) {
    if (!c || c.inDeck) continue;
    if (c.protected) continue;
    const el = normalizeElement(c.element);
    if (!el) continue;
    const lvl = Math.max(1, Math.round(asNum(c.level, 1)));
    const row = levelsData.byLevel.get(lvl) || null;
    const elems = Number.isFinite(Number(c.elementsStored))
      ? Math.max(0, Number(c.elementsStored))
      : asNum(row?.elements, 0);
    weakTotalsByElement[el] += elems;
  }

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const card = deck[i] || null;

    if (!card) {
      btn.disabled = true;
      btn.removeAttribute("data-card-id");
      btn.removeAttribute("data-card-uid");
      btn.removeAttribute("data-card-title");
      btn.removeAttribute("data-card-power");
      btn.removeAttribute("data-card-level");
      btn.removeAttribute("data-card-element");
      btn.removeAttribute("data-card-in-deck");
      btn.removeAttribute("data-card-protected");
      btn.removeAttribute("data-card-art");
      btn.setAttribute("aria-label", "Empty slot");

      const powerEl = btn.querySelector(".ref-card__power");
      if (powerEl) powerEl.textContent = "–";
      const artEl = btn.querySelector(".ref-card__art");
      if (artEl) artEl.style.backgroundImage = "";

      continue;
    }

    btn.disabled = false;
    btn.dataset.cardId = card.id;
    if (card.uid) btn.dataset.cardUid = card.uid;
    btn.dataset.cardTitle = card.title;
    btn.dataset.cardPower = String(card.power);
    btn.dataset.cardLevel = String(card.level);
    btn.dataset.cardElement = card.element;
    btn.dataset.cardInDeck = "1";
    btn.dataset.cardProtected = card.protected ? "1" : "0";
    btn.dataset.cardArt = card.art;
    btn.setAttribute("aria-label", card.title);

    setElemRarityClasses(btn, card.element, card.rarity);

    // Ensure the upgrade arrow placeholder exists (some static templates may miss it).
    if (!btn.querySelector(".ref-card__up")) {
      const up = document.createElement("div");
      up.className = "ref-card__up";
      up.setAttribute("aria-hidden", "true");
      btn.appendChild(up);
    }

    // Show upgrade arrow only for free (non-golden) upgrades reachable by absorption.
    const canReach = canReachNextLevelByAbsorb({
      levelsData,
      card,
      candidatesTotalElements: weakTotalsByElement[normalizeElement(card.element)] || 0,
    });
    btn.classList.toggle("is-upgradable", !!canReach);

    const powerEl = btn.querySelector(".ref-card__power");
    if (powerEl) powerEl.textContent = String(card.power);

    const artEl = btn.querySelector(".ref-card__art");
    if (artEl) {
      artEl.style.backgroundImage = card.art ? `url('${card.art}')` : "";
      if (!card.art) artEl.removeAttribute("style");
    }
  }

  const power = Math.round(deckPower(deck));
  const deckPowerEl = document.getElementById("deckPower");
  if (deckPowerEl && Number.isFinite(power)) deckPowerEl.textContent = String(power);

  const hudPowerEl = document.getElementById("hudPower");
  if (hudPowerEl && Number.isFinite(power) && power > 0) hudPowerEl.textContent = String(power);
}

document.addEventListener("DOMContentLoaded", render);
