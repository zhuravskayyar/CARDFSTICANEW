import "../../src/account.js";
import { CARD_BELONGS_TO, decorateCard, ensureCardCatalogLoaded } from "../../src/core/card.js";
import { buildFoundSet } from "../../src/collections-core.js";
import { emitCampaignEvent } from "../../src/campaign/campaign-events.js";

const STORAGE = {
  payCurrency: "cardastika:shop:payCurrency",
  pityPrefix: "cardastika:shop:pity:",
  freeUrfinDailyPrefix: "cardastika:shop:freeUrfinDaily:",
  readyBundlesPrefix: "cardastika:shop:readyBundles:",
  oddsVersion: "cardastika:shop:oddsVersion",
};
const SHOP_ODDS_VERSION = "2026-02-07-v2";

const PAY_CURRENCIES = {
  gold: "gold",
  diamonds: "diamonds",
};

const RARITY_CLASS_BY_QUALITY = {
  common: "rarity-1",
  uncommon: "rarity-2",
  rare: "rarity-3",
  epic: "rarity-4",
  legendary: "rarity-5",
  mythic: "rarity-6",
};

const QUALITY_RANK = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  mythic: 6,
};

function qualityRank(q) {
  const s = String(q || "").toLowerCase().trim();
  return QUALITY_RANK[s] || 0;
}

function qualityLabel(q) {
  const s = String(q || "").toLowerCase().trim();
  if (s === "common") return "звичайну";
  if (s === "uncommon") return "незвичайну";
  if (s === "rare") return "рідкісну";
  if (s === "epic") return "епічну";
  if (s === "legendary") return "легендарну";
  if (s === "mythic") return "міфічну";
  return s || "карту";
}

function qualityName(q) {
  const s = String(q || "").toLowerCase().trim();
  if (s === "common") return "Звичайна";
  if (s === "uncommon") return "Незвичайна";
  if (s === "rare") return "Рідкісна";
  if (s === "epic") return "Епічна";
  if (s === "legendary") return "Легендарна";
  if (s === "mythic") return "Міфічна";
  return String(q || "Шанс");
}

const OFFERS = {
  silver_500: {
    id: "silver_500",
    base: { quality: "uncommon", levelRange: [5, 9] },
    pay: { currency: "silver", price: 500 },
    upgrades: [
      { id: "epic", quality: "epic", levelRange: [20, 34], pityInc: 0.25, initialChance: 16 },
      { id: "rare", quality: "rare", levelRange: [10, 19], pityInc: 3.5, initialChance: 5 },
    ],
  },
  gold_50: {
    id: "gold_50",
    base: { quality: "epic", levelRange: [20, 34] },
    pay: { currency: "gold", price: 50, altCurrency: "diamonds", altPrice: 100 },
    upgrades: [
      { id: "mythic", quality: "mythic", levelRange: [60, 75], pityInc: 0.25, initialChance: 30 },
      { id: "legendary", quality: "legendary", levelRange: [35, 59], pityInc: 3.5 },
    ],
  },
  gold_150: {
    id: "gold_150",
    base: { quality: "legendary", levelRange: [35, 59] },
    pay: { currency: "gold", price: 150, altCurrency: "diamonds", altPrice: 300 },
    upgrades: [{ id: "mythic", quality: "mythic", levelRange: [60, 75], pityInc: 3.5, initialChance: 40 }],
    special: {
      id: "high_mages",
      quality: "mythic",
      level: 75,
      pityInc: 0,
      initialChance: 0,
      bonusSource: "Високі маги (магазин 150/300)",
    },
  },
};

const READY_BUNDLES = [
  { id: "bundle_elementals", title: "Колекція елементалів", priceGold: 20, kind: "collection", collectionId: "elementals" },
  { id: "bundle_veteran", title: "Набір ветерана", priceGold: 60, kind: "random", quality: "epic", count: 3, levelRange: [20, 34] },
  { id: "bundle_world_legends", title: "Легенди світу", priceGold: 120, kind: "random", quality: "legendary", count: 2, levelRange: [35, 59] },
];

function getPath(path) {
  const isInPages = location.pathname.toLowerCase().includes("/pages/");
  return isInPages ? `../../${path}` : `./${path}`;
}

function todayKeyLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function activeAccKeySuffix() {
  const acc = window.AccountSystem?.getActive?.() || null;
  const name = String(acc?.name || localStorage.getItem("cardastika:auth:active") || localStorage.getItem("activeAccount") || "").trim();
  return name ? `:${name}` : "";
}

