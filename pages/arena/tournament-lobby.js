// tournament-lobby.js - Логіка турнірного лобі

import "../../src/account.js";
import "../../src/progression-system.js";
import { getDuelLeagueByRating, getDuelLeagueIconPath } from "../../src/core/leagues.js";
import {
  canAccessTournament,
  getGlobalLeague,
  generateDemoParticipants,
  generateDemoEnemy,
  generateBracket,
  getRoundName,
  recommendBuffs,
  calculatePrize,
  loadTournamentState,
  saveTournamentState,
  clearTournamentState,
  TOURNAMENT_PRIZES,
  BUFF_TYPES,
  ELEMENTS
} from "../../src/core/tournament-leagues.js";

// ==========================================
// СТАН
// ==========================================

let tournamentState = null;
let currentEnemy = null;
let selectedBuff = null;
let playerData = {
  id: "player",
  name: "Гравець",
  rating: 0,
  power: 0,
  gold: 0,
  bestElement: "fire",
  cards: []
};

// ==========================================
// УТИЛІТИ
// ==========================================

const q = (s) => document.querySelector(s);
const qa = (s) => Array.from(document.querySelectorAll(s));

function safeJSON(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

function showToast(message, type = "info") {
  const host = q("#toastHost");
  if (!host) return;
  
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  host.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// ==========================================
// ЗАВАНТАЖЕННЯ ДАНИХ ГРАВЦЯ
// ==========================================

function loadPlayerData() {
  // Завантажуємо акаунт
  const acc = window.AccountSystem?.getActive?.();
  
  // Завантажуємо стан прогресії
  const progState = window.ProgressionSystem?.getState?.();
  
  // Отримуємо рейтинг
  const rating = progState?.duel?.rating || acc?.duel?.rating || 0;
  
  // Завантажуємо колоду
  const deckRaw = localStorage.getItem("cardastika:deck");
  const deck = safeJSON(deckRaw) || [];
  
  // Рахуємо силу
  let power = 0;
  let elementPower = { fire: 0, water: 0, air: 0, earth: 0 };
  
  for (const card of deck) {
    const cardPower = Number(card?.power) || 0;
    power += cardPower;
    const el = String(card?.element || "").toLowerCase();
    if (ELEMENTS.includes(el)) {
      elementPower[el] += cardPower;
    }
  }
  
  // Знаходимо найкращу стихію
  let bestElement = "fire";
  let maxPower = 0;
  for (const [el, p] of Object.entries(elementPower)) {
    if (p > maxPower) {
      maxPower = p;
      bestElement = el;
    }
  }
  
  playerData = {
    id: "player",
    name: acc?.name || "Гравець",
    rating: rating,
    power: power || 180,
    gold: acc?.currency?.gold || Number(localStorage.getItem("cardastika:gold")) || 0,
    silver: acc?.currency?.silver || Number(localStorage.getItem("cardastika:silver")) || 0,
    bestElement,
    cards: deck,
    isPlayer: true
  };
  
  return playerData;
}

// ==========================================
// UI ОНОВЛЕННЯ
// ==========================================

function updateHUD() {
  // Використовуємо глобальну функцію з ui-shell.js
  if (typeof window.updateGlobalHUD === "function") {
    window.updateGlobalHUD();
  }
}

function updateLeagueBadge() {
  const globalLeague = getGlobalLeague(playerData.rating);
  
  if (globalLeague) {
    q("#leagueName").textContent = globalLeague.name;
    // Використовуємо звичайну іконку ліги
    const duelLeague = getDuelLeagueByRating(playerData.rating);
    q("#leagueIcon").src = getDuelLeagueIconPath(duelLeague.id);
  } else {
    q("#leagueName").textContent = "Недоступно";
  }
}

function updateStatusPanel() {
  if (!tournamentState) {
    q("#statusText").textContent = "Реєстрація";
    q("#participantsCount").textContent = "0 / 64";
    q("#currentRound").textContent = "—";
    q("#playerStatus").textContent = "Не зареєстровано";
    return;
  }
  
  const { bracket, registered, currentRound, playerEliminated, playerWon } = tournamentState;
  
  q("#statusText").textContent = registered ? "В процесі" : "Реєстрація";
  q("#participantsCount").textContent = `${bracket?.totalParticipants || 0} / 64`;
  q("#currentRound").textContent = getRoundName(currentRound);
  
  if (playerWon) {
    q("#playerStatus").textContent = "🏆 Переможець!";
    q("#playerStatus").classList.add("tournament-status__value--winner");
  } else if (playerEliminated) {
    q("#playerStatus").textContent = "❌ Вибули з турніру";
    q("#playerStatus").classList.add("tournament-status__value--eliminated");
  } else if (registered) {
    q("#playerStatus").textContent = `✓ Зареєстровано (${getRoundName(currentRound)})`;
    q("#playerStatus").classList.remove("tournament-status__value--eliminated", "tournament-status__value--winner");
  } else {
    q("#playerStatus").textContent = "Не зареєстровано";
  }
}

function updateActionsPanel() {
  const registerBtn = q("#registerBtn");
  const battleBtn = q("#battleBtn");
  const newTournamentBtn = q("#newTournamentBtn");
  const waitingPanel = q("#waitingPanel");
  
  if (!tournamentState || !tournamentState.registered) {
    registerBtn.hidden = false;
    battleBtn.hidden = true;
    newTournamentBtn.hidden = true;
    waitingPanel.hidden = true;
    return;
  }
  
  if (tournamentState.playerEliminated || tournamentState.playerWon) {
    // Турнір завершено - показуємо кнопку нового турніру
    registerBtn.hidden = true;
    battleBtn.hidden = true;
    newTournamentBtn.hidden = false;
    waitingPanel.hidden = true;
    return;
  }
  
  if (tournamentState.awaitingBattle) {
    registerBtn.hidden = true;
    battleBtn.hidden = false;
    newTournamentBtn.hidden = true;
    waitingPanel.hidden = true;
  } else {
    registerBtn.hidden = true;
    battleBtn.hidden = true;
    newTournamentBtn.hidden = true;
    waitingPanel.hidden = false;
  }
}

function updateOpponentPanel() {
  const panel = q("#opponentPanel");
  
  if (!currentEnemy || !tournamentState?.awaitingBattle) {
    panel.hidden = true;
    return;
  }
  
  panel.hidden = false;
  q("#opponentName").textContent = currentEnemy.name;
  q("#opponentPower").textContent = fmtNum(currentEnemy.power);
  q("#opponentRating").textContent = fmtNum(currentEnemy.rating);
  
  const elemBadge = q("#opponentBestElement");
  elemBadge.textContent = getElementName(currentEnemy.bestElement);
  elemBadge.className = `element-badge elem-${currentEnemy.bestElement}`;
}

function updateBuffPanel() {
  const panel = q("#buffPanel");
  
  if (!currentEnemy || !tournamentState?.awaitingBattle) {
    panel.hidden = true;
    return;
  }
  
  panel.hidden = false;
  
  // Отримуємо рекомендовані бафи
  const buffs = recommendBuffs(playerData.cards, currentEnemy.bestElement);
  
  // Баф 1
  const buff1 = buffs[0];
  q("#buff1Icon").className = `tournament-buff__option-icon elem-${buff1.element}`;
  q("#buff1Name").textContent = buff1.name;
  q("#buff1Desc").textContent = buff1.description;
  q("#buff1Label").textContent = buff1.label;
  q("#buff1Cost").textContent = buff1.cost;
  q("#buff1Btn").dataset.element = buff1.element;
  
  // Баф 2
  const buff2 = buffs[1];
  q("#buff2Icon").className = `tournament-buff__option-icon elem-${buff2.element}`;
  q("#buff2Name").textContent = buff2.name;
  q("#buff2Desc").textContent = buff2.description;
  q("#buff2Label").textContent = buff2.label;
  q("#buff2Cost").textContent = buff2.cost;
  q("#buff2Btn").dataset.element = buff2.element;
}

function updateBracketPanel() {
  const container = q("#bracketRounds");
  if (!container) return;
  
  if (!tournamentState?.bracket) {
    container.innerHTML = '<div class="bracket-empty">Турнір ще не розпочався</div>';
    return;
  }
  
  const { bracket, currentRound, roundsWon, playerEliminated, playerWon } = tournamentState;
  
  let html = '';
  
  // Показуємо прогрес раундів з іконками
  const rounds = ["round1", "round16", "round8", "quarterFinal", "semiFinal", "final"];
  html += '<div class="bracket-progress">';
  
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const roundIdx = i + 1; // 1-based
    const isActive = currentRound === round;
    const isWon = roundsWon >= roundIdx;
    const isLost = playerEliminated && currentRound === round;
    
    let cls = "bracket-progress__item";
    if (isWon) cls += " bracket-progress__item--won";
    else if (isLost) cls += " bracket-progress__item--lost";
    else if (isActive) cls += " bracket-progress__item--active";
    
    html += `<div class="${cls}">${getRoundShortName(round)}</div>`;
  }
  
  html += '</div>';
  
  // Показуємо легенду
  html += `
    <div class="bracket-legend">
      <span class="bracket-legend__item bracket-legend__item--you">Ви</span>
      <span class="bracket-legend__item bracket-legend__item--won">Перемога</span>
      <span class="bracket-legend__item bracket-legend__item--lost">Поразка</span>
      <span class="bracket-legend__item bracket-legend__item--waiting">Очікує</span>
    </div>
  `;
  
  // Показуємо результат турніру якщо завершено
  if (playerWon) {
    html += `
      <div class="bracket-result bracket-result--champion">
        <span class="bracket-result__icon">🏆</span>
        <span class="bracket-result__text">Ви чемпіон турніру!</span>
      </div>
    `;
  } else if (playerEliminated) {
    html += `
      <div class="bracket-result bracket-result--eliminated">
        <span class="bracket-result__icon">❌</span>
        <span class="bracket-result__text">Вибули на етапі: ${getRoundName(currentRound)}</span>
      </div>
    `;
  } else {
    // Показуємо поточний матч
    html += `
      <div class="bracket-current-match">
        <div class="bracket-current-match__title">Поточний бій</div>
        <div class="bracket-current-match__vs">
          <span class="bracket-current-match__player bracket-current-match__player--you">${playerData.name}</span>
          <span class="bracket-current-match__separator">VS</span>
          <span class="bracket-current-match__player">${currentEnemy?.name || "—"}</span>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function renderPlayerMatch(pairs) {
  // Знаходимо матч гравця
  const playerMatch = pairs.find(p => 
    p.player1?.isPlayer || p.player2?.isPlayer
  );
  
  if (!playerMatch) {
    return '<div class="bracket-match bracket-match--bye">Автоматичний прохід</div>';
  }
  
  const isPlayer1 = playerMatch.player1?.isPlayer;
  const player = isPlayer1 ? playerMatch.player1 : playerMatch.player2;
  const opponent = isPlayer1 ? playerMatch.player2 : playerMatch.player1;
  
  return `
    <div class="bracket-match">
      <div class="bracket-match__player bracket-match__player--you">
        <span class="bracket-match__name">${player?.name || "Ви"}</span>
        <span class="bracket-match__power">${fmtNum(player?.power)}</span>
      </div>
      <div class="bracket-match__vs">VS</div>
      <div class="bracket-match__player">
        <span class="bracket-match__name">${opponent?.name || "—"}</span>
        <span class="bracket-match__power">${fmtNum(opponent?.power)}</span>
      </div>
    </div>
  `;
}

function getRoundIndex(round) {
  const order = ["qualifying", "round1", "round16", "round8", "quarterFinal", "semiFinal", "bronzeMatch", "final"];
  return order.indexOf(round);
}

function getRoundShortName(round) {
  const names = {
    "qualifying": "ВР",
    "round1": "Р1",
    "round16": "1/16",
    "round8": "1/8",
    "quarterFinal": "1/4",
    "semiFinal": "1/2",
    "bronzeMatch": "3м",
    "final": "Ф"
  };
  return names[round] || round;
}

function getElementName(el) {
  const names = {
    fire: "Вогонь",
    water: "Вода",
    air: "Повітря",
    earth: "Земля"
  };
  return names[el] || el;
}

function updatePrizesPanel() {
  const globalLeague = getGlobalLeague(playerData.rating);
  const leagueId = globalLeague?.id || "global-epic";
  
  const prize1 = calculatePrize("first", leagueId);
  const prize2 = calculatePrize("second", leagueId);
  const prize3 = calculatePrize("third", leagueId);
  const prizeP = calculatePrize("participant", leagueId);
  
  q("#prize1").innerHTML = formatPrize(prize1);
  q("#prize2").innerHTML = formatPrize(prize2);
  q("#prize3").innerHTML = formatPrize(prize3);
  q("#prizeParticipant").innerHTML = formatPrize(prizeP);
}

function formatPrize(prize) {
  if (!prize) return "—";
  
  let parts = [];
  
  // Кубок/медаль
  if (prize.trophy) {
    parts.push(`<span class="prize-trophy">${prize.trophyName || prize.trophy}</span>`);
  } else if (prize.medal) {
    parts.push(`<span class="prize-medal">${prize.medalName || prize.medal}</span>`);
  }
  
  // Діаманти
  if (prize.diamonds) {
    parts.push(`<img src="../../assets/icons/diamond.svg" alt="Diamonds" class="prize-icon"> ${prize.diamonds}`);
  }
  
  // Срібло
  if (prize.silver) {
    parts.push(`<img src="../../assets/icons/coin-silver.svg" alt="Silver" class="prize-icon"> ${prize.silver}`);
  }
  
  // Джерела магії
  if (prize.sources) {
    parts.push(`<span class="prize-sources">${prize.sources} джерел</span>`);
  }
  
  // Карти
  if (prize.cardLevel) {
    parts.push(`<span class="prize-card">Карта ур.${prize.cardLevel}</span>`);
  }
  
  return parts.length > 0 ? parts.join(" + ") : "—";
}

// ==========================================
// ЛОГІКА ТУРНІРУ
// ==========================================

let fillingInterval = null;
let currentParticipants = 0;

function registerForTournament() {
  if (!canAccessTournament(playerData.rating)) {
    showToast("Потрібен рейтинг 2000+ для участі в турнірі", "error");
    return;
  }
  
  // Ховаємо кнопку реєстрації, показуємо очікування
  q("#registerBtn").hidden = true;
  q("#waitingPanel").hidden = false;
  q("#battleBtn").hidden = true;
  
  // Починаємо з 48 учасників (включаючи гравця)
  currentParticipants = 48;
  q("#participantsCount").textContent = `${currentParticipants} / 64`;
  q("#statusText").textContent = "Реєстрація...";
  q("#playerStatus").textContent = "✓ Зареєстровано";
  
  showToast("Ви зареєструвалися! Очікуємо інших учасників...", "success");
  
  // Плавно заповнюємо до 64
  startFillingParticipants();
}

function startFillingParticipants() {
  if (fillingInterval) clearInterval(fillingInterval);
  
  fillingInterval = setInterval(() => {
    currentParticipants++;
    q("#participantsCount").textContent = `${currentParticipants} / 64`;
    
    if (currentParticipants >= 64) {
      clearInterval(fillingInterval);
      fillingInterval = null;
      onTournamentFull();
    }
  }, 300 + Math.random() * 400); // Випадкова затримка 300-700мс
}

function onTournamentFull() {
  // Генеруємо демо-учасників
  const participants = generateDemoParticipants(63);
  // Гравець - перший
  participants.unshift({ ...playerData });
  
  // Генеруємо сітку
  const bracket = generateBracket(participants);
  
  // Визначаємо, чи гравець в автокваліфікації
  const isAutoQualified = bracket.autoQualified.some(p => p.isPlayer);
  
  tournamentState = {
    bracket,
    registered: true,
    currentRound: bracket.currentRound,
    playerEliminated: false,
    playerWon: false,
    awaitingBattle: true,
    isAutoQualified,
    roundsWon: 0
  };
  
  // Генеруємо суперника
  currentEnemy = generateDemoEnemy(playerData.rating, playerData.power);
  
  saveTournamentState(tournamentState);
  
  // Оновлюємо UI
  q("#statusText").textContent = "В процесі";
  q("#waitingPanel").hidden = true;
  q("#battleBtn").hidden = false;
  
  showToast("Турнір розпочато! Готуйтеся до бою!", "success");
  updateUI();
}

function selectBuff(element) {
  const buff = BUFF_TYPES[element];
  if (!buff) return;
  
  // Перевіряємо золото
  if (playerData.gold < buff.cost) {
    showToast("Недостатньо золота для підсилення", "error");
    return;
  }
  
  // Списуємо золото
  if (window.AccountSystem?.updateActive) {
    window.AccountSystem.updateActive((acc) => {
      acc.currency = acc.currency || {};
      acc.currency.gold = Math.max(0, (acc.currency.gold || 0) - buff.cost);
      return null;
    });
  } else {
    const cur = Number(localStorage.getItem("cardastika:gold")) || 0;
    localStorage.setItem("cardastika:gold", String(Math.max(0, cur - buff.cost)));
  }
  
  selectedBuff = element;
  playerData.gold -= buff.cost;
  
  // Зберігаємо бафф в стані турніру
  if (tournamentState) {
    tournamentState.selectedBuff = element;
    tournamentState.buffSelected = true;
    saveTournamentState(tournamentState);
  }
  
  showToast(`Підсилення "${buff.name}" активовано!`, "success");
  startBattle();
}

function skipBuff() {
  selectedBuff = null;
  
  // Зберігаємо що бафф пропущено
  if (tournamentState) {
    tournamentState.selectedBuff = null;
    tournamentState.buffSelected = true;
    saveTournamentState(tournamentState);
  }
  
  startBattle();
}

function startNewTournament() {
  // Очищаємо стан турніру
  clearTournamentState();
  tournamentState = null;
  currentEnemy = null;
  selectedBuff = null;
  currentParticipants = 0;
  
  // Оновлюємо UI
  updateUI();
  
  showToast("Готові до нового турніру!", "info");
}

function startBattle() {
  if (!currentEnemy || !tournamentState) return;
  
  // Зберігаємо дані для бою
  const battleData = {
    enemy: currentEnemy,
    buff: selectedBuff,
    round: tournamentState.currentRound,
    roundsWon: tournamentState.roundsWon || 0
  };
  
  try {
    sessionStorage.setItem("cardastika:tournamentBattle", JSON.stringify(battleData));
    localStorage.setItem("cardastika:tournamentBattle", JSON.stringify(battleData));
  } catch (e) {
    console.warn("[tournament] Failed to save battle data", e);
  }
  
  // Переходимо на сторінку бою
  location.href = "./tournament-battle.html";
}

function updateUI() {
  updateHUD();
  updateLeagueBadge();
  updateStatusPanel();
  updateActionsPanel();
  updateOpponentPanel();
  updateBuffPanel();
  updateBracketPanel();
  updatePrizesPanel();
}

// ==========================================
// ОБРОБНИКИ ПОДІЙ
// ==========================================

function setupEventListeners() {
  // Реєстрація
  q("#registerBtn")?.addEventListener("click", registerForTournament);
  
  // Кнопка бою
  q("#battleBtn")?.addEventListener("click", () => {
    // Якщо бафф вже вибрано в цьому турнірі - одразу бій
    if (tournamentState?.buffSelected) {
      selectedBuff = tournamentState.selectedBuff;
      startBattle();
      return;
    }
    
    // Показуємо панель бафів тільки на першому бою
    q("#buffPanel").hidden = false;
    q("#battleBtn").hidden = true;
  });
  
  // Вибір бафів
  q("#buff1Btn")?.addEventListener("click", () => {
    const element = q("#buff1Btn").dataset.element;
    selectBuff(element);
  });
  
  q("#buff2Btn")?.addEventListener("click", () => {
    const element = q("#buff2Btn").dataset.element;
    selectBuff(element);
  });
  
  // Пропустити баф
  q("#skipBuffBtn")?.addEventListener("click", skipBuff);
  
  // Новий турнір
  q("#newTournamentBtn")?.addEventListener("click", startNewTournament);
}

// ==========================================
// ІНІЦІАЛІЗАЦІЯ
// ==========================================

async function init() {
  // Завантажуємо дані гравця
  loadPlayerData();
  
  // Перевіряємо доступ
  if (!canAccessTournament(playerData.rating)) {
    showToast("Турнір доступний з рейтингу 2000 (Третя епічна ліга)", "warning");
  }
  
  // Завантажуємо збережений стан турніру
  const savedState = loadTournamentState();
  if (savedState) {
    tournamentState = savedState;
    
    // Якщо був бій - генеруємо нового суперника для наступного раунду
    if (tournamentState.awaitingBattle && !tournamentState.playerEliminated && !tournamentState.playerWon) {
      currentEnemy = generateDemoEnemy(playerData.rating, playerData.power);
    }
  }
  
  // Перевіряємо результат попереднього бою
  checkBattleResult();
  
  updateUI();
  setupEventListeners();
}

function checkBattleResult() {
  try {
    const resultRaw = sessionStorage.getItem("cardastika:tournamentResult") || localStorage.getItem("cardastika:tournamentResult");
    if (!resultRaw) return;
    
    const result = safeJSON(resultRaw);
    if (!result) return;
    
    // Не застосовуємо результат, якщо турнір не чекає на бій (fallback)
    if (!tournamentState?.awaitingBattle) {
      // Не видаляємо — tournament-result.js обробить
      return;
    }
    
    // Очищаємо результат тільки якщо реально застосовуємо
    sessionStorage.removeItem("cardastika:tournamentResult");
    localStorage.removeItem("cardastika:tournamentResult");
    
    if (!tournamentState) return;
    
    if (result.won) {
      tournamentState.roundsWon = (tournamentState.roundsWon || 0) + 1;
      
      // Переходимо до наступного раунду
      const nextRound = getNextRound(tournamentState.currentRound);
      
      if (nextRound === "champion") {
        tournamentState.playerWon = true;
        tournamentState.awaitingBattle = false;
        showToast("🏆 Ви виграли турнір!", "success");
      } else {
        tournamentState.currentRound = nextRound;
        currentEnemy = generateDemoEnemy(playerData.rating, playerData.power);
        showToast(`Перемога! Наступний раунд: ${getRoundName(nextRound)}`, "success");
      }
    } else {
      // Поразка
      const placement = getPlacementFromRound(tournamentState.currentRound);
      tournamentState.playerEliminated = true;
      tournamentState.awaitingBattle = false;
      tournamentState.finalPlacement = placement;
      showToast(`Поразка. Ваш результат: ${placement}`, "info");
    }
    
    saveTournamentState(tournamentState);
    
  } catch (e) {
    console.warn("[tournament] Failed to check battle result", e);
  }
}

function getNextRound(currentRound) {
  const progression = {
    "qualifying": "round1",
    "round1": "round16",
    "round16": "round8",
    "round8": "quarterFinal",
    "quarterFinal": "semiFinal",
    "semiFinal": "final",
    "bronzeMatch": "done",
    "final": "champion"
  };
  return progression[currentRound] || "round1";
}

function getPlacementFromRound(round) {
  const placements = {
    "qualifying": "Вибув у відбірковому",
    "round1": "Учасник",
    "round16": "1/16 фіналу",
    "round8": "1/8 фіналу",
    "quarterFinal": "Чвертьфіналіст",
    "semiFinal": "4-те місце",
    "bronzeMatch": "4-те місце",
    "final": "2-ге місце"
  };
  return placements[round] || "Учасник";
}

document.addEventListener("DOMContentLoaded", init);
