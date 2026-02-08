// src/core/tournament-leagues.js - Турнірна система з глобальними лігами

import { DUEL_LEAGUES, getDuelLeagueByRating } from "./leagues.js";

// ==========================================
// КОНФІГУРАЦІЯ ТУРНІРІВ
// ==========================================

// Мінімальний рейтинг для участі в турнірах (Третя епічна ліга)
export const TOURNAMENT_MIN_RATING = 2000;

// Глобальні ліги для турнірів
export const GLOBAL_LEAGUES = [
  { id: "global-epic", name: "Епічна ліга", minRating: 2000, maxRating: 2599, color: "#9b59b6", prefix: "league-purple" },
  { id: "global-legendary", name: "Легендарна ліга", minRating: 2600, maxRating: 3199, color: "#ffd700", prefix: "league-gold" },
  { id: "global-mythic", name: "Міфічна ліга", minRating: 3200, maxRating: 3799, color: "#1a1a1a", prefix: "league-black" },
  { id: "global-masters", name: "Ліга Майстрів", minRating: 3800, maxRating: 9999, color: "#8b0000", prefix: "league-masters", requiresTrophy: "mythic" },
  { id: "global-champions", name: "Ліга Чемпіонів", minRating: 4200, maxRating: 99999, color: "#00bcd4", prefix: "league-champions", requiresTrophy: "masters", maxPlayers: 128, doubleElimination: true },
];

// Розклад турнірів (години UTC+2)
export const TOURNAMENT_SCHEDULE = {
  "global-champions": { times: ["09:00", "19:00"], excludeDays: [3, 5] }, // Ср, Пт
  "global-masters": { times: ["09:00", "19:00"], excludeDays: [3, 5] },
  "global-mythic": { times: ["10:00", "20:00"], excludeDays: [3, 5] },
  "global-legendary": { times: ["11:00", "21:00"], excludeDays: [3, 5] },
  "global-epic": { times: ["12:00", "22:00"], excludeDays: [3, 5] },
};

// Елементи та контр-елементи
export const ELEMENTS = ["fire", "water", "air", "earth"];

export const COUNTER_ELEMENTS = {
  fire: "water",   // Вода гасить вогонь
  water: "earth",  // Земля вбирає воду  
  air: "fire",     // Вогонь спалює повітря
  earth: "air"     // Повітря ерозує землю
};

// Множники шкоди по стихіях
export const ELEMENT_MULT = {
  fire:  { fire: 1.0, water: 0.5, air: 1.5, earth: 1.0 },
  water: { fire: 1.5, water: 1.0, air: 0.5, earth: 0.5 },
  air:   { fire: 0.5, water: 1.0, air: 1.0, earth: 1.5 },
  earth: { fire: 1.0, water: 1.5, air: 0.5, earth: 1.0 }
};

// Підсилення (бафи) - +15% до сили карт стихії (або +20% з колекцією "Гіганти Урфіна")
// Вартість: 10 золота
export const BUFF_COST = 10;
export const BUFF_BONUS_BASE = 0.15;
export const BUFF_BONUS_WITH_COLLECTION = 0.20;

export const BUFF_TYPES = {
  fire:  { name: "Сила Орди", description: "+15% до карт вогню", hpBonus: BUFF_BONUS_BASE, cost: BUFF_COST, element: "fire" },
  water: { name: "Хазяї Морів", description: "+15% до карт води", hpBonus: BUFF_BONUS_BASE, cost: BUFF_COST, element: "water" },
  air:   { name: "Небесні Герої", description: "+15% до карт повітря", hpBonus: BUFF_BONUS_BASE, cost: BUFF_COST, element: "air" },
  earth: { name: "Мешканці Лісу", description: "+15% до карт землі", hpBonus: BUFF_BONUS_BASE, cost: BUFF_COST, element: "earth" }
};