function hasTitle(titleId) {
  const acc = window.AccountSystem?.getActive?.() || null;
  const t = acc?.titles;
  const want = String(titleId || "").trim();
  if (!want) return false;
  if (Array.isArray(t)) return t.map(String).includes(want);
  if (typeof t === "string") return t.split(",").map((x) => x.trim()).includes(want);
  return false;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function asNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function pityKey(offerId, tierId) {
  return `${STORAGE.pityPrefix}${offerId}:${tierId}`;
}

function readChance(offerId, tier) {
  const raw = localStorage.getItem(pityKey(offerId, tier.id));
  if (raw != null) return clamp(asNum(raw, 0), 0, 100);
  return clamp(asNum(tier.initialChance ?? 0, 0), 0, 100);
}

function writeChance(offerId, tierId, value) {
  const v = clamp(asNum(value, 0), 0, 100);
  localStorage.setItem(pityKey(offerId, tierId), String(v));
  return v;
}

function migrateShopOddsIfNeeded() {
  const cur = String(localStorage.getItem(STORAGE.oddsVersion) || "");
  if (cur === SHOP_ODDS_VERSION) return;

  const toDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(STORAGE.pityPrefix)) toDelete.push(k);
  }
  for (const k of toDelete) localStorage.removeItem(k);
  localStorage.setItem(STORAGE.oddsVersion, SHOP_ODDS_VERSION);
}

