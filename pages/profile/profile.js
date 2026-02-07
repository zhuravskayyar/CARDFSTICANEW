import "../../src/progression-system.js";
import { getDuelLeagueIconPath } from "../../src/core/leagues.js";
import { emitCampaignEvent } from "../../src/campaign/campaign-events.js";

const AUTH_DB_KEY = "cardastika:auth:users";
const AUTH_ACTIVE_KEY = "cardastika:auth:active";
const AUTH_REMEMBER_KEY = "cardastika:auth:remember";
const FIRST_OPEN_KEY = "cardastika:onboarding:seen";

function asInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}

function fmtNum(v) {
  return String(Math.max(0, asInt(v, 0))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? "");
  return el;
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

function ensureActiveAccount() {
  const acc = window.AccountSystem?.getActive?.() || null;
  if (acc) return acc;

  const authName = String(localStorage.getItem(AUTH_ACTIVE_KEY) || "").trim();
  if (!authName) return null;
  if (!window.AccountSystem?.exists?.(authName)) return null;

  try {
    window.AccountSystem?.setActive?.(authName);
  } catch {
    return null;
  }
  return window.AccountSystem?.getActive?.() || null;
}

function activeAccountName(acc) {
  return (
    String(acc?.name || "").trim() ||
    localStorage.getItem(AUTH_ACTIVE_KEY) ||
    localStorage.getItem("activeAccount") ||
    "Гравець"
  );
}

function readDeckPower(acc) {
  const deck =
    (Array.isArray(acc?.deck) && acc.deck) ||
    safeParse(localStorage.getItem("cardastika:deck") || "null") ||
    [];
  if (!Array.isArray(deck)) return 0;
  return deck.reduce((sum, card) => sum + Number(card?.power ?? card?.basePower ?? 0), 0);
}

function titleLabel(id) {
  if (id === "tournamentChampion") return "Чемпіон турніру";
  if (id === "duelChampion") return "Чемпіон дуелей";
  if (id === "absoluteChampion") return "Абсолютний чемпіон";
  return "";
}

function computeDaysInGame(acc) {
  const created = asInt(acc?.created, 0);
  if (created <= 0) return 1;
  const now = Date.now();
  const diffMs = Math.max(0, now - created);
  return Math.max(1, Math.floor(diffMs / 86400000) + 1);
}

function readGiftsCount() {
  const raw = safeParse(localStorage.getItem("cardastika:gifts") || "null");
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === "object") return Object.keys(raw).length;
  return 0;
}

function showStubToast(message) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  host.appendChild(toast);
  setTimeout(() => toast.classList.add("is-show"), 10);
  setTimeout(() => {
    toast.classList.remove("is-show");
    setTimeout(() => toast.remove(), 220);
  }, 1800);
}