// Параметри бою
export const BATTLE_CONFIG = {
  cycleDuration: 9000,      // 9 секунд на цикл
  cardsPerCycle: 3,         // 3 карти за цикл
  roundDuration: 220000,    // 3 хвилини 40 секунд
  freeCardSwap: 1,          // Один безкоштовний обмін карт
};

// ==========================================
// ПРИЗИ ТУРНІРУ ПО ЛІГАХ
// ==========================================

export const TOURNAMENT_PRIZES = {
  // Ліга Чемпіонів
  "global-champions": {
    first:       { trophy: "trophy-gold", diamonds: 105, sources: 5 },
    second:      { trophy: "trophy-silver", diamonds: 105, sources: 5 },
    third:       { trophy: "trophy-bronze", diamonds: 105, sources: 3 },
    fourth:      { trophy: "trophy-4th", diamonds: 105, sources: 3 },
    round3Loss:  { medal: "medal-champions", diamonds: 100, sources: 3 },
    participant: { medal: "medal-champions", diamonds: 95, sources: 3 },
    qualifying:  { diamonds: 2 },
  },
  // Ліга Майстрів
  "global-masters": {
    first:       { trophy: "trophy-gold", diamonds: 90, sources: 5 },
    second:      { trophy: "trophy-silver", diamonds: 90, sources: 5 },
    third:       { trophy: "trophy-bronze", diamonds: 90, sources: 5 },
    fourth:      { trophy: "trophy-4th", diamonds: 90, sources: 5 },
    quarterFinal:{ medal: "medal-quarter", diamonds: 85, sources: 3 },
    round8:      { medal: "medal-8th", diamonds: 85, sources: 3 },
    round16:     { medal: "medal-participant", diamonds: 80, sources: 3 },
    participant: { medal: "medal-participant", diamonds: 75, sources: 3 },
    qualifying:  { diamonds: 2 },
  },
  // Міфічна ліга
  "global-mythic": {
    first:       { trophy: "trophy-gold", diamonds: 75, sources: 3 },
    second:      { trophy: "trophy-silver", diamonds: 75, sources: 3 },
    third:       { trophy: "trophy-bronze", diamonds: 75, sources: 3 },
    fourth:      { trophy: "trophy-4th", diamonds: 75, sources: 3 },
    quarterFinal:{ medal: "medal-quarter", diamonds: 70, sources: 2 },
    round8:      { medal: "medal-8th", diamonds: 70, sources: 2 },
    round16:     { medal: "medal-participant", diamonds: 65, sources: 2 },
    round32:     { medal: "medal-participant", diamonds: 65, sources: 2 },
    participant: { medal: "medal-participant", diamonds: 60, sources: 2 },
    qualifying:  { diamonds: 1 },
  },
  // Легендарна ліга
  "global-legendary": {
    first:       { trophy: "trophy-gold", diamonds: 60, sources: 2 },
    second:      { trophy: "trophy-silver", diamonds: 60, sources: 1 },
    third:       { trophy: "trophy-bronze", diamonds: 55, sources: 1 },
    fourth:      { trophy: "trophy-4th", diamonds: 55, sources: 1 },
    quarterFinal:{ medal: "medal-quarter", diamonds: 50, sources: 1 },
    round8:      { medal: "medal-8th", diamonds: 45, sources: 1 },
    round16:     { medal: "medal-participant", diamonds: 40, sources: 1 },
    participant: { medal: "medal-participant", diamonds: 35, sources: 1 },
    qualifying:  { }, // Нічого
  },
  // Епічна ліга (без діамантів і джерел, тільки карти і срібло)
  "global-epic": {
    first:       { trophy: "trophy-gold", silver: 35, cardLevel: 3 },
    second:      { trophy: "trophy-silver", silver: 35, cardLevel: 3 },
    third:       { trophy: "trophy-bronze", silver: 30, cardLevel: 2 },
    fourth:      { trophy: "trophy-4th", silver: 30, cardLevel: 2 },
    quarterFinal:{ medal: "medal-quarter", silver: 25, cardLevel: 2 },
    round8:      { medal: "medal-8th", silver: 25, cardLevel: 2 },
    participant: { medal: "medal-participant", silver: 20, cardLevel: 1 },
    qualifying:  { }, // Нічого
  },
};

