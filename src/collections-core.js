// src/collections-core.js
// Мінімальний “двигун” колекцій: прогрес + found/locked

import { fixMojibake } from "./core/mojibake.js";

const EXTRA_FOUND_KEY = "cardastika:foundExtra";
const EVER_FOUND_KEY = "cardastika:foundEver";
const EVER_FOUND_KEY_PREFIX = "cardastika:foundEver:";
const ID_ALIASES = [
  ["elem_01", "elem_flame_spark"],
  ["elem_02", "elem_tide_drop"],
  ["elem_03", "elem_gale_wisp"],
  ["elem_04", "elem_stone_seed"],
];

function getPath(path) {
  const isInPages = location.pathname.toLowerCase().includes("/pages/");
  return isInPages ? `../../${path}` : `./${path}`;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function getActiveAccountName() {
  const fromAccountSystem = String(window.AccountSystem?.getActive?.()?.name || "").trim();
  if (fromAccountSystem) return fromAccountSystem;
  return String(safeGetItem("activeAccount") || "").trim();
}

function getFoundHistoryKey() {
  const accountName = getActiveAccountName();
  return accountName ? `${EVER_FOUND_KEY_PREFIX}${accountName}` : EVER_FOUND_KEY;
}

function parseFoundHistory(raw) {
  const parsed = safeParse(raw);
  if (Array.isArray(parsed)) {
    return { ids: new Set(parsed.map(String).filter(Boolean)), fingerprints: new Set() };
  }

  const ids = Array.isArray(parsed?.ids) ? parsed.ids.map(String).filter(Boolean) : [];
  const fps = Array.isArray(parsed?.fingerprints) ? parsed.fingerprints.map(String).filter(Boolean) : [];
  return { ids: new Set(ids), fingerprints: new Set(fps) };
}

function readFoundHistory() {
  const key = getFoundHistoryKey();
  const primary = parseFoundHistory(safeGetItem(key));

  // Legacy migration path: merge global key into account-scoped key.
  if (key !== EVER_FOUND_KEY) {
    const legacy = parseFoundHistory(safeGetItem(EVER_FOUND_KEY));
    for (const id of legacy.ids) primary.ids.add(id);
    for (const fp of legacy.fingerprints) primary.fingerprints.add(fp);
  }

  return { key, ids: primary.ids, fingerprints: primary.fingerprints };
}

function persistFoundHistory(key, ids, fingerprints) {
  safeSetItem(
    key,
    JSON.stringify({
      ids: Array.from(ids),
      fingerprints: Array.from(fingerprints),
    }),
  );
}

function getActiveInventory() {
  if (window.AccountSystem?.getActive) {
    const acc = window.AccountSystem.getActive();
    if (acc?.inventory && Array.isArray(acc.inventory)) return acc.inventory;
  }

  const raw = localStorage.getItem("cardastika:inventory");
  if (!raw) return [];
  try {
    const inv = JSON.parse(raw);
    return Array.isArray(inv) ? inv : [];
  } catch {
    return [];
  }
}

function getActiveDeck() {
  if (window.AccountSystem?.getActive) {
    const acc = window.AccountSystem.getActive();
    if (acc?.deck && Array.isArray(acc.deck)) return acc.deck;
  }

  const raw = localStorage.getItem("cardastika:deck");
  if (!raw) return [];
  try {
    const deck = JSON.parse(raw);
    return Array.isArray(deck) ? deck : [];
  } catch {
    return [];
  }
}

function normalizeCardId(card) {
  return card?.id ?? card?.cardId ?? card?.slug ?? card?.uid ?? null;
}

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "wind") return "air";
  if (s === "fire" || s === "water" || s === "air" || s === "earth") return s;
  return "";
}

function normalizeTitle(raw) {
  return fixMojibake(String(raw || "")).toLowerCase().replace(/\s+/g, " ").trim();
}

function fingerprintCard(card) {
  const title = normalizeTitle(card?.title ?? card?.name ?? "");
  const element = normalizeElement(card?.element);
  if (!title || !element) return "";
  return `${title}|${element}`;
}

