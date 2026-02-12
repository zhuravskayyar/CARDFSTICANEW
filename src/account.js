// src/account.js - Account system (browser, localStorage)
import { GAME_CONSTANTS } from "./core/constants.js";
import { DUEL_LEAGUE_DEFAULT_ID } from "./core/leagues.js";

const KEY_PREFIX = "account:";
const KEY_ACTIVE = "activeAccount";
const SCHEMA_VERSION = 1;
const FOUND_HISTORY_KEY = "cardastika:foundEver";
const FOUND_HISTORY_KEY_PREFIX = "cardastika:foundEver:";

const now = () => Date.now();

function assert(condition, message) {
  if (!condition) {
    throw new Error(`${GAME_CONSTANTS.ERROR_PREFIXES.ACCOUNT} ${message}`);
  }
}

function normalizeName(name) {
  if (typeof name !== "string") return "";
  return name.trim();
}

function keyFor(name) {
  return `${KEY_PREFIX}${name}`;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function foundHistoryKeyForAccountName(name) {
  const n = normalizeName(name);
  return n ? `${FOUND_HISTORY_KEY_PREFIX}${n}` : FOUND_HISTORY_KEY;
}

function normalizeElementForHistory(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "wind") return "air";
  if (s === "fire" || s === "water" || s === "air" || s === "earth") return s;
  return "";
}

function normalizeTitleForHistory(raw) {
  return String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function fingerprintCardForHistory(card) {
  const title = normalizeTitleForHistory(card?.title ?? card?.name ?? "");
  const element = normalizeElementForHistory(card?.element);
  if (!title || !element) return "";
  return `${title}|${element}`;
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

function rememberAccountCardsInFoundHistory(acc) {
  if (!acc || typeof acc !== "object") return;

  const key = foundHistoryKeyForAccountName(acc.name);
  let history = { ids: new Set(), fingerprints: new Set() };

  try {
    history = parseFoundHistory(localStorage.getItem(key));
    if (key !== FOUND_HISTORY_KEY) {
      const legacy = parseFoundHistory(localStorage.getItem(FOUND_HISTORY_KEY));
      for (const id of legacy.ids) history.ids.add(id);
      for (const fp of legacy.fingerprints) history.fingerprints.add(fp);
    }
  } catch {
    // ignore storage read errors
  }

  let changed = false;
  const addCard = (card) => {
    if (!card || typeof card !== "object") return;
    const id = String(card?.id ?? card?.cardId ?? card?.slug ?? card?.uid ?? "").trim();
    if (id && !history.ids.has(id)) {
      history.ids.add(id);
      changed = true;
    }
    const fp = fingerprintCardForHistory(card);
    if (fp && !history.fingerprints.has(fp)) {
      history.fingerprints.add(fp);
      changed = true;
    }
  };

  if (Array.isArray(acc.deck)) for (const c of acc.deck) addCard(c);
  if (Array.isArray(acc.inventory)) for (const c of acc.inventory) addCard(c);

  if (!changed) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        ids: Array.from(history.ids),
        fingerprints: Array.from(history.fingerprints),
      }),
    );
  } catch {
    // ignore storage write errors
  }
}

function newId() {
  const ts = now();
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `acc_${ts}_${Math.random().toString(16).slice(2)}`;
}

function normalizeAccountCurrency(acc) {
  const gold = Number(acc?.gold ?? 0);
  acc.gold = Number.isFinite(gold) ? gold : 0;

  const diamonds = Number(acc?.diamonds ?? 0);
  acc.diamonds = Number.isFinite(diamonds) ? diamonds : 0;

  const silverCandidate =
    Number.isFinite(Number(acc?.silver)) ? Number(acc.silver) :
    Number.isFinite(Number(acc?.gems)) ? Number(acc.gems) :
    0;

  acc.silver = silverCandidate;
  // Back-compat alias
  acc.gems = silverCandidate;
}

