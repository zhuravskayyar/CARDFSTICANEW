// src/core/equipment-system.js
// Equipment + artifacts rules, storage, forge, and battle math.

const STORAGE_KEY = "cardastika:equipmentState";
const GOLD_KEY = "cardastika:gold";
const SCHEMA_VERSION = 1;

export const EQUIPMENT_LIMITS = Object.freeze({
  items: 888,
  artifacts: 888,
  overflowByDailyReward: 1,
});

export const EQUIPMENT_ELEMENTS = Object.freeze(["fire", "water", "air", "earth"]);
export const EQUIPMENT_ITEM_SLOTS = Object.freeze(["hat", "armor", "weapon", "boots"]);
export const ARTIFACT_TYPES = Object.freeze(["spear", "shield", "mirror", "amulet", "voodoo"]);

export const RARITY_ORDER = Object.freeze([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
]);

export const ITEM_POWER_BONUS_BY_RARITY = Object.freeze({
  common: 25,
  uncommon: 50,
  rare: 100,
  epic: 200,
  legendary: 400,
  mythic: 1000,
});

const ARTIFACT_PCT_BY_RARITY = Object.freeze({
  common: 0.02,
  uncommon: 0.04,
  rare: 0.08,
  epic: 0.12,
  legendary: 0.2,
  mythic: 0.3,
});

const SHIELD_PCT_BY_RARITY = Object.freeze({
  common: 0.02,
  uncommon: 0.03,
  rare: 0.07,
  epic: 0.11,
  legendary: 0.18,
  mythic: 0.24,
});

const MIRROR_PCT_BY_RARITY = Object.freeze({
  common: 0.01,
  uncommon: 0.02,
  rare: 0.04,
  epic: 0.06,
  legendary: 0.09,
  mythic: 0.12,
});

const AMULET_PCT_BY_RARITY = Object.freeze({
  common: 0.02,
  uncommon: 0.04,
  rare: 0.08,
  epic: 0.12,
  legendary: 0.2,
  mythic: 0.3,
});

const VOODOO_PCT_BY_RARITY = Object.freeze({
  common: 0.01,
  uncommon: 0.02,
  rare: 0.04,
  epic: 0.06,
  legendary: 0.09,
  mythic: 0.12,
});

export const FORGE_RECIPES = Object.freeze({
  uncommon: Object.freeze({ from: "common", need: 4, gold: 5 }),
  rare: Object.freeze({ from: "uncommon", need: 5, gold: 50 }),
  epic: Object.freeze({ from: "rare", need: 6, gold: 500 }),
  legendary: Object.freeze({ from: "epic", need: 7, gold: 5000 }),
  mythic: Object.freeze({ from: "legendary", need: 8, gold: 50000 }),
});

const ARTIFACT_BATTLE_MODES = new Set(["arena", "tournament", "guildwar", "guild_war"]);

const RARITY_ALIASES = Object.freeze({
  common: "common",
  normal: "common",
  ordinary: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
  mythic: "mythic",
  mythiccal: "mythic",
  "обычная": "common",
  "звичайна": "common",
  "необычная": "uncommon",
  "незвичайна": "uncommon",
  "редкая": "rare",
  "рідкісна": "rare",
  "эпическая": "epic",
  "епічна": "epic",
  "легендарная": "legendary",
  "легендарна": "legendary",
  "мифическая": "mythic",
  "міфічна": "mythic",
});

const ARTIFACT_TYPE_ALIASES = Object.freeze({
  spear: "spear",
  "копье": "spear",
  "копьё": "spear",
  "копье мага": "spear",
  "спис": "spear",
  "спис мага": "spear",
  shield: "shield",
  "щит": "shield",
  "щит мага": "shield",
  mirror: "mirror",
  "зеркало": "mirror",
  "зеркало магии": "mirror",
  "дзеркало": "mirror",
  "дзеркало магії": "mirror",
  amulet: "amulet",
  "амулет": "amulet",
  "амулет жизни": "amulet",
  "амулет життя": "amulet",
  voodoo: "voodoo",
  "кукла вуду": "voodoo",
  "лялька вуду": "voodoo",
});

const SLOT_ALIASES = Object.freeze({
  hat: "hat",
  helmet: "hat",
  шапка: "hat",
  шляпа: "hat",
  шолом: "hat",
  armor: "armor",
  cloak: "armor",
  chest: "armor",
  плащ: "armor",
  броня: "armor",
  weapon: "weapon",
  staff: "weapon",
  sword: "weapon",
  зброя: "weapon",
  меч: "weapon",
  boots: "boots",
  boot: "boots",
  сапоги: "boots",
  чоботи: "boots",
});

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function nowTs() {
  return Date.now();
}

