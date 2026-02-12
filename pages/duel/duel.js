// duel.js - Логіка вибору противника перед дуеллю (ФІНАЛЬНА ВЕРСІЯ)

import "../../src/account.js";
import "../../src/progression-system.js";
import { getDuelLeagueIconPath } from "../../src/core/leagues.js";
import { applyItemsToDeckAndHp } from "../../src/core/equipment-system.js";
import {
  getCollectionBattleBonuses,
  applyCollectionBonusesToDeck,
  applyCollectionBonusesToHp,
} from "../../src/core/collection-bonuses.js";

const URL_PARAMS = new URLSearchParams(location.search || "");
const IS_TUTORIAL_DUEL =
  URL_PARAMS.get("tutorial") === "1" &&
  localStorage.getItem("cardastika:tutorialStage") === "duel";

let CARDS = [];
let currentEnemy = null;
const MAGE_ARTS = [
  "../../assets/cards/arts/mage1.webp",
  "../../assets/cards/arts/mage2.webp",
  "../../assets/cards/arts/mage3.webp",
  "../../assets/cards/arts/mage4.webp",
];
let playerProfile = {
  power: 180,
  silver: 1500,
  gold: 0,
  duelsPlayed: 0,
  duelsLimit: 10,
  dailyGains: 0,
  dailyLimit: 120
};

// ==========================================
// ЗАВАНТАЖЕННЯ КАРТ
// ==========================================

async function loadCards() {
  try {
    const response = await fetch('../../data/cards.json');
    const data = await response.json();
    CARDS = data.cards || [];
  } catch (e) {
    console.error(' Помилка завантаження карт:', e);
  }
}

// ==========================================
// ЗАВАНТАЖЕННЯ КОЛОДИ З ЛОКАЛЬНОГО СХОВИЩА
// ==========================================

function loadPlayerDeckFromStorage() {
  const KEYS = [
    "cardastika:deck",
    "cardastika:playerDeck",
    "cardastika:deckCards",
    "cards:deck",
    "deck",
    "cardastika:inventory",
    "cardastika:cards",
    "cardastika:cardsAll",
    "cards"
  ];

  for (const k of KEYS) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed :
                  Array.isArray(parsed.cards) ? parsed.cards :
                  Array.isArray(parsed.deck) ? parsed.deck :
                  Array.isArray(parsed.items) ? parsed.items : null;

      if (!arr || !arr.length) continue;

      const deck9 = arr.slice(0, 9).map((c, i) => normalizeCardForHP(c, `${k}:${i}`)).filter(Boolean);
      if (deck9.length) return deck9;
    } catch (e) {
      console.warn(` Помилка парсингу ${k}:`, e);
    }
  }

  return [];
}

function calcDeckPower(deckCards = []) {
  return deckCards.reduce((sum, card) => sum + (card?.power || 0), 0);
}

function readNum(key) {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) ? n : null;
}

function readCurrency() {
  const acc = window.AccountSystem?.getActive?.() || null;

  const silver =
    (Number.isFinite(Number(acc?.silver)) ? Number(acc.silver) : null) ??
    readNum("cardastika:silver") ??
    readNum("cardastika:gems") ??
    1500;

  const gold =
    (Number.isFinite(Number(acc?.gold)) ? Number(acc.gold) : null) ??
    readNum("cardastika:gold") ??
    0;

  return {
    silver: Math.max(0, Math.round(silver)),
    gold: Math.max(0, Math.round(gold)),
  };
}

function normalizeCardForHP(raw, fallbackId) {
  if (!raw || typeof raw !== "object") return null;

  const rawEl = raw.element || raw.elem || raw.type;
  const element = String(rawEl || "").toLowerCase().trim();
  const fixedEl = element === "wind" ? "air" : element;
  if (!["fire", "water", "air", "earth"].includes(fixedEl)) return null;

  let power = Number(raw.power ?? raw.basePower ?? raw.str ?? raw.attack ?? raw.value);
  if (!Number.isFinite(power) || power < 1) power = 1;

  return {
    uid: String(raw.uid || raw.id || fallbackId || Date.now()),
    element: fixedEl,
    power: Math.round(power),
    rarity: Number(raw.rarity ?? 1),
    name: String(raw.name || fixedEl)
  };
}

// ==========================================
// ГЕНЕРУВАННЯ ПРОТИВНИКА
// ==========================================

function generateEnemyPower(playerPower) {
  if (IS_TUTORIAL_DUEL) {
    return Math.max(30, Math.round(playerPower * 0.7));
  }
  const min = Math.max(10, Math.round(playerPower * 0.8));
  const max = Math.round(playerPower * 1.4);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEnemy(playerPower = 180) {
  const enemyPower = generateEnemyPower(playerPower);

  const names = [
    "Отважний принц", "Темний лицар", "Магічний дракон", "Лісовий ельф",
    "Крижаний велетень", "Вогняний фенікс", "Водяний дух", "Земляний голем",
    "Повітряний елементаль", "Тіньовий ассасин", "Світлий паладин",
    "Некромант", "Шаман бурі", "Горний троль", "Морський капітан"
  ];

  const name = names[Math.floor(Math.random() * names.length)];
  const avatar = MAGE_ARTS[Math.floor(Math.random() * MAGE_ARTS.length)];

  currentEnemy = {
    name,
    hp: enemyPower,
    power: enemyPower,
    avatar,
    description: `Сила: ${enemyPower}`
  };

  console.log(` Згенеровано противника: ${name} (HP: ${enemyPower})`);
}

// ==========================================
// ПРОФІЛЬ ГРАВЦЯ
// ==========================================

function loadPlayerProfile() {
  const raw = localStorage.getItem("cardastika:profile");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      playerProfile = { ...playerProfile, ...parsed };
    } catch (e) {
      console.warn(" Помилка завантаження профілю:", e);
    }
  }
}