function normalizeAccountProgression(acc) {
  if (!acc || typeof acc !== "object") return;

  const xpTotal = Number(acc.xpTotal ?? 0);
  acc.xpTotal = Number.isFinite(xpTotal) ? Math.max(0, Math.floor(xpTotal)) : 0;

  if (typeof acc.duelLeagueId !== "string" || !acc.duelLeagueId.trim()) {
    acc.duelLeagueId = DUEL_LEAGUE_DEFAULT_ID;
  }

  const guildLevel = Number(acc.guildLevel ?? 0);
  acc.guildLevel = Number.isFinite(guildLevel) ? Math.max(0, Math.round(guildLevel)) : 0;

  if (!acc.bonuses || typeof acc.bonuses !== "object") acc.bonuses = {};
  const b = acc.bonuses;

  const ensureNum = (key, def = 0) => {
    const n = Number(b[key] ?? def);
    b[key] = Number.isFinite(n) ? Math.round(n) : def;
  };

  ensureNum("xpDaily", 0);
  ensureNum("xpPotion", 0);
  ensureNum("xpGuildArena", 0);
  ensureNum("xpEvent", 0);

  ensureNum("silverDaily", 0);
  ensureNum("silverPotion", 0);
  ensureNum("silverGuildArena", 0);
  ensureNum("silverEvent", 0);

  if (!Array.isArray(acc.titles)) acc.titles = [];
  if (!Array.isArray(acc.medals)) acc.medals = [];

  if (!acc.duel || typeof acc.duel !== "object") acc.duel = {};
  const d = acc.duel;

  const rating = Number(d.rating ?? 0);
  d.rating = Number.isFinite(rating) ? Math.max(0, Math.round(rating)) : 0;
  if (!Array.isArray(d.promoLeaguesClaimed)) d.promoLeaguesClaimed = [];

  const dailyGold = Number(d.dailyGold ?? 0);
  d.dailyGold = Number.isFinite(dailyGold) ? Math.max(0, Math.round(dailyGold)) : 0;
  d.dailyGoldDate = typeof d.dailyGoldDate === "string" ? d.dailyGoldDate : "";

  const pity = Number(d.goldPity ?? 0);
  d.goldPity = Number.isFinite(pity) ? Math.max(0, Math.round(pity)) : 0;

  const counters = ["played", "wins", "losses", "draws"];
  for (const k of counters) {
    const v = Number(d[k] ?? 0);
    d[k] = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  }
}

function buildAccount({ name, starterDeck, starterInventory = null, silver = 0, gold = 0, diamonds = 0 }) {
  assert(name && name.length > 0, "Account name is required");
  assert(Array.isArray(starterDeck) && starterDeck.length === 9, "Starter deck must contain exactly 9 cards");

  const ts = now();
  const acc = {
    v: SCHEMA_VERSION,
    id: newId(),
    name,
    created: ts,
    updated: ts,
    deck: starterDeck.slice(),
    inventory: Array.isArray(starterInventory) ? starterInventory.slice() : null,
    gold,
    diamonds,
    silver,
    xpTotal: 0,
    duelLeagueId: DUEL_LEAGUE_DEFAULT_ID,
    guildLevel: 0,
    bonuses: {
      xpDaily: 0,
      xpPotion: 0,
      xpGuildArena: 0,
      xpEvent: 0,
      silverDaily: 0,
      silverPotion: 0,
      silverGuildArena: 0,
      silverEvent: 0,
    },
    titles: [],
    medals: [],
    duel: {
      dailyGold: 0,
      dailyGoldDate: "",
      goldPity: 0,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    },
  };
  normalizeAccountCurrency(acc);
  normalizeAccountProgression(acc);

  return {
    ...acc,
  };
}

function saveAccount(account) {
  assert(account && typeof account === "object", "Invalid account object");
  assert(typeof account.name === "string" && account.name.trim().length > 0, "Invalid account name");

  normalizeAccountCurrency(account);
  normalizeAccountProgression(account);
  rememberAccountCardsInFoundHistory(account);
  account.updated = now();
  localStorage.setItem(keyFor(account.name), JSON.stringify(account));
  return account;
}

function loadAccount(name) {
  const n = normalizeName(name);
  if (!n) return null;

  const raw = localStorage.getItem(keyFor(n));
  if (!raw) return null;

  const acc = safeParse(raw);
  if (!acc || acc.name !== n) return null;

  if (!acc.v) acc.v = 1;
  if (!Array.isArray(acc.deck)) acc.deck = [];
  normalizeAccountCurrency(acc);
  normalizeAccountProgression(acc);
  return acc;
}

