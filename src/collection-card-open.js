// src/collection-card-open.js — separate card view for collection (not the deck screen)
import "./account.js";
import { buildFoundSet } from "./collections-core.js";

function $(id) {
  return document.getElementById(id);
}

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

function renderBioText(el, raw, { isFound } = {}) {
  if (!el) return;
  const normalized = normalizeBioText(raw);
  el.textContent = "";

  if (!normalized) {
    const p = document.createElement("p");
    p.className = `card-bio__p ${isFound ? "is-muted" : ""}`.trim();
    p.textContent = isFound ? "Опис ще не додано." : "Цю карту ще не знайдено. Відкрий її в пригодах або в крамниці.";
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
    (safeTitle
      ? `<text x="40" y="740" font-size="34" font-family="serif" fill="rgba(255,255,255,0.85)">${escapeXml(
          safeTitle,
        )}</text>`
      : "") +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeRarityClass(raw) {
  if (!raw) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.max(1, Math.min(6, Math.round(raw)));
    return `rarity-${n}`;
  }
  const s = String(raw).toLowerCase().trim();
  if (/^rarity-[1-6]$/.test(s)) return s;
  if (s === "common") return "rarity-1";
  if (s === "uncommon") return "rarity-2";
  if (s === "rare") return "rarity-3";
  if (s === "epic") return "rarity-4";
  if (s === "legendary") return "rarity-5";
  if (s === "mythic") return "rarity-6";
  return "";
}

async function tryFetchJson(path, { noStore = false } = {}) {
  const url = getPath(path);
  const r = await fetch(url, { cache: noStore ? "no-store" : "default" });
  if (!r.ok) throw new Error(`${path} fetch failed: ${r.status}`);
  return r.json();
}

let cardBioMapCache = null;
let titleBioMapCache = null;
async function loadCardBioMap() {
  if (cardBioMapCache) return cardBioMapCache;
  try {
    const json = await tryFetchJson("data/card-bio.json", { noStore: true });
    const bios = json && typeof json === "object" && json.bios && typeof json.bios === "object" ? json.bios : {};
    cardBioMapCache = bios;
    return bios;
  } catch (err) {
    console.warn("[collection-card-open] card-bio.json unavailable", err);
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

  const attach = (id, title) => {
    const bio = bios?.[String(id)];
    if (!bio) return;
    const key = normTitle(title);
    if (!key) return;
    if (!byTitle.has(key)) byTitle.set(key, String(bio));
  };

  // Source A: collections.json cards (authoritative for collection pages)
  try {
    const collections = await loadCollectionsRich();
    for (const col of collections || []) {
      const cards = Array.isArray(col?.cards) ? col.cards : [];
      for (const c of cards) attach(c?.id, c?.title ?? c?.name ?? c?.id);
    }
  } catch (err) {
    console.warn("[collection-card-open] collections.json for bio index failed", err);
  }

  // Source B: cards catalog (cards.json) — helps when ids differ but titles match.
  try {
    const cards = await loadCardCatalog();
    for (const c of cards || []) attach(c?.id, c?.title ?? c?.name ?? c?.id);
  } catch (err) {
    console.warn("[collection-card-open] cards catalog for bio index failed", err);
  }

  titleBioMapCache = byTitle;
  return byTitle;
}

let cardCatalogCache = null;
async function loadCardCatalog() {
  if (cardCatalogCache) return cardCatalogCache;
  const candidates = ["data/cards.json"];
  const merged = [];
  const seen = new Set();
  for (const p of candidates) {
    try {
      const json = await tryFetchJson(p, { noStore: true });
      const cards = Array.isArray(json?.cards) ? json.cards.filter(Boolean) : null;
      if (cards) {
        for (const card of cards) {
          const id = String(card?.id ?? "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(card);
        }
      }
    } catch (err) {
      console.warn("[collection-card-open] cards catalog unavailable", err);
    }
  }
  cardCatalogCache = merged;
  return cardCatalogCache;
}

let collectionsRichCache = null;
async function loadCollectionsRich() {
  if (collectionsRichCache) return collectionsRichCache;
  const json = await tryFetchJson("data/collections.json");
  const collections = json && Array.isArray(json.collections) ? json.collections : [];
  collectionsRichCache = collections;
  return collections;
}

async function loadCardFromBase(id) {
  try {
    const list = await tryFetchJson("assets/data/cards.base.json");
    if (!Array.isArray(list)) return null;
    const raw = list.find((c) => c && String(c.id) === String(id));
    if (!raw) return null;
    const power = Number(raw.power ?? raw.basePower ?? 0);
    // Support both 'art' (full URL) and 'artFile' (filename only)
    let art = String(raw.art ?? "").trim();
    if (!art && raw.artFile) {
      art = getPath(`assets/cards/arts/${raw.artFile}`);
    }
    return {
      id: String(raw.id ?? ""),
      title: String(raw.name ?? raw.title ?? raw.id ?? "Карта"),
      power: Number.isFinite(power) ? power : 0,
      level: Number(raw.level ?? 1) || 1,
      element: String(raw.element ?? "earth"),
      rarity: normalizeRarityClass(raw.rarity),
      art,
      bio: String(raw.bio ?? "").trim(),
    };
  } catch {
    return null;
  }
}

async function loadCardFromCatalog(id) {
  const cards = await loadCardCatalog();
  const raw = cards.find((c) => c && String(c.id) === String(id));
  if (!raw) return null;
  const power = Number(raw.power ?? raw.basePower ?? 0);
  // Support both 'art' (full URL) and 'artFile' (filename only)
  let art = String(raw.art ?? "").trim();
  if (!art && raw.artFile) {
    art = getPath(`assets/cards/arts/${raw.artFile}`);
  }
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? raw.name ?? raw.id ?? "Карта"),
    power: Number.isFinite(power) ? power : 0,
    level: Number(raw.level ?? 1) || 1,
    element: String(raw.element ?? "earth"),
    rarity: normalizeRarityClass(raw.rarity),
    art,
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
    const power = Number(raw.power ?? raw.basePower ?? 0);
    // Support both 'art' (full URL) and 'artFile' (filename only)
    let art = String(raw.art ?? "").trim();
    if (!art && raw.artFile) {
      art = getPath(`assets/cards/arts/${raw.artFile}`);
    }
    return {
      id: String(raw.id ?? ""),
      title: String(raw.title ?? raw.name ?? raw.id ?? "Карта"),
      power: Number.isFinite(power) ? power : 0,
      level: Number(raw.level ?? 1) || 1,
      element: String(raw.element ?? "earth"),
      rarity: normalizeRarityClass(raw.rarity),
      art,
      bio: String(raw.bio ?? "").trim(),
    };
  }
  return null;
}

function applyElementRarity(card) {
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

  const titleElem = $("cardTitleElem");
  if (titleElem) {
    titleElem.classList.remove("elem-fire", "elem-water", "elem-earth", "elem-air");
    titleElem.classList.add("card-titlebar__elem", "elem-" + (card.element || "earth"));
  }

  const titlebar = titleElem?.closest(".card-titlebar");
  if (titlebar) {
    titlebar.classList.remove("elem-fire", "elem-water", "elem-earth", "elem-air");
    titlebar.classList.add("elem-" + (card.element || "earth"));
  }
}

function applyArt(card, { hide = false } = {}) {
  const art = $("cardArt");
  if (!art) return;
  const url = hide
    ? buildPlaceholderArt(card?.element, "")
    : String(card?.art || "").trim() || buildPlaceholderArt(card?.element, card?.title);
  art.style.backgroundImage = url ? `url('${url}')` : "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const cardId = qs("id") || qs("card") || "";
  const collectionId = qs("collection") || qs("col") || "";

  if (!cardId) {
    console.warn("[collection-card-open] missing card id");
    return;
  }

  const back = $("backToCollection");
  if (back) {
    back.setAttribute(
      "href",
      collectionId ? `collection-open.html?id=${encodeURIComponent(collectionId)}` : "collections.html",
    );
  }

  const foundSet = buildFoundSet();
  const isFound = foundSet.has(String(cardId));

  let card =
    (await loadCardFromCatalog(cardId).catch(() => null)) ||
    (await loadCardFromCollectionsRichById(cardId).catch(() => null)) ||
    (await loadCardFromBase(cardId).catch(() => null));

  if (!card) {
    card = {
      id: String(cardId),
      title: String(cardId),
      power: 0,
      level: 1,
      element: "earth",
      rarity: "rarity-1",
      art: "",
      bio: "",
    };
  }

  if (card?.id) {
    try {
      const bios = await loadCardBioMap();
      const b = bios?.[String(card.id)];
      if (b && !card.bio) card.bio = String(b);

      if (!card.bio && card.title) {
        const byTitle = await loadTitleBioMap();
        const tBio = byTitle.get(normTitle(card.title));
        if (tBio) card.bio = String(tBio);
      }
    } catch {
      // ignore
    }
  }

  if (card?.title) document.title = `${String(card.title)} — Cardastika`;
  setText("cardTitle", card.title || "Карта");
  applyElementRarity(card);
  applyArt(card, { hide: !isFound });

  const bioWrap = $("cardBioWrap");
  const bioEl = $("cardBio");
  if (bioEl) {
    renderBioText(bioEl, card?.bio || "", { isFound });
    if (bioWrap) bioWrap.style.display = "";
  }
});