function savePlayerProfile() {
  localStorage.setItem("cardastika:profile", JSON.stringify(playerProfile));
}

// ==========================================
// ОБРОБКА ПОДІЙ
// ==========================================

function generateNewEnemy() {
  const playerPower = playerProfile.power;
  generateEnemy(playerPower);
}

function renderEnemy() {
  const bannerEl = document.getElementById("banner");
  const nameEl = document.getElementById("opponentName");
  const hpEl = document.getElementById("opponentHealth");
  const silhouetteEl = document.querySelector(".duel-silhouette");
  const avatarEl = document.querySelector(".duel-opponent__avatar");

  if (!currentEnemy) return;

  if (bannerEl) {
    const powerDiff = currentEnemy.power - playerProfile.power;
    let bannerText = "Знайдено противника";
    if (powerDiff > 50) bannerText = "Знайдено сильного противника";
    else if (powerDiff < -50) bannerText = "Знайдено слабкого противника";
    bannerEl.textContent = bannerText;
  }

  if (nameEl) nameEl.textContent = currentEnemy.name;
  if (hpEl) hpEl.textContent = currentEnemy.hp;
  if (avatarEl && currentEnemy.avatar) {
    avatarEl.style.background = `center / cover no-repeat url("${currentEnemy.avatar}")`;
  }
  if (silhouetteEl && currentEnemy.avatar) {
    silhouetteEl.style.backgroundImage = `linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.82)), url("${currentEnemy.avatar}")`;
    silhouetteEl.style.backgroundSize = "125% auto";
    silhouetteEl.style.backgroundPosition = "center 38%";
    silhouetteEl.style.backgroundRepeat = "no-repeat";
  }
}

function handleAttack() {
  if (!currentEnemy) return;

  // Зберігаємо профіль противника в sessionStorage для battle.js
    const payload = { name: currentEnemy.name, hp: currentEnemy.hp };
    try { sessionStorage.setItem("cardastika:duelEnemy", JSON.stringify(payload)); } catch(e) { console.warn('[duel] sessionStorage set failed', e); }
    try { localStorage.setItem("cardastika:duelEnemy", JSON.stringify(payload)); } catch(e) { /* ignore */ }
    // Також зберігаємо HP гравця, щоб battle.html показував те саме число, що й duel.html
    const pHp = Number(playerProfile?.power);
    if (Number.isFinite(pHp) && pHp > 0) {
      const pHpInt = Math.round(pHp);
      try { sessionStorage.setItem("cardastika:duelPlayerHp", String(pHpInt)); } catch(e) { /* ignore */ }
      try { localStorage.setItem("cardastika:duelPlayerHp", String(pHpInt)); } catch(e) { /* ignore */ }
    }

  // Переходимо до бою
  location.href = IS_TUTORIAL_DUEL ? "./battle.html?tutorial=1" : "./battle.html";
}

function handleExplore() {
  if (IS_TUTORIAL_DUEL) {
    showToast("У навчальній дуелі доступний поточний суперник.");
    return;
  }
  generateNewEnemy();
  renderEnemy();
  showToast(` Знайдено: ${currentEnemy.name}!`);
}

