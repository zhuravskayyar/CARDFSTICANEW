import "../../src/account.js";

const STORAGE = {
  pityPrefix: "cardastika:shop:pity:",
};
const SHOP_POOL_ROTATION_VERSION = "2026-02-07-v2";

const QUALITY_LABEL = {
  uncommon: "незвичайні",
  rare: "рідкісні",
  epic: "епічні",
  legendary: "легендарні",
  mythic: "міфічні",
};

const OFFER_VIEW = {
  silver_500: {
    title: "Карта за 500",
    priceLabel: "Купити за 500",
    offerBuyParam: "silver_500",
    oddsRows: [
      { id: "epic", quality: "epic", label: "шанс отримати епічну карту", initialChance: 16 },
      { id: "rare", quality: "rare", label: "шанс отримати рідкісну карту", initialChance: 5 },
    ],
    pools: [
      { quality: "epic", count: 8 },
      { quality: "rare", count: 16 },
      { quality: "uncommon", count: 12 },
    ],
  },
  gold_50: {
    title: "Карта за 50",
    priceLabel: "Купити за 50",
    offerBuyParam: "gold_50",
    oddsRows: [
      { id: "mythic", quality: "mythic", label: "шанс отримати міфічну карту", initialChance: 30 },
      { id: "legendary", quality: "legendary", label: "шанс отримати легендарну карту", initialChance: 40 },
    ],
    pools: [
      { quality: "mythic", count: 8 },
      { quality: "legendary", count: 8 },
      { quality: "epic", count: 8 },
    ],
  },
  gold_150: {
    title: "Карта за 150",
    priceLabel: "Купити за 150",
    offerBuyParam: "gold_150",
    oddsRows: [
      { id: "mythic", quality: "mythic", label: "шанс отримати міфічну карту", initialChance: 40 },
    ],
    pools: [
      { quality: "mythic", count: 21 },
      { quality: "legendary", count: 8 },
    ],
  },
};

function asNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatPercent(p) {
  const n = asNum(p, 0);
  const fixed = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${fixed}%`;
}

function pityKey(offerId, tierId) {
  return `${STORAGE.pityPrefix}${offerId}:${tierId}`;
}

function readChance(offerId, tier) {
  const raw = localStorage.getItem(pityKey(offerId, tier.id));
  if (raw != null) return clamp(asNum(raw, 0), 0, 100);
  return clamp(asNum(tier.initialChance ?? 0, 0), 0, 100);
}

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["fire", "water", "air", "earth"].includes(s)) return s;
  if (s === "wind") return "air";
  return "earth";
}

function normalizeQuality(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["common", "uncommon", "rare", "epic", "legendary", "mythic"].includes(s)) return s;
  if (s === "rarity-1") return "common";
  if (s === "rarity-2") return "uncommon";
  if (s === "rarity-3") return "rare";
  if (s === "rarity-4") return "epic";
  if (s === "rarity-5") return "legendary";
  if (s === "rarity-6") return "mythic";
  return "common";
}

function rarityClassFromQuality(q) {
  if (q === "uncommon") return "rarity-2";
  if (q === "rare") return "rarity-3";
  if (q === "epic") return "rarity-4";
  if (q === "legendary") return "rarity-5";
  if (q === "mythic") return "rarity-6";
  return "rarity-1";
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

  const safeTitle = String(title || "").slice(0, 34);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${palette[0]}"/>` +
    `<stop offset="1" stop-color="${palette[1]}"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="220" height="220" fill="url(#g)"/>` +
    `<circle cx="170" cy="56" r="60" fill="rgba(255,255,255,0.11)"/>` +
    `<circle cx="56" cy="172" r="80" fill="rgba(0,0,0,0.2)"/>` +
    `<rect x="0" y="170" width="220" height="50" fill="rgba(0,0,0,0.28)"/>` +
    `<text x="10" y="202" font-size="16" font-family="serif" fill="rgba(255,255,255,0.92)">${escapeXml(safeTitle)}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function weekIndexUtc(date = new Date()) {
  const oneDay = 24 * 60 * 60 * 1000;
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = (new Date(utc).getUTCDay() + 6) % 7;
  const mondayUtc = utc - weekday * oneDay;
  const epochMondayUtc = Date.UTC(2025, 0, 6);
  return Math.floor((mondayUtc - epochMondayUtc) / (7 * oneDay));
}

function hashStr(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function weekRangeLabel(now = new Date()) {
  const oneDay = 24 * 60 * 60 * 1000;
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekday = (new Date(utc).getUTCDay() + 6) % 7;
  const monday = new Date(utc - weekday * oneDay);
  const nextMonday = new Date(monday.getTime() + 7 * oneDay);
  const fmt = (d) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${fmt(monday)} - ${fmt(new Date(nextMonday.getTime() - oneDay))}`;
}