// ==========================================
// ФУНКЦІЇ
// ==========================================

function rootPrefix() {
  const inPages = location.pathname.toLowerCase().includes("/pages/");
  return inPages ? "../../" : "./";
}

// Перевірка чи гравець може брати участь
export function canAccessTournament(duelRating) {
  return Number(duelRating) >= TOURNAMENT_MIN_RATING;
}

// Отримати глобальну лігу по рейтингу
export function getGlobalLeague(rating) {
  const r = Number(rating) || 0;
  for (const league of GLOBAL_LEAGUES) {
    if (r >= league.minRating && r <= league.maxRating) {
      return league;
    }
  }
  // Якщо рейтинг нижче мінімального - повертаємо epic для тестування
  return GLOBAL_LEAGUES.find(l => l.id === "epic") || GLOBAL_LEAGUES[0];
}

// Отримати глобальну лігу по ID
export function getGlobalLeagueById(leagueId) {
  return GLOBAL_LEAGUES.find(l => l.id === leagueId) || null;
}

// Отримати шлях до іконки турніру
export function getTournamentIconPath(leagueId) {
  const league = getGlobalLeagueById(leagueId);
  if (!league) return `${rootPrefix()}assets/icons/trophy.svg`;
  return `${rootPrefix()}assets/icons/leagues/${league.prefix}-tournament.svg`;
}

// Отримати шлях до медалі/кубка
export function getTrophyIconPath(trophyId) {
  return `${rootPrefix()}assets/icons/trophies/${trophyId}.svg`;
}

// Знайти найкращу стихію гравця
export function findBestElement(cards) {
  if (!Array.isArray(cards) || !cards.length) return "fire";
  
  const elementPower = { fire: 0, water: 0, air: 0, earth: 0 };
  
  for (const card of cards) {
    const el = String(card?.element || "").toLowerCase();
    if (ELEMENTS.includes(el)) {
      elementPower[el] += Number(card?.power) || 0;
    }
  }
  
  let best = "fire";
  let maxPower = 0;
  for (const [el, power] of Object.entries(elementPower)) {
    if (power > maxPower) {
      maxPower = power;
      best = el;
    }
  }
  
  return best;
}

// Отримати контр-стихію
export function getCounterElement(element) {
  return COUNTER_ELEMENTS[element] || "water";
}

// Отримати контр-контр стихію (стихія, що контрить контр-стихію противника)
export function getCounterCounterElement(myBestElement, enemyBestElement) {
  // Якщо моя найкраща = контр до ворожої найкращої
  const enemyCounter = getCounterElement(enemyBestElement);
  if (myBestElement === enemyCounter) {
    // Контр-контр - стихія що контрить те, чим буде бафатися ворог
    // Ворог скоріше за все візьме контр до моєї стихії
    const myCounter = getCounterElement(myBestElement);
    return getCounterElement(myCounter);
  }
  return enemyCounter;
}

// Рекомендувати два бафи для гравця
export function recommendBuffs(playerCards, enemyBestElement) {
  const myBestElement = findBestElement(playerCards);
  const counterToEnemy = getCounterElement(enemyBestElement);
  
  // Перша рекомендація - підсилити свою найкращу стихію
  const buff1 = {
    ...BUFF_TYPES[myBestElement],
    type: "own-best",
    label: "Підсилити свою найкращу"
  };
  
  // Друга рекомендація - контр-стихія до ворога
  let buff2Element = counterToEnemy;
  let buff2Label = "Контр-стихія до ворога";
  
  // Якщо контр співпадає з моєю найкращою - пропонуємо контр-контр
  if (counterToEnemy === myBestElement) {
    buff2Element = getCounterCounterElement(myBestElement, enemyBestElement);
    buff2Label = "Контр-контр стихія";
  }
  
  const buff2 = {
    ...BUFF_TYPES[buff2Element],
    type: "counter",
    label: buff2Label
  };
  
  return [buff1, buff2];
}