// ==========================================
// UI
// ==========================================

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function updateUI() {
  const powerEl = document.getElementById("hudPower");
  const silverEl = document.getElementById("hudSilver");
  const goldEl = document.getElementById("hudGold");

  if (powerEl) powerEl.textContent = playerProfile.power;
  if (silverEl) silverEl.textContent = playerProfile.silver;
  if (goldEl) goldEl.textContent = playerProfile.gold;

  // League + daily gold limit (from ProgressionSystem)
  try {
    const st = window.ProgressionSystem?.getState?.();

    if (st?.league) {
      const leagueEl = document.getElementById("duelLeague");
      const baseSilverEl = document.getElementById("duelBaseSilver");
      if (leagueEl) {
        const name = String(st.league.name || "");
        const icon = getDuelLeagueIconPath(st.league.id);
        leagueEl.innerHTML = `<img class="duel-league-inline-icon" src="${icon}" alt="${name}" title="${name}">`;
      }
      if (baseSilverEl) baseSilverEl.textContent = String(st.league.baseSilver);
    }

    // League progress bar (rating -> next league) — icons only
    try {
      const prog = st?.duel?.leagueProgress || null;
      const leftIconEl = document.getElementById("duelLeagueProgLeftIcon");
      const rightIconEl = document.getElementById("duelLeagueProgRightIcon");
      const fillEl = document.getElementById("duelLeagueProgFill");
      const barEl = document.querySelector(".duel-league-progress__bar");

      if (prog && (leftIconEl || rightIconEl || fillEl)) {
        const curId = String(prog?.current?.id || st?.league?.id || "");
        const curName = String(prog?.current?.name || st?.league?.name || "");
        const nextId = prog?.next?.id ? String(prog.next.id) : "";
        const nextName = prog?.next?.name ? String(prog.next.name) : "";

        if (leftIconEl && curId) {
          leftIconEl.src = getDuelLeagueIconPath(curId);
          leftIconEl.alt = curName || "Ліга";
          leftIconEl.title = curName || "Ліга";
        }
        if (rightIconEl) {
          if (nextId) {
            rightIconEl.style.opacity = "1";
            rightIconEl.src = getDuelLeagueIconPath(nextId);
            rightIconEl.alt = nextName || "Наступна ліга";
            rightIconEl.title = nextName || "Наступна ліга";
          } else {
            // MAX league
            rightIconEl.removeAttribute("src");
            rightIconEl.alt = "MAX";
            rightIconEl.title = "MAX";
            rightIconEl.style.opacity = "0.35";
          }
        }

        const pct = Number(prog?.pct);
        const pctClamped = Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
        if (fillEl) fillEl.style.width = `${pctClamped}%`;
        if (barEl) barEl.setAttribute("aria-valuenow", String(pctClamped));
      }
    } catch (e) {
      console.warn("[duel] failed to render league progress", e);
    }

    const todayEl = document.getElementById("todayGains");
    const today2El = document.getElementById("todayGains2");
    const goldToday = st?.duel?.dailyGold;
    const goldLimit = st?.duel?.dailyGoldLimit;

    if (todayEl && goldToday != null) {
      todayEl.innerHTML = `<img src="../../assets/icons/coin-gold.svg" alt="gold" class="icon icon--gold"> ${goldToday}`;
    }
    if (today2El && goldLimit != null) {
      today2El.textContent = `з ${goldLimit}`;
    }
  } catch (e) {
    console.warn("[duel] failed to render progression state", e);
  }

  renderEnemy();

  if (IS_TUTORIAL_DUEL) {
    const bannerEl = document.getElementById("banner");
    const exploreBtn = document.getElementById("exploreBtn");
    const progressEl = document.getElementById("duelProgress");

    if (bannerEl) bannerEl.textContent = "Навчальна дуель";
    if (exploreBtn) {
      exploreBtn.textContent = "Навчання";
      exploreBtn.classList.add("is-disabled");
    }
    if (progressEl) progressEl.textContent = "Навчальний бій";
  }
}

function setupEventListeners() {
  const attackBtn = document.getElementById("attackBtn");
  const exploreBtn = document.getElementById("exploreBtn");

  if (attackBtn) {
    attackBtn.addEventListener('click', handleAttack);
  }

  if (exploreBtn) {
    exploreBtn.addEventListener('click', handleExplore);
  }
}

// ==========================================
// ІНІЦІАЛІЗАЦІЯ
// ==========================================

async function initDuel() {
  loadPlayerProfile();
  
  // Завантажуємо реальну колоду й розраховуємо силу
  const playerDeckRaw = loadPlayerDeckFromStorage();
  const realPower = calcDeckPower(playerDeckRaw);
  let collectionBonuses = null;
  try {
    collectionBonuses = await getCollectionBattleBonuses();
  } catch (e) {
    console.warn("[duel] failed to load collection bonuses", e);
  }

  const deckWithEquipment = applyItemsToDeckAndHp(playerDeckRaw, realPower);
  let battleDeck = Array.isArray(deckWithEquipment?.deck) && deckWithEquipment.deck.length
    ? deckWithEquipment.deck
    : playerDeckRaw;
  battleDeck = applyCollectionBonusesToDeck(battleDeck, collectionBonuses);

  const itemHpBonus = Math.max(0, Math.round(Number(deckWithEquipment?.profile?.hpBonus || 0)));
  let finalPower = calcDeckPower(battleDeck) + itemHpBonus;
  finalPower = applyCollectionBonusesToHp(finalPower, collectionBonuses, { mode: "duel" });
  finalPower = Math.max(0, Math.round(Number(finalPower || 0)));
  
  // Якщо колода є  використовуємо реальну силу
  if (realPower > 0) {
    playerProfile.power = finalPower;
    console.log(" Player deck loaded from storage with equipment. Power:", finalPower);
  } else {
    console.warn(" No deck found. Using default power:", playerProfile.power);
  }

  const cur = readCurrency();
  playerProfile.silver = cur.silver;
  playerProfile.gold = cur.gold;
  
  savePlayerProfile();
  
  // Генеруємо противника з актуальною силою гравця
  generateNewEnemy();
  
  setupEventListeners();
  updateUI();
}

// ==========================================
// ЗАПУСК ПРИ ЗАВАНТАЖЕННІ СТОРІНКИ
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadCards();
  await initDuel();
});