function newId(prefix = "eq") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${nowTs()}_${Math.random().toString(16).slice(2)}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function asObject(v) {
  return v && typeof v === "object" ? v : {};
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeElement(element) {
  const e = String(element || "").trim().toLowerCase();
  if (e === "wind") return "air";
  return EQUIPMENT_ELEMENTS.includes(e) ? e : "";
}

export function normalizeRarity(rarity) {
  if (typeof rarity === "number" && Number.isFinite(rarity)) {
    const idx = clamp(Math.round(rarity), 1, RARITY_ORDER.length) - 1;
    return RARITY_ORDER[idx];
  }
  const key = String(rarity || "").trim().toLowerCase();
  return RARITY_ALIASES[key] || "";
}

function normalizeSlot(slot) {
  const key = String(slot || "").trim().toLowerCase();
  return SLOT_ALIASES[key] || "";
}

function normalizeArtifactType(type) {
  const key = String(type || "").trim().toLowerCase();
  return ARTIFACT_TYPE_ALIASES[key] || "";
}

function emptyEquippedSlots() {
  return { hat: "", armor: "", weapon: "", boots: "" };
}

function emptyEquippedArtifacts() {
  return { spear: "", shield: "", mirror: "", amulet: "", voodoo: "" };
}

export function createEmptyEquipmentState() {
  return {
    v: SCHEMA_VERSION,
    items: [],
    artifacts: [],
    equipped: {
      items: emptyEquippedSlots(),
      artifacts: emptyEquippedArtifacts(),
    },
    updatedAt: nowTs(),
  };
}

function normalizeItem(raw) {
  const src = asObject(raw);
  const slot = normalizeSlot(src.slot || src.type);
  const rarity = normalizeRarity(src.rarity);
  const element = normalizeElement(src.element);
  if (!slot || !rarity || !element) return null;
  return {
    id: String(src.id || newId("item")),
    kind: "item",
    slot,
    element,
    rarity,
    name: String(src.name || ""),
    createdAt: Number(src.createdAt) || nowTs(),
  };
}

function normalizeArtifact(raw) {
  const src = asObject(raw);
  const artifactType = normalizeArtifactType(src.artifactType || src.type);
  const rarity = normalizeRarity(src.rarity);
  if (!artifactType || !rarity) return null;
  return {
    id: String(src.id || newId("art")),
    kind: "artifact",
    artifactType,
    rarity,
    name: String(src.name || ""),
    createdAt: Number(src.createdAt) || nowTs(),
  };
}

function normalizeEquippedRefMap(rawMap, keys) {
  const source = asObject(rawMap);
  const out = {};
  for (const k of keys) out[k] = "";
  for (const [k, v] of Object.entries(source)) {
    if (!keys.includes(k)) continue;
    out[k] = String(v || "");
  }
  return out;
}

export function normalizeEquipmentState(rawState) {
  const src = asObject(rawState);
  const state = createEmptyEquipmentState();
  state.v = Number(src.v) || SCHEMA_VERSION;

  const rawItems = asArray(src.items).map(normalizeItem).filter(Boolean);
  const rawArtifacts = asArray(src.artifacts).map(normalizeArtifact).filter(Boolean);

  const uniqueItems = new Map();
  for (const it of rawItems) {
    if (!uniqueItems.has(it.id)) uniqueItems.set(it.id, it);
  }

  const uniqueArtifacts = new Map();
  for (const art of rawArtifacts) {
    if (!uniqueArtifacts.has(art.id)) uniqueArtifacts.set(art.id, art);
  }

  state.items = Array.from(uniqueItems.values());
  state.artifacts = Array.from(uniqueArtifacts.values());

  const equippedRaw = asObject(src.equipped);
  const equippedItems = normalizeEquippedRefMap(equippedRaw.items, EQUIPMENT_ITEM_SLOTS);
  const equippedArtifacts = normalizeEquippedRefMap(equippedRaw.artifacts, ARTIFACT_TYPES);

  const itemById = new Map(state.items.map((x) => [x.id, x]));
  const artifactById = new Map(state.artifacts.map((x) => [x.id, x]));

  for (const slot of EQUIPMENT_ITEM_SLOTS) {
    const id = equippedItems[slot];
    if (!id) continue;
    const item = itemById.get(id);
    if (!item || item.slot !== slot) equippedItems[slot] = "";
  }

  for (const type of ARTIFACT_TYPES) {
    const id = equippedArtifacts[type];
    if (!id) continue;
    const art = artifactById.get(id);
    if (!art || art.artifactType !== type) equippedArtifacts[type] = "";
  }

  state.equipped = {
    items: equippedItems,
    artifacts: equippedArtifacts,
  };
  state.updatedAt = Number(src.updatedAt) || nowTs();
  return state;
}

export function readEquipmentState() {
  const raw = safeParse(localStorage.getItem(STORAGE_KEY), null);
  return normalizeEquipmentState(raw);
}

export function saveEquipmentState(nextState) {
  const state = normalizeEquipmentState(nextState);
  state.updatedAt = nowTs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function ensureEquipmentState() {
  const state = readEquipmentState();
  saveEquipmentState(state);
  return state;
}

export function getStoredCounts(stateLike = null) {
  const state = stateLike ? normalizeEquipmentState(stateLike) : readEquipmentState();
  const equippedItemIds = new Set(Object.values(state.equipped.items).filter(Boolean));
  const equippedArtifactIds = new Set(Object.values(state.equipped.artifacts).filter(Boolean));
  const itemsStored = state.items.filter((x) => !equippedItemIds.has(x.id)).length;
  const artifactsStored = state.artifacts.filter((x) => !equippedArtifactIds.has(x.id)).length;
  return { items: itemsStored, artifacts: artifactsStored };
}

function hasCapacity(kind, counts, allowOverflowByOne = false) {
  const baseLimit = kind === "artifact" ? EQUIPMENT_LIMITS.artifacts : EQUIPMENT_LIMITS.items;
  const bonus = allowOverflowByOne ? EQUIPMENT_LIMITS.overflowByDailyReward : 0;
  const cur = kind === "artifact" ? counts.artifacts : counts.items;
  return cur < (baseLimit + bonus);
}

function removeByIds(list, idSet) {
  return asArray(list).filter((x) => !idSet.has(String(x?.id || "")));
}

export function addItem(rawItem, opts = {}) {
  const item = normalizeItem(rawItem);
  if (!item) return { ok: false, reason: "invalid_item", state: readEquipmentState() };

  const state = readEquipmentState();
  const counts = getStoredCounts(state);
  const allowOverflow = opts?.source === "daily_reward";
  if (!hasCapacity("item", counts, allowOverflow)) {
    return { ok: false, reason: "items_limit", state };
  }

  state.items.push(item);
  const saved = saveEquipmentState(state);
  return { ok: true, item, state: saved };
}

export function addArtifact(rawArtifact, opts = {}) {
  const artifact = normalizeArtifact(rawArtifact);
  if (!artifact) return { ok: false, reason: "invalid_artifact", state: readEquipmentState() };

  const state = readEquipmentState();
  const counts = getStoredCounts(state);
  const allowOverflow = opts?.source === "daily_reward";
  if (!hasCapacity("artifact", counts, allowOverflow)) {
    return { ok: false, reason: "artifacts_limit", state };
  }

  state.artifacts.push(artifact);
  const saved = saveEquipmentState(state);
  return { ok: true, artifact, state: saved };
}

export function equipItem(itemId, forcedSlot = "") {
  const state = readEquipmentState();
  const id = String(itemId || "");
  const item = state.items.find((x) => x.id === id);
  if (!item) return { ok: false, reason: "item_not_found", state };

  const slot = normalizeSlot(forcedSlot || item.slot);
  if (!slot || slot !== item.slot) return { ok: false, reason: "invalid_slot", state };

  for (const s of EQUIPMENT_ITEM_SLOTS) {
    if (state.equipped.items[s] === id) state.equipped.items[s] = "";
  }

  state.equipped.items[slot] = id;
  const saved = saveEquipmentState(state);
  return { ok: true, slot, item, state: saved };
}

export function unequipItem(slot) {
  const state = readEquipmentState();
  const normalizedSlot = normalizeSlot(slot);
  if (!normalizedSlot) return { ok: false, reason: "invalid_slot", state };
  state.equipped.items[normalizedSlot] = "";
  const saved = saveEquipmentState(state);
  return { ok: true, state: saved };
}

export function equipArtifact(artifactId) {
  const state = readEquipmentState();
  const id = String(artifactId || "");
  const artifact = state.artifacts.find((x) => x.id === id);
  if (!artifact) return { ok: false, reason: "artifact_not_found", state };

  for (const t of ARTIFACT_TYPES) {
    if (state.equipped.artifacts[t] === id) state.equipped.artifacts[t] = "";
  }

  // One active artifact per type.
  state.equipped.artifacts[artifact.artifactType] = id;
  const saved = saveEquipmentState(state);
  return { ok: true, artifact, state: saved };
}

export function unequipArtifact(type) {
  const state = readEquipmentState();
  const artifactType = normalizeArtifactType(type);
  if (!artifactType) return { ok: false, reason: "invalid_artifact_type", state };
  state.equipped.artifacts[artifactType] = "";
  const saved = saveEquipmentState(state);
  return { ok: true, state: saved };
}

export function getEquippedItems(stateLike = null) {
  const state = stateLike ? normalizeEquipmentState(stateLike) : readEquipmentState();
  const byId = new Map(state.items.map((x) => [x.id, x]));
  const out = [];
  for (const slot of EQUIPMENT_ITEM_SLOTS) {
    const id = state.equipped.items[slot];
    if (!id) continue;
    const item = byId.get(id);
    if (item) out.push(item);
  }
  return out;
}

export function getEquippedArtifacts(stateLike = null) {
  const state = stateLike ? normalizeEquipmentState(stateLike) : readEquipmentState();
  const byId = new Map(state.artifacts.map((x) => [x.id, x]));
  const out = [];
  for (const type of ARTIFACT_TYPES) {
    const id = state.equipped.artifacts[type];
    if (!id) continue;
    const artifact = byId.get(id);
    if (artifact) out.push(artifact);
  }
  return out;
}

export function computeItemBonusProfile(itemsLike = null) {
  const equippedItems = itemsLike ? asArray(itemsLike) : getEquippedItems();
  const items = equippedItems.map(normalizeItem).filter(Boolean);

  const elementBonus = { fire: 0, water: 0, air: 0, earth: 0 };
  const allCardsBonus = { value: 0 };

  const setUnifiedRarity =
    items.length === 4 &&
    new Set(items.map((x) => x.rarity)).size === 1;

  const setAllElements =
    items.length === 4 &&
    new Set(items.map((x) => x.element)).size === 4;

  const rarityMult = setUnifiedRarity ? 1.25 : 1;

  let hpBonus = 0;
  const perItem = [];

  for (const item of items) {
    const base = ITEM_POWER_BONUS_BY_RARITY[item.rarity] || 0;
    const effective = base * rarityMult;
    hpBonus += effective;

    if (setAllElements) {
      allCardsBonus.value += effective;
      perItem.push({ id: item.id, slot: item.slot, bonus: effective, scope: "all" });
    } else {
      elementBonus[item.element] = (elementBonus[item.element] || 0) + effective;
      perItem.push({ id: item.id, slot: item.slot, bonus: effective, scope: item.element });
    }
  }

  return {
    itemCount: items.length,
    sets: {
      unifiedRarity: setUnifiedRarity,
      schoolOfElements: setAllElements,
    },
    rarityMultiplier: rarityMult,
    perItem,
    allCardsBonus: Math.round(allCardsBonus.value),
    elementBonus: {
      fire: Math.round(elementBonus.fire || 0),
      water: Math.round(elementBonus.water || 0),
      air: Math.round(elementBonus.air || 0),
      earth: Math.round(elementBonus.earth || 0),
    },
    hpBonus: Math.round(hpBonus),
  };
}

function cardElement(card) {
  const e = normalizeElement(card?.element || card?.elem || card?.type);
  return e || "";
}

function cardPower(card) {
  const n = Number(card?.power ?? card?.basePower ?? card?.str ?? card?.attack ?? card?.value ?? 0);
  return Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
}

export function applyItemBonusesToDeck(deck, bonusProfileLike = null) {
  const src = asArray(deck);
  const profile = bonusProfileLike && typeof bonusProfileLike === "object"
    ? bonusProfileLike
    : computeItemBonusProfile();

  return src.map((card) => {
    const c = asObject(card);
    const base = cardPower(c);
    const el = cardElement(c);
    const elementAdd = el ? Number(profile?.elementBonus?.[el] || 0) : 0;
    const allAdd = Number(profile?.allCardsBonus || 0);
    const bonus = Math.round(elementAdd + allAdd);
    return {
      ...c,
      power: Math.max(1, Math.round(base + bonus)),
      equipmentBonus: bonus,
      equipmentBonusElement: el || null,
    };
  });
}

export function applyItemBonusesToHp(baseHp, bonusProfileLike = null) {
  const base = Number.isFinite(Number(baseHp)) ? Math.max(1, Math.round(Number(baseHp))) : 1;
  const profile = bonusProfileLike && typeof bonusProfileLike === "object"
    ? bonusProfileLike
    : computeItemBonusProfile();
  const add = Number(profile?.hpBonus || 0);
  return Math.max(1, Math.round(base + add));
}

export function artifactsEnabledForMode(mode) {
  const key = String(mode || "").trim().toLowerCase();
  return ARTIFACT_BATTLE_MODES.has(key);
}

export function getArtifactRates(artifactsLike = null) {
  const list = artifactsLike ? asArray(artifactsLike) : getEquippedArtifacts();
  const out = {
    spear: 0,
    shieldReduce: 0,
    mirrorReduce: 0,
    mirrorReflect: 0,
    amuletRevive: 0,
    voodooCurse: 0,
  };

  for (const raw of list) {
    const art = normalizeArtifact(raw);
    if (!art) continue;
    const rarity = art.rarity;
    if (art.artifactType === "spear") out.spear = ARTIFACT_PCT_BY_RARITY[rarity] || 0;
    if (art.artifactType === "shield") out.shieldReduce = SHIELD_PCT_BY_RARITY[rarity] || 0;
    if (art.artifactType === "mirror") {
      out.mirrorReduce = MIRROR_PCT_BY_RARITY[rarity] || 0;
      out.mirrorReflect = MIRROR_PCT_BY_RARITY[rarity] || 0;
    }
    if (art.artifactType === "amulet") out.amuletRevive = AMULET_PCT_BY_RARITY[rarity] || 0;
    if (art.artifactType === "voodoo") out.voodooCurse = VOODOO_PCT_BY_RARITY[rarity] || 0;
  }

  return out;
}

export function createArtifactRuntime(mode, artifactsLike = null) {
  const enabled = artifactsEnabledForMode(mode);
  return {
    enabled,
    rates: enabled ? getArtifactRates(artifactsLike) : getArtifactRates([]),
    used: {
      amulet: false,
      voodoo: false,
    },
  };
}

export function applyArtifactOutgoingDamage(baseDamage, runtimeLike = null) {
  const runtime = asObject(runtimeLike);
  const n = Math.max(0, Math.round(Number(baseDamage) || 0));
  if (!runtime.enabled) return { dealt: n, spearBonus: 0 };

  const spearPct = Number(runtime?.rates?.spear || 0);
  if (spearPct <= 0) return { dealt: n, spearBonus: 0 };

  const bonus = Math.round(n * spearPct);
  return {
    dealt: Math.max(0, n + bonus),
    spearBonus: Math.max(0, bonus),
  };
}

export function applyArtifactIncomingDamage(baseDamage, runtimeLike = null) {
  const runtime = asObject(runtimeLike);
  const n = Math.max(0, Math.round(Number(baseDamage) || 0));
  if (!runtime.enabled) return { taken: n, reduced: 0, reflected: 0 };

  const shieldPct = Number(runtime?.rates?.shieldReduce || 0);
  const mirrorReducePct = Number(runtime?.rates?.mirrorReduce || 0);
  const mirrorReflectPct = Number(runtime?.rates?.mirrorReflect || 0);

  const reducePct = clamp(shieldPct + mirrorReducePct, 0, 0.95);
  const reduced = Math.round(n * reducePct);
  const reflected = Math.round(n * clamp(mirrorReflectPct, 0, 0.95));
  return {
    taken: Math.max(0, n - reduced),
    reduced: Math.max(0, reduced),
    reflected: Math.max(0, reflected),
  };
}

export function tryArtifactRevive(currentHp, maxHp, runtimeLike = null) {
  const runtime = asObject(runtimeLike);
  const hp = Number(currentHp) || 0;
  const cap = Math.max(1, Math.round(Number(maxHp) || 1));
  if (!runtime.enabled || hp > 0) return { revived: false, hp: Math.max(0, Math.round(hp)) };

  if (runtime.used?.amulet) return { revived: false, hp: 0 };
  const pct = Number(runtime?.rates?.amuletRevive || 0);
  if (pct <= 0) return { revived: false, hp: 0 };

  const restored = Math.max(1, Math.round(cap * pct));
  runtime.used.amulet = true;
  return { revived: true, hp: restored };
}

export function tryArtifactVoodoo(killerHp, killerMaxHp, runtimeLike = null) {
  const runtime = asObject(runtimeLike);
  const hp = Math.max(0, Math.round(Number(killerHp) || 0));
  const maxHp = Math.max(1, Math.round(Number(killerMaxHp) || 1));
  if (!runtime.enabled) return { triggered: false, killerHp: hp, reduced: 0 };
  if (runtime.used?.voodoo) return { triggered: false, killerHp: hp, reduced: 0 };

  const pct = Number(runtime?.rates?.voodooCurse || 0);
  if (pct <= 0) return { triggered: false, killerHp: hp, reduced: 0 };

  const reduced = Math.max(0, Math.round(maxHp * pct));
  runtime.used.voodoo = true;
  return {
    triggered: true,
    killerHp: Math.max(0, hp - reduced),
    reduced,
  };
}

function nextRarity(fromRarity) {
  const from = normalizeRarity(fromRarity);
  if (!from) return "";
  const idx = RARITY_ORDER.indexOf(from);
  if (idx < 0 || idx >= RARITY_ORDER.length - 1) return "";
  return RARITY_ORDER[idx + 1];
}

function recipeByFromRarity(fromRarity) {
  const next = nextRarity(fromRarity);
  if (!next) return null;
  const recipe = FORGE_RECIPES[next];
  if (!recipe || recipe.from !== fromRarity) return null;
  return { ...recipe, to: next };
}

function weightedRandomChoice(entries) {
  const positive = entries.filter((x) => Number(x?.w) > 0);
  const total = positive.reduce((s, x) => s + Number(x.w), 0);
  if (total <= 0) return positive[0]?.k || "";
  let roll = Math.random() * total;
  for (const x of positive) {
    roll -= Number(x.w);
    if (roll <= 0) return x.k;
  }
  return positive[positive.length - 1]?.k || "";
}

function readGold() {
  const n = Number(localStorage.getItem(GOLD_KEY));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function saveGold(nextGold) {
  const value = Math.max(0, Math.round(Number(nextGold) || 0));
  localStorage.setItem(GOLD_KEY, String(value));
  try {
    if (window.AccountSystem?.updateActive) {
      window.AccountSystem.updateActive((acc) => {
        acc.gold = value;
      });
    }
  } catch {
    // ignore
  }
  return value;
}

export function forgeSelection(payload = {}) {
  const kind = String(payload.kind || "").toLowerCase();
  const inputIds = asArray(payload.inputIds).map((x) => String(x || "")).filter(Boolean);
  const state = readEquipmentState();
  const gold = readGold();

  if (kind !== "item" && kind !== "artifact") {
    return { ok: false, reason: "invalid_kind", state, gold };
  }

  const sourcePool = kind === "item" ? state.items : state.artifacts;
  const byId = new Map(sourcePool.map((x) => [x.id, x]));
  const picked = inputIds.map((id) => byId.get(id)).filter(Boolean);
  if (picked.length !== inputIds.length || !picked.length) {
    return { ok: false, reason: "missing_inputs", state, gold };
  }

  const fromRarity = normalizeRarity(picked[0]?.rarity);
  if (!fromRarity || picked.some((x) => normalizeRarity(x?.rarity) !== fromRarity)) {
    return { ok: false, reason: "rarity_mismatch", state, gold };
  }

  const recipe = recipeByFromRarity(fromRarity);
  if (!recipe) return { ok: false, reason: "max_rarity", state, gold };
  if (picked.length !== recipe.need) return { ok: false, reason: "wrong_amount", required: recipe.need, state, gold };
  if (gold < recipe.gold) return { ok: false, reason: "not_enough_gold", required: recipe.gold, state, gold };

  let output = null;

  if (kind === "item") {
    const slots = new Set(picked.map((x) => x.slot));
    if (slots.size !== 1) return { ok: false, reason: "item_slot_mismatch", state, gold };

    const elementWeights = {};
    for (const it of picked) {
      elementWeights[it.element] = (elementWeights[it.element] || 0) + 1;
    }

    const element = weightedRandomChoice(
      Object.entries(elementWeights).map(([k, w]) => ({ k, w }))
    );

    output = normalizeItem({
      id: newId("item"),
      slot: picked[0].slot,
      element,
      rarity: recipe.to,
    });
  } else {
    const typeWeights = {};
    for (const art of picked) {
      typeWeights[art.artifactType] = (typeWeights[art.artifactType] || 0) + 1;
    }
    const artifactType = weightedRandomChoice(
      Object.entries(typeWeights).map(([k, w]) => ({ k, w }))
    );
    output = normalizeArtifact({
      id: newId("art"),
      artifactType,
      rarity: recipe.to,
    });
  }

  if (!output) return { ok: false, reason: "forge_failed", state, gold };

  const removeSet = new Set(inputIds);
  if (kind === "item") {
    state.items = removeByIds(state.items, removeSet);
    state.items.push(output);
    for (const slot of EQUIPMENT_ITEM_SLOTS) {
      if (removeSet.has(state.equipped.items[slot])) state.equipped.items[slot] = "";
    }
  } else {
    state.artifacts = removeByIds(state.artifacts, removeSet);
    state.artifacts.push(output);
    for (const type of ARTIFACT_TYPES) {
      if (removeSet.has(state.equipped.artifacts[type])) state.equipped.artifacts[type] = "";
    }
  }

  saveGold(gold - recipe.gold);
  const saved = saveEquipmentState(state);
  return {
    ok: true,
    state: saved,
    spentGold: recipe.gold,
    output,
    goldLeft: readGold(),
  };
}

function groupKeyForQuickForge(entry, kind, fromRarity) {
  if (kind === "item") {
    return `item:${fromRarity}:${entry.slot}:${entry.element}`;
  }
  return `artifact:${fromRarity}:${entry.artifactType}`;
}

function parseQuickForgeKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "item" && parts.length === 4) {
    return { kind: "item", rarity: parts[1], slot: parts[2], element: parts[3] };
  }
  if (parts[0] === "artifact" && parts.length === 3) {
    return { kind: "artifact", rarity: parts[1], artifactType: parts[2] };
  }
  return null;
}

function makeForgedEntry(meta, toRarity) {
  if (!meta) return null;
  if (meta.kind === "item") {
    return normalizeItem({
      id: newId("item"),
      slot: meta.slot,
      element: meta.element,
      rarity: toRarity,
    });
  }
  return normalizeArtifact({
    id: newId("art"),
    artifactType: meta.artifactType,
    rarity: toRarity,
  });
}

export function quickForgeAllPossible(opts = {}) {
  const mode = String(opts.mode || "both").toLowerCase();
  const allowItems = mode === "both" || mode === "items" || mode === "item";
  const allowArtifacts = mode === "both" || mode === "artifacts" || mode === "artifact";

  const state = readEquipmentState();
  let gold = readGold();
  const produced = [];
  let spent = 0;

  for (let i = 0; i < RARITY_ORDER.length - 1; i++) {
    const fromRarity = RARITY_ORDER[i];
    const recipe = recipeByFromRarity(fromRarity);
    if (!recipe) continue;

    const candidates = [];
    if (allowItems) {
      for (const it of state.items) {
        if (it.rarity === fromRarity) candidates.push(it);
      }
    }
    if (allowArtifacts) {
      for (const art of state.artifacts) {
        if (art.rarity === fromRarity) candidates.push(art);
      }
    }

    const groups = new Map();
    for (const entry of candidates) {
      const kind = entry.kind;
      if (kind === "item" && !allowItems) continue;
      if (kind === "artifact" && !allowArtifacts) continue;
      const key = groupKeyForQuickForge(entry, kind, fromRarity);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry.id);
    }

    for (const [key, ids] of groups.entries()) {
      const byCount = Math.floor(ids.length / recipe.need);
      if (byCount <= 0) continue;
      const byGold = Math.floor(gold / recipe.gold);
      const crafts = Math.min(byCount, byGold);
      if (crafts <= 0) continue;

      const consumeCount = crafts * recipe.need;
      const consume = ids.slice(0, consumeCount);
      const consumeSet = new Set(consume);
      const parsed = parseQuickForgeKey(key);
      if (!parsed) continue;

      if (parsed.kind === "item") {
        state.items = removeByIds(state.items, consumeSet);
        for (const slot of EQUIPMENT_ITEM_SLOTS) {
          if (consumeSet.has(state.equipped.items[slot])) state.equipped.items[slot] = "";
        }
      } else {
        state.artifacts = removeByIds(state.artifacts, consumeSet);
        for (const type of ARTIFACT_TYPES) {
          if (consumeSet.has(state.equipped.artifacts[type])) state.equipped.artifacts[type] = "";
        }
      }

      for (let n = 0; n < crafts; n++) {
        const next = makeForgedEntry(parsed, recipe.to);
        if (!next) continue;
        if (next.kind === "item") state.items.push(next);
        else state.artifacts.push(next);
      }

      const groupCost = crafts * recipe.gold;
      gold -= groupCost;
      spent += groupCost;
      produced.push({
        kind: parsed.kind,
        from: fromRarity,
        to: recipe.to,
        amount: crafts,
        key,
        cost: groupCost,
      });
    }
  }

  saveGold(gold);
  const saved = saveEquipmentState(state);
  return {
    ok: true,
    state: saved,
    spentGold: spent,
    goldLeft: gold,
    produced,
  };
}

