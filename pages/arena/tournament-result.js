// tournament-result.js - Логіка сторінки результату турнірного бою

import "../../src/account.js";
import "../../src/progression-system.js";
import {
  getRoundName,
  getPlacementByRound,
  calculatePrize,
  getGlobalLeague,
  loadTournamentState,
  saveTournamentState,
  TOURNAMENT_PRIZES
} from "../../src/core/tournament-leagues.js";
import { getDuelLeagueByRating } from "../../src/core/leagues.js";
import { getSourceForTournamentPlacement, saveSourceToInventory, formatSourceCardInfo } from "../../src/core/source-cards.js";

// ==========================================
// УТИЛІТИ
// ==========================================

const q = (s) => document.querySelector(s);
const safeJSON = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeGetItem(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch (e) {
    return null;
  }
}

// ==========================================
// СТАН
// ==========================================

let battleResult = null;
let tournamentState = null;

// ==========================================
// ЗАВАНТАЖЕННЯ ДАНИХ
// ==========================================

function loadBattleResult() {
  const raw = safeGetItem(sessionStorage, "cardastika:tournamentResult") || 
              safeGetItem(localStorage, "cardastika:tournamentResult");
  return safeJSON(raw);
}

function getPlayerRating() {
  const progState = window.ProgressionSystem?.getState?.();
  return progState?.duel?.rating || 0;
}

// ==========================================
// НАРАХУВАННЯ НАГОРОД
// ==========================================

let rewardsGranted = false;

