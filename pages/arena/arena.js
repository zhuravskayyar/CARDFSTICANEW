/**
 * Arena Main Screen Logic
 * Екран арени: черга, рейтинг, завдання, чат
 */

import "../../src/account.js";
import "../../src/progression-system.js";
import { 
  canAccessArena, 
  getArenaLeagueByRating,
  getArenaState,
  getArenaLeagueIconPath,
  ARENA_MIN_DUEL_RATING 
} from "../../src/core/arena-leagues.js";

// ==========================================
// CONSTANTS
// ==========================================

const QUEUE_TIME = 25; // секунди

// ==========================================
// UTILITIES
// ==========================================

const q = (s) => document.querySelector(s);
const safeJSON = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

// ==========================================
// ARENA STATE
// ==========================================

function loadArenaState() {
  const raw = localStorage.getItem('cardastika:arena');
  const state = safeJSON(raw) || {};
  return {
    rating: state.rating || 0,
    tasksPlay: state.tasksPlay ?? 10,
    tasksWin: state.tasksWin ?? 5,
    totalBattles: state.totalBattles || 0,
    totalWins: state.totalWins || 0,
    ...state
  };
}

function saveArenaState(state) {
  localStorage.setItem('cardastika:arena', JSON.stringify(state));
}

// ==========================================
// UI UPDATES
// ==========================================

function updateHUD() {
  const acc = window.AccountSystem?.getActive?.();
  if (!acc) return;

  const power = acc.duel?.power ?? acc.power ?? 0;
  q('#hudPower').textContent = fmtNum(power);
  q('#hudSilver').textContent = fmtNum(acc.currency?.silver ?? 0);
  q('#hudDiamonds').textContent = fmtNum(acc.currency?.diamonds ?? 0);
  q('#hudGold').textContent = fmtNum(acc.currency?.gold ?? 0);
}

function updateArenaUI() {
  const arenaState = getArenaState();
  const state = loadArenaState();
  
  // Використовуємо рейтинг з arenaState (нова система ліг)
  const rating = arenaState.rating || state.rating || 1400;
  const league = getArenaLeagueByRating(rating, arenaState.leagueId);
  
  q('#arenaRating').textContent = fmtNum(rating);
  q('#tasksPlay').textContent = state.tasksPlay;
  q('#tasksWin').textContent = state.tasksWin;
  q('#queueTime').textContent = QUEUE_TIME;
  
  // Оновлення ліги
  const leagueIcon = q('#arenaLeagueIcon');
  const leagueName = q('#arenaLeagueName');
  if (leagueIcon && league) {
    leagueIcon.src = getArenaLeagueIconPath(league.id);
  }
  if (leagueName && league) {
    leagueName.textContent = league.name;
  }
}

// ==========================================
// CHAT
// ==========================================

const DEMO_CHAT_MESSAGES = [
  { author: 'Спритний маг', text: 'Хто на арену?', time: '14:23' },
  { author: 'Темний лицар', text: 'Готовий до бою!', time: '14:24' },
  { author: 'Вогняна відьма', text: 'Удачі всім 🔥', time: '14:25' },
];

function renderChat() {
  const chatEl = q('#chatMessages');
  if (!chatEl) return;

  chatEl.innerHTML = DEMO_CHAT_MESSAGES.map(m => `
    <div class="arena-chat-message">
      <span class="arena-chat-message__author">${m.author}:</span>
      <span class="arena-chat-message__text">${m.text}</span>
      <span class="arena-chat-message__time">${m.time}</span>
    </div>
  `).join('');
}

function addChatMessage(author, text) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  DEMO_CHAT_MESSAGES.push({ author, text, time });
  if (DEMO_CHAT_MESSAGES.length > 20) {
    DEMO_CHAT_MESSAGES.shift();
  }
  
  renderChat();
  
  const chatEl = q('#chatMessages');
  if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

// ==========================================
// QUEUE
// ==========================================

let queueTimer = null;
let queueTime = 0;