export function changeItemElementInAtelier(itemId, nextElement, opts = {}) {
  const state = readEquipmentState();
  const id = String(itemId || "");
  const element = normalizeElement(nextElement);
  if (!element) return { ok: false, reason: "invalid_element", state, gold: readGold() };

  const item = state.items.find((x) => x.id === id);
  if (!item) return { ok: false, reason: "item_not_found", state, gold: readGold() };
  if (item.rarity !== "legendary" && item.rarity !== "mythic") {
    return { ok: false, reason: "atelier_only_legendary_or_mythic", state, gold: readGold() };
  }

  const costGold = Number.isFinite(Number(opts.costGold)) ? Math.max(0, Math.round(Number(opts.costGold))) : 50000;
  const gold = readGold();
  if (gold < costGold) return { ok: false, reason: "not_enough_gold", required: costGold, state, gold };

  item.element = element;
  saveGold(gold - costGold);
  const saved = saveEquipmentState(state);
  return { ok: true, item, spentGold: costGold, goldLeft: readGold(), state: saved };
}

export function applyItemsToDeckAndHp(deck, baseHp = null) {
  const profile = computeItemBonusProfile();
  const deckWithBonuses = applyItemBonusesToDeck(deck, profile);
  const deckHp = asArray(deckWithBonuses).reduce((s, c) => s + cardPower(c), 0);
  const hpBase = baseHp == null ? deckHp : Number(baseHp);
  const hp = applyItemBonusesToHp(hpBase, profile);
  return { deck: deckWithBonuses, hp, profile };
}

