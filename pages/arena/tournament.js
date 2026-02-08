// tournament.js - Логіка головної сторінки турніру

import "../../src/account.js";
import "../../src/progression-system.js";
import { 
  canAccessTournament, 
  loadTournamentState,
  getRoundName,
  TOURNAMENT_MIN_RATING 
} from "../../src/core/tournament-leagues.js";

// ==========================================
// УТИЛІТИ
// ==========================================

const q = (s) => document.querySelector(s);

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ==========================================
// ЗАВАНТАЖЕННЯ ДАНИХ
// ==========================================

function getPlayerRating() {
  const progState = window.ProgressionSystem?.getState?.();
  const acc = window.AccountSystem?.getActive?.();
  const rating = progState?.duel?.rating || acc?.duel?.rating || 0;
  console.log("[tournament] getPlayerRating:", rating, "progState:", progState?.duel?.rating, "acc:", acc?.duel?.rating);
  return rating;
}

function getPlayerData() {
  const acc = window.AccountSystem?.getActive?.();
  const progState = window.ProgressionSystem?.getState?.();
  
  return {
    rating: getPlayerRating(),
    power: acc?.duel?.power || progState?.duel?.power || 180,
    silver: acc?.currency?.silver || 0,
    gold: acc?.currency?.gold || 0,
    diamonds: acc?.currency?.diamonds || 0
  };
}

// ==========================================
// UI
// ==========================================

function updateHUD() {
  // Використовуємо глобальну функцію з ui-shell.js
  if (typeof window.updateGlobalHUD === "function") {
    window.updateGlobalHUD();
  }
}

function updateAccessDisplay() {
  const rating = getPlayerRating();
  const hasAccess = canAccessTournament(rating);
  
  console.log("[tournament] rating:", rating, "hasAccess:", hasAccess, "MIN_RATING:", TOURNAMENT_MIN_RATING);
  
  if (hasAccess) {
    // Турнір доступний - одразу переходимо до лобі
    window.location.href = "tournament-lobby.html";
    return;
  }
  
  // Турнір недоступний - показуємо блок
  const lockedBlock = q("#lockedBlock");
  if (lockedBlock) lockedBlock.hidden = false;
  
  // Показуємо прогрес
  const progress = Math.min(100, (rating / TOURNAMENT_MIN_RATING) * 100);
  q("#progressFill").style.width = `${progress}%`;
  q("#progressText").textContent = `Рейтинг: ${fmtNum(rating)} / ${fmtNum(TOURNAMENT_MIN_RATING)}`;
    
  if (rating > 0) {
    const remaining = TOURNAMENT_MIN_RATING - rating;
    q("#lockedText").textContent = `До відкриття залишилось ${fmtNum(remaining)} рейтингу`;
  }
}

function updateCurrentTournament() {
  const tournamentState = loadTournamentState();
  const panel = q("#currentTournamentPanel");
  
  if (!tournamentState || !tournamentState.registered) {
    panel.hidden = true;
    return;
  }
  
  panel.hidden = false;
  
  // Статус
  if (tournamentState.playerWon) {
    q("#currentStatus").textContent = "🏆 Переможець!";
  } else if (tournamentState.playerEliminated) {
    q("#currentStatus").textContent = "Завершено";
  } else {
    q("#currentStatus").textContent = "В процесі";
  }
  
  // Раунд
  q("#currentRound").textContent = getRoundName(tournamentState.currentRound);
}

// ==========================================
// ОБРОБНИКИ ПОДІЙ
// ==========================================

function setupEventListeners() {
  // Кнопка входу в турнір
  q("#enterTournamentBtn")?.addEventListener("click", () => {
    location.href = "./tournament-lobby.html";
  });
  
  // Кнопка продовження турніру
  q("#continueTournamentBtn")?.addEventListener("click", () => {
    location.href = "./tournament-lobby.html";
  });
}

// ==========================================
// ІНІЦІАЛІЗАЦІЯ
// ==========================================

function init() {
  updateHUD();
  updateAccessDisplay();
  updateCurrentTournament();
  setupEventListeners();
}

document.addEventListener("DOMContentLoaded", init);
