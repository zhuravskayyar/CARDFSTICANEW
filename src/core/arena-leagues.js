// src/core/arena-leagues.js - Arena leagues system (окрема від дуелей)

// Мінімальний рейтинг дуелей для доступу до арени
export const ARENA_MIN_DUEL_RATING = 2000;

// Початковий рейтинг арени при першому вході
export const ARENA_STARTING_RATING = 1400;

// Буферна зона для падіння в нижчу лігу (100 очків)
export const ARENA_DEMOTION_BUFFER = 100;

// Шанс дропу карт з арени (10%)
export const ARENA_CARD_DROP_CHANCE = 0.10;

// Глобальні ліги (після досягнення - не можна повернутися)
const GLOBAL_LEAGUE_PREFIXES = ["league-gold", "league-black", "league-masters"];

// Ліги арени (та ж структура, що й дуелі, але окремий рейтинг)
// Арена починається з 3-ї синьої ліги (1400)
export const ARENA_LEAGUES = [
  // Green (можна опуститися сюди)
  { id: "arena-green-3", name: "Третя зелена", minRating: 800, promoSilver: 3000, baseSilver: 400, globalLock: false },
  { id: "arena-green-2", name: "Друга зелена", minRating: 1000, promoSilver: 4000, baseSilver: 500, globalLock: false },
  { id: "arena-green-1", name: "Перша зелена", minRating: 1200, promoSilver: 5000, baseSilver: 600, globalLock: false },

  // Blue (стартова ліга арени)
  { id: "arena-blue-3", name: "Третя синя", minRating: 1400, promoSilver: 6000, baseSilver: 800, globalLock: false },
  { id: "arena-blue-2", name: "Друга синя", minRating: 1600, promoSilver: 7000, baseSilver: 900, globalLock: false },
  { id: "arena-blue-1", name: "Перша синя", minRating: 1800, promoSilver: 8000, baseSilver: 1000, globalLock: false },

  // Epic
  { id: "arena-purple-3", name: "Третя епічна", minRating: 2000, promoSilver: 10000, baseSilver: 1200, globalLock: false },
  { id: "arena-purple-2", name: "Друга епічна", minRating: 2200, promoSilver: 15000, baseSilver: 1300, globalLock: false },
  { id: "arena-purple-1", name: "Перша епічна", minRating: 2400, promoSilver: 20000, baseSilver: 1400, globalLock: false },

  // Legendary (глобальна ліга - після досягнення не можна повернутися)
  { id: "arena-gold-3", name: "Третя легендарна", minRating: 2600, promoSilver: 30000, baseSilver: 2000, globalLock: true },
  { id: "arena-gold-2", name: "Друга легендарна", minRating: 2800, promoSilver: 40000, baseSilver: 2400, globalLock: true },
  { id: "arena-gold-1", name: "Перша легендарна", minRating: 3000, promoSilver: 50000, baseSilver: 3000, globalLock: true },

  // Mythic (глобальна ліга)
  { id: "arena-black-3", name: "Третя міфічна", minRating: 3200, promoSilver: 70000, baseSilver: 4000, globalLock: true },
  { id: "arena-black-2", name: "Друга міфічна", minRating: 3400, promoSilver: 80000, baseSilver: 4400, globalLock: true },
  { id: "arena-black-1", name: "Перша міфічна", minRating: 3600, promoSilver: 100000, baseSilver: 5000, globalLock: true },

  // Masters (потрібен кубок міфічної ліги)
  { id: "arena-masters-3", name: "Третя майстрів", minRating: 3800, promoSilver: 120000, baseSilver: 6000, globalLock: true, requiresMythicCup: true },
  { id: "arena-masters-2", name: "Друга майстрів", minRating: 4000, promoSilver: 150000, baseSilver: 7000, globalLock: true, requiresMythicCup: true },
  { id: "arena-masters-1", name: "Перша майстрів", minRating: 4200, promoSilver: 200000, baseSilver: 8000, globalLock: true, requiresMythicCup: true },
].slice().sort((a, b) => (a.minRating ?? 0) - (b.minRating ?? 0));