export function getEquipmentSummary() {
  const state = readEquipmentState();
  const counts = getStoredCounts(state);
  const itemsEq = getEquippedItems(state);
  const artsEq = getEquippedArtifacts(state);
  const itemBonus = computeItemBonusProfile(itemsEq);
  const artifactRates = getArtifactRates(artsEq);

  return {
    counts,
    limits: { ...EQUIPMENT_LIMITS },
    equipped: {
      items: itemsEq,
      artifacts: artsEq,
    },
    itemBonus,
    artifactRates,
    gold: readGold(),
  };
}

export function seedDemoEquipmentIfEmpty() {
  const state = readEquipmentState();
  if (state.items.length || state.artifacts.length) return state;

  state.items.push(
    normalizeItem({ slot: "hat", element: "earth", rarity: "common" }),
    normalizeItem({ slot: "armor", element: "fire", rarity: "epic" }),
    normalizeItem({ slot: "weapon", element: "air", rarity: "rare" }),
    normalizeItem({ slot: "boots", element: "water", rarity: "legendary" }),
  );
  state.artifacts.push(
    normalizeArtifact({ artifactType: "spear", rarity: "uncommon" }),
    normalizeArtifact({ artifactType: "shield", rarity: "rare" }),
    normalizeArtifact({ artifactType: "mirror", rarity: "epic" }),
    normalizeArtifact({ artifactType: "amulet", rarity: "legendary" }),
    normalizeArtifact({ artifactType: "voodoo", rarity: "common" }),
  );

  for (const slot of EQUIPMENT_ITEM_SLOTS) {
    const found = state.items.find((x) => x.slot === slot);
    if (found) state.equipped.items[slot] = found.id;
  }
  for (const type of ARTIFACT_TYPES) {
    const found = state.artifacts.find((x) => x.artifactType === type);
    if (found) state.equipped.artifacts[type] = found.id;
  }

  return saveEquipmentState(state);
}