function formatPercent(p) {
  const n = asNum(p, 0);
  const fixed = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${fixed}%`;
}

function showToast(message) {
  const host = document.getElementById("toastHost") || document.body;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function randomInt(min, max) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["fire", "water", "air", "earth"].includes(s)) return s;
  if (s === "wind") return "air";
  return "earth";
}

function readBalances() {
  const acc = window.AccountSystem?.getActive?.() || null;
  const fromLs = (k, def = 0) => {
    const n = Number(localStorage.getItem(k));
    return Number.isFinite(n) ? n : def;
  };

  const silver =
    (Number.isFinite(Number(acc?.silver)) ? Number(acc.silver) : null) ??
    fromLs("cardastika:silver", fromLs("cardastika:gems", 1500));
  const diamonds = (Number.isFinite(Number(acc?.diamonds)) ? Number(acc.diamonds) : null) ?? fromLs("cardastika:diamonds", 0);
  const gold = (Number.isFinite(Number(acc?.gold)) ? Number(acc.gold) : null) ?? fromLs("cardastika:gold", 0);

  return {
    silver: Math.max(0, Math.round(silver)),
    diamonds: Math.max(0, Math.round(diamonds)),
    gold: Math.max(0, Math.round(gold)),
  };
}

function normalizeQuality(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["common", "uncommon", "rare", "epic", "legendary", "mythic"].includes(s)) return s;
  return "common";
}

function fmtK(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  const abs = Math.abs(v);
  if (abs < 1000) return String(Math.round(v));
  const k = abs / 1000;
  const str = k < 10 ? k.toFixed(1) : k.toFixed(0);
  const cleaned = str.replace(/\.0$/, "");
  return `${v < 0 ? "-" : ""}${cleaned}k`;
}

function renderHud(bal) {
  const hudSilver = document.getElementById("hudSilver");
  const hudDiamonds = document.getElementById("hudDiamonds");
  const hudGold = document.getElementById("hudGold");
  if (hudSilver) hudSilver.textContent = fmtK(bal.silver);
  if (hudDiamonds) hudDiamonds.textContent = fmtK(bal.diamonds);
  if (hudGold) hudGold.textContent = fmtK(bal.gold);
}

function readDeckFromStorage() {
  const raw = localStorage.getItem("cardastika:deck");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function maybeAutoPutIntoDeck(deck, newCard) {
  const deckArr = Array.isArray(deck) ? deck : [];
  const deck9 = deckArr.slice(0, 9);

  const cardPower = asNum(newCard?.power ?? newCard?.basePower, 0);

  if (deck9.length < 9) {
    deckArr.push(newCard);
    return { equipped: true, replaced: null };
  }

  let minPower = Infinity;
  let minIdx = -1;
  for (let i = 0; i < deck9.length; i++) {
    const p = asNum(deck9[i]?.power ?? deck9[i]?.basePower, 0);
    if (p < minPower) {
      minPower = p;
      minIdx = i;
    }
  }

  if (minIdx >= 0 && cardPower > minPower) {
    const replaced = deckArr[minIdx] || null;
    deckArr[minIdx] = newCard;
    return { equipped: true, replaced };
  }

  return { equipped: false, replaced: null };
}

function applyPurchaseToAccount({ spend, card }) {
  const hasUpdate = typeof window.AccountSystem?.updateActive === "function";
  if (hasUpdate) {
    let equipRes = { equipped: false, replaced: null };
    window.AccountSystem.updateActive((acc) => {
      acc.silver = Math.max(0, Math.round((acc.silver ?? 0) - (spend.silver ?? 0)));
      acc.diamonds = Math.max(0, Math.round((acc.diamonds ?? 0) - (spend.diamonds ?? 0)));
      acc.gold = Math.max(0, Math.round((acc.gold ?? 0) - (spend.gold ?? 0)));

      if (!Array.isArray(acc.inventory)) acc.inventory = [];
      acc.inventory.push(card);

      if (!Array.isArray(acc.deck)) acc.deck = [];
      acc.deck = acc.deck.slice(0, 9);
      equipRes = maybeAutoPutIntoDeck(acc.deck, card);
      try {
        if (equipRes?.replaced) equipRes.replaced.inDeck = false;
      } catch {
        // ignore
      }
      acc.deck = acc.deck.slice(0, 9);
      return acc;
    });
    try {
      card.inDeck = !!equipRes?.equipped;
      card.belongsTo = equipRes?.equipped ? CARD_BELONGS_TO.deck : CARD_BELONGS_TO.shop;
    } catch {
      // ignore
    }
    return equipRes;
  }

  const invRaw = localStorage.getItem("cardastika:inventory");
  let inv = [];
  if (invRaw) {
    try {
      const parsed = JSON.parse(invRaw);
      if (Array.isArray(parsed)) inv = parsed;
    } catch {
      // ignore
    }
  }

  inv.push(card);
  localStorage.setItem("cardastika:inventory", JSON.stringify(inv));

  const deck = readDeckFromStorage().slice(0, 9);
  const equipRes = maybeAutoPutIntoDeck(deck, card);
  try {
    if (equipRes?.replaced) equipRes.replaced.inDeck = false;
  } catch {
    // ignore
  }
  localStorage.setItem("cardastika:deck", JSON.stringify(deck.slice(0, 9)));
  try {
    card.inDeck = !!equipRes?.equipped;
    card.belongsTo = equipRes?.equipped ? CARD_BELONGS_TO.deck : CARD_BELONGS_TO.shop;
  } catch {
    // ignore
  }

  const bal = readBalances();
  localStorage.setItem("cardastika:silver", String(Math.max(0, bal.silver - (spend.silver ?? 0))));
  localStorage.setItem("cardastika:diamonds", String(Math.max(0, bal.diamonds - (spend.diamonds ?? 0))));
  localStorage.setItem("cardastika:gold", String(Math.max(0, bal.gold - (spend.gold ?? 0))));
  return equipRes;
}

function computeSpend({ balances, currency, price }) {
  const spend = { silver: 0, diamonds: 0, gold: 0 };

  if (currency === "gold") {
    if (balances.gold < price) return { ok: false, reason: "not_enough_gold", spend };
    spend.gold = price;
    return { ok: true, spend, note: "" };
  }

  if (currency === "silver") {
    const have = balances.silver;
    if (have >= price) {
      spend.silver = price;
      return { ok: true, spend, note: "" };
    }

    const missing = price - have;
    const goldNeed = Math.ceil(missing / 100);
    if (balances.gold < goldNeed) return { ok: false, reason: "not_enough_gold", spend };

    spend.silver = have;
    spend.gold = goldNeed;
    return { ok: true, spend, note: `Автодоплата золотом: +${goldNeed} (не хватало ${missing} серебра).` };
  }

  if (currency === "diamonds") {
    const have = balances.diamonds;
    if (have >= price) {
      spend.diamonds = price;
      return { ok: true, spend, note: "" };
    }

    const missing = price - have;
    const goldNeed = missing;
    if (balances.gold < goldNeed) return { ok: false, reason: "not_enough_gold", spend };

    spend.diamonds = have;
    spend.gold = goldNeed;
    return { ok: true, spend, note: `Автодоплата золотом: +${goldNeed} (не хватало ${missing} алмазов).` };
  }

  return { ok: false, reason: "bad_currency", spend, note: "" };
}

async function loadCardLevels() {
  const r = await fetch(getPath("data/cardLevels.json"));
  if (!r.ok) throw new Error(`cardLevels.json fetch failed: ${r.status}`);
  const json = await r.json();
  const levels = json?.cardLevels?.levels;
  if (!Array.isArray(levels)) throw new Error("cardLevels.json: levels must be array");

  const byLevel = new Map();
  for (const row of levels) {
    const lvl = Number(row?.level);
    const basePower = Number(row?.basePower);
    if (!Number.isFinite(lvl) || !Number.isFinite(basePower)) continue;
    byLevel.set(lvl, { level: lvl, basePower, quality: String(row?.quality ?? "") });
  }

  const specials = Array.isArray(json?.bonusRules?.special) ? json.bonusRules.special : [];
  const bonusFixedBySource = new Map();
  for (const s of specials) {
    if (!s || typeof s !== "object") continue;
    const src = String(s.source ?? "").trim();
    const bonusFixed = s.bonusFixed;
    if (!src) continue;
    if (typeof bonusFixed === "number" && Number.isFinite(bonusFixed)) {
      bonusFixedBySource.set(src, bonusFixed);
    }
  }

  return { byLevel, bonusFixedBySource };
}

async function loadCoverPool() {
  // Prefer main data/cards.json, then cards.base.json.
  for (const rel of ["data/cards.json"]) {
    try {
      const r = await fetch(getPath(rel), { cache: "no-store" });
      if (!r.ok) continue;
      const json = await r.json();
      const cards = Array.isArray(json?.cards) ? json.cards : [];
      const out = cards
        .filter((c) => c && typeof c === "object" && c.id && !String(c.id).startsWith("starter_"))
        .map((c) => ({
          id: String(c.id),
          title: String(c.title ?? c.name ?? c.id),
          element: normalizeElement(c.element),
          quality: normalizeQuality(c.rarity),
        }));
      if (out.length) return out;
    } catch {
      // try next source
    }
  }

  const r = await fetch(getPath("assets/data/cards.base.json"));
  if (!r.ok) throw new Error(`cards.base.json fetch failed: ${r.status}`);
  const pool = await r.json();
  if (!Array.isArray(pool)) throw new Error("cards.base.json must be an array");

  return pool
    .filter((c) => c && typeof c === "object" && c.id)
    .map((c) => ({
      id: String(c.id),
      title: String(c.name ?? c.title ?? c.id),
      element: normalizeElement(c.element),
      quality: normalizeQuality(c.rarity),
    }));
}

function buildOfferCoverPools(covers) {
  const all = Array.isArray(covers) ? covers.slice() : [];
  const byQuality = {
    common: all.filter((c) => normalizeQuality(c?.quality) === "common"),
    uncommon: all.filter((c) => normalizeQuality(c?.quality) === "uncommon"),
    rare: all.filter((c) => normalizeQuality(c?.quality) === "rare"),
    epic: all.filter((c) => normalizeQuality(c?.quality) === "epic"),
    legendary: all.filter((c) => normalizeQuality(c?.quality) === "legendary"),
    mythic: all.filter((c) => normalizeQuality(c?.quality) === "mythic"),
  };

  const merge = (...parts) => {
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      for (const c of p || []) {
        const id = String(c?.id || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(c);
      }
    }
    return out;
  };

  const pools = {
    silver_500: merge(byQuality.common, byQuality.uncommon, byQuality.rare, byQuality.epic),
    gold_50: merge(byQuality.rare, byQuality.epic, byQuality.legendary, byQuality.mythic),
    gold_150: merge(byQuality.legendary, byQuality.mythic),
    __all: all,
  };

  for (const k of ["silver_500", "gold_50", "gold_150"]) {
    if (!pools[k]?.length) pools[k] = all;
  }
  return pools;
}

function pickCoverForOffer(offerId, coverPools) {
  const pool = coverPools?.[offerId];
  return pickRandom(Array.isArray(pool) && pool.length ? pool : coverPools?.__all);
}

function decideTier(offerId, offer) {
  const tiers = [];
  if (offer.special) tiers.push(offer.special);
  for (const t of offer.upgrades || []) tiers.push(t);

  let triggeredId = null;
  let picked = null;
  for (const t of tiers) {
    const chance = readChance(offerId, t);
    if (Math.random() * 100 < chance) {
      triggeredId = t.id;
      picked = t;
      break;
    }
  }

  return { triggeredId, tier: picked || offer.base };
}

function listTiersForOffer(offer) {
  const tiers = [];
  if (offer?.special) tiers.push(offer.special);
  for (const t of offer?.upgrades || []) tiers.push(t);
  return tiers;
}

function computeEffectiveChances(offerId, offer) {
  const tiers = listTiersForOffer(offer);
  const out = [];
  let remaining = 1;
  for (const t of tiers) {
    const chance = clamp(asNum(readChance(offerId, t), 0), 0, 100) / 100;
    const effective = remaining * chance;
    remaining *= (1 - chance);
    out.push({ id: t.id, quality: String(t.quality || ""), chancePct: chance * 100, effectivePct: effective * 100 });
  }
  return out;
}

function updateChancesAfterPurchase(offerId, offer, triggeredId, { absoluteChampion = false } = {}) {
  const tiers = [];
  if (offer.special) tiers.push(offer.special);
  for (const t of offer.upgrades || []) tiers.push(t);

  const after = {};
  for (const t of tiers) {
    const before = readChance(offerId, t);
    const pityInc =
      offerId === "gold_50" && t.id === "mythic"
        ? (absoluteChampion ? 1 : 0.25)
        : asNum(t.pityInc, 0);
    const next = t.id === triggeredId ? Math.ceil(before / 2) : before + pityInc;
    after[t.id] = writeChance(offerId, t.id, clamp(next, 0, 100));
  }
  return after;
}

function buildCard({ cover, tier, levelsData, offer }) {
  const uid = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const level =
    typeof tier.level === "number" && Number.isFinite(tier.level) ? Math.round(tier.level) :
    Array.isArray(tier.levelRange) ? randomInt(tier.levelRange[0], tier.levelRange[1]) :
    1;

  const levelInfo = levelsData.byLevel.get(level) || null;
  const basePower = levelInfo?.basePower ?? 0;

  let bonusFixed = 0;
  if (tier.id === offer?.special?.id && offer.special?.bonusSource) {
    bonusFixed = asNum(levelsData.bonusFixedBySource.get(String(offer.special.bonusSource)), 0);
  }

  const power = Math.max(0, Math.round(basePower + bonusFixed));
  const quality = String(tier.quality || levelInfo?.quality || offer.base.quality || "common");
  const rarity = RARITY_CLASS_BY_QUALITY[quality] || "";

  return decorateCard({
    uid,
    id: cover.id,
    title: cover.title,
    element: cover.element,
    level,
    power,
    basePower: Math.round(basePower),
    bonusFixed: bonusFixed || 0,
    rarity,
    inDeck: false,
    protected: false,
    art: "",
    source: `shop:${offer.id}`,
  }, CARD_BELONGS_TO.shop);
}

function getPayCurrency() {
  const raw = String(localStorage.getItem(STORAGE.payCurrency) || PAY_CURRENCIES.gold);
  return raw === PAY_CURRENCIES.diamonds ? PAY_CURRENCIES.diamonds : PAY_CURRENCIES.gold;
}

function setPayCurrency(cur) {
  const v = cur === PAY_CURRENCIES.diamonds ? PAY_CURRENCIES.diamonds : PAY_CURRENCIES.gold;
  localStorage.setItem(STORAGE.payCurrency, v);
  return v;
}

function renderCurrencyToggle(cur) {
  document.querySelectorAll(".shop-currency-toggle").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.currency === cur);
  });
}

function renderOfferCard(offerId, offer, payCur, { freeAvailable = false } = {}) {
  const el = document.querySelector(`[data-offer-id="${offerId}"]`);
  if (!el) return;

  const badge = el.querySelector("[data-odds-badge]");
  const oddsEls = el.querySelectorAll("[data-odds]");

  const tiers = [];
  if (offer.special) tiers.push(offer.special);
  for (const t of offer.upgrades || []) tiers.push(t);

  const odds = {};
  for (const t of tiers) odds[t.id] = readChance(offerId, t);

  for (const span of oddsEls) {
    const k = span.dataset.odds;
    if (!k) continue;
    span.textContent = formatPercent(odds[k] ?? 0);
  }

  if (badge) {
    const badgeTier =
      (offer.upgrades && offer.upgrades.length ? offer.upgrades[0].id : null) ||
      (offer.special ? offer.special.id : null);
    badge.textContent = formatPercent(odds[badgeTier] ?? 0);
  }

  const priceEl = el.querySelector("[data-price]");
  const btnPriceEl = el.querySelector("[data-btn-price]");
  const iconEl = el.querySelector("[data-currency-icon]");
  const btnIconEl = el.querySelector("[data-btn-currency-icon]");

  const pay = offer.pay;
  let currency = pay.currency;
  let price = pay.price;
  let icon = currency === "silver" ? "../../assets/icons/coin-silver.svg" : "../../assets/icons/coin-gold.svg";
  let alt = currency;

  if (pay.currency === "gold") {
    if (payCur === PAY_CURRENCIES.diamonds) {
      currency = "diamonds";
      price = pay.altPrice;
      icon = "../../assets/icons/diamond.svg";
      alt = "diamonds";
    } else {
      currency = "gold";
      price = pay.price;
      icon = "../../assets/icons/coin-gold.svg";
      alt = "gold";
    }
  }

  const freeAllowed = offerId === "silver_500" || offerId === "gold_50" || offerId === "gold_150";
  const isFree = freeAvailable && freeAllowed;

  el.dataset.payCurrency = alt;
  el.dataset.payPrice = String(isFree ? 0 : price);
  el.dataset.free = isFree ? "1" : "0";

  if (priceEl) priceEl.textContent = String(isFree ? 0 : price);
  if (btnPriceEl) btnPriceEl.textContent = String(isFree ? 0 : price);
  if (iconEl) iconEl.setAttribute("src", icon);
  if (btnIconEl) btnIconEl.setAttribute("src", icon);
}

async function loadCollectionsRich() {
  const r = await fetch(getPath("data/collections.json"), { cache: "no-store" });
  if (!r.ok) throw new Error(`collections.json fetch failed: ${r.status}`);
  const json = await r.json();
  return json && Array.isArray(json.collections) ? json.collections : [];
}

function formatMs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  return `${m}м ${String(ss).padStart(2, "0")}с`;
}

function readReadyBundlesState() {
  const key = `${STORAGE.readyBundlesPrefix}${activeAccKeySuffix()}`;
  const raw = localStorage.getItem(key);
  if (!raw) return { purchased: 0, nextAt: 0 };
  try {
    const j = JSON.parse(raw);
    const purchased = Math.max(0, Math.round(Number(j?.purchased ?? 0)));
    const nextAt = Math.max(0, Math.round(Number(j?.nextAt ?? 0)));
    return { purchased, nextAt };
  } catch {
    return { purchased: 0, nextAt: 0 };
  }
}

function writeReadyBundlesState(state) {
  const key = `${STORAGE.readyBundlesPrefix}${activeAccKeySuffix()}`;
  const s = {
    purchased: Math.max(0, Math.round(Number(state?.purchased ?? 0))),
    nextAt: Math.max(0, Math.round(Number(state?.nextAt ?? 0))),
  };
  localStorage.setItem(key, JSON.stringify(s));
  return s;
}

function renderReadyBundles({ state, now }) {
  const host = document.getElementById("readyBundlesHost");
  if (!host) return;
  const section = host.closest(".shop-section");
  const hideSection = () => {
    if (section) section.style.display = "none";
  };
  const showSection = () => {
    if (section) section.style.display = "";
  };

  host.innerHTML = "";

  const idx = state.purchased;
  if (idx >= READY_BUNDLES.length) {
    hideSection();
    return;
  }

  const bundle = READY_BUNDLES[idx];
  const available = now >= state.nextAt;
  if (!available) {
    hideSection(); // hide the banner during cooldown (24h after purchase)
    return;
  }
  showSection();

  const card = document.createElement("div");
  card.className = "shop-card";
  card.dataset.bundleId = bundle.id;

  card.innerHTML =
    `<div class="shop-card__art"><img src="../../assets/cards/demo/fire_01.jpg" alt="Набір" /></div>` +
    `<div class="shop-card__info">` +
      `<h4 class="shop-card__name">${bundle.title}</h4>` +
      `<p class="shop-card__desc">Після покупки банер набору зникне на 24 години.</p>` +
    `</div>` +
    `<button class="shop-card__btn" type="button">` +
      `<span class="shop-card__btn-label">Купити за</span> ` +
      `<img class="shop-card__btn-coin" data-btn-currency-icon src="../../assets/icons/coin-gold.svg" alt=""> ` +
      `<span class="shop-card__btn-price" data-btn-price>${bundle.priceGold}</span>` +
    `</button>`;

  host.appendChild(card);
}

async function main() {
  migrateShopOddsIfNeeded();

  await ensureCardCatalogLoaded();
  const levelsData = await loadCardLevels();
  const covers = await loadCoverPool();
  const coverPools = buildOfferCoverPools(covers);
  const collectionsRich = await loadCollectionsRich().catch(() => []);

  const absChampion = hasTitle(window.ProgressionSystem?.titles?.TITLE_ABSOLUTE_CHAMPION || "absoluteChampion");

  const found = buildFoundSet();
  const urfinCol = (collectionsRich || []).find((c) => c && String(c.id) === "soldaty-urfina") || null;
  const urfinIds = Array.isArray(urfinCol?.cards) ? urfinCol.cards.map((x) => String(x?.id || "")).filter(Boolean) : [];
  const hasUrfinSoldiers = urfinIds.length ? urfinIds.every((id) => found.has(id)) : false;
  const freeKey = `${STORAGE.freeUrfinDailyPrefix}${activeAccKeySuffix()}`;

  const getFreeAvailable = () => hasUrfinSoldiers && localStorage.getItem(freeKey) !== todayKeyLocal();

  let payCur = getPayCurrency();
  renderCurrencyToggle(payCur);

  const rerender = () => {
    const freeAvailable = getFreeAvailable();
    for (const [offerId, offer] of Object.entries(OFFERS)) {
      renderOfferCard(offerId, offer, payCur, { freeAvailable });
    }
    renderHud(readBalances());

    const state = readReadyBundlesState();
    renderReadyBundles({ state, now: Date.now() });
  };

  document.querySelectorAll(".shop-currency-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      payCur = setPayCurrency(btn.dataset.currency);
      renderCurrencyToggle(payCur);
      rerender();
    });
  });

  document.querySelectorAll("[data-offer-id]").forEach((cardEl) => {
    const offerId = cardEl.dataset.offerId;
    if (!offerId || !OFFERS[offerId]) return;
    const btn = cardEl.querySelector(".shop-card__btn");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const offer = OFFERS[offerId];
      const payCurrency = String(cardEl.dataset.payCurrency || offer.pay.currency);
      const payPrice = asNum(cardEl.dataset.payPrice, offer.pay.price);

      const isFreeClick = getFreeAvailable() && cardEl.dataset.free === "1";

      let spendRes = { ok: true, spend: { silver: 0, diamonds: 0, gold: 0 }, note: "" };
      if (!isFreeClick) {
        const balances = readBalances();
        spendRes = computeSpend({ balances, currency: payCurrency, price: payPrice });
        if (!spendRes.ok) {
          if (spendRes.reason === "not_enough_gold") showToast("Недостатньо золота.");
          return;
        }
        if (spendRes.note) showToast(spendRes.note);
      } else {
        localStorage.setItem(freeKey, todayKeyLocal());
        showToast("Безкоштовна покупка (колекція «Солдати Урфіна»).");
      }

      const beforeEff = computeEffectiveChances(offerId, offer);
      const { triggeredId, tier } = decideTier(offerId, offer);
      updateChancesAfterPurchase(offerId, offer, triggeredId, { absoluteChampion: absChampion });
      const afterEff = computeEffectiveChances(offerId, offer);

      const cover = pickCoverForOffer(offerId, coverPools) || { id: "card", title: "Карта", element: "earth" };
      const card = buildCard({ cover, tier, levelsData, offer });

      const equipRes = applyPurchaseToAccount({ spend: spendRes.spend, card });
      try { emitCampaignEvent("shop_purchase", { count: 1 }); } catch { /* ignore */ }

      const q = String(tier.quality || offer.base.quality || "common");
      showToast(`Отримано: ${card.title} • ${q} • рів. ${card.level} • сила ${card.power}`);
      if (equipRes?.equipped) {
        const replacedTitle = equipRes.replaced?.title || equipRes.replaced?.name || "";
        showToast(replacedTitle ? `Карта автоматично додана до колоди (замінила: ${replacedTitle}).` : "Карта автоматично додана до колоди.");
      }

      rerender();
      try {
        sessionStorage.setItem("openCard", JSON.stringify(card));
      } catch {
        // ignore
      }

      const baseQ = String(offer.base.quality || "common");
      const gotQ = String(tier.quality || baseQ);
      const upgraded = qualityRank(gotQ) > qualityRank(baseQ);
      const upgradeMessage = upgraded
        ? `Вам пощастило! Вітаємо!`
        : `Покупка успішна!`;
      const subtitle = upgraded
        ? `Замість ${qualityLabel(baseQ)} — ${qualityLabel(gotQ)} карта!`
        : `Отримано ${qualityLabel(gotQ)} карту.`;

      const tiers = listTiersForOffer(offer);
      const betterShown = tiers
        .filter((t) => qualityRank(t.quality) > qualityRank(baseQ))
        .map((t) => {
          const row = afterEff.find((x) => x.id === t.id) || null;
          return {
            id: t.id,
            label: qualityName(t.quality),
            chance: row ? row.chancePct : asNum(readChance(offerId, t), 0),
          };
        });

      const resultPayload = {
        offerId,
        payCurrency,
        payPrice,
        card,
        equipped: !!equipRes?.equipped,
        replacedTitle: String(equipRes?.replaced?.title || equipRes?.replaced?.name || ""),
        upgradeMessage,
        subtitle,
        chances: {
          tiers: betterShown.length ? betterShown : [],
          before: beforeEff,
          after: afterEff,
        },
      };
      try {
        sessionStorage.setItem("shop:lastResult", JSON.stringify(resultPayload));
      } catch {
        // ignore
      }

      location.href = "./shop-result.html";
    });
  });

  document.getElementById("readyBundlesHost")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".shop-card__btn");
    if (!btn) return;
    const cardEl = e.target.closest("[data-bundle-id]");
    if (!cardEl) return;

    const state = readReadyBundlesState();
    const idx = state.purchased;
    const bundle = READY_BUNDLES[idx] || null;
    if (!bundle) return;

    const now = Date.now();
    if (now < state.nextAt) return;

    const balances = readBalances();
    if (balances.gold < bundle.priceGold) {
      showToast("Недостаточно золота.");
      return;
    }

    const spend = { silver: 0, diamonds: 0, gold: bundle.priceGold };

    if (bundle.kind === "collection") {
      const col = (collectionsRich || []).find((c) => c && String(c.id) === String(bundle.collectionId)) || null;
      const cards = Array.isArray(col?.cards) ? col.cards : [];
      if (!cards.length) {
        showToast("Набір недоступний (немає даних колекції).");
        return;
      }


      const obtained = [];
      let first = true;
      for (const c of cards) {
        const power = Math.max(0, Math.round(asNum(c?.basePower ?? c?.power, 0)));
        const card = decorateCard({
          uid: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          id: String(c?.id ?? ""),
          title: String(c?.title ?? c?.id ?? "Карта"),
          element: normalizeElement(c?.element),
          level: asNum(c?.level, 1) || 1,
          power,
          basePower: power,
          rarity: String(c?.rarity || "rarity-1"),
          inDeck: false,
          protected: false,
          art: "",
          source: `shop:${bundle.id}`,
        }, CARD_BELONGS_TO.shop);

        applyPurchaseToAccount({ spend: first ? spend : { silver: 0, diamonds: 0, gold: 0 }, card });
        obtained.push(card);
        first = false;
      }

      showToast(`Отримано: ${cards.length} карт • ${bundle.title}`);
      try { emitCampaignEvent("shop_purchase", { count: cards.length }); } catch { /* ignore */ }

      try {
        sessionStorage.setItem("shop:lastResult", JSON.stringify({
          offerId: "",
          payCurrency: "gold",
          payPrice: bundle.priceGold,
          kind: "bundle",
          bundleId: bundle.id,
          bundleTitle: bundle.title,
          upgradeMessage: "Вітаємо з покупкою!",
          subtitle: `Ви отримали набір: ${bundle.title}`,
          cards: obtained,
          chances: { tiers: [] },
        }));
      } catch {
        // ignore
      }
      writeReadyBundlesState({ purchased: idx + 1, nextAt: now + 24 * 60 * 60 * 1000 });
      location.href = "./shop-result.html";
      return;
    } else if (bundle.kind === "random") {
      const tier = { quality: bundle.quality, levelRange: bundle.levelRange || [1, 1], id: bundle.quality };
      const offerLike = { id: bundle.id, base: { quality: bundle.quality }, upgrades: [] };


      const obtained = [];
      let first = true;
      for (let i = 0; i < (bundle.count || 1); i++) {
        const cover = pickRandom(covers) || { id: "card", title: "Карта", element: "earth" };
        const card = buildCard({ cover, tier, levelsData, offer: offerLike });
        applyPurchaseToAccount({ spend: first ? spend : { silver: 0, diamonds: 0, gold: 0 }, card });
        obtained.push(card);
        first = false;
      }

      showToast(`Получено: ${bundle.count} карт • ${bundle.title}`);
      try { emitCampaignEvent("shop_purchase", { count: bundle.count || 1 }); } catch { /* ignore */ }

      try {
        sessionStorage.setItem("shop:lastResult", JSON.stringify({
          offerId: "",
          payCurrency: "gold",
          payPrice: bundle.priceGold,
          kind: "bundle",
          bundleId: bundle.id,
          bundleTitle: bundle.title,
          upgradeMessage: "Вітаємо з покупкою!",
          subtitle: `Ви отримали набір: ${bundle.title}`,
          cards: obtained,
          chances: { tiers: [] },
        }));
      } catch {
        // ignore
      }
      writeReadyBundlesState({ purchased: idx + 1, nextAt: now + 24 * 60 * 60 * 1000 });
      location.href = "./shop-result.html";
      return;
    }

    rerender();
  });

  rerender();

  // Optional: auto-buy from query (?buy=gold_50) used by shop-result "buy again".
  try {
    const url = new URL(location.href);
    const buyId = String(url.searchParams.get("buy") || "").trim();
    if (buyId && OFFERS[buyId]) {
      url.searchParams.delete("buy");
      history.replaceState(null, "", url.toString());
      const btn = document.querySelector(`[data-offer-id="${buyId}"] .shop-card__btn`);
      if (btn) btn.click();
    }
  } catch {
    // ignore
  }
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((err) => {
    console.warn("[shop] init failed", err);
    showToast("Помилка завантаження крамниці.");
  });
});

