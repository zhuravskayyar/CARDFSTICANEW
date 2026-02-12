// tournament-battle.js - Логіка турнірного бою

import "../../src/account.js";
import "../../src/progression-system.js";
import { ensureCardCatalogLoaded, resolveCardArt } from "../../src/core/card.js";
import {
  applyItemsToDeckAndHp,
  createArtifactRuntime,
  applyArtifactOutgoingDamage,
  applyArtifactIncomingDamage,
  tryArtifactRevive,
  tryArtifactVoodoo,
} from "../../src/core/equipment-system.js";
import { 
  applyBuffToDeck, 
  BUFF_TYPES, 
  ELEMENT_MULT,
  getRoundName,
  loadTournamentState,
  saveTournamentState 
} from "../../src/core/tournament-leagues.js";

// ==========================================
// КОНФІГУРАЦІЯ
// ==========================================

const ELEMENTS = ["fire", "water", "air", "earth"];

const MULT = {
  fire:  { fire: 1.0, water: 0.5, air: 1.5, earth: 1.0 },
  water: { fire: 1.5, water: 1.0, air: 0.5, earth: 0.5 },
  air:   { fire: 0.5, water: 1.0, air: 1.0, earth: 1.5 },
  earth: { fire: 1.0, water: 1.5, air: 0.5, earth: 1.0 }
};

// ==========================================
// СТАН
// ==========================================

let BATTLE_DATA = null;
let CURRENT_DUEL = null;
let selectedPlayerCard = null;
let isTurnAnimating = false;
let PLAYER_ARTIFACT_RUNTIME = null;

