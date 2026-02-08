// src/core/source-cards.js — Логіка карт-джерел магії

const SOURCES = [
  { id: "source_fire", title: "Джерело вогню", element: "fire" },
  { id: "source_water", title: "Джерело води", element: "water" },
  { id: "source_air", title: "Джерело повітря", element: "air" },
  { id: "source_earth", title: "Джерело землі", element: "earth" },
];

const INVENTORY_KEY = "cardastika:inventory";
const SOURCE_DROPS_KEY = "cardastika:sourceDrops";

/**
 * Генерує випадкову карту-джерело
 * @param {number} minLevel - Мінімальний рівень
 * @param {number} maxLevel - Максимальний рівень  
 * @returns {Object} Об'єкт карти-джерела
 */
export function generateSourceCard(minLevel = 1, maxLevel = 50) {
  const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
  const level = Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel;
  
  return {
    uid: `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    id: source.id,
    title: source.title,
    name: source.title,
    element: source.element,
    level: level,
    power: 1, // Завжди 1
    basePower: 1,
    rarity: 1, // common для сортування
    isSource: true,
    droppedAt: Date.now(),
  };
}

/**
 * Перевіряє чи випаде карта-джерело (для арени)
 * @param {number} chance - Шанс випадання (0-100)
 * @returns {boolean}
 */
export function shouldDropSource(chance = 15) {
  return Math.random() * 100 < chance;
}

/**
 * Генерує карту-джерело для арени (15% шанс, рівень 20-40)
 * @returns {Object|null} Карта або null якщо не випала
 */
export function tryDropArenaSource() {
  if (!shouldDropSource(15)) return null;
  return generateSourceCard(20, 40);
}

/**
 * Генерує карту-джерело для турніру залежно від місця
 * @param {string} placement - Місце в турнірі (first, second, third, fourth, quarterFinal, etc.)
 * @returns {Object|null} Карта або null
 */
export function getSourceForTournamentPlacement(placement) {
  // Визначаємо діапазон рівнів та шанс залежно від місця
  const config = {
    "first": { minLevel: 40, maxLevel: 50, chance: 100 },
    "second": { minLevel: 35, maxLevel: 45, chance: 100 },
    "third": { minLevel: 30, maxLevel: 40, chance: 100 },
    "fourth": { minLevel: 25, maxLevel: 35, chance: 100 },
    "quarterFinal": { minLevel: 20, maxLevel: 30, chance: 75 },
    "round8": { minLevel: 15, maxLevel: 25, chance: 50 },
    "round16": { minLevel: 10, maxLevel: 20, chance: 25 },
    "participant": { minLevel: 10, maxLevel: 15, chance: 10 },
  };
  
  const cfg = config[placement];
  if (!cfg) return null;
  
  if (!shouldDropSource(cfg.chance)) return null;
  return generateSourceCard(cfg.minLevel, cfg.maxLevel);
}

/**
 * Зберігає карту-джерело в інвентар
 * @param {Object} card - Карта-джерело
 */
export function saveSourceToInventory(card) {
  if (!card || !card.uid) return;
  
  let inventory = [];
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    inventory = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(inventory)) inventory = [];
  } catch {
    inventory = [];
  }
  
  // Додаємо карту
  inventory.push({
    ...card,
    addedAt: Date.now(),
  });
  
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
  } catch (e) {
    console.warn("[source-cards] Failed to save to inventory:", e);
  }
  
  // Також зберігаємо в історію випадань
  saveDropHistory(card);
}

/**
 * Зберігає історію випадання джерела
 * @param {Object} card - Карта-джерело
 */
function saveDropHistory(card) {
  let drops = [];
  try {
    const raw = localStorage.getItem(SOURCE_DROPS_KEY);
    drops = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(drops)) drops = [];
  } catch {
    drops = [];
  }
  
  drops.push({
    uid: card.uid,
    id: card.id,
    title: card.title,
    element: card.element,
    level: card.level,
    droppedAt: card.droppedAt || Date.now(),
  });
  
  // Зберігаємо останні 100 випадань
  if (drops.length > 100) {
    drops = drops.slice(-100);
  }
  
  try {
    localStorage.setItem(SOURCE_DROPS_KEY, JSON.stringify(drops));
  } catch (e) {
    console.warn("[source-cards] Failed to save drop history:", e);
  }
}

/**
 * Отримує всі карти-джерела з інвентарю
 * @returns {Array} Масив карт-джерел
 */
export function getSourceCardsFromInventory() {
  let inventory = [];
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    inventory = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(inventory)) inventory = [];
  } catch {
    inventory = [];
  }
  
  return inventory.filter(c => c && c.isSource);
}

/**
 * Видаляє карту-джерело з інвентарю (після використання)
 * @param {string} uid - UID карти
 */
export function removeSourceFromInventory(uid) {
  if (!uid) return;
  
  let inventory = [];
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    inventory = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(inventory)) inventory = [];
  } catch {
    inventory = [];
  }
  
  inventory = inventory.filter(c => c && c.uid !== uid);
  
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
  } catch (e) {
    console.warn("[source-cards] Failed to remove from inventory:", e);
  }
}

/**
 * Отримує назву елементу українською
 * @param {string} element - Елемент (fire, water, air, earth)
 * @returns {string}
 */
export function getElementNameUk(element) {
  const names = {
    fire: "вогню",
    water: "води",
    air: "повітря",
    earth: "землі",
  };
  return names[element] || element;
}

/**
 * Форматує інформацію про карту-джерело для UI
 * @param {Object} card - Карта-джерело
 * @returns {string}
 */
export function formatSourceCardInfo(card) {
  if (!card) return "";
  return `${card.title} (Рівень ${card.level})`;
}
