// src/net.js - Socket.IO presence + online list + player profile modal
import { buildAndCachePublicProfileSnapshot, readPublicProfileCache } from "./public-profile.js";
(function () {
  const SOCKET_IO_CDN = "https://cdn.socket.io/4.7.5/socket.io.min.js";
  const GITHUB_PAGES_API = "https://cardastica-server.onrender.com";
  const API_PROBE_TIMEOUT_MS = 3500;
  const PING_INTERVAL_MS = 20_000;
  const REST_REFRESH_MS = 30_000;
  const LIST_LIMIT = 200;
  const CHAT_ROOM_ID = "global";
  const CHAT_LIMIT = 50;
  const AVATAR_PATH_RE = /^(?:\.\/|\.\.\/\.\.\/|\/)?assets\/cards\/arts\/[\w.-]+\.(?:webp|png|jpe?g|avif)$/i;
  const CARD_ART_FILE_RE = /^[\w.-]+\.(?:webp|png|jpe?g|avif)$/i;

  const IDS = {
    style: "onlinePresenceStyle",
    fallbackLink: "onlineFallbackLink",
    modal: "onlinePresenceModal",
    list: "onlinePresenceList",
    search: "onlinePresenceSearch",
    stat: "onlinePresenceStat",
    profileModal: "onlineProfileModal",
    chatModal: "globalChatModal",
    chatLog: "globalChatLog",
    chatForm: "globalChatForm",
    chatInput: "globalChatInput",
    chatStatus: "globalChatStatus"
  };

  function assetPrefix() {
    return location.pathname.toLowerCase().includes("/pages/") ? "../../" : "./";
  }

  const DEFAULT_AVATAR = `${assetPrefix()}assets/cards/arts/fire_001.webp`;
  const QUALITY_COLOR = {
    mythic: "#ff4fa2",
    legendary: "#f6ad43",
    epic: "#b58dff",
    rare: "#54b5ff",
    uncommon: "#7ddf7d",
    common: "#d6d6d6"
  };
  const CARD_ELEMENTS = new Set(["fire", "water", "earth", "air"]);
  const RARITY_TO_CLASS = {
    common: "rarity-1",
    uncommon: "rarity-2",
    rare: "rarity-3",
    epic: "rarity-4",
    legendary: "rarity-5",
    mythic: "rarity-6"
  };

  let socket = null;
  let pingInterval = null;
  let restInterval = null;
  let latestSnapshot = { count: 0, list: [] };
  let latestChatMessages = [];
  let chatJoinPending = false;
  let chatTriggersBound = false;
  let escHandler = null;
  let apiBase = "";

  function defaultLocalApi() {
    return `${location.protocol}//${location.hostname}:3000`;
  }

  function activeApi() {
    return apiBase || defaultLocalApi();
  }

  function normalizeApiBase(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, location.href);
      if (!/^https?:$/i.test(url.protocol)) return "";
      return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
      return "";
    }
  }

  function isGithubPagesHost() {
    return /(?:^|\.)github\.io$/i.test(String(location.hostname || ""));
  }

  function uniquePush(list, value) {
    const normalized = normalizeApiBase(value);
    if (!normalized) return;
    if (!list.includes(normalized)) list.push(normalized);
  }

  function readConfiguredApiBase() {
    let fromQuery = "";
    try {
      fromQuery = new URLSearchParams(location.search).get("api") || "";
    } catch {
      // ignore
    }

    const candidates = [];
    uniquePush(candidates, fromQuery);
    uniquePush(candidates, window.__CARDASTICA_API__);
    uniquePush(candidates, localStorage.getItem("cardastika:apiBase"));
    uniquePush(candidates, localStorage.getItem("cardastika:api"));
    uniquePush(candidates, localStorage.getItem("cardastika:apiLast"));
    return candidates[0] || "";
  }

  function buildApiCandidates() {
    const out = [];
    if (isGithubPagesHost()) {
      uniquePush(out, GITHUB_PAGES_API);
    }
    uniquePush(out, defaultLocalApi());
    return out;
  }

  async function probeApi(base) {
    const root = normalizeApiBase(base);
    if (!root) return false;

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      try {
        controller?.abort();
      } catch {
        // ignore
      }
    }, API_PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(`${root}/`, {
        method: "GET",
        cache: "no-store",
        signal: controller?.signal
      });
      return !!response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveApiBase() {
    const configured = readConfiguredApiBase();
    if (configured) return configured;

    const candidates = buildApiCandidates();
    for (const candidate of candidates) {
      if (await probeApi(candidate)) return candidate;
    }

    return candidates[0] || defaultLocalApi();
  }

  function toAbsoluteUrl(value, fallback = "") {
    const raw = String(value || "").trim();
    if (!raw) return fallback ? toAbsoluteUrl(fallback, "") : "";
    try {
      return new URL(raw, location.href).href;
    } catch {
      return fallback ? toAbsoluteUrl(fallback, "") : "";
    }
  }

  function sanitizeAvatarValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (AVATAR_PATH_RE.test(raw)) {
      if (raw.startsWith("/assets/")) {
        return `${assetPrefix()}${raw.replace(/^\/+/, "")}`;
      }
      return raw;
    }

    if (raw.startsWith("assets/")) {
      return `${assetPrefix()}${raw}`;
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

  function toAvatarUrl(value, fallback = DEFAULT_AVATAR) {
    const safe = sanitizeAvatarValue(value);
    const next = safe || fallback;
    return toAbsoluteUrl(next, DEFAULT_AVATAR);
  }

  function normalizeCardElement(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "wind") return "air";
    if (CARD_ELEMENTS.has(raw)) return raw;
    return "earth";
  }

  function normalizeCardId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.replace(/[^\w.-]/g, "");
  }

  function extractCardId(cardLike) {
    const card = cardLike && typeof cardLike === "object" ? cardLike : {};
    return normalizeCardId(
      card?.id
      ?? card?.cardId
      ?? card?.card_id
      ?? card?.slug
      ?? card?.uid
      ?? card?.nameId
      ?? card?.code
    );
  }

  function rarityClassFromValue(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (/^rarity-[1-6]$/.test(raw)) return raw;
    if (RARITY_TO_CLASS[raw]) return RARITY_TO_CLASS[raw];

    const n = Number(raw);
    if (Number.isFinite(n)) {
      return `rarity-${Math.max(1, Math.min(6, Math.round(n)))}`;
    }

    return "rarity-1";
  }

  function cardArtFallbackUrl(cardLike) {
    const element = normalizeCardElement(cardLike?.element);
    return toAbsoluteUrl(`${assetPrefix()}assets/cards/arts/${element}_001.webp`, DEFAULT_AVATAR);
  }

  function normalizeCardArtFileSource(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (CARD_ART_FILE_RE.test(raw)) return `${assetPrefix()}assets/cards/arts/${raw}`;
    return sanitizeAvatarValue(raw);
  }

  function directCardArtUrl(cardLike) {
    const card = cardLike && typeof cardLike === "object" ? cardLike : {};
    const direct = sanitizeAvatarValue(card?.art ?? card?.image ?? card?.img ?? card?.avatar ?? card?.cover);
    return direct ? toAbsoluteUrl(direct, "") : "";
  }

  function cardArtByIdUrl(cardLike) {
    const id = extractCardId(cardLike);
    if (!id) return "";
    return toAbsoluteUrl(`${assetPrefix()}assets/cards/arts/${id}.webp`, "");
  }

  function cardArtFromFileUrl(cardLike) {
    const card = cardLike && typeof cardLike === "object" ? cardLike : {};
    const source = normalizeCardArtFileSource(card?.artFile ?? card?.art_file);
    return source ? toAbsoluteUrl(source, "") : "";
  }

  function toCardArtUrl(cardLike) {
    const card = cardLike && typeof cardLike === "object" ? cardLike : {};
    const byId = cardArtByIdUrl(card);
    if (byId) return byId;
    const byFile = cardArtFromFileUrl(card);
    if (byFile) return byFile;
    const direct = directCardArtUrl(card);
    if (direct) return direct;
    return cardArtFallbackUrl(card);
  }

  function toCardArtBackupUrl(cardLike) {
    const card = cardLike && typeof cardLike === "object" ? cardLike : {};
    const primary = toCardArtUrl(card);
    const byFile = cardArtFromFileUrl(card);
    if (byFile && byFile !== primary) return byFile;
    const direct = directCardArtUrl(card);
    if (direct && direct !== primary) return direct;
    return "";
  }

  function installAvatarFallback(img, fallbackUrl = DEFAULT_AVATAR) {
    if (!img || img.dataset.avatarFallbackBound === "1") return;
    img.dataset.avatarFallbackBound = "1";
    img.addEventListener("error", () => {
      const fallback = toAvatarUrl(fallbackUrl, DEFAULT_AVATAR);
      if (img.src !== fallback) img.src = fallback;
    });
  }

  function shouldAutoFocusInputs() {
    try {
      if (window.matchMedia?.("(pointer: coarse)")?.matches) return false;
      if (window.matchMedia?.("(hover: none)")?.matches) return false;
    } catch {
      // ignore
    }
    return Number(window.navigator?.maxTouchPoints || 0) <= 0;
  }

  function focusInputIfDesktop(input) {
    if (!input || !shouldAutoFocusInputs()) return;
    requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        try {
          input.focus();
        } catch {
          // ignore
        }
      }
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.io) return resolve();

      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        const started = Date.now();
        const timer = setInterval(() => {
          if (window.io) {
            clearInterval(timer);
            resolve();
          }
          if (Date.now() - started > 5000) {
            clearInterval(timer);
            reject(new Error("socket.io load timeout"));
          }
        }, 60);
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  }

  function ensureStyles() {
    if (document.getElementById(IDS.style)) return;

    const style = document.createElement("style");
    style.id = IDS.style;
    style.textContent = `
#${IDS.fallbackLink}{
  position: fixed;
  right: 12px;
  bottom: calc(var(--botH, 76px) + 10px);
  z-index: 59;
  color: #f0c879;
  text-decoration: underline;
  text-underline-offset: 2px;
  background: rgba(28, 17, 8, 0.88);
  border: 1px solid rgba(175, 134, 70, 0.44);
  border-radius: 999px;
  padding: 3px 9px;
  font: 700 13px/1 "EB Garamond", serif;
}
#${IDS.modal}, #${IDS.profileModal}{
  position: fixed;
  inset: 0;
  z-index: 1600;
  background: rgba(13, 8, 4, 0.86);
  display: grid;
  place-items: center;
  padding: 16px;
}
#${IDS.profileModal}{
  z-index: 1610;
}
#${IDS.modal} .online-modal__card,
#${IDS.profileModal} .online-profile__card{
  width: min(425px, 100%);
  max-height: min(86vh, 820px);
  display: grid;
  gap: 10px;
  background:
    radial-gradient(130% 140% at 50% 0%, rgba(198, 143, 54, 0.16), transparent 60%),
    linear-gradient(180deg, rgba(27, 18, 10, 0.98), rgba(12, 8, 4, 0.98));
  border: 1px solid rgba(168, 127, 66, 0.6);
  border-radius: 12px;
  box-shadow: 0 24px 48px rgba(0,0,0,0.55);
  padding: 14px;
  color: #f3dfb6;
}
#${IDS.modal} .online-modal__card{
  grid-template-rows: auto auto auto minmax(180px, 1fr);
}
#${IDS.profileModal} .online-profile__card{
  grid-template-rows: auto minmax(0, 1fr);
}
.online-modal__head,
.online-profile__head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.online-modal__title,
.online-profile__title{
  margin: 0;
  font-size: 24px;
  line-height: 1;
  color: #f2c980;
}
.online-modal__close,
.online-profile__close,
.online-profile__back{
  appearance: none;
  border: 1px solid rgba(170, 128, 68, 0.75);
  background: linear-gradient(180deg, rgba(78,53,26,0.96), rgba(43,27,12,0.98));
  color: #f8deb0;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 14px;
  cursor: pointer;
}
.online-profile__head-actions{
  display: flex;
  align-items: center;
  gap: 8px;
}
.online-modal__search{
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.online-modal__search input{
  width: 100%;
  background: rgba(9, 6, 3, 0.62);
  border: 1px solid rgba(156, 118, 62, 0.5);
  color: #ffe7c0;
  border-radius: 8px;
  padding: 9px 10px;
}
.online-modal__search button{
  appearance: none;
  border: 1px solid rgba(171, 130, 63, 0.95);
  border-radius: 8px;
  background: linear-gradient(180deg, #9a6f36, #6a4620);
  color: #fff3d4;
  font-weight: 700;
  padding: 8px 14px;
  cursor: pointer;
}
.online-modal__stat{
  font-size: 13px;
  color: rgba(231, 201, 150, 0.94);
}
.online-modal__list{
  border: 1px solid rgba(153, 114, 57, 0.46);
  border-radius: 10px;
  overflow: auto;
  background: rgba(8, 6, 4, 0.38);
}
.online-row{
  display: grid;
  grid-template-columns: 36px 42px 1fr 120px;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid rgba(175, 137, 86, 0.18);
  background: rgba(14, 10, 6, 0.42);
  color: #f0deb7;
  text-align: left;
  cursor: pointer;
}
.online-row:hover{
  background: rgba(69, 45, 21, 0.72);
}
.online-row:last-child{ border-bottom: 0; }
.online-row__rank{
  color: #deb56f;
  font-weight: 700;
  text-align: right;
}
.online-row__avatar{
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid rgba(180, 137, 72, 0.58);
  object-fit: cover;
  background: rgba(0,0,0,0.28);
}
.online-row__name{
  font-weight: 700;
  color: #f6e2bb;
}
.online-row__meta{
  margin-top: 2px;
  font-size: 12px;
  color: rgba(215, 184, 136, 0.9);
}
.online-row__power{
  text-align: right;
  color: #ffcf7f;
  font-weight: 700;
}
.online-empty{
  padding: 20px 12px;
  color: rgba(218, 187, 139, 0.92);
  text-align: center;
}
.online-profile__content{
  overflow: auto;
  display: grid;
  gap: 10px;
  padding-right: 2px;
}
.online-profile__hero{
  display: grid;
  grid-template-columns: 86px 1fr;
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(163, 121, 62, 0.42);
  border-radius: 10px;
  padding: 10px;
  background: rgba(0,0,0,0.24);
}
.online-profile__avatar{
  width: 84px;
  height: 84px;
  border-radius: 10px;
  border: 1px solid rgba(188, 143, 75, 0.62);
  object-fit: cover;
  background: rgba(0,0,0,0.32);
}
.online-profile__name{
  font-size: 23px;
  color: #f8e3be;
  font-weight: 700;
  line-height: 1.1;
}
.online-profile__subtitle{
  margin-top: 2px;
  font-size: 14px;
  color: #d8b16d;
}
.online-profile__chips{
  margin-top: 7px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.online-profile__chip{
  border: 1px solid rgba(173, 130, 68, 0.46);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  color: #f2dfbc;
  background: rgba(36, 24, 13, 0.82);
}
.online-profile__grid{
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.online-profile__panel{
  border: 1px solid rgba(157, 116, 58, 0.38);
  border-radius: 10px;
  padding: 9px;
  background: rgba(23, 15, 9, 0.56);
}
.online-profile__panel-title{
  margin: 0 0 6px;
  font-size: 15px;
  color: #edc77e;
  border-bottom: 1px solid rgba(160, 120, 61, 0.24);
  padding-bottom: 4px;
}
.online-profile__kv{
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  font-size: 13px;
  line-height: 1.35;
}
.online-profile__kv span:nth-child(odd){ color: rgba(221, 189, 145, 0.92); }
.online-profile__kv span:nth-child(even){ color: #f8e6c6; font-weight: 700; }
.online-profile__cards{
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.online-profile__card-slot{
  display: grid;
  gap: 4px;
}
.online-profile__deck-card.ref-card{
  width: 100%;
  aspect-ratio: 5 / 6;
  min-height: 122px;
  border-radius: 10px;
  cursor: default;
}
.online-profile__deck-card.ref-card::before{
  inset: 4px;
  border-radius: 8px;
}
.online-profile__deck-card.ref-card::after{
  border-radius: 10px;
}
.online-profile__deck-card.ref-card:hover{
  transform: none;
}
.online-profile__deck-card .ref-card__top{
  height: 20px;
  left: 0;
  right: 0;
  top: 0;
  width: 100%;
  padding: 0 6px;
  border-radius: 0;
  background: linear-gradient(180deg, rgba(245,240,225,0.96), rgba(225,215,190,0.92));
  z-index: 4;
}
.online-profile__deck-card.elem-fire .ref-card__top{
  background: linear-gradient(180deg, rgba(255,245,235,0.96), rgba(255,205,195,0.92));
}
.online-profile__deck-card.elem-water .ref-card__top{
  background: linear-gradient(180deg, rgba(240,250,255,0.96), rgba(190,220,255,0.92));
}
.online-profile__deck-card.elem-earth .ref-card__top{
  background: linear-gradient(180deg, rgba(245,255,245,0.96), rgba(190,235,200,0.92));
}
.online-profile__deck-card.elem-air .ref-card__top{
  background: linear-gradient(180deg, rgba(255,252,240,0.96), rgba(245,220,150,0.92));
}
.online-profile__deck-card .ref-card__type{
  width: 18px;
  height: 18px;
  border-radius: 3px;
  flex: 0 0 auto;
}
.online-profile__deck-card .ref-card__power{
  font-size: 14px;
  line-height: 1;
  font-weight: 900;
}
.online-profile__deck-card .ref-card__art{
  top: 20px;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: inset 0 -18px 24px rgba(0,0,0,.55);
}
.online-profile__card-meta{
  padding: 0 2px;
}
.online-profile__card-name{
  font-size: 12px;
  color: #f4e4c6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.online-profile__card-power{
  font-size: 12px;
  margin-top: 2px;
  color: #f0d3a5;
  font-weight: 700;
}

#${IDS.chatModal}{
  position: fixed;
  inset: 0;
  z-index: 1620;
  background: rgba(15, 9, 4, 0.9);
  display: grid;
  place-items: center;
  padding: 10px;
}
.global-chat{
  width: min(385px, 100%);
  height: min(78vh, 700px);
  max-height: 760px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  border: 1px solid rgba(181, 139, 72, 0.78);
  border-radius: 0;
  overflow: hidden;
  background:
    radial-gradient(120% 120% at 50% -15%, rgba(177, 127, 56, 0.2), transparent 58%),
    linear-gradient(180deg, rgba(31, 19, 9, 0.98), rgba(12, 7, 3, 0.98));
  box-shadow:
    0 20px 44px rgba(0, 0, 0, 0.72),
    inset 0 0 0 1px rgba(132, 92, 38, 0.7);
}
.global-chat__head{
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  min-height: 32px;
  background: linear-gradient(180deg, #7a5328, #4d2e13);
  border-bottom: 1px solid rgba(39, 23, 9, 0.95);
  box-shadow: inset 0 -1px 0 rgba(204, 157, 84, 0.46);
}
.global-chat__title{
  margin: 0;
  text-align: center;
  font: 500 17px/1 "EB Garamond", serif;
  color: #f4dcae;
  letter-spacing: 0.02em;
}
.global-chat__close{
  appearance: none;
  border: 0;
  height: 100%;
  min-width: 38px;
  background: linear-gradient(180deg, rgba(105, 65, 27, 0.98), rgba(69, 41, 16, 0.98));
  color: #f5e3bf;
  font-size: 20px;
  cursor: pointer;
}
.global-chat__close:hover{
  filter: brightness(1.12);
}
.global-chat__tools{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(133, 98, 52, 0.62);
  background: rgba(28, 17, 8, 0.98);
}
.global-chat__refresh{
  appearance: none;
  border: 1px solid rgba(181, 139, 72, 0.78);
  border-radius: 4px;
  background: rgba(58, 35, 14, 0.95);
  color: #f0cf90;
  font: 700 12px/1 "Segoe UI", Arial, sans-serif;
  padding: 4px 9px;
  cursor: pointer;
}
.global-chat__refresh:hover{
  background: rgba(77, 47, 20, 0.98);
}
.global-chat__status{
  margin-left: auto;
  color: rgba(233, 200, 138, 0.92);
  font: 700 12px/1 "Segoe UI", Arial, sans-serif;
}
.global-chat__log{
  background:
    radial-gradient(80% 120% at 90% 0, rgba(121, 84, 42, 0.2), transparent 70%),
    #120b05;
  overflow: auto;
  padding: 0;
}
.global-chat__empty{
  padding: 24px 12px;
  text-align: center;
  color: rgba(216, 189, 142, 0.85);
  font: 500 13px/1.4 "Segoe UI", Arial, sans-serif;
}
.global-chat__msg{
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 8px;
  align-items: start;
  padding: 7px 8px;
  border-bottom: 1px solid rgba(115, 83, 43, 0.58);
}
.global-chat__msg:hover{
  background: rgba(96, 68, 34, 0.35);
}
.global-chat__avatar{
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid rgba(163, 118, 59, 0.7);
  background: rgba(0, 0, 0, 0.5);
}
.global-chat__body{
  min-width: 0;
}
.global-chat__meta{
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.global-chat__name{
  color: #f0d39f;
  font: 700 13px/1.2 "Segoe UI", Arial, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 210px;
}
.global-chat__time{
  margin-left: auto;
  color: rgba(191, 164, 122, 0.88);
  font: 500 12px/1.2 "Segoe UI", Arial, sans-serif;
  white-space: nowrap;
}
.global-chat__text{
  margin-top: 2px;
  color: #f8ead0;
  font: 500 15px/1.25 "Segoe UI", Arial, sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
}
.global-chat__bar{
  display: grid;
  grid-template-columns: 1fr 38px;
  gap: 0;
  border-top: 1px solid rgba(136, 99, 52, 0.72);
  background: rgba(24, 14, 7, 0.98);
  padding: 6px 6px 8px;
}
.global-chat__input{
  height: 32px;
  border: 1px solid rgba(170, 124, 62, 0.8);
  border-right: 0;
  background: #f0e1c5;
  color: #2d1b0b;
  padding: 0 8px;
  font: 600 13px/1 "Segoe UI", Arial, sans-serif;
  outline: none;
}
.global-chat__send{
  appearance: none;
  border: 1px solid rgba(183, 140, 72, 0.88);
  background: linear-gradient(180deg, rgba(108, 71, 32, 0.95), rgba(70, 43, 17, 0.98));
  color: #ffe9be;
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
}
.global-chat__send:hover{
  filter: brightness(1.14);
}
@media (max-width: 540px){
  .online-row{
    grid-template-columns: 30px 38px 1fr 90px;
    padding: 8px 8px;
  }
  .online-row__avatar{
    width: 36px;
    height: 36px;
  }
  .online-profile__grid{
    grid-template-columns: 1fr;
  }
  .online-profile__cards{
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .global-chat{
    width: min(390px, 100%);
    height: min(82vh, 760px);
  }
  .global-chat__name{
    max-width: 180px;
  }
  .global-chat__text{
    font-size: 14px;
  }
}
`;

    document.head.appendChild(style);
  }

  function bindOnlineLink(el) {
    if (!el || el.dataset.boundOnline === "1") return;
    el.dataset.boundOnline = "1";
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (document.getElementById(IDS.chatModal)) closeGlobalChatModal();
      if (document.getElementById(IDS.modal)) closeOnlineModal();
      else openOnlineModal();
    });
  }

  function ensureOnlineLink() {
    const mainLink = document.getElementById("botbarOnlineLink");
    if (mainLink) {
      bindOnlineLink(mainLink);
      const fallback = document.getElementById(IDS.fallbackLink);
      if (fallback) fallback.remove();
      return mainLink;
    }

    const botbar = document.getElementById("botbar");
    if (!botbar) return null;

    ensureStyles();

    let fallback = document.getElementById(IDS.fallbackLink);
    if (!fallback) {
      fallback = document.createElement("a");
      fallback.id = IDS.fallbackLink;
      fallback.href = "#";
      fallback.textContent = "Онлайн: 0";
      document.body.appendChild(fallback);
    }

    bindOnlineLink(fallback);
    return fallback;
  }

  function getPlayerId() {
    let id = localStorage.getItem("cardastika:playerId") || localStorage.getItem("playerId");
    if (!id) {
      if (typeof crypto !== "undefined" && crypto?.randomUUID) id = crypto.randomUUID();
      else id = `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("cardastika:playerId", id);
      localStorage.setItem("playerId", id);
    }
    return id;
  }

  function getName() {
    const fromStorage = localStorage.getItem("playerName")
      || localStorage.getItem("cardastika:auth:active")
      || localStorage.getItem("cardastika:player");
    if (fromStorage && String(fromStorage).trim()) return String(fromStorage).trim();

    try {
      const acc = window.AccountSystem?.getActive?.();
      const name = acc?.name || acc?.nickname;
      if (name && String(name).trim()) return String(name).trim();
    } catch {
      // ignore
    }

    return "Player";
  }

  function deckPower(deck) {
    if (!Array.isArray(deck)) return null;
    let sum = 0;
    for (let i = 0; i < deck.length; i += 1) {
      const c = deck[i];
      sum += Number(c?.power ?? c?.basePower ?? 0);
    }
    return Number.isFinite(sum) && sum > 0 ? Math.round(sum) : null;
  }

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getDeckFromEnv() {
    try {
      const acc = window.AccountSystem?.getActive?.();
      if (Array.isArray(acc?.deck) && acc.deck.length) return acc.deck;
    } catch {
      // ignore
    }

    const fromStorage = safeParse(localStorage.getItem("cardastika:deck") || "null");
    return Array.isArray(fromStorage) ? fromStorage : [];
  }

  function getDeckPowerFromEnv() {
    const p = deckPower(getDeckFromEnv());
    return p == null ? 0 : p;
  }

  function getLeagueFromEnv() {
    try {
      const state = window.ProgressionSystem?.getState?.();
      if (state?.league?.name) return String(state.league.name);
      const acc = window.AccountSystem?.getActive?.();
      if (acc?.duelLeagueId) return String(acc.duelLeagueId);
    } catch {
      // ignore
    }
    const leagueLS = localStorage.getItem("cardastika:league");
    return leagueLS ? String(leagueLS) : "-";
  }

  function normalizeCardPreview(card) {
    const power = Number(card?.power ?? card?.basePower ?? 0);
    const level = Number(card?.level ?? 0);
    const rarity = String(card?.rarity ?? card?.quality ?? "").toLowerCase().trim();
    const element = normalizeCardElement(card?.element);
    return {
      id: extractCardId(card),
      title: String(card?.title || card?.name || "\u041A\u0430\u0440\u0442\u0430"),
      power: Number.isFinite(power) ? Math.max(0, Math.round(power)) : 0,
      level: Number.isFinite(level) ? Math.max(0, Math.round(level)) : 0,
      rarity,
      rarityClass: rarityClassFromValue(rarity),
      element,
      art: toCardArtUrl(card)
    };
  }

  function topCardsFromDeck(deck) {
    if (!Array.isArray(deck)) return [];
    const cards = deck.map(normalizeCardPreview);
    cards.sort((a, b) => Number(b.power || 0) - Number(a.power || 0));
    return cards.slice(0, 3);
  }

  function computeDaysInGame(createdTs) {
    const created = Number(createdTs);
    if (!Number.isFinite(created) || created <= 0) return 0;
    const diff = Math.max(0, Date.now() - created);
    return Math.max(1, Math.floor(diff / 86400000) + 1);
  }

  function buildLocalProfileSnapshot() {
    try {
      const synced = buildAndCachePublicProfileSnapshot();
      if (synced && typeof synced === "object") return synced;
    } catch {
      // ignore
    }

    try {
      const cached = readPublicProfileCache();
      if (cached && typeof cached === "object") return cached;
    } catch {
      // ignore
    }

    const state = window.ProgressionSystem?.getState?.() || null;
    const acc = window.AccountSystem?.getActive?.() || null;
    const deck = getDeckFromEnv();
    const ratings = {
      deck: getDeckPowerFromEnv(),
      duel: Number(state?.duel?.rating ?? acc?.duel?.rating ?? 0) || 0,
      arena: Number(localStorage.getItem("cardastika:arena:rating") || localStorage.getItem("cardastika:arenaRating") || 0) || 0,
      tournament: Number(localStorage.getItem("cardastika:tournament:rating") || localStorage.getItem("cardastika:tournamentRating") || 0) || 0,
      league: String(state?.league?.name || getLeagueFromEnv() || "-")
    };

    const duel = {
      played: Number(state?.duel?.played ?? acc?.duel?.played ?? 0) || 0,
      wins: Number(state?.duel?.wins ?? acc?.duel?.wins ?? 0) || 0,
      losses: Number(state?.duel?.losses ?? acc?.duel?.losses ?? 0) || 0,
      draws: Number(state?.duel?.draws ?? acc?.duel?.draws ?? 0) || 0
    };

    const bonuses = {
      xpPct: Number(state?.bonuses?.xpPct ?? 0) || 0,
      silverPct: Number(state?.bonuses?.silverPct ?? 0) || 0,
      guildPct: Number(state?.guildLevel ?? acc?.guildLevel ?? 0) || 0
    };

    return {
      version: 1,
      name: getName(),
      title: Array.isArray(state?.titles) && state.titles.length ? String(state.titles[0]) : "Достойний маг",
      subtitle: "Боєвий дракон",
      avatar: toAvatarUrl(String(localStorage.getItem("cardastika:avatarUrl") || DEFAULT_AVATAR), DEFAULT_AVATAR),
      level: Number(state?.level ?? 1) || 1,
      guildRank: String(acc?.guildRank || ""),
      ratings,
      duel,
      bonuses,
      daysInGame: computeDaysInGame(acc?.created),
      lastLoginText: "зараз у грі",
      medalsCount: Array.isArray(state?.medals) ? state.medals.length : 0,
      giftsCount: Number(localStorage.getItem("cardastika:giftsCount") || 0) || 0,
      topCards: topCardsFromDeck(deck)
    };
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function fmtNum(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return new Intl.NumberFormat("uk-UA").format(Math.round(n));
  }

  function fmtLastSeen(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return "-";
    const sec = Math.max(0, Math.round(n / 1000));
    if (sec < 5) return "зараз";
    if (sec < 60) return `${sec} с тому`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} хв тому`;
    const hr = Math.round(min / 60);
    return `${hr} год тому`;
  }

  function getEventElementTarget(event) {
    const target = event?.target;
    if (target instanceof Element) return target;
    return target?.parentElement || null;
  }

  function normalizeSnapshot(snapshotLike) {
    const src = snapshotLike && typeof snapshotLike === "object" ? snapshotLike : {};
    const rawList = Array.isArray(src.list) ? src.list : [];

    const list = rawList.map((row) => {
      const powerRaw = Number(row?.power);
      const seenRaw = Number(row?.lastSeenMsAgo);
      const levelRaw = Number(row?.level);
      return {
        playerId: String(row?.playerId || ""),
        name: String(row?.name || "Player").trim() || "Player",
        power: Number.isFinite(powerRaw) ? Math.max(0, Math.round(powerRaw)) : 0,
        league: row?.league == null ? "-" : String(row.league),
        avatar: toAvatarUrl(String(row?.avatar || DEFAULT_AVATAR), DEFAULT_AVATAR),
        level: Number.isFinite(levelRaw) ? Math.max(1, Math.round(levelRaw)) : null,
        title: String(row?.title || ""),
        lastSeenMsAgo: Number.isFinite(seenRaw) ? Math.max(0, Math.round(seenRaw)) : 0
      };
    });

    const countRaw = Number(src.count);
    return {
      count: Number.isFinite(countRaw) ? Math.max(0, Math.round(countRaw)) : list.length,
      list
    };
  }

  function sortPlayers(list) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      const aPower = Number(a?.power || 0);
      const bPower = Number(b?.power || 0);
      if (bPower !== aPower) return bPower - aPower;

      const aSeen = Number(a?.lastSeenMsAgo || 0);
      const bSeen = Number(b?.lastSeenMsAgo || 0);
      if (aSeen !== bSeen) return aSeen - bSeen;

      return String(a?.name || "").localeCompare(String(b?.name || ""), "uk", { sensitivity: "base" });
    });
  }

  function currentSearch() {
    const input = document.getElementById(IDS.search);
    return input ? String(input.value || "") : "";
  }

  function normalizeChatMessages(historyLike) {
    if (!Array.isArray(historyLike)) return [];

    const rows = [];
    for (const row of historyLike) {
      const text = String(row?.text || "").trim().slice(0, 240);
      if (!text) continue;
      const tsRaw = Number(row?.ts);
      rows.push({
        name: String(row?.name || "Гравець").trim().slice(0, 48) || "Гравець",
        text,
        ts: Number.isFinite(tsRaw) && tsRaw > 0 ? tsRaw : Date.now()
      });
    }
    return rows.slice(-CHAT_LIMIT);
  }

  function findAvatarByChatName(name) {
    const target = String(name || "").trim().toLowerCase();
    if (!target) return toAvatarUrl(DEFAULT_AVATAR, DEFAULT_AVATAR);

    const row = latestSnapshot.list.find((p) => String(p?.name || "").trim().toLowerCase() === target);
    return toAvatarUrl(row?.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR);
  }

  function formatChatAgo(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "-";

    const diffSec = Math.max(0, Math.floor((Date.now() - n) / 1000));
    if (diffSec < 15) return "щойно";
    if (diffSec < 60) return `${diffSec} с тому`;
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min} хв тому`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} год тому`;
    const d = new Date(n);
    return `${d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function updateChatStatusLabel() {
    const status = document.getElementById(IDS.chatStatus);
    if (!status) return;

    const online = Number.isFinite(Number(latestSnapshot.count))
      ? Math.max(0, Math.round(Number(latestSnapshot.count)))
      : 0;
    status.textContent = socket?.connected ? `Онлайн: ${online}` : "Підключення...";
  }

  function renderGlobalChat() {
    const logEl = document.getElementById(IDS.chatLog);
    if (!logEl) return;

    const stickToBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 42;
    if (!latestChatMessages.length) {
      logEl.innerHTML = '<div class="global-chat__empty">Повідомлень поки нема.</div>';
      return;
    }

    logEl.innerHTML = latestChatMessages.map((msg) => {
      const name = escapeHtml(msg?.name || "Гравець");
      const text = escapeHtml(msg?.text || "");
      const time = escapeHtml(formatChatAgo(msg?.ts));
      const avatar = escapeHtml(findAvatarByChatName(msg?.name));
      return `