const ARENA_BY_ID = new Map(ARENA_LEAGUES.map((l) => [l.id, l]));

const DEFAULT_ARENA_LEAGUE_ID = "arena-blue-3";

function rootPrefix() {
  const inPages = location.pathname.toLowerCase().includes("/pages/");
  return inPages ? "../../" : "./";
}

// Перевірка чи гравець має доступ до арени
export function canAccessArena(duelRating) {
  return Number(duelRating) >= ARENA_MIN_DUEL_RATING;
}

// Отримати лігу арени по ID
export function getArenaLeague(leagueId) {
  const id = String(leagueId || "").trim();
  return ARENA_BY_ID.get(id) || ARENA_BY_ID.get(DEFAULT_ARENA_LEAGUE_ID);
}

// Отримати лігу арени по рейтингу з урахуванням буферної зони та глобальних ліг
export function getArenaLeagueByRating(rating, currentLeagueId = null, highestGlobalLeagueId = null) {
  const r = Number(rating);
  const val = Number.isFinite(r) ? Math.max(0, Math.round(r)) : ARENA_STARTING_RATING;
  
  let newLeague = ARENA_BY_ID.get(DEFAULT_ARENA_LEAGUE_ID);
  
  // Знаходимо лігу по рейтингу
  for (const l of ARENA_LEAGUES) {
    if ((l.minRating ?? 0) <= val) newLeague = l;
    else break;
  }
  
  const currentLeague = currentLeagueId ? ARENA_BY_ID.get(currentLeagueId) : null;
  
  // Перевірка глобальних ліг - не можна опуститися нижче найвищої досягнутої глобальної ліги
  if (highestGlobalLeagueId) {
    const highestGlobal = ARENA_BY_ID.get(highestGlobalLeagueId);
    if (highestGlobal && highestGlobal.globalLock) {
      // Знаходимо мінімальну лігу цієї глобальної групи
      const prefix = highestGlobalLeagueId.split("-").slice(0, 2).join("-");
      const globalGroupLeagues = ARENA_LEAGUES.filter(l => l.id.startsWith(prefix));
      const lowestInGroup = globalGroupLeagues[0];
      
      if (lowestInGroup && newLeague.minRating < lowestInGroup.minRating) {
        newLeague = lowestInGroup;
      }
    }
  }
  
  // Буферна зона при падінні
  if (currentLeague && newLeague.minRating < currentLeague.minRating) {
    // Гравець падає - перевіряємо буфер
    const buffer = currentLeague.minRating - ARENA_DEMOTION_BUFFER;
    if (val > buffer) {
      // Залишаємося в поточній лізі (буферна зона)
      return { ...currentLeague, inBuffer: true, bufferMin: buffer };
    }
  }
  
  return { ...newLeague, inBuffer: false };
}

// Шлях до іконки ліги арени (щит замість кружка)
export function getArenaLeagueIconPath(leagueId) {
  const league = getArenaLeague(leagueId);
  // Використовуємо ті ж іконки, але з суфіксом -shield
  const baseId = league.id.replace("arena-", "league-");
  return `${rootPrefix()}assets/icons/leagues/${baseId}-shield.svg`;
}

// Альтернативний шлях - використати ті ж іконки що і для дуелей
export function getArenaLeagueIconPathFallback(leagueId) {
  const league = getArenaLeague(leagueId);
  const baseId = league.id.replace("arena-", "league-");
  return `${rootPrefix()}assets/icons/leagues/${baseId}.svg`;
}

// Розрахунок нагороди за перемогу на арені
export function calculateArenaReward(arenaLeague) {
  // Використовуємо baseSilver з ліги арени (вже x2 від дуелей)
  const arenaBaseSilver = arenaLeague?.baseSilver || 800;
  
  return {
    silver: arenaBaseSilver,
    arenaPoints: 25, // Базові очки рейтингу арени за перемогу
  };
}

// Розрахунок втрати за поразку на арені
export function calculateArenaLoss(arenaLeague) {
  return {
    arenaPoints: -20, // Втрата очків рейтингу арени
  };
}