function accountExists(name) {
  const n = normalizeName(name);
  if (!n) return false;
  return localStorage.getItem(keyFor(n)) != null;
}

function listAccounts() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(KEY_PREFIX)) continue;

    const name = k.slice(KEY_PREFIX.length);
    const acc = loadAccount(name);
    if (acc) out.push(acc);
  }

  out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return out;
}

function deleteAccount(name) {
  const n = normalizeName(name);
  if (!n) return false;

  const k = keyFor(n);
  const existed = localStorage.getItem(k) != null;
  if (!existed) return false;

  localStorage.removeItem(k);
  localStorage.removeItem(foundHistoryKeyForAccountName(n));

  if (localStorage.getItem(KEY_ACTIVE) === n) {
    localStorage.removeItem(KEY_ACTIVE);
  }

  return true;
}

function createAccount(name, starterDeck, opts = {}) {
  const n = normalizeName(name);
  assert(n.length > 0, "Account name is required");
  assert(!accountExists(n), `Account "${n}" already exists`);

  const acc = buildAccount({
    name: n,
    starterDeck,
    starterInventory: opts.starterInventory ?? null,
    silver: opts.silver ?? opts.gems ?? 0,
    gold: opts.gold ?? 0,
    diamonds: opts.diamonds ?? 0,
  });

  saveAccount(acc);
  return acc;
}

function setActiveAccount(name) {
  const n = normalizeName(name);
  const acc = loadAccount(n);
  assert(acc, `Account "${n}" not found`);

  localStorage.setItem(KEY_ACTIVE, n);

  localStorage.setItem("cardastika:deck", JSON.stringify(acc.deck));
  if (Array.isArray(acc.inventory)) {
    localStorage.setItem("cardastika:inventory", JSON.stringify(acc.inventory));
  }
  localStorage.setItem("cardastika:gold", String(acc.gold ?? 0));
  localStorage.setItem("cardastika:diamonds", String(acc.diamonds ?? 0));
  localStorage.setItem("cardastika:silver", String(acc.silver ?? 0));
  localStorage.setItem("cardastika:gems", String(acc.silver ?? 0));

  return acc;
}

function getActiveAccount() {
  const name = localStorage.getItem(KEY_ACTIVE);
  if (!name) return null;
  return loadAccount(name);
}

function updateActiveAccount(updater) {
  const acc = getActiveAccount();
  assert(acc, "No active account");

  const res = typeof updater === "function" ? updater(acc) : null;
  if (res && typeof res === "object") Object.assign(acc, res);

  saveAccount(acc);

  localStorage.setItem("cardastika:deck", JSON.stringify(acc.deck));
  if (Array.isArray(acc.inventory)) {
    localStorage.setItem("cardastika:inventory", JSON.stringify(acc.inventory));
  }
  localStorage.setItem("cardastika:gold", String(acc.gold ?? 0));
  localStorage.setItem("cardastika:diamonds", String(acc.diamonds ?? 0));
  localStorage.setItem("cardastika:silver", String(acc.silver ?? 0));
  localStorage.setItem("cardastika:gems", String(acc.silver ?? 0));

  return acc;
}

function resetAllAccounts({ keepSettingsKeys = [] } = {}) {
  const keep = new Set(keepSettingsKeys);
  const stash = {};
  for (const k of keep) stash[k] = localStorage.getItem(k);

  localStorage.clear();

  for (const k of keep) {
    if (stash[k] != null) localStorage.setItem(k, stash[k]);
  }

  return true;
}

export const AccountSystem = {
  create: createAccount,
  load: loadAccount,
  list: listAccounts,
  exists: accountExists,
  delete: deleteAccount,

  setActive: setActiveAccount,
  getActive: getActiveAccount,

  save: saveAccount,
  updateActive: updateActiveAccount,
  resetAll: resetAllAccounts,
};

if (typeof window !== "undefined") {
  window.AccountSystem = AccountSystem;
}