<div class="global-chat__msg">
  <img class="global-chat__avatar" src="${avatar}" alt="${name}">
  <div class="global-chat__body">
    <div class="global-chat__meta">
      <span class="global-chat__name">${name}</span>
      <span class="global-chat__time">${time}</span>
    </div>
    <div class="global-chat__text">${text}</div>
  </div>
</div>`;
    }).join("");

    logEl.querySelectorAll(".global-chat__avatar").forEach((img) => installAvatarFallback(img, DEFAULT_AVATAR));
    if (stickToBottom) logEl.scrollTop = logEl.scrollHeight;
  }

  function joinGlobalChat(force = false) {
    if (!socket) {
      chatJoinPending = true;
      if (force) updateChatStatusLabel();
      return;
    }
    if (!socket.connected) {
      chatJoinPending = true;
      if (force) updateChatStatusLabel();
      return;
    }

    chatJoinPending = false;
    socket.emit("chat:join", { roomId: CHAT_ROOM_ID });
    if (force) updateChatStatusLabel();
  }

  function sendGlobalChatMessage() {
    const input = document.getElementById(IDS.chatInput);
    if (!input) return;

    const text = String(input.value || "").trim().slice(0, 240);
    if (!text) return;

    if (!socket || !socket.connected) {
      joinGlobalChat(true);
      return;
    }

    socket.emit("chat:msg", {
      roomId: CHAT_ROOM_ID,
      playerId: getPlayerId(),
      text
    });
    input.value = "";
  }

  function closeGlobalChatModal() {
    const modal = document.getElementById(IDS.chatModal);
    if (modal) modal.remove();
  }

  function bindGlobalChatTriggers() {
    if (chatTriggersBound) return;
    chatTriggersBound = true;

    window.addEventListener("botbar:chat-open-request", () => {
      openGlobalChatModal();
    });

    document.addEventListener("click", (ev) => {
      const target = getEventElementTarget(ev);
      if (!target) return;
      const link = target.closest('[data-stub-link="chat"]');
      if (!link) return;

      ev.preventDefault();
      openGlobalChatModal();
    }, true);
  }

  function openGlobalChatModal() {
    ensureStyles();
    if (document.getElementById(IDS.chatModal)) return;
    if (document.getElementById(IDS.modal)) closeOnlineModal();
    if (document.getElementById(IDS.profileModal)) closeProfileModal();

    const overlay = document.createElement("section");
    overlay.id = IDS.chatModal;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Загальний чат");
    overlay.innerHTML = `
