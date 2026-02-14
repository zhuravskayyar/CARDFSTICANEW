const PUBLIC_PROFILE_CACHE_KEY = "cardastika:publicProfileCache";
const DEFAULT_AVATAR = "assets/cards/arts/fire_001.webp";
const AVATAR_ASSET_RE = /^(?:\.\/|\.\.\/\.\.\/|\/)?assets\/cards\/arts\/[\w.-]+\.(?:webp|png|jpe?g|avif)$/i;
const CARD_ART_FILE_RE = /^[\w.-]+\.(?:webp|png|jpe?g|avif)$/i;

function asInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readNumFromStorage(key, fallback = 0) {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) ? n : fallback;
}

function readFirstNum(keys, fallback = null) {
  for (const key of keys) {
    const n = Number(localStorage.getItem(key));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function safeAccountSystemCall(method, ...args) {
  try {
    const fn = globalThis?.AccountSystem?.[method];
    if (typeof fn !== "function") return null;
    return fn(...args);
  } catch {
    return null;
  }
}

function ensureActiveAccount() {
  const active = safeAccountSystemCall("getActive");
  if (active && typeof active === "object") return active;

  const candidate =
    String(localStorage.getItem("cardastika:auth:active") || "").trim() ||
    String(localStorage.getItem("activeAccount") || "").trim() ||
    String(localStorage.getItem("cardastika:player") || "").trim();

  if (!candidate) return null;

  const exists = safeAccountSystemCall("exists", candidate);
  if (exists) {
    safeAccountSystemCall("setActive", candidate);
    const switched = safeAccountSystemCall("getActive");
    if (switched && typeof switched === "object") return switched;
  }

  const loaded = safeAccountSystemCall("load", candidate);
  if (loaded && typeof loaded === "object") return loaded;

  return null;
}

function parseHudPowerText(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  const compact = s.replace(/\s+/g, "");
  const m = compact.match(/^([0-9]+(?:[.,][0-9]+)?)(k)?$/i);
  if (!m) return null;
  let n = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (m[2]) n *= 1000;
  return Math.max(0, Math.round(n));
}

function readHudPowerFallback() {
  try {
    const el = document.getElementById("hudPower");
    return parseHudPowerText(el?.textContent || "");
  } catch {
    return null;
  }
}

function titleLabel(id) {
  const k = String(id || "").trim();
  if (k === "tournamentChampion") return "Чемпіон турніру";
  if (k === "duelChampion") return "Чемпіон дуелей";
  if (k === "absoluteChampion") return "Абсолютний чемпіон";
  return "";
}

function activeAccountName(acc) {
  return (
    String(acc?.name || "").trim() ||
    localStorage.getItem("cardastika:auth:active") ||
    localStorage.getItem("activeAccount") ||
    localStorage.getItem("cardastika:player") ||
    "Гравець"
  );
}

function readDeck(acc) {
  if (Array.isArray(acc?.deck) && acc.deck.length) return acc.deck;
  const parsed = safeParse(localStorage.getItem("cardastika:deck") || "null");
  return Array.isArray(parsed) ? parsed : [];
}

function deckPower(deck) {
  if (!Array.isArray(deck)) return 0;
  return deck.reduce((sum, card) => sum + Number(card?.power ?? card?.basePower ?? 0), 0);
}

function normalizeCardId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/[^\w.-]/g, "");
}

function extractCardId(card) {
  const safe = card && typeof card === "object" ? card : {};
  return normalizeCardId(
    safe?.id
    ?? safe?.cardId
    ?? safe?.card_id
    ?? safe?.slug
    ?? safe?.uid
    ?? safe?.nameId
    ?? safe?.code
  );
}

function normalizeCardArtSource(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("./assets/")) return raw.slice(2);
  if (raw.startsWith("/assets/")) return raw.replace(/^\/+/, "");
  if (raw.startsWith("assets/")) return raw;
  if (CARD_ART_FILE_RE.test(raw)) return `assets/cards/arts/${raw}`;
  return raw;
}

function cardArt(card) {
  if (!card || typeof card !== "object") return DEFAULT_AVATAR;
  const id = extractCardId(card);
  if (id) return `assets/cards/arts/${id}.webp`;
  const byFile = normalizeCardArtSource(card.artFile ?? card.art_file);
  if (byFile) return byFile;
  const direct = normalizeCardArtSource(card.art || card.image || card.img || card.cover);
  if (direct) return direct;
  return DEFAULT_AVATAR;
}

function normalizeCardPreview(card) {
  return {
    id: extractCardId(card),
    title: String(card?.title || card?.name || "\u041A\u0430\u0440\u0442\u0430"),
    power: Math.max(0, asInt(card?.power ?? card?.basePower, 0)),
    level: Math.max(0, asInt(card?.level, 0)),
    rarity: String(card?.rarity ?? card?.quality ?? "").toLowerCase().trim(),
    element: String(card?.element || "").toLowerCase().trim(),
    art: cardArt(card),
  };
}

function topCardsFromDeck(deck) {
  if (!Array.isArray(deck)) return [];
  const cards = deck.map(normalizeCardPreview);
  cards.sort((a, b) => Number(b.power || 0) - Number(a.power || 0));
  return cards.slice(0, 3);
}