// Застосувати баф до колоди
export function applyBuffToDeck(cards, buffElement) {
  const buff = BUFF_TYPES[buffElement];
  if (!buff || !Array.isArray(cards)) return cards;
  
  return cards.map(card => {
    if (!card) return card;
    const cardEl = String(card.element || "").toLowerCase();
    if (cardEl === buffElement) {
      const bonusPower = Math.round(Number(card.power || 0) * buff.hpBonus);
      return {
        ...card,
        power: (Number(card.power) || 0) + bonusPower,
        buffed: true,
        buffElement: buffElement
      };
    }
    return card;
  });
}

// Розрахувати приз
export function calculatePrize(placement, globalLeagueId) {
  const leaguePrizes = TOURNAMENT_PRIZES[globalLeagueId];
  if (!leaguePrizes) return null;
  
  const prizeConfig = leaguePrizes[placement];
  if (!prizeConfig) return null;
  
  const prize = { ...prizeConfig };
  
  // Додаємо назви медалей/кубків
  if (prize.medal) {
    prize.medalName = getMedalName(prize.medal, globalLeagueId);
  }
  if (prize.trophy) {
    prize.trophyName = getTrophyName(prize.trophy, globalLeagueId);
  }
  
  // Визначаємо тип нагороди
  if (prize.sources) {
    prize.rewardType = "source";
    prize.rewardDescription = `${prize.sources} джерел магії`;
  } else if (prize.cardLevel) {
    prize.rewardType = "card";
    prize.rewardDescription = `Карта рівня ${prize.cardLevel}`;
  }
  
  return prize;
}

function getMedalName(medalId, leagueId) {
  const leagueNames = {
    "global-epic": "Епічна",
    "global-legendary": "Легендарна",
    "global-mythic": "Міфічна",
    "global-masters": "Майстрів",
    "global-champions": "Чемпіонів"
  };
  const medalNames = {
    "medal-participant": "Медаль учасника",
    "medal-champions": "Медаль ліги чемпіонів",
    "medal-8th": "Медаль 1/8 фіналу",
    "medal-quarter": "Медаль 1/4 фіналу"
  };
  const leagueName = leagueNames[leagueId] || "";
  const baseName = medalNames[medalId] || medallId;
  return `${baseName} (${leagueName})`;
}

function getTrophyName(trophyId, leagueId) {
  const leagueNames = {
    "global-epic": "Епічний",
    "global-legendary": "Легендарний",
    "global-mythic": "Міфічний",
    "global-masters": "Майстрів",
    "global-champions": "Ліги Чемпіонів"
  };
  const trophyNames = {
    "trophy-4th": "Кубок 4-го місця",
    "trophy-bronze": "Бронзовий кубок",
    "trophy-silver": "Срібний кубок",
    "trophy-gold": "Золотий кубок"
  };
  const leagueName = leagueNames[leagueId] || "";
  const baseName = trophyNames[trophyId] || trophyId;
  return `${leagueName} ${baseName}`;
}

// ==========================================
// ТУРНІРНА СІТКА
// ==========================================

// Структура турніру (32 учасники + 32 відбіркових = 64 слоти)
export const BRACKET_SIZE = 32;
export const QUALIFYING_SIZE = 32;