export const EquipmentSystem = {
  STORAGE_KEY,
  EQUIPMENT_LIMITS,
  EQUIPMENT_ELEMENTS,
  EQUIPMENT_ITEM_SLOTS,
  ARTIFACT_TYPES,
  RARITY_ORDER,
  ITEM_POWER_BONUS_BY_RARITY,
  FORGE_RECIPES,

  normalizeRarity,
  createEmptyEquipmentState,
  normalizeEquipmentState,
  readState: readEquipmentState,
  saveState: saveEquipmentState,
  ensureState: ensureEquipmentState,

  addItem,
  addArtifact,
  equipItem,
  unequipItem,
  equipArtifact,
  unequipArtifact,

  getStoredCounts,
  getEquippedItems,
  getEquippedArtifacts,
  getSummary: getEquipmentSummary,

  computeItemBonusProfile,
  applyItemBonusesToDeck,
  applyItemBonusesToHp,
  applyItemsToDeckAndHp,

  artifactsEnabledForMode,
  getArtifactRates,
  createArtifactRuntime,
  applyArtifactOutgoingDamage,
  applyArtifactIncomingDamage,
  tryArtifactRevive,
  tryArtifactVoodoo,

  forgeSelection,
  quickForgeAllPossible,
  changeItemElementInAtelier,
  seedDemoEquipmentIfEmpty,
};

if (typeof window !== "undefined") {
  window.EquipmentSystem = EquipmentSystem;
}