function computeDaysInGame(acc) {
  const created = asInt(acc?.created, 0);
  if (created <= 0) return 1;
  const diff = Math.max(0, Date.now() - created);
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

function readGiftsCount() {
  const raw = safeParse(localStorage.getItem("cardastika:gifts") || "null");
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === "object") return Object.keys(raw).length;
  return 0;
}

function sanitizeAvatarUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (AVATAR_ASSET_RE.test(raw)) {
    return raw.startsWith("/") ? raw.replace(/^\/+/, "") : raw;
  }

  if (raw.startsWith("assets/")) {
    return raw;
  }

  try {
    const url = new URL(raw, location.href);
    if (!/^https?:$/i.test(url.protocol)) return "";
    if (url.origin === location.origin && !/\/assets\/cards\/arts\//i.test(url.pathname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function buildPublicProfileSnapshot() {
  const acc = ensureActiveAccount();
  const state = window.ProgressionSystem?.getState?.() || null;

  const deck = readDeck(acc);
  const powerDeck = Math.max(0, asInt(deckPower(deck), 0));
  const power = powerDeck > 0
    ? powerDeck
    : Math.max(
      0,
      asInt(
        readFirstNum(["cardastika:deckPower", "cardastika:power"], readHudPowerFallback() ?? 0),
        0,
      ),
    );

  const duelRating = Math.max(
    0,
    asInt(
      state?.duel?.rating
      ?? acc?.duel?.rating
      ?? readFirstNum(["cardastika:duel:rating", "cardastika:duelRating"], 0),
      0,
    ),
  );
  const arenaRating = Math.max(
    0,
    asInt(
      readFirstNum(
        ["cardastika:arena:rating", "cardastika:arenaRating", "cardastika:arena:wins"],
        0,
      ),
      0,
    ),
  );
  const tournamentRating = Math.max(
    0,
    asInt(
      readFirstNum(
        ["cardastika:tournament:rating", "cardastika:tournamentRating", "cardastika:tournament:wins"],
        0,
      ),
      0,
    ),
  );

  const titles = Array.isArray(state?.titles) ? state.titles : [];
  const firstTitle = titleLabel(titles[0]);
  const duel = acc?.duel || {};
  const avatarStored = String(localStorage.getItem("cardastika:avatarUrl") || "").trim();
  const avatarSafe = sanitizeAvatarUrl(avatarStored);
  if (!avatarSafe && avatarStored) {
    try {
      localStorage.removeItem("cardastika:avatarUrl");
    } catch {
      // ignore
    }
  }
  const avatarUrl = avatarSafe || DEFAULT_AVATAR;

  return {
    version: 1,
    name: activeAccountName(acc),
    title: firstTitle || "Достойний маг",
    subtitle: "Боєвий дракон",
    avatar: avatarUrl,
    level: Math.max(1, asInt(state?.level, 1)),
    guildRank: String(acc?.guildRank || ""),
    ratings: {
      deck: power,
      duel: duelRating,
      arena: arenaRating,
      tournament: tournamentRating,
      league: String(state?.league?.name || acc?.duelLeagueId || localStorage.getItem("cardastika:league") || "-"),
    },
    duel: {
      played: Math.max(0, asInt(state?.duel?.played ?? duel.played ?? readFirstNum(["cardastika:duel:played"], 0), 0)),
      wins: Math.max(0, asInt(state?.duel?.wins ?? duel.wins ?? readFirstNum(["cardastika:duel:wins"], 0), 0)),
      losses: Math.max(0, asInt(state?.duel?.losses ?? duel.losses ?? readFirstNum(["cardastika:duel:losses"], 0), 0)),
      draws: Math.max(0, asInt(state?.duel?.draws ?? duel.draws ?? readFirstNum(["cardastika:duel:draws"], 0), 0)),
    },
    bonuses: {
      xpPct: Math.max(0, asInt(state?.bonuses?.xpPct, 0)),
      silverPct: Math.max(0, asInt(state?.bonuses?.silverPct, 0)),
      guildPct: Math.max(0, asInt(state?.guildLevel ?? acc?.guildLevel, 0)),
    },
    daysInGame: computeDaysInGame(acc),
    lastLoginText: "зараз у грі",
    medalsCount: Array.isArray(state?.medals) ? state.medals.length : 0,
    giftsCount: readGiftsCount(),
    topCards: topCardsFromDeck(deck),
    currency: {
      silver: asInt(acc?.silver, readNumFromStorage("cardastika:silver", 0)),
      gold: asInt(acc?.gold, readNumFromStorage("cardastika:gold", 0)),
      diamonds: asInt(acc?.diamonds, readNumFromStorage("cardastika:diamonds", 0)),
    },
  };
}

export function writePublicProfileCache(snapshotLike) {
  const payload = snapshotLike && typeof snapshotLike === "object"
    ? snapshotLike
    : buildPublicProfileSnapshot();
  try {
    localStorage.setItem(PUBLIC_PROFILE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  return payload;
}

export function readPublicProfileCache() {
  return safeParse(localStorage.getItem(PUBLIC_PROFILE_CACHE_KEY) || "null");
}

export function buildAndCachePublicProfileSnapshot() {
  const snap = buildPublicProfileSnapshot();
  return writePublicProfileCache(snap);
}
