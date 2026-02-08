import "../../src/account.js";

function $(id) {
  return document.getElementById(id);
}

function asNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function showToast(message) {
  const host = document.getElementById("toastHost") || document.body;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["fire", "water", "air", "earth"].includes(s)) return s;
  if (s === "wind") return "air";
  return "earth";
}

function fmtCurrency(cur) {
  const c = String(cur || "");
  if (c === "silver") return "серебра";
  if (c === "diamonds") return "алмазов";
  if (c === "gold") return "золота";
  return c || "—";
}

function buildMiniRefCard(card) {
  const element = normalizeElement(card?.element);
  const rarity = String(card?.rarity || "");

  const wrap = document.createElement("div");
  wrap.className = `ref-card elem-${element} ${rarity}`.trim();
  wrap.setAttribute("aria-label", String(card?.title || "Карта"));

  const size = Math.max(60, Math.round(asNum(card?.__uiSize, 130)));
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;

  const top = document.createElement("div");
  top.className = "ref-card__top";
  const type = document.createElement("span");
  type.className = "ref-card__type";
  type.setAttribute("aria-hidden", "true");
  const power = document.createElement("span");
  power.className = "ref-card__power";
  power.textContent = String(Math.max(0, Math.round(asNum(card?.power ?? card?.basePower, 0))));
  top.append(type, power);

  const art = document.createElement("div");
  art.className = "ref-card__art";
  // Support both 'art' (full URL) and 'artFile' (filename only)
  let artUrl = card?.art;
  if (!artUrl && card?.artFile) {
    artUrl = `../../assets/cards/arts/${card.artFile}`;
  }
  if (artUrl) art.style.backgroundImage = `url('${String(artUrl)}')`;

  const elem = document.createElement("div");
  elem.className = "ref-card__elem";
  elem.setAttribute("aria-hidden", "true");

  wrap.append(top, art, elem);
  return wrap;
}

function renderBanners(host, banners) {
  if (!host) return;
  host.textContent = "";
  const rows = Array.isArray(banners) ? banners : [];
  for (const b of rows) {
    const obj = b && typeof b === "object" ? b : { text: String(b || "") };
    const text = String(obj.text || "").trim();
    if (!text) continue;
    const el = document.createElement("div");
    el.className = `shop-result__banner ${obj.kind ? `is-${obj.kind}` : "is-blue"}`.trim();
    el.innerHTML = text.replace(/\n/g, "<br>");
    host.appendChild(el);
  }
  host.style.display = host.childElementCount ? "" : "none";
}

function renderChances(listEl, chances) {
  if (!listEl) return;
  listEl.textContent = "";

  const rows = Array.isArray(chances?.tiers) ? chances.tiers : [];
  if (!rows.length) {
    const span = document.createElement("div");
    span.className = "shop-result__chance is-muted";
    span.textContent = "—";
    listEl.appendChild(span);
    return;
  }

  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "shop-result__chance";
    const label = document.createElement("span");
    label.className = "shop-result__chance-label";
    label.textContent = String(r.label || r.id || "Шанс");
    const value = document.createElement("b");
    value.className = "shop-result__chance-value";
    value.textContent = `${asNum(r.chance, 0).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
    row.append(label, value);
    listEl.appendChild(row);
  }
}

function readLastResult() {
  try {
    const raw = sessionStorage.getItem("shop:lastResult");
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem("shop:lastResult");
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

document.addEventListener("DOMContentLoaded", () => {
  const res = readLastResult();
  if (!res || typeof res !== "object") {
    showToast("Немає даних покупки.");
    location.href = "./shop.html";
    return;
  }

  const kind = String(res.kind || "");
  const offerId = String(res.offerId || "");
  const isBundle = kind === "bundle";

  const cards = Array.isArray(res.cards) && res.cards.length ? res.cards : res.card ? [res.card] : [];
  if (!cards.length) {
    showToast("Немає даних карти.");
    location.href = "./shop.html";
    return;
  }

  const titleEl = $("resultTitle");
  const subtitleEl = $("resultSubtitle");
  if (titleEl) titleEl.textContent = String(res.upgradeMessage || (isBundle ? "Вітаємо з покупкою!" : "Покупка"));
  if (subtitleEl) subtitleEl.textContent = String(res.subtitle || "");

  if (isBundle && !$("resultBanners")?.childElementCount) {
    renderBanners($("resultBanners"), [
      { kind: "blue", text: "Вітаємо з покупкою!\nВи отримали комплект карт!" },
    ]);
  } else {
    renderBanners($("resultBanners"), res.banners || null);
  }

  const host = $("resultCard");
  if (host) {
    host.textContent = "";
    const grid = document.createElement("div");
    grid.className = cards.length > 1 ? "shop-result__grid" : "shop-result__single";
    for (const c of cards) {
      const ui = { ...(c || {}) };
      ui.__uiSize = cards.length > 1 ? 92 : 130;
      grid.appendChild(buildMiniRefCard(ui));
    }
    host.appendChild(grid);
  }

  const priceEl = $("resultPrice");
  if (priceEl) {
    const price = asNum(res.payPrice, 0);
    const cur = fmtCurrency(res.payCurrency);
    priceEl.textContent = price <= 0 ? "Цена: бесплатно" : `Цена: ${price} ${cur}`;
  }

  renderChances($("resultChances"), res.chances || null);
  const chancesWrap = document.querySelector(".shop-result__chances");
  const hasChances = Array.isArray(res?.chances?.tiers) && res.chances.tiers.length;
  if (chancesWrap) chancesWrap.style.display = hasChances ? "" : "none";

  const metaWrap = document.querySelector(".shop-result__meta");
  if (metaWrap) metaWrap.style.display = isBundle ? "none" : "";

  const btnBuyAgain = $("btnBuyAgain");
  if (btnBuyAgain) {
    btnBuyAgain.style.display = offerId && !isBundle ? "" : "none";
    btnBuyAgain.addEventListener("click", () => {
      if (!offerId) location.href = "./shop.html";
      else location.href = `./shop.html?buy=${encodeURIComponent(offerId)}`;
    });
  }

  $("btnBackToShop")?.addEventListener("click", () => {
    location.href = "./shop.html";
  });
});
