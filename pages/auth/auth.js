import "../../src/account.js";

const DB_KEY = "cardastika:auth:users";
const ACTIVE_KEY = "cardastika:auth:active";
const REMEMBER_KEY = "cardastika:auth:remember";
const FIRST_OPEN_KEY = "cardastika:onboarding:seen";

const STARTER_DECK_SIZE = 9;
const STARTER_CARD_POWER = 12;
const STARTER_SILVER = 1500;
const STARTER_DIAMONDS = 0;
const STARTER_GOLD = 0;

const RARITY_TO_NUM = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  mythic: 6,
  "rarity-1": 1,
  "rarity-2": 2,
  "rarity-3": 3,
  "rarity-4": 4,
  "rarity-5": 5,
  "rarity-6": 6,
};

const welcomeScreen = document.getElementById("welcomeScreen");
const authPanel = document.getElementById("authPanel");
const startNewBtn = document.getElementById("startNewBtn");
const startLoginBtn = document.getElementById("startLoginBtn");
const backToWelcomeBtn = document.getElementById("backToWelcomeBtn");

const form = document.getElementById("authForm");
const nameEl = document.getElementById("name");
const passEl = document.getElementById("pass");
const rememberEl = document.getElementById("remember");
const msgEl = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");
const subText = document.getElementById("subText");
const togglePassBtn = document.getElementById("togglePass");

const params = new URLSearchParams(location.search);
const from = String(params.get("from") || "").toLowerCase().trim();

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function markOnboardingSeen() {
  try {
    localStorage.setItem(FIRST_OPEN_KEY, "1");
  } catch {
    // ignore
  }
}

function setMsg(text, kind = "") {
  msgEl.textContent = text || "";
  msgEl.classList.remove("is-err", "is-ok");
  if (kind === "err") msgEl.classList.add("is-err");
  if (kind === "ok") msgEl.classList.add("is-ok");
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(DB_KEY, JSON.stringify(users));
}

function normName(v) {
  return String(v || "").trim();
}

function validName(name) {
  if (name.length < 3 || name.length > 24) return false;
  return /^[a-zA-Z0-9._\-А-Яа-яІіЇїЄєҐґ]+$/.test(name);
}

function validPass(pass) {
  return pass.length >= 6 && pass.length <= 64;
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function setModeLogin() {
  if (submitBtn) submitBtn.textContent = "Увійти";
  if (subText) subText.textContent = "Реєстрація доступна у профілі через кнопку «Зберегти профіль».";
  setMsg("");
}

function showAuth(show) {
  if (!welcomeScreen || !authPanel) return;
  welcomeScreen.classList.toggle("is-hidden", show);
  welcomeScreen.hidden = !!show;
  authPanel.classList.toggle("is-hidden", !show);
  authPanel.hidden = !show;
  if (show) setModeLogin();
}

togglePassBtn?.addEventListener("click", () => {
  const isPass = passEl.type === "password";
  passEl.type = isPass ? "text" : "password";
  togglePassBtn.textContent = isPass ? "Сховати" : "Показати";
});

(function initRemember() {
  const remember = localStorage.getItem(REMEMBER_KEY);
  if (rememberEl) rememberEl.checked = remember !== "0";
  const active = localStorage.getItem(ACTIVE_KEY);
  if (active && nameEl) nameEl.value = active;
})();

function setActive(name) {
  localStorage.setItem(ACTIVE_KEY, name);
  localStorage.setItem(REMEMBER_KEY, rememberEl && rememberEl.checked ? "1" : "0");

  if (window.AccountSystem?.setActive) {
    try {
      window.AccountSystem.setActive(name);
    } catch {
      // ignore
    }
  }
}

function redirectAfterAuth() {
  markOnboardingSeen();
  if (from === "profile") {
    window.location.href = "../profile/profile.html";
    return;
  }
  window.location.href = "../../index.html";
}

function rarityToNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return clamp(Math.round(raw), 1, 6);
  const s = String(raw || "").toLowerCase().trim();
  if (RARITY_TO_NUM[s]) return RARITY_TO_NUM[s];
  const m = s.match(/^rarity-([1-6])$/);
  if (m) return Number(m[1]);
  return 1;
}

function normalizeElement(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (["fire", "water", "air", "earth"].includes(s)) return s;
  if (s === "wind") return "air";
  return "earth";
}