function sortForWeek(list, { offerId, quality, week }) {
  const copy = list.slice();
  copy.sort((a, b) => {
    const ha = hashStr(`${SHOP_POOL_ROTATION_VERSION}|${offerId}|${quality}|${week}|${a.id}`);
    const hb = hashStr(`${SHOP_POOL_ROTATION_VERSION}|${offerId}|${quality}|${week}|${b.id}`);
    return ha - hb;
  });
  return copy;
}

function getBasePath() {
  return location.pathname.toLowerCase().includes("/pages/") ? "../../" : "./";
}

async function loadCards() {
  const base = getBasePath();
  const collectionShopFlagByTitle = new Map();
  const byId = new Map();
  const pushCard = (raw) => {
    if (!raw || typeof raw !== "object") return;
    const id = String(raw.id || "").trim();
    if (!id || id.startsWith("starter_")) return;
    const existing = byId.get(id) || {
      id,
      title: String(raw.title ?? raw.name ?? id),
      element: normalizeElement(raw.element),
      quality: normalizeQuality(raw.rarity),
      collections: [],
      shopBuyable: false,
    };
    const rawCollections = Array.isArray(raw.collections) ? raw.collections : [];
    for (const c of rawCollections) {
      const title = String(c || "").trim();
      if (!title) continue;
      if (!existing.collections.includes(title)) existing.collections.push(title);
    }
    byId.set(id, existing);
  };

  {
    let loaded = false;
    for (const file of ["data/cards.json"]) {
      try {
        const r = await fetch(`${base}${file}`, { cache: "no-store" });
        if (!r.ok) continue;
        const json = await r.json();
        const cards = Array.isArray(json?.cards) ? json.cards : [];
        for (const c of cards) pushCard(c);
        loaded = true;
        break;
      } catch {
        // try next source
      }
    }
    if (!loaded) throw new Error("card catalog fetch failed");
  }

  try {
    const rc = await fetch(`${base}data/collections.json`, { cache: "no-store" });
    if (rc.ok) {
      const jc = await rc.json();
      const cols = Array.isArray(jc?.collections) ? jc.collections : [];
      for (const col of cols) {
        const colTitle = String(col?.title || col?.id || "").trim();
        const source = String(col?.source || "").toLowerCase();
        const sourceLink = String(col?.sourceLink || "").toLowerCase();
        const isShopCollection =
          source.includes("магаз") ||
          source.includes("крамниц") ||
          source.includes("shop") ||
          sourceLink.includes("/shop/") ||
          sourceLink.includes("shop.html");
        if (colTitle) collectionShopFlagByTitle.set(colTitle, isShopCollection);
        const colCards = Array.isArray(col?.cards) ? col.cards : [];
        for (const c of colCards) {
          pushCard(c);
          const id = String(c?.id || "").trim();
          if (!id || !byId.has(id) || !colTitle) continue;
          const row = byId.get(id);
          if (!row.collections.includes(colTitle)) row.collections.push(colTitle);
          if (isShopCollection) row.shopBuyable = true;
        }
      }
    }
  } catch {
    // ignore, cards.json data is already loaded
  }

  for (const row of byId.values()) {
    if (row.shopBuyable) continue;
    for (const t of row.collections || []) {
      if (collectionShopFlagByTitle.get(t) === true) {
        row.shopBuyable = true;
        break;
      }
    }
  }

  return [...byId.values()];
}

