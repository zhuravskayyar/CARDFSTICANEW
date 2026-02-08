/**
 * Canon Arena Battle (6 FFA) — канонна арена
 * - 6 учасників: гравець + 5 ботів (без мережі)
 * - Цикл 9 секунд
 * - Гравець: до 3 ударів за цикл
 * - Невикористані слоти гравця переносяться на наступний цикл (оновлюються тільки порожні)
 * - Боти: 1 удар у 1-му циклі (2-га половина), 2 удари далі (1-ша + 2-га половина)
 * - Ціль бота фіксована до смерті, потім авто-перемикання
 * - observedTargetId: перегляд/атака поточної цілі + ряд 5 міні-аватарів
 */

import "../../src/account.js";
import {
  getArenaLeagueByRating,
  updateArenaRating,
  getArenaState,
  saveArenaState,
  calculateArenaReward,
  rollCardDrop,
  getArenaLeagueIconPath,
  ARENA_STARTING_RATING
} from "../../src/core/arena-leagues.js";

// ===================== CONSTANTS =====================
const CYCLE_MS = 9000;

const ELEMENTS = ["fire", "water", "air", "earth"];
const RARITIES = [1, 2, 3, 4, 5];

const BOT_NAMES = [
  "Ловкий солдат", "Осторожный воин", "Быстрый принц", "Тёмный маг", "Фёдор",
  "Натали", "Big Warrior", "Fast Fist", "Штормовой шаман", "Лесной страж"
];

const BOT_AVATARS = [
  "../../assets/cards/arts/fire_001.webp",
  "../../assets/cards/arts/water_001.webp",
  "../../assets/cards/arts/air_001.webp",
  "../../assets/cards/arts/earth_001.webp",
  "../../assets/cards/demo/fire_02.jpg",
];

// Множники (як у тебе)
const MULT = {
  fire:  { fire: 1.0, water: 0.5, air: 1.5, earth: 1.0 },
  water: { fire: 1.5, water: 1.0, air: 0.5, earth: 0.5 },
  air:   { fire: 0.5, water: 1.0, air: 1.0, earth: 1.5 },
  earth: { fire: 1.0, water: 1.5, air: 0.5, earth: 1.0 }
};

// ===================== STATE =====================
const arena = {
  phase: "fight",            // 'fight' | 'result'
  participants: [],          // [0]=player, [1..5]=bots
  observedTargetId: 1,       // 1..5

  cycleIndex: 0,
  cycleEndsAt: 0,
  timerId: null,
  botTickId: null,

  changeCardsCount: 0,       // 1-й раз безкоштовно, далі 5 (UI показує в #changeCardsCost)

  log: [],                   // останні записи
  playerDeck: [],            // 9 карт (з акаунта або fallback)
};

// ===================== BOOT =====================
document.addEventListener("DOMContentLoaded", () => {
  initArena();
  bindEvents();
  startNextCycle();
  startBotTick();
});

// ===================== INIT =====================
function initArena() {
  const acc = window.AccountSystem?.getActive?.();

  // deck (9)
  let deck = acc?.deck ?? [];
  if (!Array.isArray(deck) || deck.length < 9) deck = generateFallbackDeck(180);
  arena.playerDeck = deck.slice(0, 9).map(normalizeCard);

  const deckPower = arena.playerDeck.reduce((sum, c) => sum + (c?.power ?? 0), 0);
  const power = deckPower || acc?.duel?.power || acc?.power || 180;

  // player
  let savedAvatar = String(localStorage.getItem("cardastika:avatarUrl") || "").trim();
  // Валідація
  if (savedAvatar && !savedAvatar.startsWith("assets/")) {
    savedAvatar = "";
  }
  const playerAvatar = savedAvatar 
    ? "../../" + savedAvatar
    : "../../assets/cards/arts/fire_001.webp";
  const player = makeMage({
    id: 0,
    name: acc?.name ?? "Гравець",
    avatar: playerAvatar,
    power,
    isBot: false,
    deck: arena.playerDeck
  });

  arena.participants = [player];

  // 5 bots
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 1; i <= 5; i++) {
    const botPower = Math.round(power * (0.8 + Math.random() * 0.4));
    const bot = makeMage({
      id: i,
      name: names[i - 1] || `Бот ${i}`,
      avatar: BOT_AVATARS[(i - 1) % BOT_AVATARS.length],
      power: botPower,
      isBot: true,
      deck: generateFallbackDeck(botPower)
    });
    bot.targetId = pickNewTargetId(bot.id);
    arena.participants.push(bot);
  }

  ensureTargetsRow();
  renderTargetsRow();

  renderObservedBattle();
  updateUI();
  updateMultipliers();

  addLogEntry("Арена стартувала. Переможці — топ-3 за нанесеним уроном.");
}

function makeMage({ id, name, avatar, power, isBot, deck }) {
  const hp = power * 3;
  return {
    id, name, avatar, power, isBot,
    alive: true,
    hp, maxHp: hp,
    deck: Array.isArray(deck) && deck.length ? deck : generateFallbackDeck(power),

    // 3 слоти: card=null => слот "використано" і чекає КД
    slots: [null, null, null],
    // UI-слоти: те, що показуємо на екрані у цьому циклі
    uiSlots: [null, null, null],
    // Індивідуальний КД для кожного слоту (timestamp коли закінчиться)
    slotCooldowns: [0, 0, 0],

    // stats
    damageDone: 0,      // рейтинг

    // bots
    targetId: null,
    botPlan: null,      // {cycleIndex, times:[ms], done}
  };
}