function joinQueue() {
  queueTime = QUEUE_TIME;
  
  // Показати модалку черги або перейти на бій
  // Поки що просто переходимо на бій через 2 секунди (демо)
  const btn = q('#joinQueueBtn');
  if (btn) {
    btn.textContent = 'Пошук...';
    btn.disabled = true;
  }
  
  queueTimer = setTimeout(() => {
    // Перехід на бій
    location.href = 'arena-battle.html';
  }, 2000);
}

function cancelQueue() {
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  
  const btn = q('#joinQueueBtn');
  if (btn) {
    btn.textContent = 'Записатися';
    btn.disabled = false;
  }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function setupEventListeners() {
  // Записатися в чергу
  q('#joinQueueBtn')?.addEventListener('click', () => {
    joinQueue();
  });
  
  // Оновити
  q('#refreshBtn')?.addEventListener('click', () => {
    updateHUD();
    updateArenaUI();
    renderChat();
  });
  
  // Чат
  q('#chatSendBtn')?.addEventListener('click', sendChatMessage);
  q('#chatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

function sendChatMessage() {
  const input = q('#chatInput');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  const acc = window.AccountSystem?.getActive?.();
  const author = acc?.name || 'Гравець';
  
  addChatMessage(author, text);
  input.value = '';
}

// ==========================================
// INIT
// ==========================================

function checkArenaAccess() {
  const acc = window.AccountSystem?.getActive?.();
  const duelRating = acc?.duel?.rating ?? 0;
  
  if (!canAccessArena(duelRating)) {
    // Показуємо повідомлення про блокування
    const main = document.querySelector('.arena-screen');
    if (main) {
      main.innerHTML = `
        <div class="arena-locked">
          <div class="arena-locked__icon">🔒</div>
          <div class="arena-locked__title">Арена заблокована</div>
          <div class="arena-locked__text">
            Для доступу до арени потрібен рейтинг дуелей <strong>${ARENA_MIN_DUEL_RATING}</strong>
          </div>
          <div class="arena-locked__current">
            Ваш поточний рейтинг: <strong>${duelRating}</strong>
          </div>
          <a href="../duel/duel.html" class="arena-locked__btn">Перейти до дуелей</a>
        </div>
      `;
      
      // Додаємо стилі для locked екрану
      const style = document.createElement('style');
      style.textContent = `
        .arena-locked {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          text-align: center;
          gap: 16px;
        }
        .arena-locked__icon {
          font-size: 4rem;
        }
        .arena-locked__title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ff6b6b;
        }
        .arena-locked__text {
          font-size: 1rem;
          color: #ccc;
        }
        .arena-locked__current {
          font-size: 0.95rem;
          color: #888;
        }
        .arena-locked__btn {
          display: inline-block;
          margin-top: 16px;
          padding: 12px 32px;
          background: linear-gradient(135deg, #60a5fa, #3b82f6);
          color: #fff;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .arena-locked__btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 16px rgba(59,130,246,0.4);
        }
      `;
      document.head.appendChild(style);
    }
    return false;
  }
  return true;
}

function updateArenaLeagueUI() {
  const state = getArenaState();
  const league = getArenaLeagueByRating(state.rating, state.leagueId, state.highestGlobalLeagueId);
  
  // Оновлюємо рейтинг
  const ratingEl = q('#arenaRating');
  if (ratingEl) ratingEl.textContent = fmtNum(state.rating);
  
  // Показуємо іконку ліги якщо є елемент
  const leagueIcon = q('#arenaLeagueIcon');
  if (leagueIcon && league) {
    leagueIcon.src = getArenaLeagueIconPath(league.id);
    leagueIcon.alt = league.name;
  }
  
  // Показуємо назву ліги
  const leagueName = q('#arenaLeagueName');
  if (leagueName && league) {
    leagueName.textContent = league.name;
  }
}

function init() {
  // Перевіряємо доступ до арени
  if (!checkArenaAccess()) return;
  
  updateHUD();
  updateArenaUI();
  updateArenaLeagueUI();
  renderChat();
  setupEventListeners();
}

document.addEventListener('DOMContentLoaded', init);