// Перевірка дропу карти
export function rollCardDrop() {
  return Math.random() < ARENA_CARD_DROP_CHANCE;
}

// Список всіх ліг арени
export function listArenaLeagues() {
  return ARENA_LEAGUES.slice();
}

// Перевірка чи можна увійти в лігу майстрів
export function canEnterMastersLeague(hasMythicCup) {
  return hasMythicCup === true;
}

// Отримати стан арени гравця
export function getArenaState() {
  try {
    const raw = localStorage.getItem("cardastika:arenaState");
    const state = raw ? JSON.parse(raw) : null;
    return state || {
      rating: ARENA_STARTING_RATING,
      leagueId: DEFAULT_ARENA_LEAGUE_ID,
      highestGlobalLeagueId: null,
      promotedLeagues: [], // Ліги, в які вже переходили (для одноразової нагороди)
      totalWins: 0,
      totalLosses: 0,
      totalDamage: 0,
      hasMythicCup: false,
    };
  } catch (e) {
    console.warn("[arena-leagues] Failed to load arena state", e);
    return {
      rating: ARENA_STARTING_RATING,
      leagueId: DEFAULT_ARENA_LEAGUE_ID,
      highestGlobalLeagueId: null,
      promotedLeagues: [],
      totalWins: 0,
      totalLosses: 0,
      totalDamage: 0,
      hasMythicCup: false,
    };
  }
}

// Зберегти стан арени гравця
export function saveArenaState(state) {
  try {
    localStorage.setItem("cardastika:arenaState", JSON.stringify(state));
  } catch (e) {
    console.warn("[arena-leagues] Failed to save arena state", e);
  }
}

// Оновити рейтинг арени після бою
export function updateArenaRating(result, damageDone = 0) {
  const state = getArenaState();
  const currentLeague = getArenaLeague(state.leagueId);
  
  let ratingChange = 0;
  let promoReward = null;
  
  if (result === "win") {
    ratingChange = 25 + Math.floor(Math.random() * 10); // 25-34 очки
    state.totalWins++;
  } else if (result === "lose") {
    ratingChange = -(15 + Math.floor(Math.random() * 10)); // -15 до -24 очки
    state.totalLosses++;
  }
  
  state.rating = Math.max(0, state.rating + ratingChange);
  state.totalDamage += damageDone;
  
  // Визначаємо нову лігу
  const newLeagueData = getArenaLeagueByRating(state.rating, state.leagueId, state.highestGlobalLeagueId);
  const newLeague = getArenaLeague(newLeagueData.id);
  
  // Перевірка підвищення ліги
  if (newLeague.minRating > currentLeague.minRating) {
    // Перехід у вищу лігу
    state.leagueId = newLeague.id;
    
    // Оновлюємо найвищу глобальну лігу
    if (newLeague.globalLock) {
      if (!state.highestGlobalLeagueId || 
          getArenaLeague(state.highestGlobalLeagueId).minRating < newLeague.minRating) {
        state.highestGlobalLeagueId = newLeague.id;
      }
    }
    
    // Одноразова нагорода за перший перехід
    if (!state.promotedLeagues.includes(newLeague.id) && newLeague.promoSilver) {
      promoReward = {
        silver: newLeague.promoSilver,
        leagueName: newLeague.name,
      };
      state.promotedLeagues.push(newLeague.id);
    }
  } else if (newLeague.minRating < currentLeague.minRating && !newLeagueData.inBuffer) {
    // Падіння в нижчу лігу (якщо не в буфері)
    state.leagueId = newLeague.id;
  }
  
  saveArenaState(state);
  
  return {
    oldRating: state.rating - ratingChange,
    newRating: state.rating,
    ratingChange,
    oldLeague: currentLeague,
    newLeague: getArenaLeague(state.leagueId),
    leagueChanged: state.leagueId !== currentLeague.id,
    promoReward,
    inBuffer: newLeagueData.inBuffer,
  };
}

export const ARENA_LEAGUE_DEFAULT_ID = DEFAULT_ARENA_LEAGUE_ID;