// Генерувати турнірну сітку
export function generateBracket(participants) {
  if (!Array.isArray(participants)) participants = [];
  
  // Сортуємо учасників по силі (рейтингу)
  const sorted = [...participants].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  
  // Визначаємо, скільки проходить автоматично (найсильніші)
  // Якщо 48 учасників: 16 найсильніших проходять автоматично
  // 32 грають у відбірковому раунді (16 пар -> 16 переможців)
  // Разом 32 в першому раунді
  
  const totalSlots = BRACKET_SIZE; // 32 місця в основній сітці
  const autoQualifyCount = Math.min(sorted.length, Math.floor(totalSlots / 2));
  const qualifyingCount = Math.min(sorted.length - autoQualifyCount, totalSlots);
  
  const autoQualified = sorted.slice(0, autoQualifyCount);
  const qualifyingParticipants = sorted.slice(autoQualifyCount, autoQualifyCount + qualifyingCount);
  
  // Створюємо пари для відбіркового раунду
  const qualifyingPairs = [];
  for (let i = 0; i < qualifyingParticipants.length; i += 2) {
    if (qualifyingParticipants[i + 1]) {
      qualifyingPairs.push({
        id: `q-${i / 2}`,
        player1: qualifyingParticipants[i],
        player2: qualifyingParticipants[i + 1],
        winner: null,
        round: "qualifying"
      });
    } else {
      // Непарний - автоматично проходить
      autoQualified.push(qualifyingParticipants[i]);
    }
  }
  
  return {
    autoQualified,
    qualifyingPairs,
    mainBracket: [],
    currentRound: qualifyingPairs.length > 0 ? "qualifying" : "round1",
    totalParticipants: participants.length
  };
}

// Отримати назву раунду
export function getRoundName(round, totalRounds = 5) {
  const names = {
    "qualifying": "Відбірковий раунд",
    "round1": "1-й раунд",
    "round32": "1/32 фіналу",
    "round16": "1/16 фіналу",
    "round8": "1/8 фіналу",
    "quarterFinal": "Чвертьфінал",
    "semiFinal": "Півфінал",
    "bronzeMatch": "Матч за 3-тє місце",
    "final": "Фінал"
  };
  return names[round] || round;
}

// Визначити приз по раунду вибуття
export function getPlacementByRound(round, wonMatch) {
  if (round === "final" && wonMatch) return "first";
  if (round === "final" && !wonMatch) return "second";
  if (round === "bronzeMatch" && wonMatch) return "third";
  if (round === "bronzeMatch" && !wonMatch) return "fourth";
  if (round === "semiFinal") return "fourth"; // Програв у півфіналі - йде на бронзовий матч
  if (round === "quarterFinal") return "quarterFinal";
  if (round === "round8") return "round8";
  if (round === "round16") return "round16";
  if (round === "round32") return "round32";
  if (round === "qualifying") return "qualifying";
  return "participant";
}

// ==========================================
// РОЗКЛАД ТУРНІРІВ
// ==========================================

// Перевірити чи турнір доступний зараз
export function isTournamentAvailable(globalLeagueId) {
  const schedule = TOURNAMENT_SCHEDULE[globalLeagueId];
  if (!schedule) return false;
  
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = неділя, 3 = середа, 5 = п'ятниця
  
  // Перевіряємо заборонені дні
  if (schedule.excludeDays?.includes(dayOfWeek)) {
    return false;
  }
  
  return true;
}

// Отримати наступний час турніру
export function getNextTournamentTime(globalLeagueId) {
  const schedule = TOURNAMENT_SCHEDULE[globalLeagueId];
  if (!schedule) return null;
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  for (const timeStr of schedule.times) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const scheduleTime = hours * 60 + minutes;
    
    if (scheduleTime > currentTime) {
      return timeStr;
    }
  }
  
  // Наступний день
  return schedule.times[0];
}

// ==========================================
// ЗДОРОВ'Я ГРАВЦЯ
// ==========================================