function normalizeCard(raw) {
  if (!raw || typeof raw !== "object") return genRandomCard();
  const element = normalizeElement(raw.element || raw.elem || raw.type);
  if (!element) return genRandomCard();

  let power = Number(raw.power ?? raw.basePower ?? raw.str ?? raw.attack ?? raw.value);
  if (!Number.isFinite(power) || power < 1) power = Math.floor(Math.random() * 50) + 20;

  const rarityRaw = Number(raw.rarity ?? raw.quality ?? 1);
  const rarity = Number.isFinite(rarityRaw) ? Math.max(1, Math.min(6, Math.round(rarityRaw))) : 1;

  return {
    uid: String(raw.uid || raw.id || (Date.now() + Math.random())),
    element,
    power: Math.max(1, Math.round(power)),
    rarity,
    name: String(raw.name || raw.title || element),
    art: raw.art || raw.image || raw.img || null
  };
}

function normalizeElement(x) {
  const s = String(x || "").toLowerCase();
  if (ELEMENTS.includes(s)) return s;
  if (s === "wind") return "air";
  return null;
}

function generateFallbackDeck(targetPower = 180) {
  const deck = [];
  const avg = Math.max(10, Math.round(targetPower / 9));
  for (let i = 0; i < 9; i++) {
    const k = Math.random() * 0.4 + 0.8; // 0.8..1.2
    const power = Math.max(5, Math.round(avg * k));
    const element = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    deck.push({
      uid: `card_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      element,
      rarity: RARITIES[Math.floor(Math.random() * RARITIES.length)],
      power,
      name: element,
      art: null
    });
  }
  return deck;
}

function genRandomCard() {
  const element = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  return {
    uid: `card_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    element,
    rarity: RARITIES[Math.floor(Math.random() * RARITIES.length)],
    power: Math.floor(Math.random() * 50) + 20,
    name: element,
    art: null
  };
}

function genCardFromDeck(mage) {
  if (!mage?.deck?.length) return genRandomCard();
  const base = mage.deck[Math.floor(Math.random() * mage.deck.length)];
  return { ...normalizeCard(base), uid: `uid_${Date.now()}_${Math.random().toString(16).slice(2)}` };
}

function rand(a, b) {
  return Math.floor(a + Math.random() * (b - a + 1));
}

function formatMult(m) {
  return (m % 1 === 0) ? m.toFixed(0) : m.toFixed(1);
}

function generateDroppedCard(league) {
  // Генерує карту на основі ліги арени
  const element = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  const baseRarity = league ? Math.min(5, Math.floor(league.minRating / 800) + 1) : 1;
  const rarity = Math.min(5, Math.max(1, baseRarity + (Math.random() > 0.7 ? 1 : 0)));
  const power = Math.floor(20 + Math.random() * 30 + rarity * 10);
  
  return {
    uid: `drop_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    element,
    rarity,
    power,
    name: `${element.charAt(0).toUpperCase() + element.slice(1)} Card`,
    art: null,
    source: "arena"
  };
}

// ===================== CYCLE =====================
function startNextCycle() {
  if (arena.phase !== "fight") return;

  arena.cycleIndex++;
  arena.cycleEndsAt = Date.now() + CYCLE_MS;

  // refill ONLY empty slots => перенос невикористаних
  for (const p of arena.participants) {
    if (!p.alive) continue;
    for (let i = 0; i < 3; i++) {
      if (p.slots[i] == null) p.slots[i] = genCardFromDeck(p);
      // На початку циклу: КД = 0 (всі слоти готові для циклу)
      p.slotCooldowns[i] = 0;
    }
    // СНАПШОТ ДЛЯ UI: показуємо карти цього циклу стабільно
    p.uiSlots = p.slots.map(c => c ? ({ ...c }) : null);
  }

  // plan bots for this cycle
  for (const p of arena.participants) {
    if (p.isBot && p.alive) planBotForCycle(p);
  }

  renderTargetsRow();
  renderObservedBattle();
  updateUI();
  updateMultipliers();

  addLogEntry(`--- Цикл ${arena.cycleIndex} ---`);

  if (arena.timerId) clearInterval(arena.timerId);
  arena.timerId = setInterval(() => {
    const now = Date.now();
    const player = arena.participants[0];

    // Перевіряємо і рефілимо слоти гравця, чиї КД закінчились
    for (let i = 0; i < 3; i++) {
      if (!player.slots[i] && now >= player.slotCooldowns[i]) {
        player.slots[i] = genCardFromDeck(player);
        player.uiSlots[i] = { ...player.slots[i] };
        renderObservedBattle();
        updateMultipliers();
      }
    }

    // То саме для botів
    for (const p of arena.participants) {
      if (!p.isBot || !p.alive) continue;
      for (let i = 0; i < 3; i++) {
        if (!p.slots[i] && now >= p.slotCooldowns[i]) {
          p.slots[i] = genCardFromDeck(p);
          p.uiSlots[i] = { ...p.slots[i] };
        }
      }
    }

    // Update UI для таймерів
    updateCooldownUI();

    if (checkEndConditions()) endFight();
  }, 100);
}

function updateCooldownUI() {
  const now = Date.now();
  const player = arena.participants[0];
  const target = getObservedTarget();

  // Для кожного слоту розраховуємо залишок часу
  for (let i = 0; i < 3; i++) {
    const pt = document.getElementById(`playerCard${i}Timer`);
    const et = document.getElementById(`enemyCard${i}Timer`);

    // Мій слот
    if (pt) {
      const hasCard = !!player?.slots[i];
      const cooldownEnd = player?.slotCooldowns?.[i] || 0;
      const remaining = Math.max(0, Math.ceil((cooldownEnd - now) / 1000));
      const inCd = !hasCard && remaining > 0;

      pt.style.display = inCd ? "flex" : "none";
      if (inCd) pt.textContent = `${remaining} сек`;
    }

    // Верхній слот синхронізуємо з моїм
    if (et) {
      const hasCard = !!player?.slots[i];
      const cooldownEnd = player?.slotCooldowns?.[i] || 0;
      const remaining = Math.max(0, Math.ceil((cooldownEnd - now) / 1000));
      const inCd = !hasCard && remaining > 0;

      et.style.display = inCd ? "flex" : "none";
      if (inCd) et.textContent = `${remaining} сек`;
    }
  }
}

// ===================== BOT AI (canonical) =====================
function planBotForCycle(bot) {
  // Для кожного бота встановлюємо випадковий час першої атаки в цьому циклі
  bot.nextAttackTime = Date.now() + rand(500, 2000);
}

function startBotTick() {
  if (arena.botTickId) clearInterval(arena.botTickId);
  arena.botTickId = setInterval(() => {
    if (arena.phase !== "fight") return;
    botTick(Date.now());
  }, 80);
}

function botTick(now) {
  for (const bot of arena.participants) {
    if (!bot.isBot || !bot.alive) continue;

    // Іноді бот змінює ціль (10% шанс на тік)
    if (Math.random() < 0.1) {
      bot.targetId = pickNewTargetId(bot.id);
    }

    // Якщо час атакувати
    if (now >= bot.nextAttackTime) {
      // Вибір цілі, якщо немає
      if (bot.targetId == null || !arena.participants[bot.targetId]?.alive) {
        bot.targetId = pickNewTargetId(bot.id);
      }
      if (bot.targetId == null) continue;

      const slot = pickBestSlot(bot.id, bot.targetId);
      if (slot !== -1) {
        performHit(bot.id, bot.targetId, slot);

        renderTargetsRow();
        renderObservedBattle();
        updateUI();
        updateMultipliers();

        if (checkEndConditions()) {
          endFight();
          return;
        }
      }

      // Встановлюємо час наступної атаки: випадково 1-3 сек
      bot.nextAttackTime = now + rand(1000, 3000);
    }
  }
}

function pickBestSlot(attackerId, targetId) {
  const a = arena.participants[attackerId];
  const t = arena.participants[targetId];
  if (!a || !t) return -1;

  let best = -1;
  let bestDmg = -1;

  for (let i = 0; i < 3; i++) {
    const atk = a.slots[i];
    if (!atk) continue;
    const def = t.slots[i];
    const mult = def ? (MULT[atk.element][def.element] ?? 1.0) : 1.0;
    const dmg = Math.round(atk.power * mult);
    if (dmg > bestDmg) { bestDmg = dmg; best = i; }
  }
  return best;
}

// ===================== PLAYER ACTIONS =====================
function playerUseSlot(slotIndex) {
  if (arena.phase !== "fight") return;

  const player = arena.participants[0];
  if (!player?.alive) return;

  if (!player.slots[slotIndex]) {
    showToast("Цей слот в КД — чекай 9 сек");
    return;
  }

  // Перевірка КД слоту (для подвійної безпеки)
  if (Date.now() < player.slotCooldowns[slotIndex]) {
    showToast(`Слот ще в КД...`);
    return;
  }

  // якщо ціль померла — б'ємо по наступній живій (канон)
  let targetId = arena.observedTargetId;
  console.log(`Гравець атакує слот ${slotIndex}, ціль ${targetId}`);
  if (!arena.participants[targetId]?.alive) {
    targetId = findNextAliveAfter(targetId);
    if (targetId == null) return;
    arena.observedTargetId = targetId;
    console.log(`Ціль змінилася на ${targetId}`);
  }

  const ok = performHit(0, targetId, slotIndex);
  if (!ok) return;

  renderTargetsRow();
  renderObservedBattle();
  updateUI();
  updateMultipliers();

  if (checkEndConditions()) endFight();
}

function changeTargetCyclic() {
  const next = findNextAliveAfter(arena.observedTargetId);
  if (next == null) return;
  arena.observedTargetId = next;

  renderTargetsRow();
  renderObservedBattle();
  updateUI();
  updateMultipliers();
}

function changeCardsPlayer() {
  const player = arena.participants[0];
  if (!player?.alive) return;

  arena.changeCardsCount++;
  const cost = arena.changeCardsCount === 1 ? 0 : 5;
  const costEl = document.getElementById("changeCardsCost");
  if (costEl) costEl.textContent = String(cost);

  // Канон: змінюємо 3 карти на полі одразу
  player.slots = [genCardFromDeck(player), genCardFromDeck(player), genCardFromDeck(player)];
  player.slotCooldowns = [0, 0, 0]; // Обнуляємо КД для нових карт
  player.uiSlots = player.slots.map(c => c ? ({ ...c }) : null);

  addLogEntry(`${player.name} змінює карти (вартість: ${cost})`);

  renderObservedBattle();
  updateUI();
  updateMultipliers();
}

// ===================== HIT RESOLUTION =====================
function performHit(attackerId, targetId, slotIndex) {
  const a = arena.participants[attackerId];
  const t = arena.participants[targetId];
  if (!a || !t) return false;
  if (!a.alive || !t.alive) return false;

  const atk = a.slots[slotIndex];
  if (!atk) return false;

  const def = t.slots[slotIndex];
  // Атака відбувається навіть якщо у цілі немає карти в цьому слоті

  const mult = def ? (MULT[atk.element][def.element] ?? 1.0) : 1.0;
  const dmg = Math.round(atk.power * mult);

  t.hp = Math.max(0, t.hp - dmg);
  if (attackerId === 0) a.hp = Math.max(0, a.hp - dmg); // Тільки при атаці гравця він теж втрачає HP
  a.damageDone += dmg;

  console.log(`Атака: ${a.name} (${attackerId}) -> ${t.name} (${targetId}), слот ${slotIndex}, dmg ${dmg}, HP ${t.name} тепер ${t.hp}`);

  const multText = mult !== 1 ? ` (x${formatMult(mult)})` : "";
  addLogEntry(`${a.name} → ${t.name}, слот ${slotIndex + 1}: ${dmg} шкоди${multText}`);

  // Витрата слоту: встановлюємо КД 9 сек для цього слоту атакуючого
  a.slots[slotIndex] = null;
  a.slotCooldowns[slotIndex] = Date.now() + 9000;

  // Для цілі: якщо атакує гравець, витрачаємо слот і добираємо нову карту негайно (як у дуелі)
  if (attackerId === 0) {
    t.slots[slotIndex] = genCardFromDeck(t);
  }

  // Після атаки НЕ змінюємо ціль автоматично - гравець сам переключає

  // смерть
  if (t.hp <= 0) {
    t.alive = false;
    addLogEntry(`☠ ${t.name} повалений. Останній удар: ${a.name}`);

    // боти, що били цю ціль — перевибирають
    for (const bot of arena.participants) {
      if (bot.isBot && bot.alive && bot.targetId === t.id) {
        bot.targetId = pickNewTargetId(bot.id);
      }
    }

    // якщо спостерігали — авто-перемикнути
    if (arena.observedTargetId === t.id) {
      const next = findNextAliveAfter(t.id);
      if (next != null) arena.observedTargetId = next;
    }
  }

  return true;
}

// ===================== END / RESULT =====================
function checkEndConditions() {
  return arena.participants.filter(p => p.alive).length <= 3;
}

function endFight() {
  if (arena.phase !== "fight") return;
  arena.phase = "result";

  if (arena.timerId) clearInterval(arena.timerId);
  if (arena.botTickId) clearInterval(arena.botTickId);

  const ranked = [...arena.participants].sort((a, b) => b.damageDone - a.damageDone);

  addLogEntry(`=== Бій завершено ===`);
  addLogEntry(`Топ-3: ${ranked.slice(0, 3).map(w => `${w.name} (${w.damageDone})`).join(", ")}`);

  // Визначаємо місце гравця (1-6)
  const player = arena.participants[0];
  const aliveCount = arena.participants.filter(p => p.alive).length;
  let playerPlace;
  if (player.alive) {
    // Живі отримують місця 1, 2, 3
    const aliveByDamage = arena.participants.filter(p => p.alive).sort((a, b) => b.damageDone - a.damageDone);
    playerPlace = aliveByDamage.findIndex(p => p.id === 0) + 1;
  } else {
    // Мертві отримують місця 4, 5, 6 (порядок смерті)
    const deadByDamage = ranked.filter(p => !p.alive);
    playerPlace = aliveCount + deadByDamage.findIndex(p => p.id === 0) + 1;
  }

  // Оновлюємо рейтинг арени (перемога якщо живий, поразка якщо ні)
  const result = player.alive ? "win" : "lose";
  const ratingResult = updateArenaRating(result, player.damageDone);

  // Обчислюємо нагороди
  const rewards = calculateArenaReward(ratingResult.newLeague);
  const hasCardDrop = rollCardDrop();
  const droppedCard = hasCardDrop ? generateDroppedCard(ratingResult.newLeague) : null;

  // Нараховуємо нагороди до акаунту
  let silverToAdd = 0;
  if (player.alive) {
    silverToAdd += (rewards.silver || 0);
  }
  if (ratingResult.promoReward) {
    silverToAdd += ratingResult.promoReward.silver;
  }
  
  if (window.AccountSystem?.updateActive) {
    window.AccountSystem.updateActive((a) => {
      if (silverToAdd > 0) {
        a.silver = (a.silver || 0) + silverToAdd;
        a.gems = a.silver; // sync alias
      }
      if (droppedCard) {
        a.inventory = a.inventory || [];
        a.inventory.push(droppedCard);
      }
    });
  } else {
    // Fallback: оновлюємо localStorage напряму (як у дуелях)
    if (silverToAdd > 0) {
      try {
        const curSilver = Number(localStorage.getItem("cardastika:silver")) || 0;
        const newSilver = Math.max(0, curSilver + silverToAdd);
        localStorage.setItem("cardastika:silver", String(newSilver));
        localStorage.setItem("cardastika:gems", String(newSilver)); // sync alias
      } catch { /* ignore */ }
    }
  }

  showResultScreen(ranked, {
    oldRating: ratingResult.oldRating,
    newRating: ratingResult.newRating,
    change: ratingResult.ratingChange,
    oldLeague: ratingResult.oldLeague,
    newLeague: ratingResult.newLeague,
    promoted: ratingResult.leagueChanged && ratingResult.newLeague.minRating > ratingResult.oldLeague.minRating,
    demoted: ratingResult.leagueChanged && ratingResult.newLeague.minRating < ratingResult.oldLeague.minRating,
    rewards: player.alive ? rewards : { silver: 0 },
    droppedCard,
    playerPlace,
    promoReward: ratingResult.promoReward
  });
}

function showResultScreen(ranked, leagueData = {}) {
  const player = arena.participants[0];
  const playerAlive = player?.alive;
  const { 
    oldRating = 0, newRating = 0, change = 0, 
    oldLeague, newLeague, promoted, demoted, 
    rewards = {}, droppedCard, playerPlace = 1 
  } = leagueData;
  
  // Живі автоматично топ 3
  const aliveCount = arena.participants.filter(p => p.alive).length;
  const playerRank = playerAlive ? Math.min(aliveCount, 3) : (aliveCount + ranked.filter(p => !p.alive).findIndex(p => p.id === 0) + 1);

  // Ховаємо бойовий фрейм
  const arenaFrame = document.querySelector(".battle-arena-frame");
  if (arenaFrame) arenaFrame.style.display = "none";

  // Ховаємо кнопки дій
  const actions = document.querySelector(".arena-actions--fixed");
  if (actions) actions.style.display = "none";

  // Ховаємо панелі enemy і player (червону і синю)
  const enemyPanel = document.querySelector(".battle-player--enemy");
  if (enemyPanel) enemyPanel.style.display = "none";
  const playerPanel = document.querySelector(".battle-player--self");
  if (playerPanel) playerPanel.style.display = "none";

  // Ховаємо targets row
  const targetsRow = document.getElementById("targetsRow");
  if (targetsRow) targetsRow.style.display = "none";

  // Результат-банер з лігою
  const changeSign = change >= 0 ? '+' : '';
  const changeColor = change >= 0 ? '#5bff5b' : '#ff6b6b';
  const leagueIcon = newLeague ? getArenaLeagueIconPath(newLeague.id) : '';
  
  let statusText = playerAlive ? '🏆 Перемога!' : '💀 Ви пали.';
  if (promoted) statusText += ' ⬆️ Підвищення!';
  if (demoted) statusText += ' ⬇️ Пониження';

  // Вставляємо банер між targets і логом
  const screen = document.getElementById("screen");
  if (screen) {
    screen.classList.add("is-result");
    
    const banner = document.createElement("div");
    banner.className = "arena-result-banner";
    banner.innerHTML = `
      <div class="arena-result-content">
        <div class="arena-result-text">${statusText}</div>
        <div class="arena-result-place">Місце: #${playerPlace}</div>
        <div class="arena-result-league">
          ${leagueIcon ? `<img class="arena-result-league-icon" src="${leagueIcon}" alt="">` : ''}
          <span class="arena-result-league-name">${newLeague?.name || 'Арена'}</span>
        </div>
        <div class="arena-result-rating">
          <span class="arena-result-rating-value">${newRating}</span>
          <span class="arena-result-rating-change" style="color: ${changeColor}">(${changeSign}${change})</span>
        </div>
      </div>`;

    const logSection = screen.querySelector(".battle-log");
    if (logSection) {
      screen.insertBefore(banner, logSection);
    } else {
      screen.appendChild(banner);
    }
  }

  // Статистика в лог
  const logHost = document.getElementById("battleLog");
  const battleLog = logHost?.closest(".battle-log");
  if (battleLog) battleLog.classList.add("is-result");
  
  if (logHost) {
    // Розділяємо на живих і мертвих, сортуємо по damageDone
    const alive = ranked.filter(p => p.alive).slice(0, 3);
    const dead = ranked.filter(p => !p.alive).slice(0, 3);

    let statsHtml = ``;

    // Нагороди
    if (rewards.silver > 0 || droppedCard) {
      statsHtml += `<div class="result-header result-header--rewards">🎁 Нагороди</div>`;
      statsHtml += `<div class="result-rewards">`;
      if (rewards.silver > 0) {
        statsHtml += `<div class="result-reward-item">
          <img class="result-reward-icon-img" src="../../assets/icons/coin-silver.svg" alt="Срібло">
          <span class="result-reward-value">+${rewards.silver}</span>
          <span class="result-reward-label">срібла</span>
        </div>`;
      }
      if (droppedCard) {
        statsHtml += `<div class="result-reward-item result-reward-item--card">
          <span class="result-reward-icon">🃏</span>
          <span class="result-reward-value">Нова картка!</span>
          <span class="result-reward-label">${droppedCard.name || 'Рідкісність ' + droppedCard.rarity}</span>
        </div>`;
      }
      statsHtml += `</div>`;
    }

    // Топ 3 живих
    if (alive.length > 0) {
      statsHtml += `<div class="result-header">🏆 Переможці</div>`;
      statsHtml += `<div class="result-stats-list">`;
      for (let idx = 0; idx < alive.length; idx++) {
        const p = alive[idx];
        const isPlayer = p.id === 0;
        const dealt = p.damageDone || 0;
        const hp = Math.max(0, p.hp || 0);
        const borderColor = isPlayer ? '#50beff' : '#ffc832';

        statsHtml += `
          <div class="result-stat-row ${isPlayer ? 'result-stat-row--player' : ''}">
            <span class="result-stat-rank">#${idx + 1}</span>
            <div class="result-stat-avatar-wrap" style="border-color: ${borderColor}">
              <img class="result-stat-avatar" src="${p.avatar}" alt="${p.name}">
            </div>
            <div class="result-stat-info">
              <span class="result-stat-name">${p.name}</span>
              <div class="result-stat-bars">
                <div class="result-stat-hp">
                  <span class="result-stat-hp-icon">❤️</span>
                  <span class="result-stat-hp-value">${hp}</span>
                </div>
              </div>
            </div>
            <div class="result-stat-damage">
              <div class="result-stat-dealt-row">
                <img class="result-stat-swords" src="../../assets/icons/swords-umgewandelt-von-png.svg" alt="">
                <span class="result-stat-dealt-value">${dealt}</span>
              </div>
            </div>
          </div>`;
      }
      statsHtml += `</div>`;
    }

    // Топ 3 мертвих
    if (dead.length > 0) {
      statsHtml += `<div class="result-header result-header--dead">☠️ Полеглі</div>`;
      statsHtml += `<div class="result-stats-list">`;
      for (let idx = 0; idx < dead.length; idx++) {
        const p = dead[idx];
        const isPlayer = p.id === 0;
        const dealt = p.damageDone || 0;

        statsHtml += `
          <div class="result-stat-row is-defeated ${isPlayer ? 'result-stat-row--player' : ''}">
            <span class="result-stat-rank">#${idx + 1}</span>
            <div class="result-stat-avatar-wrap is-defeated" style="border-color: #666">
              <img class="result-stat-avatar" src="${p.avatar}" alt="${p.name}">
              <div class="result-stat-tombstone">R.I.P.</div>
            </div>
            <div class="result-stat-info">
              <span class="result-stat-name">${p.name}</span>
              <div class="result-stat-bars">
                <div class="result-stat-hp is-zero">
                  <span class="result-stat-hp-icon">💀</span>
                  <span class="result-stat-hp-value">0</span>
                </div>
              </div>
            </div>
            <div class="result-stat-damage">
              <div class="result-stat-dealt-row">
                <img class="result-stat-swords" src="../../assets/icons/swords-umgewandelt-von-png.svg" alt="">
                <span class="result-stat-dealt-value">${dealt}</span>
              </div>
            </div>
          </div>`;
      }
      statsHtml += `</div>`;
    }
    statsHtml += `
      <div class="result-continue">
        <button class="result-continue-btn" id="resultContinueBtn">Продовжити</button>
      </div>`;

    logHost.innerHTML = statsHtml;

    document.getElementById("resultContinueBtn")?.addEventListener("click", () => {
      window.location.href = "arena.html";
    });
  }

  // Стилі результату
  addResultStyles();
}

function renderFinalTargetsRow() {
  const row = document.getElementById("targetsRow");
  if (!row) return;
  row.innerHTML = "";

  // Показуємо всіх учасників (включаючи гравця) у фінальному стані
  for (let i = 0; i < arena.participants.length; i++) {
    const p = arena.participants[i];
    if (!p) continue;

    const btn = document.createElement("div");
    btn.className = "arena-target arena-target--final";
    if (!p.alive) btn.classList.add("is-defeated");
    if (i === 0) btn.classList.add("is-player");

    btn.innerHTML = `
      <img class="arena-target__avatar" src="${p.avatar}" alt="${p.name}">
      <span class="arena-target__hp">${p.alive ? p.hp : 0}</span>
      ${!p.alive ? '<div class="arena-target__rip">☠️</div>' : ''}
    `;

    row.appendChild(btn);
  }
}

function addResultStyles() {
  if (document.getElementById("arena-result-styles")) return;

  const style = document.createElement("style");
  style.id = "arena-result-styles";
  style.textContent = `
    .arena-result-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: linear-gradient(135deg, rgba(0,0,0,0.7), rgba(30,30,30,0.9));
      border: 1px solid rgba(255,200,50,0.3);
      border-radius: 8px;
      margin: 8px 0;
    }
    .arena-result-text {
      font-size: 1.2rem;
      font-weight: 600;
      color: #fff;
      text-align: center;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    }
    .result-header {
      text-align: center;
      font-size: 1.1rem;
      font-weight: 600;
      color: #ffc832;
      margin-bottom: 12px;
      margin-top: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,200,50,0.3);
    }
    .result-header:first-child {
      margin-top: 0;
    }
    .result-header--dead {
      color: #ff6b6b;
      border-bottom-color: rgba(255,107,107,0.3);
    }
    .result-stat-rank {
      font-weight: 700;
      font-size: 1rem;
      min-width: 32px;
      color: #ffc832;
    }
    .result-stat-row.is-defeated .result-stat-rank {
      color: #888;
    }
    .result-stats-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 8px;
    }
    .result-stat-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: linear-gradient(135deg, rgba(40,40,50,0.9), rgba(20,20,30,0.95));
      border: 1px solid rgba(100,100,120,0.3);
      border-radius: 8px;
    }
    .result-stat-row--player {
      background: linear-gradient(135deg, rgba(50,80,120,0.9), rgba(30,50,80,0.95));
      border: 1px solid rgba(80,190,255,0.4);
    }
    .result-stat-row.is-defeated {
      opacity: 0.7;
      background: linear-gradient(135deg, rgba(30,30,35,0.9), rgba(15,15,20,0.95));
    }
    .result-stat-avatar-wrap {
      position: relative;
      width: 48px;
      height: 48px;
      flex-shrink: 0;
      border: 2px solid #ffc832;
      border-radius: 6px;
      overflow: hidden;
    }
    .result-stat-avatar-wrap.is-defeated {
      border-color: #666;
    }
    .result-stat-avatar {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .result-stat-avatar-wrap.is-defeated .result-stat-avatar {
      filter: grayscale(1) brightness(0.5);
    }
    .result-stat-tombstone {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: #888;
      background: rgba(0,0,0,0.7);
    }
    .result-stat-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .result-stat-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: #fff;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .result-stat-bars {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .result-stat-hp {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .result-stat-hp-icon {
      font-size: 0.8rem;
    }
    .result-stat-hp-value {
      font-size: 0.85rem;
      font-weight: 600;
      color: #5bff5b;
    }
    .result-stat-hp.is-zero .result-stat-hp-value {
      color: #ff6b6b;
    }
    .result-stat-damage {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .result-stat-dealt-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .result-stat-swords {
      width: 20px;
      height: 20px;
      opacity: 0.9;
    }
    .result-stat-dealt-value {
      font-size: 1rem;
      font-weight: 700;
      color: #ffc832;
      min-width: 50px;
      text-align: right;
    }
    .result-continue {
      margin-top: 16px;
      text-align: center;
    }
    .result-continue-btn {
      background: url('../../assets/textures/btn-gold.png') center/cover no-repeat;
      border: none;
      color: #1a1a2e;
      padding: 14px 48px;
      border-radius: 8px;
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      text-shadow: 0 1px 0 rgba(255,255,255,0.3);
    }
    .result-continue-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 16px rgba(255,200,50,0.4);
    }
    .battle-log.is-result {
      max-height: none !important;
      overflow: visible !important;
      flex: 1;
    }
    .battle-log.is-result .battle-log__entries {
      max-height: none !important;
      overflow: visible !important;
    }
    .battle-log.is-result .battle-log__title {
      display: none;
    }
    .screen.is-result {
      overflow: visible !important;
    }
    .arena-target--final {
      pointer-events: none;
    }
    .arena-target--final.is-player {
      border: 2px solid #50beff;
    }
    .arena-target__rip {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      background: rgba(0,0,0,0.6);
      border-radius: inherit;
    }
    /* Нові стилі для ліги та нагород */
    .arena-result-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: 100%;
    }
    .arena-result-place {
      font-size: 1rem;
      color: #ffc832;
      font-weight: 600;
    }
    .arena-result-league {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .arena-result-league-icon {
      width: 32px;
      height: 32px;
    }
    .arena-result-league-name {
      font-size: 0.95rem;
      color: #c084fc;
      font-weight: 600;
    }
    .arena-result-rating {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .arena-result-rating-value {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
    }
    .arena-result-rating-change {
      font-size: 0.95rem;
      font-weight: 600;
    }
    .result-header--rewards {
      color: #5bff5b;
      border-bottom-color: rgba(91,255,91,0.3);
    }
    .result-rewards {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
      padding: 12px;
      background: linear-gradient(135deg, rgba(40,50,40,0.9), rgba(20,30,20,0.95));
      border: 1px solid rgba(91,255,91,0.3);
      border-radius: 8px;
    }
    .result-reward-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .result-reward-icon {
      font-size: 1.2rem;
    }
    .result-reward-icon-img {
      width: 24px;
      height: 24px;
    }
    .result-reward-value {
      font-size: 1rem;
      font-weight: 700;
      color: #ffc832;
    }
    .result-reward-label {
      font-size: 0.85rem;
      color: #aaa;
    }
    .result-reward-item--card .result-reward-value {
      color: #c084fc;
    }
  `;
  document.head.appendChild(style);
}

// ===================== TARGETS / HELPERS =====================
function pickNewTargetId(selfId) {
  const alive = arena.participants.filter(p => p.id !== selfId && p.alive);
  if (!alive.length) return null;
  
  // 10% шанс атакувати гравця, 90% - інших ботів
  const bots = alive.filter(p => p.id !== 0);
  if (bots.length > 0 && Math.random() > 0.1) {
    // Атакуємо бота
    return bots[Math.floor(Math.random() * bots.length)].id;
  }
  // Атакуємо гравця або бота (якщо ботів немає)
  return alive[Math.floor(Math.random() * alive.length)].id;
}

function findNextAliveAfter(currentId) {
  // циклічно 1..5 (UI цілей)
  for (let step = 1; step <= 6; step++) {
    const id = ((currentId + step) % 6);
    if (id === 0) continue;
    if (arena.participants[id]?.alive) return id;
  }
  return null;
}

function getObservedTarget() {
  const t = arena.participants[arena.observedTargetId];
  return t && t.alive ? t : null;
}

// ===================== UI =====================
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(v ?? "");
}
function setImg(id, src) {
  const el = document.getElementById(id);
  if (el && src) el.src = src;
}
function setHpBar(id, hp, maxHp) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  el.style.setProperty("--hp-pct", `${Math.max(0, Math.min(100, pct))}%`);
}

function updateUI() {
  const player = arena.participants[0];
  const target = getObservedTarget();

  // player
  setText("playerHp", player?.hp ?? 0);
  setHpBar("playerHpBar", player?.hp ?? 0, player?.maxHp ?? 1);
  const pName = document.getElementById("playerName");
  if (pName) pName.innerHTML = `<span class="battle-player__rarity">🏆</span>${player?.name ?? "Гравець"}`;
  setImg("playerAvatar", player?.avatar);

  // enemy (observed)
  if (target) {
    setText("enemyHp", target.hp);
    setHpBar("enemyHpBar", target.hp, target.maxHp);
    const eName = document.getElementById("enemyName");
    if (eName) eName.innerHTML = `<span class="battle-player__rarity">🏆</span>${target.name}`;
    setImg("enemyAvatar", target.avatar);
  } else {
    setText("enemyHp", 0);
    const eName = document.getElementById("enemyName");
    if (eName) eName.innerHTML = `<span class="battle-player__rarity">🏆</span>Немає цілі`;
  }

  // enemies left
  const aliveEnemies = arena.participants.slice(1).filter(p => p.alive).length;
  setText("enemiesCount", aliveEnemies);

  // changeCardsCost
  const cost = arena.changeCardsCount <= 1 ? 0 : 5;
  setText("changeCardsCost", cost);
}

function updateMultipliers() {
  const player = arena.participants[0];
  const target = getObservedTarget();
  for (let i = 0; i < 3; i++) {
    const multEl = document.getElementById(`mult${i}`);
    const tEl = document.getElementById(`multText${i}`);
    const playerDmgEl = document.getElementById(`playerDamage${i}`);
    const enemyDmgEl = document.getElementById(`enemyDamage${i}`);
    
    if (!tEl) continue;
    
    const p = player?.slots[i];
    const e = target?.uiSlots?.[i];
    const m = (p && e) ? (MULT[p.element][e.element] ?? 1.0) : 1.0;
    tEl.textContent = `x${formatMult(m)}`;

    // Обчислюємо урон в обидва боки
    if (playerDmgEl && p && e) {
      const playerDmg = Math.round(p.power * m);
      // playerDmgEl.textContent = `${playerDmg}`;
    } else if (playerDmgEl) {
      // playerDmgEl.textContent = '';
    }
    
    if (enemyDmgEl && e && p) {
      const enemyMult = MULT[e.element]?.[p.element] ?? 1.0;
      const enemyDmg = Math.round(e.power * enemyMult);
      // enemyDmgEl.textContent = `${enemyDmg}`;
    } else if (enemyDmgEl) {
      // enemyDmgEl.textContent = '';
    }

    if (multEl) {
      multEl.classList.remove("battle-multiplier--bonus", "battle-multiplier--penalty");
      if (m > 1) multEl.classList.add("battle-multiplier--bonus");
      if (m < 1) multEl.classList.add("battle-multiplier--penalty");
    }
  }
}

function renderObservedBattle() {
  const player = arena.participants[0];
  const target = getObservedTarget();

  // player cards
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`playerCard${i}`);
    if (!el) continue;
    const card = player?.slots[i];
    if (!card) {
      el.className = "ref-card rarity-1 is-mystery";
      el.innerHTML = `<span class="ref-card__top"><span class="ref-card__power">?</span></span>
        <span class="ref-card__art"></span><span class="ref-card__elem"></span>
        <div class="ref-card__cooldown" id="playerCard${i}Timer" style="display:flex;">9 сек</div>`;
      continue;
    }
    el.className = `ref-card elem-${card.element} rarity-${card.rarity}`;
    el.innerHTML = `<span class="ref-card__top"><span class="ref-card__power">${card.power}</span></span>
      <span class="ref-card__art" style="background-image: linear-gradient(135deg, var(--color-${card.element}), var(--color-${card.element}-light))"></span>
      <span class="ref-card__elem"></span>
      <div class="ref-card__cooldown" id="playerCard${i}Timer" style="display:none;">9 сек</div>`;
  }

  // enemy cards (observed, not clickable)
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById(`enemyCard${i}`);
    if (!el) continue;
    el.disabled = true;
    const card = target?.uiSlots?.[i];
    const playerInCd = !arena.participants[0]?.slots[i];

    // Якщо слот гравця в КД — у ворога теж рендеримо mystery з таймером
    if (playerInCd) {
      el.className = "ref-card rarity-1 is-mystery";
      el.innerHTML = `<span class="ref-card__top"><span class="ref-card__power">?</span></span>
        <span class="ref-card__art"></span><span class="ref-card__elem"></span>
        <div class="ref-card__cooldown" id="enemyCard${i}Timer" style="display:flex;">9 сек</div>`;
      continue;
    }

    if (!card) {
      el.className = "ref-card rarity-1 is-mystery";
      el.innerHTML = `<span class="ref-card__top"><span class="ref-card__power">?</span></span>
        <span class="ref-card__art"></span><span class="ref-card__elem"></span>
        <div class="ref-card__cooldown" id="enemyCard${i}Timer" style="display:flex;">9 сек</div>`;
      continue;
    }
    el.className = `ref-card elem-${card.element} rarity-${card.rarity}`;
    el.innerHTML = `<span class="ref-card__top"><span class="ref-card__power">${card.power}</span></span>
      <span class="ref-card__art" style="background-image: linear-gradient(135deg, var(--color-${card.element}), var(--color-${card.element}-light))"></span>
      <span class="ref-card__elem"></span>
      <div class="ref-card__cooldown" id="enemyCard${i}Timer" style="display:none;">9 сек</div>`;
  }

  updateCooldownUI(Math.max(0, Math.ceil((arena.cycleEndsAt - Date.now()) / 1000)));
}

function ensureTargetsRow() {
  let row = document.getElementById("targetsRow");
  if (row) return;
  // якщо в HTML не вставили — створимо прямо під enemy panel
  const screen = document.getElementById("screen");
  if (!screen) return;
  row = document.createElement("div");
  row.id = "targetsRow";
  row.className = "arena-targets-row";
  screen.insertBefore(row, screen.querySelector(".battle-arena-frame"));
}

function renderTargetsRow() {
  const row = document.getElementById("targetsRow");
  if (!row) return;
  row.innerHTML = "";

  for (let i = 1; i <= 5; i++) {
    const t = arena.participants[i];
    if (!t) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arena-target";
    if (i === arena.observedTargetId) btn.classList.add("is-selected");
    if (!t.alive) btn.classList.add("is-defeated");

    btn.innerHTML = `
      <img class="arena-target__avatar" src="${t.avatar}" alt="${t.name}">
      <span class="arena-target__hp">${t.alive ? t.hp : 0}</span>
    `;

    btn.addEventListener("click", () => {
      if (!t.alive) return;
      arena.observedTargetId = i;
      renderTargetsRow();
      renderObservedBattle();
      updateUI();
      updateMultipliers();
    });

    row.appendChild(btn);
  }
}

// ===================== EVENTS =====================
function bindEvents() {
  for (let i = 0; i < 3; i++) {
    document.getElementById(`playerCard${i}`)?.addEventListener("click", () => playerUseSlot(i));
  }

  document.getElementById("changeTargetBtn")?.addEventListener("click", changeTargetCyclic);
  document.getElementById("changeCardsBtn")?.addEventListener("click", changeCardsPlayer);

  // botbar routes (як в інших екранах)
  document.querySelectorAll("[data-route]")?.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const route = e.currentTarget.dataset.route;
      const routes = {
        home: "../../index.html",
        profile: "../../pages/profile/profile.html",
        guild: "../../pages/guild/guild.html",
      };
      if (routes[route]) window.location.href = routes[route];
    });
  });
}

// ===================== LOG / TOAST =====================
function addLogEntry(message) {
  const time = new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  arena.log.push({ time, message });
  // канон: показуємо останні 7 ударів/подій
  if (arena.log.length > 50) arena.log.shift();
  renderBattleLog();
}

function renderBattleLog() {
  const host = document.getElementById("battleLog");
  if (!host) return;
  const last = arena.log.slice(-7);
  host.innerHTML = last.map(x => `
    <div class="battle-log__entry">
      <span class="battle-log__time">${x.time}</span>
      <span class="battle-log__msg">${x.message}</span>
    </div>
  `).join("");
  host.scrollTop = host.scrollHeight;
}

function showToast(message) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  host.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast--fade");
    setTimeout(() => toast.remove(), 280);
  }, 1800);
}
