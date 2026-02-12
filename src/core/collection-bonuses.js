import { buildFoundSet, loadCollectionsConfigSmart } from "../collections-core.js";

const CACHE_TTL_MS = 3000;

const DEFAULT_BONUSES = {
  completedCollectionIds: [],
  elementPowerPct: {
    fire: 0,
    water: 0,
    air: 0,
    earth: 0,
  },
  deckPowerPct: 0,
  duelHpPct: 0,
  arenaHpPct: 0,
  tournamentHpPct: 0,
  tournamentBuffPct: 15,
};

const BONUS_RULES = [
  { ids: ["horde-power"], apply: (b) => { b.elementPowerPct.fire += 5; } },
  { ids: ["sea-masters"], apply: (b) => { b.elementPowerPct.water += 5; } },
  { ids: ["sky-heroes"], apply: (b) => { b.elementPowerPct.air += 5; } },
  { ids: ["forest-dwellers"], apply: (b) => { b.elementPowerPct.earth += 5; } },
  { ids: ["campaign-act-bosses-1"], apply: (b) => { b.deckPowerPct += 5; } },
  {
    ids: ["vyshchi-mahy", "higher-mages"],
    apply: (b) => {
      b.arenaHpPct += 5;
      b.tournamentHpPct += 5;
    },
  },
  {
    ids: ["hihanty-urfina", "urfin-giants"],
    apply: (b) => {
      b.tournamentBuffPct = Math.max(20, Number(b.tournamentBuffPct || 15));
    },
  },
];

let cache = {
  ts: 0,
  bonuses: null,
};

function asNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function normalizeCollectionId(raw) {
  return String(raw || "").trim().toLowerCase();
}

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "wind") return "air";
  if (s === "fire" || s === "water" || s === "air" || s === "earth") return s;
  return "";
}

function cardPower(card) {
  const n = Number(card?.power ?? card?.basePower ?? card?.str ?? card?.attack ?? card?.value ?? 0);
  return Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
}

function cloneDefaultBonuses() {
  return {
    ...DEFAULT_BONUSES,
    completedCollectionIds: [],
    elementPowerPct: { ...DEFAULT_BONUSES.elementPowerPct },
  };
}

function hasCompletedCollection(completedSet, aliases = []) {
  for (const rawId of aliases) {
    const id = normalizeCollectionId(rawId);
    if (!id) continue;
    if (completedSet.has(id)) return true;
  }
  return false;
}

export async function getCompletedCollectionIds() {
  const defs = await loadCollectionsConfigSmart().catch(() => []);
  const found = buildFoundSet();

  const completed = new Set();
  for (const def of defs) {
    if (!def || typeof def !== "object") continue;
    const id = normalizeCollectionId(def.id);
    if (!id) continue;
    const ids = Array.isArray(def.cardIds) ? def.cardIds.map(String).filter(Boolean) : [];
    if (!ids.length) continue;
    const isCompleted = ids.every((x) => found.has(String(x)));
    if (isCompleted) completed.add(id);
  }
  return completed;
}

export async function getCollectionBattleBonuses({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.bonuses && now - cache.ts <= CACHE_TTL_MS) {
    return cache.bonuses;
  }

  const bonuses = cloneDefaultBonuses();
  const completed = await getCompletedCollectionIds();
  bonuses.completedCollectionIds = Array.from(completed);

  for (const rule of BONUS_RULES) {
    if (!hasCompletedCollection(completed, rule.ids)) continue;
    try {
      rule.apply(bonuses);
    } catch {
      // ignore malformed rule
    }
  }

  cache = { ts: now, bonuses };
  return bonuses;
}

export function applyCollectionBonusesToDeck(deck, bonusesLike = null) {
  const src = Array.isArray(deck) ? deck : [];
  const bonuses = bonusesLike && typeof bonusesLike === "object" ? bonusesLike : DEFAULT_BONUSES;
  const deckPct = Math.max(0, asNum(bonuses.deckPowerPct, 0));
  const elementPctMap = bonuses.elementPowerPct && typeof bonuses.elementPowerPct === "object"
    ? bonuses.elementPowerPct
    : DEFAULT_BONUSES.elementPowerPct;

  return src.map((card) => {
    if (!card || typeof card !== "object") return card;

    const basePower = cardPower(card);
    const element = normalizeElement(card.element || card.elem || card.type);
    const elementPct = element ? Math.max(0, asNum(elementPctMap[element], 0)) : 0;
    const totalPct = deckPct + elementPct;
    if (totalPct <= 0) return card;

    const nextPower = Math.max(1, Math.round(basePower * (1 + totalPct / 100)));
    return {
      ...card,
      power: nextPower,
      collectionBonusPct: totalPct,
    };
  });
}

export function applyCollectionBonusesToHp(baseHp, bonusesLike = null, { mode = "duel" } = {}) {
  const base = Number.isFinite(Number(baseHp)) ? Math.max(1, Math.round(Number(baseHp))) : 1;
  const bonuses = bonusesLike && typeof bonusesLike === "object" ? bonusesLike : DEFAULT_BONUSES;
  const m = String(mode || "duel").toLowerCase().trim();

  let hpPct = 0;
  if (m === "tournament") hpPct += Math.max(0, asNum(bonuses.tournamentHpPct, 0));
  if (m === "arena") hpPct += Math.max(0, asNum(bonuses.arenaHpPct, 0));
  if (m === "duel" || m === "boss") hpPct += Math.max(0, asNum(bonuses.duelHpPct, 0));

  if (hpPct <= 0) return base;
  return Math.max(1, Math.round(base * (1 + hpPct / 100)));
}

export function getTournamentBuffBonusFraction(bonusesLike = null) {
  const bonuses = bonusesLike && typeof bonusesLike === "object" ? bonusesLike : DEFAULT_BONUSES;
  const pct = Math.max(0, asNum(bonuses.tournamentBuffPct, 15));
  return pct / 100;
}