<article class="global-chat">
  <header class="global-chat__head">
    <h2 class="global-chat__title">Загальний чат</h2>
    <button type="button" class="global-chat__close" id="globalChatCloseBtn" aria-label="Закрити">↩</button>
  </header>
  <div class="global-chat__tools">
    <button type="button" class="global-chat__refresh" id="globalChatRefreshBtn">Оновити</button>
    <span class="global-chat__status" id="${IDS.chatStatus}">Підключення...</span>
  </div>
  <div class="global-chat__log" id="${IDS.chatLog}" aria-live="polite"></div>
  <form class="global-chat__bar" id="${IDS.chatForm}" autocomplete="off">
    <input class="global-chat__input" id="${IDS.chatInput}" maxlength="240" placeholder="Напишіть повідомлення...">
    <button class="global-chat__send" type="submit" aria-label="Надіслати">↪</button>
  </form>
</article>`;

    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeGlobalChatModal();
    });
    document.body.appendChild(overlay);

    document.getElementById("globalChatCloseBtn")?.addEventListener("click", closeGlobalChatModal);
    document.getElementById("globalChatRefreshBtn")?.addEventListener("click", () => joinGlobalChat(true));
    document.getElementById(IDS.chatForm)?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      sendGlobalChatMessage();
    });

    renderGlobalChat();
    updateChatStatusLabel();
    joinGlobalChat(true);

    focusInputIfDesktop(document.getElementById(IDS.chatInput));
  }

  // Expose chat opener as early as possible, independent from socket/API readiness.
  window.Net = window.Net || {};
  if (typeof window.Net.openChat !== "function") {
    window.Net.openChat = openGlobalChatModal;
  }

  async function fetchPlayerProfile(playerId) {
    const id = String(playerId || "").trim();
    if (!id) return null;

    try {
      const response = await fetch(`${activeApi()}/online/${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store"
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.ok || !data?.player) return null;
      return data.player;
    } catch {
      return null;
    }
  }

  function closeProfileModal() {
    const modal = document.getElementById(IDS.profileModal);
    if (modal) modal.remove();
  }

  function profileRow(label, value) {
    return `<span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span>`;
  }

  function qualityColor(rarity) {
    const key = String(rarity || "").toLowerCase();
    return QUALITY_COLOR[key] || "#d9edff";
  }

  function renderProfileCards(cards) {
    const rows = Array.isArray(cards) ? cards.slice(0, 3) : [];
    if (!rows.length) {
      return `<div class="online-profile__panel"><h3 class="online-profile__panel-title">\u041D\u0430\u0439\u0441\u0438\u043B\u044C\u043D\u0456\u0448\u0456 \u043A\u0430\u0440\u0442\u0438</h3><div class="online-empty">\u041D\u0435\u043C\u0430\u0454 \u0434\u0430\u043D\u0438\u0445 \u043F\u043E \u043A\u0430\u0440\u0442\u0430\u0445.</div></div>`;
    }

    const items = rows.map((card) => {
      const title = escapeHtml(card?.title || "\u041A\u0430\u0440\u0442\u0430");
      const element = normalizeCardElement(card?.element);
      const rarityClass = rarityClassFromValue(card?.rarityClass || card?.rarity || card?.quality);
      const artPrimary = escapeHtml(toCardArtUrl(card));
      const artSecondary = escapeHtml(toCardArtBackupUrl(card));
      const artFallback = escapeHtml(cardArtFallbackUrl(card));
      const power = fmtNum(card?.power || 0);
      const level = Number(card?.level || 0);
      const rarity = String(card?.rarity || "").toLowerCase();
      const color = qualityColor(rarity);
      const meta = level > 0 ? `${power} | \u0420\u0456\u0432 ${level}` : power;
      const artLayers = [
        `url(${artPrimary})`,
        artSecondary ? `url(${artSecondary})` : "",
        `url(${artFallback})`,
        "radial-gradient(120% 90% at 30% 20%, rgba(255,255,255,.08), transparent 55%)",
        "radial-gradient(140% 120% at 70% 80%, rgba(0,0,0,.55), transparent 60%)",
        "linear-gradient(180deg, rgba(255,255,255,.04), rgba(0,0,0,.40))"
      ].filter(Boolean).join(",");
      return `
<div class="online-profile__card-slot">
  <div class="online-profile__deck-card ref-card elem-${element} ${rarityClass}" role="img" aria-label="${title}">
    <span class="ref-card__top">
      <span class="ref-card__type"></span>
      <span class="ref-card__power">${power}</span>
    </span>
    <span class="ref-card__art" style="background-image:${artLayers};"></span>
    <span class="ref-card__elem"></span>
  </div>
  <div class="online-profile__card-meta">
    <div class="online-profile__card-name" title="${title}">${title}</div>
    <div class="online-profile__card-power" style="color:${color}">\u2694 ${meta}</div>
  </div>
</div>`;
    }).join("");

    return `<div class="online-profile__panel"><h3 class="online-profile__panel-title">\u041D\u0430\u0439\u0441\u0438\u043B\u044C\u043D\u0456\u0448\u0456 \u043A\u0430\u0440\u0442\u0438</h3><div class="online-profile__cards">${items}</div></div>`;
  }

  function profileFromFallback(playerRow) {
    const row = playerRow || {};
    return {
      name: row.name || "Player",
      power: row.power || 0,
      league: row.league || "-",
      avatar: toAvatarUrl(row.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR),
      profile: {
        level: row.level || 1,
        title: row.title || "Достойний маг",
        subtitle: "Боєвий дракон",
        avatar: toAvatarUrl(row.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR),
        ratings: {
          deck: row.power || 0,
          duel: 0,
          arena: 0,
          tournament: 0,
          league: row.league || "-"
        },
        duel: { played: 0, wins: 0, losses: 0, draws: 0 },
        bonuses: { xpPct: 0, silverPct: 0, guildPct: 0 },
        daysInGame: 0,
        medalsCount: 0,
        giftsCount: 0,
        topCards: []
      }
    };
  }

  function renderProfileModal(player, fallbackRow) {
    closeProfileModal();

    const data = player || profileFromFallback(fallbackRow);
    const p = data.profile || {};
    const ratings = p.ratings || {};
    const duel = p.duel || {};
    const bonuses = p.bonuses || {};

    const name = data.name || p.name || "Player";
    const avatar = toAvatarUrl(p.avatar || data.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR);
    const title = p.title || "Достойний маг";
    const subtitle = p.subtitle || "Боєвий дракон";
    const level = Number(p.level || 1) || 1;

    const overlay = document.createElement("section");
    overlay.id = IDS.profileModal;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `Профіль мага ${name}`);
    overlay.innerHTML = `
<article class="online-profile__card">
  <div class="online-profile__head">
    <h2 class="online-profile__title">Профіль мага</h2>
    <div class="online-profile__head-actions">
      <button type="button" class="online-profile__back" id="onlineProfileBackBtn">Назад</button>
      <button type="button" class="online-profile__close" id="onlineProfileCloseBtn">Закрити</button>
    </div>
  </div>
  <div class="online-profile__content">
    <section class="online-profile__hero">
      <img class="online-profile__avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}">
      <div>
        <div class="online-profile__name">${escapeHtml(name)}</div>
        <div class="online-profile__subtitle">${escapeHtml(title)} • ${escapeHtml(subtitle)}</div>
        <div class="online-profile__chips">
          <span class="online-profile__chip">Рівень: ${fmtNum(level)}</span>
          <span class="online-profile__chip">Сила колоди: ${fmtNum(ratings.deck)}</span>
          <span class="online-profile__chip">Ліга: ${escapeHtml(ratings.league || data.league || "-")}</span>
        </div>
      </div>
    </section>

    <section class="online-profile__grid">
      <article class="online-profile__panel">
        <h3 class="online-profile__panel-title">Рейтинги</h3>
        <div class="online-profile__kv">
          ${profileRow("Колода", fmtNum(ratings.deck))}
          ${profileRow("Дуелі", fmtNum(ratings.duel))}
          ${profileRow("Арена", fmtNum(ratings.arena))}
          ${profileRow("Турнір", fmtNum(ratings.tournament))}
        </div>
      </article>

      <article class="online-profile__panel">
        <h3 class="online-profile__panel-title">Бойова статистика</h3>
        <div class="online-profile__kv">
          ${profileRow("Боїв", fmtNum(duel.played))}
          ${profileRow("Перемог", fmtNum(duel.wins))}
          ${profileRow("Поразок", fmtNum(duel.losses))}
          ${profileRow("Нічиїх", fmtNum(duel.draws))}
        </div>
      </article>

      <article class="online-profile__panel">
        <h3 class="online-profile__panel-title">Бонуси</h3>
        <div class="online-profile__kv">
          ${profileRow("XP", `+${fmtNum(bonuses.xpPct)}%`)}
          ${profileRow("Срібло", `+${fmtNum(bonuses.silverPct)}%`)}
          ${profileRow("Гільдія", `+${fmtNum(bonuses.guildPct)}%`)}
        </div>
      </article>

      <article class="online-profile__panel">
        <h3 class="online-profile__panel-title">Активність</h3>
        <div class="online-profile__kv">
          ${profileRow("Днів у грі", fmtNum(p.daysInGame || 0))}
          ${profileRow("Медалей", fmtNum(p.medalsCount || 0))}
          ${profileRow("Подарунків", fmtNum(p.giftsCount || 0))}
          ${profileRow("Останній вхід", p.lastLoginText || fmtLastSeen(data.lastSeenMsAgo || 0))}
        </div>
      </article>
    </section>

    ${renderProfileCards(p.topCards)}
  </div>
</article>`;

    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeProfileModal();
    });

    document.body.appendChild(overlay);
    installAvatarFallback(overlay.querySelector(".online-profile__avatar"));

    document.getElementById("onlineProfileCloseBtn")?.addEventListener("click", () => {
      closeProfileModal();
      closeOnlineModal();
    });

    document.getElementById("onlineProfileBackBtn")?.addEventListener("click", () => {
      closeProfileModal();
    });
  }

  async function openPlayerProfile(playerId) {
    const id = String(playerId || "").trim();
    if (!id) return;

    const fallbackRow = latestSnapshot.list.find((row) => String(row.playerId) === id) || null;
    const data = await fetchPlayerProfile(id);
    renderProfileModal(data, fallbackRow);
  }

  function renderList(searchValue = "") {
    const listEl = document.getElementById(IDS.list);
    const statEl = document.getElementById(IDS.stat);
    if (!listEl) return;

    const q = String(searchValue || "").trim().toLowerCase();
    const sorted = sortPlayers(latestSnapshot.list);
    const filtered = q
      ? sorted.filter((p) => String(p.name || "").toLowerCase().includes(q))
      : sorted;

    if (statEl) {
      statEl.textContent = `Онлайн зараз: ${latestSnapshot.count}. Показано: ${filtered.length}. Натисни на мага для профілю.`;
    }

    if (!filtered.length) {
      listEl.innerHTML = `<div class="online-empty">Гравців не знайдено.</div>`;
      return;
    }

    listEl.innerHTML = filtered.slice(0, LIST_LIMIT).map((p, i) => {
      const name = escapeHtml(p.name || "Player");
      const power = escapeHtml(fmtNum(p.power));
      const avatar = escapeHtml(toAvatarUrl(p.avatar || DEFAULT_AVATAR, DEFAULT_AVATAR));
      return `
<button class="online-row" type="button" data-player-id="${escapeHtml(p.playerId)}">
  <div class="online-row__rank">${i + 1}</div>
  <img class="online-row__avatar" src="${avatar}" alt="${name}">
  <div>
    <div class="online-row__name">${name}</div>
  </div>
  <div class="online-row__power">? ${power}</div>
</button>`;
    }).join("");

    listEl.querySelectorAll(".online-row__avatar").forEach((img) => installAvatarFallback(img));

    listEl.querySelectorAll(".online-row[data-player-id]").forEach((row) => {
      row.addEventListener("click", () => {
        openPlayerProfile(row.getAttribute("data-player-id") || "");
      });
    });
  }

  function closeOnlineModal() {
    closeProfileModal();

    const modal = document.getElementById(IDS.modal);
    if (modal) modal.remove();

    if (escHandler) {
      document.removeEventListener("keydown", escHandler);
      escHandler = null;
    }
  }

  function openOnlineModal() {
    ensureStyles();
    if (document.getElementById(IDS.modal)) return;

    const overlay = document.createElement("section");
    overlay.id = IDS.modal;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Маги онлайн");
    overlay.innerHTML = `
<article class="online-modal__card">
  <div class="online-modal__head">
    <h2 class="online-modal__title">Маги онлайн</h2>
    <button type="button" class="online-modal__close" id="onlinePresenceCloseBtn">Закрити</button>
  </div>
  <div class="online-modal__search">
    <input id="${IDS.search}" type="text" placeholder="Пошук мага по імені" autocomplete="off">
    <button type="button" id="onlinePresenceFindBtn">Знайти</button>
  </div>
  <div class="online-modal__stat" id="${IDS.stat}"></div>
  <div class="online-modal__list" id="${IDS.list}"></div>
</article>`;

    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeOnlineModal();
    });

    document.body.appendChild(overlay);

    document.getElementById("onlinePresenceCloseBtn")?.addEventListener("click", closeOnlineModal);

    const input = document.getElementById(IDS.search);
    const findBtn = document.getElementById("onlinePresenceFindBtn");
    const applySearch = () => renderList(currentSearch());

    findBtn?.addEventListener("click", applySearch);
    input?.addEventListener("input", applySearch);
    input?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        applySearch();
      }
    });

    escHandler = (ev) => {
      if (ev.key === "Escape") {
        if (document.getElementById(IDS.profileModal)) closeProfileModal();
        else closeOnlineModal();
      }
    };
    document.addEventListener("keydown", escHandler);

    renderList();
    focusInputIfDesktop(input);
  }

  function updatePresenceUI(snapshotLike) {
    latestSnapshot = normalizeSnapshot(snapshotLike);

    const link = ensureOnlineLink();
    if (link) {
      const count = Number.isFinite(Number(latestSnapshot.count)) ? latestSnapshot.count : 0;
      link.textContent = `Онлайн: ${count}`;
      link.title = `Показати гравців онлайн (${count})`;
    }

    if (document.getElementById(IDS.modal)) {
      renderList(currentSearch());
    }
    if (document.getElementById(IDS.chatModal)) {
      renderGlobalChat();
      updateChatStatusLabel();
    }
  }

  async function refreshViaRest() {
    try {
      const response = await fetch(`${activeApi()}/online?limit=${LIST_LIMIT}`, {
        method: "GET",
        cache: "no-store"
      });
      if (!response.ok) return;
      const data = await response.json();
      updatePresenceUI(data);
    } catch {
      // ignore
    }
  }

  function emitPresenceHello(playerId) {
    socket?.emit("presence:hello", {
      playerId,
      name: getName(),
      power: getDeckPowerFromEnv(),
      league: getLeagueFromEnv(),
      profile: buildLocalProfileSnapshot()
    });
  }

  function emitPresencePing(playerId) {
    socket?.emit("presence:ping", {
      playerId,
      power: getDeckPowerFromEnv(),
      league: getLeagueFromEnv(),
      profile: buildLocalProfileSnapshot()
    });
  }

  function exposeApi() {
    window.Net = window.Net || {};
    window.Net.socket = socket;
    window.Net.apiBase = activeApi();
    window.Net.getPlayerId = getPlayerId;
    window.Net.getName = getName;
    window.Net.openOnline = openOnlineModal;
    window.Net.openChat = openGlobalChatModal;
  }

  async function init() {
    bindGlobalChatTriggers();
    ensureOnlineLink();
    updatePresenceUI({ count: 0, list: [] });

    window.addEventListener("botbar:links-ready", () => {
      updatePresenceUI(latestSnapshot);
    });

    apiBase = await resolveApiBase();
    if (apiBase) {
      console.info("[net] online api:", apiBase);
      try {
        localStorage.setItem("cardastika:apiLast", apiBase);
      } catch {
        // ignore
      }
    }

    await refreshViaRest();

    if (restInterval) clearInterval(restInterval);
    restInterval = setInterval(refreshViaRest, REST_REFRESH_MS);

    try {
      await loadScript(SOCKET_IO_CDN);
    } catch (err) {
      console.warn("[net] socket.io client load failed", err);
      exposeApi();
      return;
    }

    if (typeof io !== "function") {
      console.warn("[net] socket.io global is missing");
      exposeApi();
      return;
    }

    try {
      socket = io(activeApi(), { transports: ["websocket", "polling"] });
    } catch (err) {
      console.warn("[net] socket connect failed", err);
      exposeApi();
      return;
    }

    const playerId = getPlayerId();

    socket.on("connect", () => {
      emitPresenceHello(playerId);
      updateChatStatusLabel();
      if (chatJoinPending || document.getElementById(IDS.chatModal)) {
        joinGlobalChat(true);
      }

      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        emitPresencePing(playerId);
      }, PING_INTERVAL_MS);
    });

    socket.on("presence:update", (snapshot) => {
      try {
        updatePresenceUI(snapshot);
      } catch (err) {
        console.warn("[net] presence UI failed", err);
      }
    });

    socket.on("chat:history", (history) => {
      latestChatMessages = normalizeChatMessages(history);
      renderGlobalChat();
      updateChatStatusLabel();
    });

    socket.on("chat:msg", (message) => {
      const rows = normalizeChatMessages([message]);
      if (!rows.length) return;
      latestChatMessages = [...latestChatMessages, rows[0]].slice(-CHAT_LIMIT);
      renderGlobalChat();
    });

    socket.on("disconnect", () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      updateChatStatusLabel();
    });

    exposeApi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();