function grantRewards(rewards) {
  console.log("[tournament-result] grantRewards викликано з:", rewards, "rewardsGranted:", rewardsGranted);
  
  if (!rewards) {
    console.warn("[tournament-result] grantRewards: rewards = null, виходимо");
    return;
  }
  if (rewardsGranted) {
    console.warn("[tournament-result] grantRewards: rewardsGranted вже true, виходимо");
    return;
  }
  
  const diamonds = Number(rewards.diamonds) || 0;
  const silver = Number(rewards.silver) || 0;
  
  if (diamonds <= 0 && silver <= 0) {
    console.warn("[tournament-result] grantRewards: diamonds=0 і silver=0, виходимо");
    return;
  }
  
  console.log("[tournament-result] Нараховуємо нагороди:", { diamonds, silver });
  
  // Спочатку пробуємо через AccountSystem
  if (window.AccountSystem?.updateActive) {
    try {
      window.AccountSystem.updateActive((acc) => {
        acc.currency = acc.currency || {};
        if (diamonds > 0) {
          acc.currency.diamonds = (acc.currency.diamonds || 0) + diamonds;
        }
        if (silver > 0) {
          acc.currency.silver = (acc.currency.silver || 0) + silver;
        }
        console.log("[tournament-result] Оновлено через AccountSystem:", acc.currency);
        return null;
      });
    } catch (e) {
      console.warn("[tournament-result] AccountSystem помилка:", e);
    }
  }
  
  // Завжди зберігаємо в localStorage як резерв
  try {
    if (diamonds > 0) {
      const curDiamonds = Number(localStorage.getItem("cardastika:diamonds")) || 0;
      localStorage.setItem("cardastika:diamonds", String(curDiamonds + diamonds));
    }
    if (silver > 0) {
      const curSilver = Number(localStorage.getItem("cardastika:silver")) || 0;
      localStorage.setItem("cardastika:silver", String(curSilver + silver));
    }
    console.log("[tournament-result] Збережено в localStorage");
  } catch (e) {
    console.warn("[tournament-result] localStorage помилка:", e);
  }
  
  rewardsGranted = true;
  
  // Оновлюємо HUD після невеликої затримки
  setTimeout(updateHUD, 100);
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

function renderResult() {
  if (!battleResult) {
    q("#resultTitle").textContent = "Помилка";
    q("#resultSubtitle").textContent = "Результат бою не знайдено";
    return;
  }
  
  const won = battleResult.won;
  const round = battleResult.round || "round1";
  const resultCard = q("#resultCard");
  
  if (won) {
    resultCard.classList.add("is-win");
    resultCard.classList.remove("is-lose");
    q("#resultTitle").textContent = "ПЕРЕМОГА!";
    q("#resultSubtitle").textContent = `${getRoundName(round)} пройдено`;
    q("#resultIconImg").src = "../../assets/icons/trophy.svg";
  } else {
    resultCard.classList.add("is-lose");
    resultCard.classList.remove("is-win");
    q("#resultTitle").textContent = "ПОРАЗКА";
    q("#resultSubtitle").textContent = `Вибули в ${getRoundName(round)}`;
    q("#resultIconImg").src = "../../assets/icons/medal.svg";
  }
  
  // Статистика
  q("#playerHpResult").textContent = fmtNum(Math.max(0, battleResult.playerHp || 0));
  q("#enemyHpResult").textContent = fmtNum(Math.max(0, battleResult.enemyHp || 0));
  q("#turnsResult").textContent = String(battleResult.turns || 0);
}

function renderRewards() {
  const won = battleResult?.won;
  const round = battleResult?.round || "round1";
  
  // Отримуємо глобальну лігу гравця
  const rating = getPlayerRating();
  const globalLeague = getGlobalLeague(rating);
  const leagueId = globalLeague?.id || "global-epic";
  
  console.log("[tournament-result] renderRewards:", { won, round, rating, leagueId });
  
  if (won) {
    // Показуємо нагороди за перемогу
    q("#rewardsPanel").hidden = false;
    q("#eliminationPanel").hidden = true;
    q("#trophyPanel").hidden = true;
    
    // Базова нагорода за раунд (срібло)
    const baseSilver = 100 + (tournamentState?.roundsWon || 0) * 50;
    
    console.log("[tournament-result] Перемога! Нараховуємо срібло:", baseSilver);
    q("#rewardSilver").textContent = `+${fmtNum(baseSilver)}`;
    
    // Нараховуємо
    grantRewards({ silver: baseSilver });
    
    // Показуємо кнопку продовження
    q("#continueBtn").hidden = false;
    
  } else {
    // Поразка - показуємо приз за вибування
    q("#rewardsPanel").hidden = true;
    
    const placement = getPlacementByRound(round, false);
    const prize = calculatePrize(placement, leagueId);
    
    console.log("[tournament-result] Поразка. Placement:", placement, "Prize:", prize);
    
    if (placement === "first" || placement === "second" || placement === "third" || placement === "fourth") {
      // Топ-4 - показуємо кубок
      q("#eliminationPanel").hidden = true;
      q("#trophyPanel").hidden = false;
      
      const trophyName = prize?.trophyName || `${placement} місце`;
      q("#trophyName").textContent = trophyName;
      
      // Встановлюємо іконку кубка
      if (placement === "first") {
        q("#trophyImg").style.filter = "hue-rotate(40deg) saturate(2)"; // Gold
      } else if (placement === "second") {
        q("#trophyImg").style.filter = "saturate(0) brightness(1.5)"; // Silver
      } else if (placement === "third") {
        q("#trophyImg").style.filter = "hue-rotate(-20deg) saturate(0.5)"; // Bronze
      } else {
        q("#trophyImg").style.filter = "saturate(0) brightness(0.7)"; // 4th
      }
      
      // Призова інформація
      if (prize) {
        let cardInfo = "";
        if (prize.sources) {
          cardInfo = `${prize.sources} джерел магії`;
        } else if (prize.cardLevel) {
          cardInfo = `Карта рівня ${prize.cardLevel}`;
        }
        q("#prizeCardInfo").textContent = cardInfo;
        
        // Нараховуємо призи
        grantRewards({ 
          diamonds: prize.diamonds || 0, 
          silver: prize.silver || 0 
        });
        
        // Випадання карти-джерела для топ-4
        const sourceCard = getSourceForTournamentPlacement(placement);
        if (sourceCard) {
          saveSourceToInventory(sourceCard);
          console.log("[tournament-result] Топ-4 - випала карта-джерело:", sourceCard.title, "рівень", sourceCard.level);
          
          const prizeCardInfoEl = q("#prizeCardInfo");
          if (prizeCardInfoEl) {
            prizeCardInfoEl.textContent += ` + ${formatSourceCardInfo(sourceCard)}`;
          }
        }
      }
      
    } else {
      // Звичайне вибування - медаль
      q("#eliminationPanel").hidden = false;
      q("#trophyPanel").hidden = true;
      
      const medalTitle = getMedalTitle(placement);
      const medalDesc = getMedalDescription(placement, leagueId);
      
      q("#eliminationTitle").textContent = medalTitle;
      q("#eliminationDesc").textContent = medalDesc;
      
      console.log("[tournament-result] Показуємо медаль:", { medalTitle, medalDesc, prize });
      
      if (prize) {
        // Показуємо діаманти або срібло
        const diamondsEl = q("#eliminationDiamonds");
        const silverEl = q("#eliminationSilver");
        
        console.log("[tournament-result] prize.diamonds:", prize.diamonds, "prize.silver:", prize.silver);
        console.log("[tournament-result] diamondsEl:", diamondsEl, "silverEl:", silverEl);
        
        if (prize.diamonds && diamondsEl) {
          diamondsEl.textContent = `+${fmtNum(prize.diamonds)}`;
          diamondsEl.parentElement.hidden = false;
          console.log("[tournament-result] Показуємо діаманти:", prize.diamonds);
        }
        if (prize.silver && silverEl) {
          silverEl.textContent = `+${fmtNum(prize.silver)}`;
          silverEl.parentElement.hidden = false;
          console.log("[tournament-result] Показуємо срібло:", prize.silver);
        }
        
        // Нараховуємо призи
        console.log("[tournament-result] ВИКЛИКАЄМО grantRewards:", { diamonds: prize.diamonds || 0, silver: prize.silver || 0 });
        grantRewards({ diamonds: prize.diamonds || 0, silver: prize.silver || 0 });
      } else {
        console.warn("[tournament-result] prize = null! Не можемо видати нагороду");
      }
      
      // Випадання карти-джерела залежно від місця
      const sourceCard = getSourceForTournamentPlacement(placement);
      if (sourceCard) {
        saveSourceToInventory(sourceCard);
        console.log("[tournament-result] Випала карта-джерело:", sourceCard.title, "рівень", sourceCard.level);
        
        // Показуємо інформацію про карту
        const sourceInfoEl = q("#eliminationSourceInfo");
        if (sourceInfoEl) {
          sourceInfoEl.textContent = `+ ${formatSourceCardInfo(sourceCard)}`;
          sourceInfoEl.hidden = false;
        }
      }
    }
    
    // Ховаємо кнопку продовження
    q("#continueBtn").hidden = true;
  }
}

function getMedalTitle(placement) {
  const titles = {
    "qualifying": "Вибули у відбірковому",
    "participant": "Медаль учасника",
    "round16": "Медаль 1/16 фіналу",
    "round32": "Медаль 1/32 фіналу",
    "round8": "Медаль 1/8 фіналу",
    "quarterFinal": "Медаль чвертьфіналіста"
  };
  return titles[placement] || "Медаль учасника";
}

function getMedalDescription(placement, leagueId) {
  const leagueNames = {
    "global-epic": "Епічної ліги",
    "global-legendary": "Легендарної ліги",
    "global-mythic": "Міфічної ліги",
    "global-masters": "Ліги Майстрів",
    "global-champions": "Ліги Чемпіонів"
  };
  const leagueName = leagueNames[leagueId] || "";
  return `Турнір ${leagueName}`;
}

function renderBattleLog() {
  const logContainer = q("#battleLog");
  if (!logContainer || !battleResult?.log) {
    logContainer.innerHTML = '<div class="log-empty">Журнал порожній</div>';
    return;
  }
  
  const logs = battleResult.log.slice(-10).reverse();
  let html = "";
  
  for (const entry of logs) {
    const t = Number(entry?.turn) ?? 0;
    const slot = (Number(entry?.playerIdx) ?? 0) + 1;
    const pEl = String(entry?.pEl || "");
    const eEl = String(entry?.eEl || "");
    
    html += `
      <div class="log-entry">
        <div class="log-entry__meta">Хід ${t + 1} • Слот ${slot}</div>
        <div class="log-entry__line">
          <span class="log-card elem-${escHtml(pEl)}">${entry?.pPower || 0}</span>
          <span class="log-dmg log-dmg--player">-${entry?.pDmg || 0}</span>
          <span class="log-vs">⚔</span>
          <span class="log-dmg log-dmg--enemy">-${entry?.eDmg || 0}</span>
          <span class="log-card elem-${escHtml(eEl)}">${entry?.ePower || 0}</span>
        </div>
      </div>
    `;
  }
  
  logContainer.innerHTML = html;
}

// ==========================================
// ОНОВЛЕННЯ СТАНУ ТУРНІРУ
// ==========================================

function updateTournamentState() {
  tournamentState = loadTournamentState();
  if (!tournamentState || !battleResult) return;
  
  if (battleResult.won) {
    // Перемога - збільшуємо лічильник і готуємось до наступного бою
    tournamentState.roundsWon = (tournamentState.roundsWon || 0) + 1;
    tournamentState.currentRound = getNextRound(battleResult.round);
    tournamentState.awaitingBattle = true;
    
    // Перевіряємо чи виграли турнір
    if (tournamentState.currentRound === "champion") {
      tournamentState.playerWon = true;
      tournamentState.awaitingBattle = false;
    }
  } else {
    // Поразка - вибуваємо з турніру
    tournamentState.playerEliminated = true;
    tournamentState.awaitingBattle = false;
    tournamentState.finalPlacement = getPlacementByRound(battleResult.round, false);
  }
  
  saveTournamentState(tournamentState);
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

// ==========================================
// ОБРОБНИКИ ПОДІЙ
// ==========================================

function setupEventListeners() {
  q("#lobbyBtn")?.addEventListener("click", () => {
    location.href = "./tournament-lobby.html";
  });
  
  q("#continueBtn")?.addEventListener("click", () => {
    // Переходимо назад до лобі для наступного бою
    location.href = "./tournament-lobby.html";
  });
}

// ==========================================
// ІНІЦІАЛІЗАЦІЯ
// ==========================================

function init() {
  console.log("[tournament-result] Ініціалізація...");
  
  // Завантажуємо результат
  battleResult = loadBattleResult();
  console.log("[tournament-result] battleResult:", battleResult);
  
  // Очищаємо збережений результат
  try {
    sessionStorage.removeItem("cardastika:tournamentResult");
    localStorage.removeItem("cardastika:tournamentResult");
  } catch (e) {
    // ignore
  }
  
  // Оновлюємо стан турніру
  updateTournamentState();
  console.log("[tournament-result] tournamentState:", tournamentState);
  
  // Рендеримо UI
  renderResult();
  renderRewards();
  renderBattleLog();
  updateHUD();
  
  setupEventListeners();
  console.log("[tournament-result] Готово");
}

document.addEventListener("DOMContentLoaded", init);