// ==========================================
// УТИЛІТИ
// ==========================================

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
const safeJSON = (raw) => { try { return JSON.parse(raw); } catch { return null; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function shuffle(arr) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

function safeGetItem(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch (e) {
    return null;
  }
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtNumAbs(v) {
  const n = Math.abs(Number(v));
  const ok = Number.isFinite(n) ? Math.round(n) : 0;
  return String(ok).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ==========================================
// НОРМАЛІЗАЦІЯ КАРТ
// ==========================================

function normalizeElement(x) {
  const s = String(x || "").toLowerCase();
  if (ELEMENTS.includes(s)) return s;
  if (s === "wind") return "air";
  return null;
}

function normalizeCard(raw, fallbackId) {
  if (!raw || typeof raw !== "object") return null;
  const element = normalizeElement(raw.element || raw.elem || raw.type);
  let power = Number(raw.power ?? raw.basePower ?? raw.str ?? raw.attack ?? raw.value);
  if (!Number.isFinite(power) || power < 1) power = 1;
  if (!element) return null;

  const rarity = Number(raw.rarity ?? raw.quality ?? 1);
  const id = raw.id ?? raw.cardId ?? raw.card_id ?? null;
  const name = String(raw.name || raw.title || element);
  // Support both 'art' (full URL) and 'artFile' (filename only)
  let art = raw.art || raw.image || raw.img || raw.cover || null;
  const artResolved = resolveCardArt({
    id,
    title: name,
    element,
    art,
    artFile: raw.artFile || "",
  });
  if (artResolved?.art) {
    art = artResolved.art;
  }

  return {
    uid: String(raw.uid || raw.id || fallbackId || Date.now()),
    id,
    name,
    element,
    power: Math.max(1, Math.round(power)),
    rarity: Number.isFinite(rarity) ? clamp(Math.round(rarity), 1, 6) : 1,
    art: art ? String(art) : null,
    buffed: !!raw.buffed,
    buffElement: raw.buffElement || null
  };
}

// ==========================================
// ЗАВАНТАЖЕННЯ КОЛОДИ
// ==========================================

function loadPlayerDeck() {
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
    const raw = safeGetItem(localStorage, k);
    if (!raw) continue;

    const parsed = safeJSON(raw);
    if (!parsed) continue;

    const arr =
      Array.isArray(parsed) ? parsed :
      Array.isArray(parsed.cards) ? parsed.cards :
      Array.isArray(parsed.deck) ? parsed.deck :
      Array.isArray(parsed.items) ? parsed.items :
      null;

    if (!arr || !arr.length) continue;

    const deck9 = arr.slice(0, 9)
      .map((c, i) => normalizeCard(c, `${k}:${i}`))
      .filter(Boolean);

    if (deck9.length) return deck9;
  }

  return [];
}

function calcHP(cards) {
  return cards.reduce((s, c) => s + (c?.power || 0), 0);
}

// ==========================================
// ГЕНЕРУВАННЯ КОЛОДИ ПРОТИВНИКА
// ==========================================

function buildEnemyDeck(totalHp) {
  const count = 9;
  const hp = Math.max(1, Math.round(Number(totalHp) || 0));

  let minPower = (hp >= count * 12) ? 12 : 1;
  let remaining = hp - minPower * count;
  if (remaining < 0) {
    minPower = 1;
    remaining = hp - minPower * count;
  }

  const weights = Array.from({ length: count }, () => Math.random());
  const sumW = weights.reduce((s, w) => s + w, 0) || 1;
  const adds = weights.map(w => Math.floor((remaining * w) / sumW));

  const exacts = weights.map((w, i) => {
    const exact = (remaining * w) / sumW;
    return { i, frac: exact - adds[i] };
  }).sort((a, b) => b.frac - a.frac);

  let used = adds.reduce((s, x) => s + x, 0);
  let diff = remaining - used;
  let di = 0;
  while (diff > 0) {
    adds[exacts[di % count].i] += 1;
    diff -= 1;
    di += 1;
  }

  const cards = adds.map((add, i) => ({
    uid: `enemy:${Date.now()}:${i}`,
    name: `Карта ворога ${i + 1}`,
    element: pick(ELEMENTS),
    power: Math.max(1, minPower + add),
    rarity: rint(1, 6),
    art: null
  }));

  const sum = cards.reduce((s, c) => s + (c.power || 0), 0);
  const fix = hp - sum;
  if (fix !== 0) {
    cards[cards.length - 1].power = Math.max(1, (cards[cards.length - 1].power || 1) + fix);
  }

  return cards;
}

// ==========================================
// СИСТЕМА ШКОДИ
// ==========================================

function damage(attackerCard, defenderCard) {
  const aEl = attackerCard.element;
  const dEl = defenderCard.element;
  const mult = (MULT?.[aEl]?.[dEl]) ?? 1.0;
  const dmg = Math.round(attackerCard.power * mult);
  return { dmg, mult };
}

// ==========================================
// ДУЕЛЬ
// ==========================================

function createDuel(playerDeck, enemyDeck) {
  const pNorm = playerDeck.map((c, i) => normalizeCard(c, `p${i}`)).filter(Boolean);
  const eNorm = enemyDeck.map((c, i) => normalizeCard(c, `e${i}`)).filter(Boolean);

  if (pNorm.length < 3 || eNorm.length < 3) {
    throw new Error("Need at least 3 cards per side");
  }

  const pHP = pNorm.reduce((s, c) => s + c.power, 0);
  const eHP = eNorm.reduce((s, c) => s + c.power, 0);

  const duel = {
    turn: 0,
    player: {
      hp: pHP,
      maxHp: pHP,
      allCards: pNorm.slice(0, 9),
      drawPile: shuffle(pNorm.slice(0, 9)),
      discardPile: [],
      hand: []
    },
    enemy: {
      hp: eHP,
      maxHp: eHP,
      allCards: eNorm.slice(0, 9),
      drawPile: shuffle(eNorm.slice(0, 9)),
      discardPile: [],
      hand: []
    },
    log: [],
    finished: false,
    result: null
  };

  fillInitialHand(duel.player, 3);
  fillInitialHand(duel.enemy, 3);

  return duel;
}

function drawCard(side, opts = null) {
  if (!side) return null;
  if (!Array.isArray(side.drawPile)) side.drawPile = [];
  if (!Array.isArray(side.discardPile)) side.discardPile = [];
  if (!Array.isArray(side.allCards)) side.allCards = [];

  const avoidUids = opts?.avoidUids instanceof Set ? opts.avoidUids : null;

  if (!side.drawPile.length && side.discardPile.length) {
    side.drawPile = shuffle(side.discardPile);
    side.discardPile = [];
  }

  if (!side.drawPile.length && !side.discardPile.length && side.allCards.length) {
    side.drawPile = shuffle(side.allCards.slice());
  }

  const deferred = [];
  let safety = side.drawPile.length + 10;

  while (side.drawPile.length && safety-- > 0) {
    const c = side.drawPile.pop();
    if (!c) continue;
    if (avoidUids && avoidUids.has(c.uid)) {
      deferred.push(c);
      continue;
    }
    while (deferred.length) side.drawPile.unshift(deferred.pop());
    return c;
  }

  if (deferred.length) return deferred.pop();
  return null;
}

function fillInitialHand(side, count) {
  side.hand = [];
  for (let i = 0; i < count; i++) {
    const c = drawCard(side);
    if (c) side.hand[i] = c;
  }
  for (let i = 0; i < count; i++) {
    if (!side.hand[i]) side.hand[i] = drawCard(side);
  }
}

function ensureSlotCard(side, idx) {
  if (!side) return null;
  if (!Array.isArray(side.hand)) side.hand = [];
  if (!side.hand[idx]) side.hand[idx] = drawCard(side);
  return side.hand[idx] || null;
}

function discardCard(side, card) {
  if (!side || !card) return;
  if (!Array.isArray(side.discardPile)) side.discardPile = [];
  side.discardPile.push(card);
}

function playTurn(duel, idx) {
  if (duel.finished) return duel;

  const pCard = duel.player.hand[idx];
  const eCard = duel.enemy.hand[idx];
  if (!pCard || !eCard) {
    if (!pCard) ensureSlotCard(duel.player, idx);
    if (!eCard) ensureSlotCard(duel.enemy, idx);
    return duel;
  }

  const pHit = damage(pCard, eCard);
  const eHit = damage(eCard, pCard);
  const pOut = applyArtifactOutgoingDamage(pHit.dmg, PLAYER_ARTIFACT_RUNTIME);
  const pIn = applyArtifactIncomingDamage(eHit.dmg, PLAYER_ARTIFACT_RUNTIME);

  duel.enemy.hp -= pOut.dealt;
  duel.player.hp -= pIn.taken;
  if (pIn.reflected > 0) duel.enemy.hp -= pIn.reflected;

  duel.lastTurn = { pIdx: idx, eIdx: idx, pCard, eCard, pHit, eHit };

  duel.log.push({
    turn: duel.turn++,
    playerIdx: idx,
    enemyIdx: idx,
    pEl: pCard.element,
    eEl: eCard.element,
    pPower: pCard.power,
    ePower: eCard.power,
    pName: String(pCard.name || pCard.element || "Карта"),
    eName: String(eCard.name || eCard.element || "Карта"),
    pDmg: pOut.dealt, pMult: pHit.mult,
    eDmg: pIn.taken, eMult: eHit.mult,
    pSpearBonus: pOut.spearBonus,
    eReduced: pIn.reduced,
    eReflected: pIn.reflected,
    pBuffed: !!pCard.buffed
  });

  // Discard + draw
  discardCard(duel.player, pCard);
  const pNext = drawCard(duel.player, { avoidUids: new Set([pCard.uid]) });
  if (pNext) {
    duel.player.hand[idx] = pNext;
  } else {
    if (duel.player.discardPile?.[duel.player.discardPile.length - 1]?.uid === pCard.uid) {
      duel.player.discardPile.pop();
    }
    duel.player.hand[idx] = pCard;
  }

  discardCard(duel.enemy, eCard);
  const eNext = drawCard(duel.enemy, { avoidUids: new Set([eCard.uid]) });
  if (eNext) {
    duel.enemy.hand[idx] = eNext;
  } else {
    if (duel.enemy.discardPile?.[duel.enemy.discardPile.length - 1]?.uid === eCard.uid) {
      duel.enemy.discardPile.pop();
    }
    duel.enemy.hand[idx] = eCard;
  }

  if (duel.player.hp <= 0) {
    const revive = tryArtifactRevive(duel.player.hp, duel.player.maxHp, PLAYER_ARTIFACT_RUNTIME);
    if (revive.revived) {
      duel.player.hp = revive.hp;
      duel.log.push({
        turn: duel.turn++,
        system: true,
        text: "Амулет життя спрацював: маг воскрес.",
      });
    } else {
      const curse = tryArtifactVoodoo(duel.enemy.hp, duel.enemy.maxHp, PLAYER_ARTIFACT_RUNTIME);
      if (curse.triggered) {
        duel.enemy.hp = curse.killerHp;
        duel.log.push({
          turn: duel.turn++,
          system: true,
          text: "Кукла Вуду спрацювала: ворог проклятий.",
        });
      }
    }
  }

  if (duel.player.hp <= 0 && duel.enemy.hp <= 0) duel.result = "draw";
  else if (duel.player.hp <= 0) duel.result = "lose";
  else if (duel.enemy.hp <= 0) duel.result = "win";

  if (duel.result) duel.finished = true;
  return duel;
}

// ==========================================
// DOM ЕЛЕМЕНТИ
// ==========================================

const els = {
  enemyHp: q(".battle-player--enemy .battle-player__hp"),
  playerHp: q(".battle-player--self .battle-player__hp"),
  log: q("#battleLog"),
  enemyBtns: qa(".battle-cards--enemy .ref-card"),
  playerBtns: qa(".battle-cards:not(.battle-cards--enemy) .ref-card"),
  multEls: qa(".battle-multipliers .battle-multiplier")
};

// ==========================================
// РЕНДЕРИНГ
// ==========================================

function setHP(el, hp, maxHp) {
  if (!el) return;
  const hpSpan = el.querySelector("span:first-of-type") || el;
  const maxSpan = el.querySelector("span:last-of-type");
  if (hpSpan) hpSpan.textContent = Math.max(0, hp);
  if (maxSpan && maxSpan !== hpSpan) maxSpan.textContent = Math.max(1, maxHp);
}

function setCardButton(btn, card) {
  const elemClass = `elem-${card.element}`;

  btn.classList.remove("elem-fire", "elem-water", "elem-air", "elem-earth");
  btn.classList.add(elemClass);

  for (let r = 1; r <= 6; r++) btn.classList.remove(`rarity-${r}`);
  btn.classList.add(`rarity-${card.rarity}`);

  const powerEl = btn.querySelector(".ref-card__power");
  if (powerEl) powerEl.textContent = String(card.power);

  const artEl = btn.querySelector(".ref-card__art");
  if (artEl) {
    artEl.style.backgroundImage = `linear-gradient(135deg, var(--color-${card.element}), var(--color-${card.element}-light))`;
  }

  btn.dataset.uid = card.uid;
  btn.dataset.element = card.element;
  btn.dataset.power = String(card.power);

  // Показуємо індикатор бафу
  if (card.buffed) {
    btn.classList.add("is-buffed");
  } else {
    btn.classList.remove("is-buffed");
  }
}

function updateMultiplierPreview() {
  if (!CURRENT_DUEL) return;

  for (let i = 0; i < els.multEls.length; i++) {
    const mEl = els.multEls[i];
    const pCard = CURRENT_DUEL.player.hand[i];
    const eCard = CURRENT_DUEL.enemy.hand[i];

    let mult = 1.0;
    if (pCard && eCard) mult = MULT[pCard.element][eCard.element];

    const txt = (mult % 1 === 0) ? `x${mult.toFixed(0)}` : `x${mult.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
    mEl.innerHTML = `<img class="battle-multiplier__icon" src="../../assets/icons/swords-umgewandelt-von-png.svg" alt=""> ${txt}`;

    mEl.classList.remove("battle-multiplier--bonus", "battle-multiplier--penalty");
    if (mult > 1) mEl.classList.add("battle-multiplier--bonus");
    if (mult < 1) mEl.classList.add("battle-multiplier--penalty");
  }
}

function updateLog() {
  if (!els.log || !CURRENT_DUEL) return;
  els.log.innerHTML = "";
  const logs = CURRENT_DUEL.log.slice(-5).reverse();
  
  for (const entry of logs) {
    if (entry?.system) {
      const sysHtml = `
        <div class="battle-log__entry">
          <div class="log-meta">Системна подія</div>
          <div class="log-line">${escHtml(entry?.text || "")}</div>
        </div>
      `;
      els.log.insertAdjacentHTML("beforeend", sysHtml);
      continue;
    }

    const t = Number(entry?.turn) ?? 0;
    const slot = (Number(entry?.playerIdx) ?? 0) + 1;
    const pm = Number.isFinite(Number(entry?.pMult)) ? Number(entry.pMult) : 1;
    const em = Number.isFinite(Number(entry?.eMult)) ? Number(entry.eMult) : 1;
    const pEl = String(entry?.pEl || "");
    const eEl = String(entry?.eEl || "");
    const buffIndicator = entry?.pBuffed ? '<span class="log-buff-indicator">🔥</span>' : '';

    const html = `
      <div class="battle-log__entry">
        <div class="log-meta">Хід ${t + 1} • Слот ${slot}</div>
        <div class="log-line">
          <span class="log-card elem-${escHtml(pEl)}">${entry?.pPower}${buffIndicator}</span>
          <span class="log-dmg log-dmg--p">-${fmtNumAbs(entry?.pDmg)}</span>
          <span class="log-vs">⚔</span>
          <span class="log-dmg log-dmg--e">-${fmtNumAbs(entry?.eDmg)}</span>
          <span class="log-card elem-${escHtml(eEl)}">${entry?.ePower}</span>
        </div>
      </div>
    `;
    els.log.insertAdjacentHTML("beforeend", html);
  }
}

function renderAll() {
  if (!CURRENT_DUEL) return;

  // Player cards
  for (let i = 0; i < els.playerBtns.length; i++) {
    const btn = els.playerBtns[i];
    if (!CURRENT_DUEL.player.hand[i]) ensureSlotCard(CURRENT_DUEL.player, i);
    const card = CURRENT_DUEL.player.hand[i];
    if (card) setCardButton(btn, card);
  }

  // Enemy cards
  for (let i = 0; i < els.enemyBtns.length; i++) {
    const btn = els.enemyBtns[i];
    if (!CURRENT_DUEL.enemy.hand[i]) ensureSlotCard(CURRENT_DUEL.enemy, i);
    const card = CURRENT_DUEL.enemy.hand[i];
    if (card) setCardButton(btn, card);
  }

  // HP
  q("#playerHp").textContent = Math.max(0, CURRENT_DUEL.player.hp);
  q("#playerMaxHp").textContent = CURRENT_DUEL.player.maxHp;
  q("#enemyHp").textContent = Math.max(0, CURRENT_DUEL.enemy.hp);
  q("#enemyMaxHp").textContent = CURRENT_DUEL.enemy.maxHp;

  // HP bars
  const pPct = (CURRENT_DUEL.player.hp / CURRENT_DUEL.player.maxHp) * 100;
  const ePct = (CURRENT_DUEL.enemy.hp / CURRENT_DUEL.enemy.maxHp) * 100;
  const pBar = q("#playerHpBar");
  const eBar = q("#enemyHpBar");
  if (pBar) pBar.style.width = `${Math.max(0, Math.min(100, pPct))}%`;
  if (eBar) eBar.style.width = `${Math.max(0, Math.min(100, ePct))}%`;

  updateMultiplierPreview();
  updateLog();
}

// ==========================================
// БІЙ
// ==========================================

function endBattle() {
  const result = CURRENT_DUEL.result;
  const won = result === "win"; // Тільки чиста перемога

  // Зберігаємо результат
  const tournamentResult = {
    won,
    result,
    round: BATTLE_DATA?.round || "round1",
    playerHp: CURRENT_DUEL.player.hp,
    enemyHp: CURRENT_DUEL.enemy.hp,
    turns: CURRENT_DUEL.turn,
    log: CURRENT_DUEL.log
  };

  try {
    sessionStorage.setItem("cardastika:tournamentResult", JSON.stringify(tournamentResult));
    localStorage.setItem("cardastika:tournamentResult", JSON.stringify(tournamentResult));
  } catch (e) {
    console.warn("[tournament-battle] Failed to save result", e);
  }

  // Переходимо на сторінку результату
  setTimeout(() => {
    location.href = "./tournament-result.html";
  }, 500);
}

function runAttackAnimation(idx) {
  const attackerBtn = els.playerBtns[idx];
  const defenderBtn = els.enemyBtns[idx];
  if (!attackerBtn || !defenderBtn) return;

  attackerBtn.classList.remove("is-attacking");
  defenderBtn.classList.remove("is-hit");
  void attackerBtn.offsetWidth;
  void defenderBtn.offsetWidth;

  attackerBtn.classList.add("is-attacking");
  setTimeout(() => defenderBtn.classList.add("is-hit"), 120);
  setTimeout(() => {
    attackerBtn.classList.remove("is-attacking");
    defenderBtn.classList.remove("is-hit");
  }, 320);
}

function performTurnWithAnimation(idx) {
  if (!CURRENT_DUEL || CURRENT_DUEL.finished || isTurnAnimating) return;

  if (!CURRENT_DUEL.player.hand[idx] || !CURRENT_DUEL.enemy.hand[idx]) {
    ensureSlotCard(CURRENT_DUEL.player, idx);
    ensureSlotCard(CURRENT_DUEL.enemy, idx);
    renderAll();
    return;
  }

  isTurnAnimating = true;
  runAttackAnimation(idx);

  setTimeout(() => {
    try {
      CURRENT_DUEL = playTurn(CURRENT_DUEL, idx);
    } catch (e) {
      console.error("playTurn failed:", e);
      isTurnAnimating = false;
      return;
    }

    renderAll();
    if (CURRENT_DUEL.finished) {
      endBattle();
    }
    isTurnAnimating = false;
  }, 170);
}

function bindUI() {
  els.playerBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => performTurnWithAnimation(idx));
  });

  els.enemyBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => performTurnWithAnimation(idx));
  });
}

// ==========================================
// ІНІЦІАЛІЗАЦІЯ
// ==========================================

async function init() {
  try {
    await ensureCardCatalogLoaded();
  } catch {
    // ignore
  }

  // Завантажуємо дані бою
  const battleRaw = safeGetItem(sessionStorage, "cardastika:tournamentBattle") || safeGetItem(localStorage, "cardastika:tournamentBattle");
  BATTLE_DATA = safeJSON(battleRaw) || {};
  PLAYER_ARTIFACT_RUNTIME = createArtifactRuntime("tournament");

  // Показуємо раунд
  const roundName = getRoundName(BATTLE_DATA.round || "round1");
  q("#roundName").textContent = roundName;

  // Показуємо баф якщо є
  if (BATTLE_DATA.buff) {
    const buff = BUFF_TYPES[BATTLE_DATA.buff];
    if (buff) {
      q("#activeBuff").hidden = false;
      q("#buffIcon").className = `tournament-active-buff__icon elem-${BATTLE_DATA.buff}`;
      q("#buffName").textContent = buff.name;
    }
  }

  // Завантажуємо колоду гравця
  let playerDeck = loadPlayerDeck();
  if (playerDeck.length < 3) {
    playerDeck = [
      { uid: "dev1", element: "fire", power: 12, rarity: 3 },
      { uid: "dev2", element: "water", power: 11, rarity: 2 },
      { uid: "dev3", element: "air", power: 10, rarity: 2 },
      { uid: "dev4", element: "earth", power: 13, rarity: 3 },
    ];
  }

  const withEquipment = applyItemsToDeckAndHp(playerDeck, calcHP(playerDeck));
  if (Array.isArray(withEquipment?.deck) && withEquipment.deck.length) {
    playerDeck = withEquipment.deck;
  }
  const hpFlatFromItems = Math.max(0, Math.round(Number(withEquipment?.profile?.hpBonus || 0)));

  // Застосовуємо баф
  if (BATTLE_DATA.buff) {
    playerDeck = applyBuffToDeck(playerDeck, BATTLE_DATA.buff);
  }

  // HP гравця
  let playerHp = calcHP(playerDeck) + hpFlatFromItems;

  // HP ворога
  const enemy = BATTLE_DATA.enemy || {};
  const enemyHp = Number(enemy.hp) || Math.round(playerHp * (0.8 + Math.random() * 0.4));

  // Ім'я ворога
  if (enemy.name) {
    q("#enemyName").innerHTML = `<span class="battle-player__rarity"></span> ${escHtml(enemy.name)}`;
  }

  // Ім'я гравця
  const acc = window.AccountSystem?.getActive?.();
  const playerName = acc?.name || "Гравець";
  q("#playerName").innerHTML = `<span class="battle-player__rarity"></span> ${escHtml(playerName)}`;

  // Будуємо колоду ворога
  const enemyDeck = buildEnemyDeck(enemyHp);

  // Створюємо дуель
  try {
    CURRENT_DUEL = createDuel(playerDeck, enemyDeck);
  } catch (e) {
    console.error("Duel init failed:", e);
    alert("Бій не стартував: проблема з колодою.");
    return;
  }

  // Override HP
  if (CURRENT_DUEL) {
    CURRENT_DUEL.player.hp = playerHp;
    CURRENT_DUEL.player.maxHp = playerHp;
    CURRENT_DUEL.enemy.hp = enemyHp;
    CURRENT_DUEL.enemy.maxHp = enemyHp;
  }

  bindUI();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);

