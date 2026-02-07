import "../../src/account.js";

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function getPath(path) {
  return location.pathname.toLowerCase().includes("/pages/") ? `../../${path}` : `./${path}`;
}

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["fire", "water", "air", "earth"].includes(s)) return s;
  if (s === "wind") return "air";
  return "earth";
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

  const safeTitle = String(title || "").slice(0, 36);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs>` +
    `<rect width="420" height="420" fill="url(#g)"/>` +
    `<circle cx="315" cy="115" r="90" fill="rgba(255,255,255,0.11)"/>` +
    `<circle cx="125" cy="305" r="120" fill="rgba(0,0,0,0.22)"/>` +
    `<rect x="0" y="340" width="420" height="80" fill="rgba(0,0,0,0.3)"/>` +
    `<text x="18" y="388" font-size="34" font-family="serif" fill="rgba(255,255,255,0.95)">${escapeXml(safeTitle)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function loadCardById(cardId) {
  const targetId = String(cardId || "").trim();
  if (!targetId) return null;

  try {
    const r = await fetch(getPath("data/cards.json"), { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const cards = Array.isArray(j?.cards) ? j.cards : [];
      const c = cards.find((x) => String(x?.id || "").trim() === targetId) || null;
      if (c) {
        return {
          id: String(c.id),
          title: String(c.title ?? c.name ?? c.id),
          element: normalizeElement(c.element),
          collections: Array.isArray(c.collections) ? c.collections.map((x) => String(x || "").trim()).filter(Boolean) : [],
          bio: String(c.bio || "").trim(),
        };
      }
    }
  } catch {
    // fallback to collections.json
  }

  // Pool entries can be present in collections.json even if absent from cards.json.
  try {
    const r = await fetch(getPath("data/collections.json"), { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    const cols = Array.isArray(j?.collections) ? j.collections : [];
    for (const col of cols) {
      const colTitle = String(col?.title || col?.id || "").trim();
      const cards = Array.isArray(col?.cards) ? col.cards : [];
      const c = cards.find((x) => String(x?.id || "").trim() === targetId);
      if (!c) continue;
      return {
        id: targetId,
        title: String(c?.title ?? c?.name ?? c?.id ?? targetId),
        element: normalizeElement(c?.element),
        collections: colTitle ? [colTitle] : [],
        bio: String(c?.bio || "").trim(),
      };
    }
  } catch {
    // ignore
  }

  return null;
}

async function loadBios() {
  try {
    const r = await fetch(getPath("data/card-bio.json"), { cache: "no-store" });
    if (!r.ok) return {};
    const j = await r.json();
    return j && typeof j === "object" && j.bios && typeof j.bios === "object" ? j.bios : {};
  } catch {
    return {};
  }
}

function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function loadTitleBioMap() {
  const bios = await loadBios();
  const byTitle = new Map();
  try {
    const r = await fetch(getPath("data/collections.json"), { cache: "no-store" });
    if (!r.ok) return byTitle;
    const j = await r.json();
    const cols = Array.isArray(j?.collections) ? j.collections : [];
    for (const col of cols) {
      const cards = Array.isArray(col?.cards) ? col.cards : [];
      for (const c of cards) {
        const id = String(c?.id || "").trim();
        const title = normTitle(c?.title ?? c?.name ?? c?.id);
        const bio = String(bios?.[id] || "").trim();
        if (!id || !title || !bio) continue;
        if (!byTitle.has(title)) byTitle.set(title, bio);
      }
    }
  } catch {
    // ignore
  }
  return byTitle;
}

async function loadCollectionsMap() {
  const byTitle = new Map();
  const byCardId = new Map();

  try {
    const r = await fetch(getPath("data/collections.json"), { cache: "no-store" });
    if (!r.ok) return { byTitle, byCardId };
    const j = await r.json();
    const cols = Array.isArray(j?.collections) ? j.collections : [];

    for (const col of cols) {
      const title = String(col?.title || col?.id || "").trim();
      if (!title) continue;
      byTitle.set(title, col);
      for (const c of Array.isArray(col?.cards) ? col.cards : []) {
        const id = String(c?.id || "").trim();
        if (!id) continue;
        if (!byCardId.has(id)) byCardId.set(id, []);
        byCardId.get(id).push(col);
      }
    }
  } catch {
    // return empty maps and keep the page usable
  }

  return { byTitle, byCardId };
}

function dedupeCollections(rows) {
  const out = [];
  const seen = new Set();
  for (const col of rows) {
    const key = String(col?.id || col?.title || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(col);
  }
  return out;
}

function renderCollections(host, cols) {
  host.textContent = "";
  if (!cols.length) {
    const empty = document.createElement("p");
    empty.className = "shop-card-info__empty";
    empty.textContent = "Коллекция не указана.";
    host.appendChild(empty);
    return;
  }

  for (const col of cols) {
    const card = document.createElement("article");
    card.className = "shop-card-info__collection";

    const link = document.createElement("a");
    link.className = "shop-card-info__collection-link";
    const cid = String(col?.id || "").trim();
    link.href = cid ? `../collections/collection-open.html?id=${encodeURIComponent(cid)}` : "../collections/collections.html";
    link.textContent = `«${String(col?.title || col?.id || "Коллекция") }»`;
    card.appendChild(link);

    const bonus = document.createElement("div");
    bonus.className = "shop-card-info__bonus";
    bonus.textContent = String(col?.bonus || "Бонус не указан.");
    card.appendChild(bonus);

    host.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const cardId = String(qs("id") || "").trim();
  const offer = String(qs("offer") || "gold_50").trim();
  const back = document.getElementById("shopCardBack");
  if (back) back.href = `./shop-pool.html?offer=${encodeURIComponent(offer)}`;
  if (!cardId) {
    location.href = `./shop-pool.html?offer=${encodeURIComponent(offer)}`;
    return;
  }

  const [card, bios, titleBioMap, cMap] = await Promise.all([
    loadCardById(cardId),
    loadBios(),
    loadTitleBioMap(),
    loadCollectionsMap(),
  ]);

  const titleEl = document.getElementById("shopCardTitle");
  const artEl = document.getElementById("shopCardArt");
  const bioEl = document.getElementById("shopCardBio");
  const colsHost = document.getElementById("shopCardCollections");

  const safeCard = card || {
    id: cardId,
    title: cardId,
    element: "earth",
    collections: [],
    bio: "",
  };

  if (titleEl) titleEl.textContent = safeCard.title;
  if (artEl) artEl.style.backgroundImage = `url('${buildPlaceholderArt(safeCard.element, safeCard.title)}')`;

  const bioByCard = String(safeCard.bio || "").trim();
  const bioById = String(bios?.[safeCard.id] || "").trim();
  const bioByTitle = String(titleBioMap.get(normTitle(safeCard.title)) || "").trim();
  const bio = bioByCard || bioById || bioByTitle || "Опис карти поки недоступний.";
  if (bioEl) bioEl.textContent = bio;

  const collectionsByTitle = safeCard.collections.map((t) => cMap.byTitle.get(t)).filter(Boolean);
  const collectionsById = cMap.byCardId.get(safeCard.id) || [];
  const collections = dedupeCollections([...collectionsByTitle, ...collectionsById]);
  if (colsHost) renderCollections(colsHost, collections);
});