async function loadDetailIndex() {
  const base = getBasePath();
  const bioById = new Map();
  const titleById = new Map();
  const collectionsByCardId = new Map();

  try {
    const r = await fetch(`${base}data/card-bio.json`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const bios = j && typeof j === "object" && j.bios && typeof j.bios === "object" ? j.bios : {};
      for (const [id, bio] of Object.entries(bios)) {
        const key = String(id || "").trim();
        if (!key) continue;
        bioById.set(key, String(bio || "").trim());
      }
    }
  } catch {
    // ignore
  }

  try {
    const r = await fetch(`${base}data/cards.json`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const cards = Array.isArray(j?.cards) ? j.cards : [];
      for (const c of cards) {
        const id = String(c?.id || "").trim();
        if (!id) continue;
        const title = String(c?.title ?? c?.name ?? id).trim();
        if (title) titleById.set(id, title);
        const cRows = Array.isArray(c?.collections) ? c.collections : [];
        for (const cTitle of cRows) {
          const t = String(cTitle || "").trim();
          if (!t) continue;
          if (!collectionsByCardId.has(id)) collectionsByCardId.set(id, []);
          collectionsByCardId.get(id).push({ title: t, source: "cards.json" });
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    const r = await fetch(`${base}data/collections.json`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const cols = Array.isArray(j?.collections) ? j.collections : [];
      for (const col of cols) {
        const colTitle = String(col?.title || col?.id || "Коллекция");
        const source = String(col?.source || "").trim();
        const cards = Array.isArray(col?.cards) ? col.cards : [];
        for (const c of cards) {
          const id = String(c?.id || "").trim();
          if (!id) continue;
          if (!titleById.has(id)) {
            const t = String(c?.title || id).trim();
            if (t) titleById.set(id, t);
          }
          if (!collectionsByCardId.has(id)) collectionsByCardId.set(id, []);
          collectionsByCardId.get(id).push({ title: colTitle, source });
        }
      }
    }
  } catch {
    // ignore
  }

  const bioByTitle = new Map();
  for (const [id, bio] of bioById.entries()) {
    const title = String(titleById.get(id) || "").trim().toLowerCase();
    if (!title || !bio) continue;
    if (!bioByTitle.has(title)) bioByTitle.set(title, bio);
  }

  return { bioById, bioByTitle, collectionsByCardId };
}

function setupCardModal(detailIndex) {
  const modal = document.getElementById("poolCardModal");
  const titleEl = document.getElementById("poolCardTitle");
  const artEl = document.getElementById("poolCardArt");
  const bioEl = document.getElementById("poolCardBio");
  const colsEl = document.getElementById("poolCardCollections");
  const srcEl = document.getElementById("poolCardSources");
  if (!modal || !titleEl || !artEl || !bioEl || !colsEl || !srcEl) {
    return { open: () => {}, close: () => {} };
  }

  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  modal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", close);
  });

  const open = (card) => {
    const id = String(card?.id || "").trim();
    const title = String(card?.title || "Карта");
    const element = normalizeElement(card?.element);
    titleEl.textContent = title;
    artEl.style.backgroundImage = `url('${buildPlaceholderArt(element, title)}')`;

    const byId = String(detailIndex?.bioById?.get(id) || "").trim();
    const byTitle = String(detailIndex?.bioByTitle?.get(title.toLowerCase()) || "").trim();
    const fallbackBio = `Карта стихії ${element || "earth"}: ${title}. Джерело залежить від колекції карти.`;
    const bio = byId || byTitle || fallbackBio;
    bioEl.textContent = bio;

    colsEl.textContent = "";
    const rows = Array.isArray(detailIndex?.collectionsByCardId?.get(id)) ? detailIndex.collectionsByCardId.get(id) : [];
    if (!rows.length) {
      const li = document.createElement("li");
      li.textContent = "Колекція не вказана.";
      colsEl.appendChild(li);
    } else {
      const seen = new Set();
      for (const row of rows) {
        const key = `${row.title}|${row.source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const li = document.createElement("li");
        li.textContent = row.source ? `${row.title} (${row.source})` : row.title;
        colsEl.appendChild(li);
      }
    }

    srcEl.textContent = "";
    const norm = (s) => String(s || "").trim().toLowerCase();
    const sourceRows = [];
    const seenSource = new Set();
    for (const row of rows) {
      const raw = String(row?.source || "").trim();
      if (!raw || norm(raw) === "cards.json") continue;
      const key = norm(raw);
      if (seenSource.has(key)) continue;
      seenSource.add(key);
      sourceRows.push(raw);
    }

    if (!sourceRows.length) {
      const li = document.createElement("li");
      li.textContent = "Джерело не визначено.";
      srcEl.appendChild(li);
    } else {
      for (const s of sourceRows) {
        const li = document.createElement("li");
        li.textContent = s;
        srcEl.appendChild(li);
      }

      const hasShopSource = sourceRows.some((s) => {
        const v = norm(s);
        return v.includes("магаз") || v.includes("крамниц") || v.includes("shop");
      });
      if (!hasShopSource) {
        const li = document.createElement("li");
        li.textContent = "Цю карту не можна купити в магазині.";
        srcEl.appendChild(li);
      }
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  return { open, close };
}

function renderOdds(host, offerId, cfg) {
  host.textContent = "";
  for (const row of cfg.oddsRows) {
    const line = document.createElement("div");
    line.className = `shop-pool-odds__row is-${row.quality}`;

    const pct = document.createElement("span");
    pct.className = "shop-pool-odds__pct";
    pct.textContent = formatPercent(readChance(offerId, row));

    const txt = document.createElement("span");
    txt.className = "shop-pool-odds__text";
    txt.textContent = row.label;

    line.append(pct, txt);
    host.appendChild(line);
  }
}

function renderPoolSections(host, offerId, cfg, allCards, { onCardClick } = {}) {
  host.textContent = "";
  const week = weekIndexUtc(new Date());
  const byQuality = new Map();
  for (const c of allCards) {
    const q = normalizeQuality(c.quality);
    if (!byQuality.has(q)) byQuality.set(q, []);
    byQuality.get(q).push(c);
  }

  const heading = document.createElement("div");
  heading.className = "shop-pool-now";
  heading.textContent = "Прямо сейчас в продаже:";
  host.appendChild(heading);

  for (const sectionCfg of cfg.pools) {
    const section = document.createElement("section");
    section.className = "shop-pool-section";

    const label = document.createElement("h4");
    label.className = `shop-pool-section__title is-${sectionCfg.quality}`;
    label.textContent = QUALITY_LABEL[sectionCfg.quality] || sectionCfg.quality;
    section.appendChild(label);

    const src = (byQuality.get(sectionCfg.quality) || []).filter(
      (c) => c.shopBuyable && Array.isArray(c.collections) && c.collections.length > 0,
    );
    const sorted = sortForWeek(src, { offerId, quality: sectionCfg.quality, week });
    const need = Math.max(0, sectionCfg.count);
    const picked = [];
    if (sorted.length > 0 && need > 0) {
      for (let i = 0; i < need; i++) picked.push(sorted[i % sorted.length]);
    }

    const grid = document.createElement("div");
    grid.className = "shop-pool-grid";
    for (const card of picked) {
      const item = document.createElement("article");
      item.className = "shop-pool-card";
      item.title = card.title;
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      const art = document.createElement("div");
      art.className = `shop-pool-art ${rarityClassFromQuality(sectionCfg.quality)}`.trim();
      art.style.backgroundImage = `url('${buildPlaceholderArt(card.element, card.title)}')`;
      item.appendChild(art);
      const open = () => {
        if (typeof onCardClick === "function") onCardClick(card);
      };
      item.addEventListener("click", open);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
      grid.appendChild(item);
    }

    // Center the final incomplete row in a 7-column grid.
    const rem = picked.length % 7;
    if (rem > 0) {
      const startIdx = picked.length - rem;
      const firstLastRow = grid.children[startIdx];
      if (firstLastRow) {
        const startCol = Math.floor((7 - rem) / 2) + 1;
        firstLastRow.style.gridColumnStart = String(startCol);
      }
    }

    section.appendChild(grid);
    host.appendChild(section);
  }
}

function getOfferIdFromUrl() {
  try {
    const u = new URL(location.href);
    const offer = String(u.searchParams.get("offer") || "").trim();
    if (offer in OFFER_VIEW) return offer;
  } catch {
    // ignore
  }
  return "gold_50";
}

async function main() {
  const offerId = getOfferIdFromUrl();
  const cfg = OFFER_VIEW[offerId] || OFFER_VIEW.gold_50;

  const titleEl = document.getElementById("poolTitle");
  if (titleEl) titleEl.textContent = cfg.title;

  const oddsHost = document.getElementById("poolOdds");
  if (oddsHost) renderOdds(oddsHost, offerId, cfg);

  const buyBtn = document.getElementById("poolBuyBtn");
  if (buyBtn) {
    buyBtn.textContent = cfg.priceLabel;
    buyBtn.addEventListener("click", () => {
      location.href = `./shop.html?buy=${encodeURIComponent(cfg.offerBuyParam)}`;
    });
  }
  const cards = await loadCards();
  const host = document.getElementById("poolSections");
  if (host) {
    renderPoolSections(host, offerId, cfg, cards, {
      onCardClick: (card) => {
        const id = String(card?.id || "").trim();
        if (!id) return;
        location.href = `./shop-card.html?id=${encodeURIComponent(id)}&offer=${encodeURIComponent(offerId)}`;
      },
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((err) => {
    console.warn("[shop-pool] init failed", err);
    location.href = "./shop.html";
  });
});