function getExtraFoundIds() {
  const raw = localStorage.getItem(EXTRA_FOUND_KEY);
  if (!raw) return [];
  const parsed = safeParse(raw);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

export function buildFoundSet() {
  return new Set(buildFoundMatcher().foundIds);
}

export function buildFoundMatcher() {
  const inv = getActiveInventory();
  const deck = getActiveDeck();
  const history = readFoundHistory();
  const found = new Set(history.ids);
  const foundFingerprints = new Set(history.fingerprints);
  let historyChanged = false;

  const pushCard = (card) => {
    if (!card || typeof card !== "object") return;
    const id = normalizeCardId(card);
    if (id) {
      const key = String(id);
      if (!history.ids.has(key)) {
        history.ids.add(key);
        historyChanged = true;
      }
      found.add(key);
    }
    const fp = fingerprintCard(card);
    if (fp) {
      if (!history.fingerprints.has(fp)) {
        history.fingerprints.add(fp);
        historyChanged = true;
      }
      foundFingerprints.add(fp);
    }
  };

  for (const c of inv) {
    pushCard(c);
  }

  // Defensive: if something put a card into deck but forgot to add to inventory,
  // still count it as found for collection progress UI.
  for (const c of deck) {
    pushCard(c);
  }

  // Persist "ever owned" snapshot so consumed cards stay found in collection.
  if (historyChanged) {
    persistFoundHistory(history.key, history.ids, history.fingerprints);
  }

  // Extra found ids (e.g., trophies) that are not real deck/inventory cards.
  for (const id of getExtraFoundIds()) {
    if (id) found.add(String(id));
  }

  // Legacy/canonical id bridge for elementals collection.
  for (const [legacyId, canonicalId] of ID_ALIASES) {
    const hasLegacy = found.has(legacyId);
    const hasCanonical = found.has(canonicalId);
    if (hasLegacy || hasCanonical) {
      found.add(legacyId);
      found.add(canonicalId);
    }
  }

  const hasId = (id) => {
    const key = String(id || "").trim();
    if (!key) return false;
    if (found.has(key)) return true;
    for (const [legacyId, canonicalId] of ID_ALIASES) {
      if (key === legacyId && found.has(canonicalId)) return true;
      if (key === canonicalId && found.has(legacyId)) return true;
    }
    return false;
  };

  const hasCard = (cardLike) => {
    if (!cardLike || typeof cardLike !== "object") return false;
    const id = normalizeCardId(cardLike);
    if (id && hasId(id)) return true;
    const fp = fingerprintCard(cardLike);
    return fp ? foundFingerprints.has(fp) : false;
  };

  return { foundIds: found, hasId, hasCard };
}

export function computeCollectionProgress(collectionDef, foundSet) {
  const ids = (collectionDef.cardIds || []).map(String);
  let found = 0;
  for (const id of ids) if (foundSet.has(id)) found++;
  return {
    found,
    total: ids.length,
    percent: ids.length ? Math.round((found / ids.length) * 100) : 0,
  };
}

async function loadCardsJson() {
  const url = getPath("data/cards.json");
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`cards.json fetch failed: ${r.status}`);
  const json = await r.json();
  const cards = Array.isArray(json?.cards) ? json.cards : [];
  return cards.filter(Boolean);
}

async function loadCollectionsFixed() {
  const url = getPath("assets/data/collections.fixed.json");
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`collections.fixed.json fetch failed: ${r.status}`);
  const json = await r.json();
  if (!Array.isArray(json)) throw new Error("collections.fixed.json must be an array");
  return json.filter(Boolean);
}

async function loadCollectionsRich() {
  const url = getPath("data/collections.json");
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`collections.json fetch failed: ${r.status}`);
  const json = await r.json();
  const list = Array.isArray(json?.collections) ? json.collections : [];
  return list.filter(Boolean);
}

function cardBelongsToCollection(card, collectionTitle) {
  if (!card || typeof card !== "object") return false;
  const cols = card.collections;
  if (!Array.isArray(cols) || cols.length === 0) return false;
  const t = String(collectionTitle || "").trim();
  if (!t) return false;
  return cols.some((x) => String(x || "").trim() === t);
}

export async function loadCollectionsConfigSmart() {
  const fixed = await loadCollectionsFixed();
  let cards = [];
  let rich = [];
  try {
    cards = await loadCardsJson();
  } catch (err) {
    console.warn("[collections] cards.json unavailable; using collections.fixed.json cardIds", err);
    cards = [];
  }
  try {
    rich = await loadCollectionsRich();
  } catch (err) {
    console.warn("[collections] collections.json unavailable; using fallback ids", err);
    rich = [];
  }

  const richById = new Map(rich.map((c) => [String(c?.id || ""), c]));

  const out = [];
  for (const col of fixed) {
    const title = String(col?.title || "").trim();
    const richCol = richById.get(String(col?.id || "")) || null;
    const richTitle = String(richCol?.title || "").trim();

    const titlesToCheck = [title, richTitle].filter(Boolean);
    const fromCards = titlesToCheck.length
      ? cards
          .filter((c) => titlesToCheck.some((t) => cardBelongsToCollection(c, t)))
          .map((c) => String(c.id))
      : [];
    const fromRich = Array.isArray(richCol?.cards) ? richCol.cards.map((c) => String(c?.id || "")).filter(Boolean) : [];
    const fromFixed = Array.isArray(col?.cardIds) ? col.cardIds.map(String) : [];

    const chosenIds = fromCards.length ? fromCards : (fromRich.length ? fromRich : fromFixed);

    out.push({
      id: String(col?.id || ""),
      title: richTitle || title || String(col?.id || ""),
      cardIds: chosenIds,
    });
  }

  return out.filter((c) => c.id);
}