// Розрахувати початкове здоров'я (2x сила колоди)
export function calculateTournamentHealth(deckPower, bonuses = {}) {
  let hp = Math.round(deckPower * 2);
  
  // Бонус від колекції "Вищі маги" (+5%)
  if (bonuses.higherMages) {
    hp = Math.round(hp * 1.05);
  }
  
  // Бонус від алтаря гільдії
  if (bonuses.guildAltar) {
    hp = Math.round(hp * (1 + bonuses.guildAltar / 100));
  }
  
  return hp;
}

// Застосувати бафи до сили карт
export function applyCollectionBonuses(cards, bonuses = {}) {
  if (!Array.isArray(cards)) return cards;
  
  return cards.map(card => {
    if (!card) return card;
    const el = String(card.element || "").toLowerCase();
    let power = Number(card.power) || 0;
    
    // Колекції стихій (+5%)
    if (bonuses.skyHeroes && el === "air") power = Math.round(power * 1.05);
    if (bonuses.forestDwellers && el === "earth") power = Math.round(power * 1.05);
    if (bonuses.hordeStrength && el === "fire") power = Math.round(power * 1.05);
    if (bonuses.seaMasters && el === "water") power = Math.round(power * 1.05);
    
    // Настойка Дуайта (+10% до обраної стихії)
    if (bonuses.dwaitePotion && bonuses.dwaiteElement === el) {
      power = Math.round(power * 1.10);
    }
    
    return { ...card, power };
  });
}

// ==========================================
// ЗБЕРЕЖЕННЯ СТАНУ ТУРНІРУ
// ==========================================

const TOURNAMENT_STATE_KEY = "cardastika:tournament";

export function loadTournamentState() {
  try {
    const raw = localStorage.getItem(TOURNAMENT_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveTournamentState(state) {
  try {
    localStorage.setItem(TOURNAMENT_STATE_KEY, JSON.stringify(state));
  } catch {
    console.warn("[tournament] Failed to save state");
  }
}

export function clearTournamentState() {
  try {
    localStorage.removeItem(TOURNAMENT_STATE_KEY);
  } catch {
    // ignore
  }
}

// ==========================================
// ДЕМО ДАНІ
// ==========================================

const DEMO_NAMES = [
  "Вогняний маг", "Крижана відьма", "Повітряний елементаль", "Земляний голем",
  "Темний чаклун", "Світлий паладин", "Лісовий друїд", "Морський капітан",
  "Гірський тролль", "Пустельний номад", "Тіньовий ассасін", "Штормовий маг",
  "Кристальний страж", "Полум'яний фенікс", "Льодовий дракон", "Кам'яний титан",
  "Вітряний лучник", "Водяний дух", "Вогняний демон", "Земляний шаман",
  "Небесний ангел", "Підземний гном", "Болотна відьма", "Пустельний скорпіон",
  "Снігова королева", "Вулканічний голем", "Туманний привид", "Сонячний воїн",
  "Місячна жриця", "Зоряний мандрівник", "Грозовий титан", "Природний дух"
];

export function generateDemoParticipants(count = 48) {
  const participants = [];
  for (let i = 0; i < count; i++) {
    const name = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ` ${Math.floor(i / DEMO_NAMES.length) + 1}` : "");
    participants.push({
      id: `demo-${i}`,
      name,
      rating: 2600 + Math.floor(Math.random() * 800),
      power: 150 + Math.floor(Math.random() * 200),
      isPlayer: i === 0,
      bestElement: ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]
    });
  }
  return participants;
}

// Генерувати демо-ворога
export function generateDemoEnemy(playerRating, playerPower) {
  const variance = 0.2; // ±20%
  const enemyRating = playerRating + Math.round((Math.random() - 0.5) * playerRating * variance);
  const enemyPower = playerPower + Math.round((Math.random() - 0.5) * playerPower * variance);
  
  return {
    id: `enemy-${Date.now()}`,
    name: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)],
    rating: Math.max(TOURNAMENT_MIN_RATING, enemyRating),
    power: Math.max(50, enemyPower),
    hp: Math.max(50, enemyPower),
    bestElement: ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]
  };
}