function loadAuthUsers() {
  const raw = localStorage.getItem(AUTH_DB_KEY);
  const parsed = raw ? safeParse(raw) : {};
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveAuthUsers(users) {
  localStorage.setItem(AUTH_DB_KEY, JSON.stringify(users || {}));
}

function isProfileRegistered(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  const users = loadAuthUsers();
  return !!users[n];
}

function validAuthName(name) {
  const n = String(name || "").trim();
  if (n.length < 3 || n.length > 24) return false;
  return /^[a-zA-Z0-9._\-А-Яа-яІіЇїЄєҐґ]+$/.test(n);
}

function validAuthPass(pass) {
  const p = String(pass || "");
  return p.length >= 6 && p.length <= 64;
}

async function sha256(text) {
  const enc = new TextEncoder().encode(String(text || ""));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function snapshotCurrentGameState() {
  const deckRaw = safeParse(localStorage.getItem("cardastika:deck") || "null");
  const invRaw = safeParse(localStorage.getItem("cardastika:inventory") || "null");
  const deck = Array.isArray(deckRaw) ? deckRaw.slice(0, 9) : [];
  const inventory = Array.isArray(invRaw) && invRaw.length ? invRaw : deck.slice();
  const silver = readNumFromStorage("cardastika:silver", readNumFromStorage("cardastika:gems", 0));
  const diamonds = readNumFromStorage("cardastika:diamonds", 0);
  const gold = readNumFromStorage("cardastika:gold", 0);
  return { deck, inventory, silver, diamonds, gold };
}

function closeSettingsModal() {
  const host = document.getElementById("modalHost");
  if (!host) return;
  host.classList.remove("is-open");
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = "";
}

function closeRegisterModal() {
  const host = document.getElementById("modalHost");
  if (!host) return;
  host.classList.remove("is-open");
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = "";
}

function logout() {
  localStorage.removeItem(AUTH_ACTIVE_KEY);
  localStorage.removeItem("activeAccount");
  localStorage.removeItem("cardastika:deck");
  localStorage.removeItem("cardastika:inventory");
  localStorage.removeItem("cardastika:gold");
  localStorage.removeItem("cardastika:silver");
  localStorage.removeItem("cardastika:gems");
  localStorage.removeItem("cardastika:profile");
  window.location.href = "../auth/auth.html";
}

function openRegisterModal() {
  const host = document.getElementById("modalHost");
  if (!host) return;

  host.innerHTML = `
    <div class="profile-auth-modal">
      <div class="profile-auth-modal__backdrop" data-register-close></div>
      <section class="profile-auth-modal__panel" role="dialog" aria-modal="true" aria-label="Реєстрація профілю">
        <h3 class="profile-auth-modal__title">Реєстрація профілю</h3>
        <p class="profile-auth-modal__text">Збереження профілю відкриває реєстрацію нового акаунта.</p>

        <label class="profile-auth-modal__label" for="regNameInput">Ім'я</label>
        <input class="profile-auth-modal__input" id="regNameInput" maxlength="24" placeholder="Наприклад, Маг_01">

        <label class="profile-auth-modal__label" for="regPassInput">Пароль</label>
        <input class="profile-auth-modal__input" id="regPassInput" type="password" maxlength="64" placeholder="Мінімум 6 символів">

        <div class="profile-auth-modal__msg" id="regAuthMsg"></div>

        <div class="profile-auth-modal__actions">
          <button type="button" class="profile-auth-modal__btn is-secondary" data-register-close>Скасувати</button>
          <button type="button" class="profile-auth-modal__btn is-primary" id="regAuthSubmitBtn">Зареєструвати</button>
        </div>
      </section>
    </div>
  `;

  host.classList.add("is-open");
  host.setAttribute("aria-hidden", "false");

  host.querySelectorAll("[data-register-close]").forEach((el) => el.addEventListener("click", closeRegisterModal));

  const nameEl = document.getElementById("regNameInput");
  const passEl = document.getElementById("regPassInput");
  const msgEl = document.getElementById("regAuthMsg");
  const submitBtn = document.getElementById("regAuthSubmitBtn");

  const setMsg = (text, kind = "") => {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.classList.remove("is-err", "is-ok");
    if (kind === "err") msgEl.classList.add("is-err");
    if (kind === "ok") msgEl.classList.add("is-ok");
  };

  submitBtn?.addEventListener("click", async () => {
    const name = String(nameEl?.value || "").trim();
    const pass = String(passEl?.value || "");

    if (!validAuthName(name)) {
      setMsg("Некоректне ім'я (3-24 символи).", "err");
      return;
    }
    if (!validAuthPass(pass)) {
      setMsg("Пароль має бути 6-64 символів.", "err");
      return;
    }

    submitBtn.disabled = true;
    try {
      const users = loadAuthUsers();
      if (users[name]) {
        setMsg("Користувач вже існує.", "err");
        return;
      }

      const passHash = await sha256(pass);
      users[name] = { passHash, created: Date.now() };
      saveAuthUsers(users);

      const state = snapshotCurrentGameState();
      if (!Array.isArray(state.deck) || state.deck.length !== 9) {
        setMsg("Некоректна колода. Почни гру заново і спробуй ще раз.", "err");
        return;
      }

      if (window.AccountSystem?.create && window.AccountSystem?.setActive && window.AccountSystem?.exists) {
        if (!window.AccountSystem.exists(name)) {
          window.AccountSystem.create(name, state.deck, {
            starterInventory: state.inventory,
            silver: state.silver,
            diamonds: state.diamonds,
            gold: state.gold,
          });
        }
        window.AccountSystem.setActive(name);
      }

      localStorage.setItem(AUTH_ACTIVE_KEY, name);
      localStorage.setItem(AUTH_REMEMBER_KEY, "1");
      localStorage.setItem(FIRST_OPEN_KEY, "1");

      try {
        emitCampaignEvent("profile_saved");
      } catch {
        // ignore
      }

      setMsg("Реєстрацію збережено.", "ok");
      showStubToast("Профіль зареєстровано.");
      setTimeout(() => {
        closeRegisterModal();
        render();
      }, 220);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function openSettingsModal() {
  const host = document.getElementById("modalHost");
  if (!host) return;

  const acc = ensureActiveAccount();
  const name = activeAccountName(acc);
  const registered = isProfileRegistered(name);

  const saveBtnHtml = registered
    ? ""
    : `<button type="button" class="profile-auth-modal__btn is-primary" id="saveProfileBtn">Зберегти профіль</button>`;

  host.innerHTML = `
    <div class="profile-auth-modal">
      <div class="profile-auth-modal__backdrop" data-settings-close></div>
      <section class="profile-auth-modal__panel" role="dialog" aria-modal="true" aria-label="Налаштування профілю">
        <h3 class="profile-auth-modal__title">Налаштування</h3>
        <p class="profile-auth-modal__text">Керування профілем для <b>${name}</b>.</p>
        <div class="profile-auth-modal__actions">
          ${saveBtnHtml}
          <button type="button" class="profile-auth-modal__btn is-secondary" id="logoutBtn">Вийти</button>
        </div>
        <div class="profile-auth-modal__actions">
          <button type="button" class="profile-auth-modal__btn is-secondary" data-settings-close>Закрити</button>
        </div>
      </section>
    </div>
  `;

  host.classList.add("is-open");
  host.setAttribute("aria-hidden", "false");

  host.querySelectorAll("[data-settings-close]").forEach((el) => {
    el.addEventListener("click", closeSettingsModal);
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    closeSettingsModal();
    logout();
  });

  document.getElementById("saveProfileBtn")?.addEventListener("click", () => {
    closeSettingsModal();
    openRegisterModal();
  });
}

function render() {
  const acc = ensureActiveAccount();
  const state = window.ProgressionSystem?.getState?.() || null;

  const name = activeAccountName(acc);
  const level = asInt(state?.level, 1);
  const deckPower = asInt(readDeckPower(acc), 0);
  const duelRating = asInt(state?.duel?.rating, 0);
  const duelPlayed = asInt(state?.duel?.played, 0);
  const duelWins = asInt(state?.duel?.wins, 0);
  const duelLosses = asInt(state?.duel?.losses, 0);
  const duelDraws = asInt(state?.duel?.draws, 0);
  const medals = Array.isArray(state?.medals) ? state.medals : [];
  const titles = Array.isArray(state?.titles) ? state.titles : [];
  const giftsCount = readGiftsCount();

  const silver = asInt(acc?.silver, readNumFromStorage("cardastika:silver", 0));
  const gold = asInt(acc?.gold, readNumFromStorage("cardastika:gold", 0));

  const arenaRating = readFirstNum(["cardastika:arena:rating", "cardastika:arenaRating"], null);
  const tournamentRating = readFirstNum(
    ["cardastika:tournament:rating", "cardastika:tournamentRating", "cardastika:tournament:wins"],
    null
  );

  setText("profileName", name);
  setText("profLevel", level);
  setText("profDeckPower", fmtNum(deckPower));
  setText("ratingDeck", fmtNum(deckPower));
  setText("ratingDuels", fmtNum(duelRating));
  setText("ratingDuelsSub", `${fmtNum(duelPlayed)} боїв • ${fmtNum(silver)} срібла • ${fmtNum(gold)} золота`);
  setText("ratingArena", arenaRating == null ? "—" : fmtNum(arenaRating));
  setText("ratingTournament", tournamentRating == null ? "—" : fmtNum(tournamentRating));

  const avatar = document.getElementById("profAvatar");
  if (avatar) {
    const src = String(localStorage.getItem("cardastika:avatarUrl") || "").trim();
    if (src) avatar.src = src;
  }

  const league = state?.league || null;
  setText("profLeagueName", league?.name || "Без ліги");
  const leagueIcon = document.getElementById("profLeagueIcon");
  if (leagueIcon) leagueIcon.src = getDuelLeagueIconPath(league?.id || "league-gray-1");

  const bestTitle = titleLabel(String(titles[0] || ""));
  setText("recTitle", bestTitle || "Титулів немає");
  setText("recMedals", medals.length ? `${fmtNum(medals.length)} шт.` : "Медалей немає");
  setText("recTournament", titles.includes("tournamentChampion") ? "Чемпіон" : "Нагород немає");
  if (duelPlayed > 0) {
    setText("recAchievement", `В:${fmtNum(duelWins)} П:${fmtNum(duelLosses)} Н:${fmtNum(duelDraws)}`);
  } else {
    setText("recAchievement", "Досягнень немає");
  }

  const xpBonus = asInt(state?.bonuses?.xpPct, 0);
  const silverBonus = asInt(state?.bonuses?.silverPct, 0);
  const guildLevel = asInt(state?.guildLevel, 0);
  const bonusParts = [];
  if (xpBonus > 0) bonusParts.push(`XP +${xpBonus}%`);
  if (silverBonus > 0) bonusParts.push(`Срібло +${silverBonus}%`);
  if (guildLevel > 0) bonusParts.push(`Гільдія +${guildLevel}%`);
  setText("profBonuses", bonusParts.length ? bonusParts.join(", ") : "Бонусів немає.");

  const days = computeDaysInGame(acc);
  const xpTotal = asInt(state?.xpTotal, 0);
  const xpPerHour = Math.max(0, Math.round(xpTotal / Math.max(1, days * 24)));
  setText("profXpHour", fmtNum(xpPerHour));
  setText("profXpPct", asInt(state?.duel?.leagueProgress?.pct, 0));
  setText("profDays", fmtNum(days));
  setText("profGifts", giftsCount > 0 ? `Подарунків: ${fmtNum(giftsCount)}` : "Подарунків немає.");
}

function bind() {
  document.getElementById("btnMail")?.addEventListener("click", () => showStubToast("Пошта скоро буде доступна."));
  document.getElementById("btnDeck")?.addEventListener("click", () => {
    window.location.href = "../deck/deck.html";
  });
  document.getElementById("btnEquipment")?.addEventListener("click", () => {
    window.location.href = "../equipment/equipment.html";
  });
  document.getElementById("btnAllGifts")?.addEventListener("click", () => showStubToast("Подарунків поки немає."));
  document.getElementById("btnSettings")?.addEventListener("click", openSettingsModal);

  window.addEventListener("storage", render);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bind();
  render();
});