function buildStarterCard(base, idx) {
  const num = String(idx + 1).padStart(2, "0");
  const id = String(base?.id || `starter_${num}`);
  return {
    id,
    name: String(base?.name || base?.title || id),
    element: normalizeElement(base?.element),
    power: STARTER_CARD_POWER,
    basePower: STARTER_CARD_POWER,
    rarity: rarityToNumber(base?.rarity),
    level: 1,
  };
}

async function createStarterDeck() {
  const out = [];
  try {
    const r = await fetch("../../data/cards.json", { cache: "no-store" });
    if (r.ok) {
      const json = await r.json();
      const cards = Array.isArray(json?.cards) ? json.cards : [];
      const starters = cards.filter((c) => c && typeof c === "object" && String(c.id || "").startsWith("starter_"));
      for (let i = 0; i < Math.min(STARTER_DECK_SIZE, starters.length); i++) out.push(buildStarterCard(starters[i], i));
    }
  } catch {
    // ignore
  }

  if (out.length < STARTER_DECK_SIZE) {
    try {
      const r = await fetch("../../assets/data/cards.base.json", { cache: "no-store" });
      if (r.ok) {
        const pool = await r.json();
        if (Array.isArray(pool)) {
          for (let i = out.length; i < Math.min(STARTER_DECK_SIZE, pool.length); i++) {
            out.push(buildStarterCard(pool[i], i));
          }
        }
      }
    } catch {
      // ignore
    }
  }

  for (let i = out.length; i < STARTER_DECK_SIZE; i++) out.push(buildStarterCard(null, i));
  return out;
}

async function ensureGameAccount(name) {
  const hasAccountSystem = !!window.AccountSystem?.create && !!window.AccountSystem?.exists;
  if (!hasAccountSystem) return;

  try {
    if (window.AccountSystem.exists(name)) return;
    const starterDeck = await createStarterDeck();
    window.AccountSystem.create(name, starterDeck, {
      silver: STARTER_SILVER,
      diamonds: STARTER_DIAMONDS,
      gold: STARTER_GOLD,
      starterInventory: starterDeck,
    });
  } catch (err) {
    console.warn("[auth] failed to ensure game account, using storage fallback", err);
    const starterDeck = await createStarterDeck();
    localStorage.setItem("cardastika:deck", JSON.stringify(starterDeck));
    localStorage.setItem("cardastika:inventory", JSON.stringify(starterDeck));
    localStorage.setItem("cardastika:gold", String(STARTER_GOLD));
    localStorage.setItem("cardastika:diamonds", String(STARTER_DIAMONDS));
    localStorage.setItem("cardastika:silver", String(STARTER_SILVER));
    localStorage.setItem("cardastika:gems", String(STARTER_SILVER));
  }
}

startNewBtn?.addEventListener("click", async () => {
  markOnboardingSeen();
  localStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem("activeAccount");
  localStorage.removeItem("cardastika:profile");
  localStorage.removeItem("cardastika:avatarUrl");
  sessionStorage.removeItem("openCard");

  // Start as a new local player: force starter deck/resources.
  try {
    const starterDeck = await createStarterDeck();
    localStorage.setItem("cardastika:deck", JSON.stringify(starterDeck));
    localStorage.setItem("cardastika:inventory", JSON.stringify(starterDeck));
    localStorage.setItem("cardastika:gold", String(STARTER_GOLD));
    localStorage.setItem("cardastika:diamonds", String(STARTER_DIAMONDS));
    localStorage.setItem("cardastika:silver", String(STARTER_SILVER));
    localStorage.setItem("cardastika:gems", String(STARTER_SILVER));
  } catch (err) {
    console.warn("[auth] failed to prepare starter state for new game", err);
  }

  window.location.href = "../../index.html";
});

startLoginBtn?.addEventListener("click", () => {
  showAuth(true);
});

backToWelcomeBtn?.addEventListener("click", () => {
  showAuth(false);
});

showAuth(false);

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("");

  const name = normName(nameEl?.value);
  const pass = String(passEl?.value || "");

  if (!validName(name)) return setMsg("Некоректне ім'я (3-24, літери/цифри/._-).", "err");
  if (!validPass(pass)) return setMsg("Пароль має бути 6-64 символів.", "err");

  if (submitBtn) submitBtn.disabled = true;

  try {
    const users = loadUsers();
    const passHash = await sha256(pass);

    if (!users[name]) return setMsg("Акаунт не знайдено. Зареєструй профіль на сторінці «Профіль».", "err");
    if (users[name].passHash !== passHash) return setMsg("Невірний пароль.", "err");

    await ensureGameAccount(name);
    setActive(name);
    setMsg("Вхід виконано.", "ok");
    setTimeout(redirectAfterAuth, 250);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});
