import "../../src/account.js";
import "../../src/progression-system.js";
import { getDuelLeagueIconPath } from "../../src/core/leagues.js";
import { isBossDefeated, loadCampaignState, saveCampaignState, setBossDefeated } from "../../src/campaign/campaign-state.js";
import { tryDropArenaSource, saveSourceToInventory, formatSourceCardInfo } from "../../src/core/source-cards.js";

// Helper to update task progress in localStorage
function updateTaskProgress(taskId, increment = 1) {
  const PROGRESS_KEY = "cardastika:tasks:progress";
  let progress = {};
  try {
    progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {};
  } catch {
    progress = {};
  }
  const cur = Math.max(0, Number(progress[taskId] ?? 0));
  progress[taskId] = cur + increment;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* ignore */ }
}

const RESULT_KEY = "cardastika:duelResult";
const EXTRA_FOUND_KEY = "cardastika:foundExtra";
const BOSS_LAST_RESULT_KEY = "cardastika:bossLastResultByAct";

const BOSS_TROPHIES = {
  act1: { id: "trophy_tax_collector", title: "Гоблін", element: "earth", rarity: "rarity-4" },
  act2: { id: "trophy_underground_captain", title: "Капітан Підземної Варти", element: "air", rarity: "rarity-4" },
  act3: { id: "trophy_black_titheman", title: "Чорний Десятинник", element: "water", rarity: "rarity-5" },
  act4: { id: "trophy_goblin_shaman", title: "Гоблін-Шаман (2 фази)", element: "fire", rarity: "rarity-5" },
  act5: { id: "trophy_underking", title: "Підземний Король (3 фази)", element: "earth", rarity: "rarity-6" },
};

const BOSS_REWARDS = {
  act1: { gold: 100, diamonds: 1 },
  act2: { gold: 150, diamonds: 1 },
  act3: { gold: 200, diamonds: 2 },
  act4: { gold: 250, diamonds: 2 },
  act5: { gold: 400, diamonds: 3 },
};

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normActId(actId) {
  const s = String(actId || "").trim();
  return /^act[1-5]$/.test(s) ? s : "";
}

function loadJsonObject(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? safeParse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveJsonObject(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj && typeof obj === "object" ? obj : {}));
  } catch {
    // ignore
  }
}

function loadJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? safeParse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonArray(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
  } catch {
    // ignore
  }
}

function addExtraFoundId(cardId) {
  const id = String(cardId || "").trim();
  if (!id) return false;
  const list = loadJsonArray(EXTRA_FOUND_KEY).map(String);
  const set = new Set(list);
  const had = set.has(id);
  if (!had) {
    set.add(id);
    saveJsonArray(EXTRA_FOUND_KEY, Array.from(set));
  }
  return !had;
}

function setBossLastResult(actId, result) {
  const act = normActId(actId);
  if (!act) return;
  const res = String(result || "").trim();
  const map = loadJsonObject(BOSS_LAST_RESULT_KEY);
  map[act] = res;
  saveJsonObject(BOSS_LAST_RESULT_KEY, map);
}

function clearBossLastResult(actId) {
  const act = normActId(actId);
  if (!act) return;
  const map = loadJsonObject(BOSS_LAST_RESULT_KEY);
  delete map[act];
  saveJsonObject(BOSS_LAST_RESULT_KEY, map);
}

function grantCurrency({ gold = 0, diamonds = 0 } = {}) {
  const g = Math.max(0, asInt(gold));
  const d = Math.max(0, asInt(diamonds));
  if (g <= 0 && d <= 0) return;

  if (window.AccountSystem?.updateActive) {
    window.AccountSystem.updateActive((acc) => {
      acc.gold = Math.max(0, asInt(acc.gold) + g);
      acc.diamonds = Math.max(0, asInt(acc.diamonds) + d);
      return null;
    });
  } else {
    try {
      const curGold = asInt(localStorage.getItem("cardastika:gold"));
      localStorage.setItem("cardastika:gold", String(Math.max(0, curGold + g)));
    } catch {
      // ignore
    }
    try {
      const curDia = asInt(localStorage.getItem("cardastika:diamonds"));
      localStorage.setItem("cardastika:diamonds", String(Math.max(0, curDia + d)));
    } catch {
      // ignore
    }
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtNumAbs(v) {
  const n = Math.abs(asInt(v));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtDelta(v) {
  const n = asInt(v);
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${fmtNumAbs(n)}`;
}
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function swordIconForMult(pMult, eMult) {
  const p = Number(pMult);
  const e = Number(eMult);
  const pm = Number.isFinite(p) ? p : 1;
  const em = Number.isFinite(e) ? e : 1;
  const eps = 0.001;
  if (Math.abs(pm - em) <= eps) return "../../assets/icons/swords-equal.svg";
  // In our UI: left sword represents enemy, right sword represents player.
  if (em > pm) return "../../assets/icons/swords-enemy-adv.svg";
  return "../../assets/icons/swords-player-adv.svg";
}

function miniArtBg(artUrl, element) {
  const el = String(element || "").toLowerCase();
  const url = String(artUrl || "").trim();
  if (url) return `url('${url.replace(/'/g, "\\'")}')`;
  return `linear-gradient(135deg, var(--color-${el}), var(--color-${el}-light))`;
}

const RESULT_META = {
  win: { title: "ПЕРЕМОГА", className: "is-win" },
  lose: { title: "ПОРАЗКА", className: "is-lose" },
  draw: { title: "НІЧИЯ", className: "is-draw" },
};

function startBossBattle({ actId, bossName, bossPower } = {}) {
  const act = actId ? String(actId) : "";
  if (!act) return;

  const name = String(bossName || "Бос");
  const power = Math.max(1, asInt(bossPower || 0));

  const bossMeta = { mode: "boss", actId: act, bossName: name, bossPower: power, ts: Date.now() };

  try { sessionStorage.setItem("cardastika:battleMode", "boss"); } catch { /* ignore */ }
  try { localStorage.setItem("cardastika:battleMode", "boss"); } catch { /* ignore */ }
  try { sessionStorage.setItem("cardastika:bossBattle", JSON.stringify(bossMeta)); } catch { /* ignore */ }
  try { localStorage.setItem("cardastika:bossBattle", JSON.stringify(bossMeta)); } catch { /* ignore */ }

  const duelEnemy = { name, hp: power };
  try { sessionStorage.setItem("cardastika:duelEnemy", JSON.stringify(duelEnemy)); } catch { /* ignore */ }
  try { localStorage.setItem("cardastika:duelEnemy", JSON.stringify(duelEnemy)); } catch { /* ignore */ }

  location.href = `./battle.html?mode=boss&act=${encodeURIComponent(act)}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(location.search || "");
  const modeParam = String(urlParams.get("mode") || "").toLowerCase();
  const isBossBattle = modeParam === "boss";
  const actParam = urlParams.get("act") ? String(urlParams.get("act")) : null;

  const againBtn = document.getElementById("againBtn");
  const deckBtn = document.getElementById("deckBtn");

  if (deckBtn) {
    deckBtn.hidden = !isBossBattle;
    deckBtn.addEventListener("click", () => {
      location.href = "../deck/deck.html";
    });
  }

  // sessionStorage first, then localStorage fallback
  let data = safeParse(sessionStorage.getItem(RESULT_KEY) || "null");
  if (!data) data = safeParse(localStorage.getItem(RESULT_KEY) || "null");
  if (!data) {
    setText("resultTitle", "РЕЗУЛЬТАТ");
    setText("rewardGold", "+0");
    setText("rewardSilver", "+0");
    setText("rewardXp", "+0");
    setText("resultWinsLine", "Перемог у дуелях: —");
    setText("resultTodayLine", "Сьогодні здобуто: —");
    return;
  }

  const res = String(data?.result || "");
  const meta = RESULT_META[res] || { title: "РЕЗУЛЬТАТ", className: "" };

  // Update task progress for duels (only when not boss battle)
  if (!isBossBattle && res) {
    // Every duel counts for "play duel" task
    updateTaskProgress("t_play_duel_30", 1);
    // Wins count for "win duel" task
    if (res === "win") {
      updateTaskProgress("t_win_duel_20", 1);
    }
  }

  // Primary action button
  if (againBtn) {
    if (isBossBattle) {
      const bossActId = actParam || (data?.boss?.actId ? String(data.boss.actId) : null);
      const bossName = String(data?.boss?.name || data?.enemyName || "Бос");
      const bossPower = asInt(data?.boss?.power ?? data?.enemy?.maxHp ?? 0);

      if (res === "win") {
        againBtn.textContent = "До кампанії";
        againBtn.addEventListener("click", () => {
          location.href = "../campaign/campaign.html";
        });
      } else {
        againBtn.textContent = "Ще раз";
        againBtn.addEventListener("click", () => {
          if (!bossActId) return;
          startBossBattle({ actId: bossActId, bossName, bossPower });
        });
      }
    } else {
      againBtn.textContent = "Ще дуель";
      againBtn.addEventListener("click", () => {
        location.href = "./duel.html";
      });
    }
  }

  const screen = document.getElementById("screen");
  if (screen && meta.className) screen.classList.add(meta.className);
  setText("resultTitle", meta.title);

  const silver = asInt(data?.rewards?.silver);
  const gold = asInt(data?.rewards?.gold);
  const xp = asInt(data?.xp?.gained);

  setText("rewardGold", fmtDelta(gold));
  setText("rewardSilver", fmtDelta(silver));
  setText("rewardXp", fmtDelta(xp));

  const goldWrap = document.getElementById("rewardGoldWrap");
  const silverWrap = document.getElementById("rewardSilverWrap");
  const xpWrap = document.getElementById("rewardXpWrap");
  if (goldWrap) goldWrap.hidden = gold === 0;
  if (silverWrap) silverWrap.hidden = silver === 0;
  if (xpWrap) xpWrap.hidden = xp === 0;

  // Випадання карти-джерела з арени (15% шанс при перемозі, не бос)
  if (!isBossBattle && res === "win") {
    const sourceCard = tryDropArenaSource();
    if (sourceCard) {
      saveSourceToInventory(sourceCard);
      
      // Показуємо інформацію про випалу карту
      const sourceWrap = document.getElementById("rewardSourceWrap");
      const sourceText = document.getElementById("rewardSource");
      if (sourceWrap && sourceText) {
        sourceText.textContent = formatSourceCardInfo(sourceCard);
        sourceWrap.hidden = false;
      } else {
        // Fallback - показуємо toast якщо є
        console.log("[arena] Випала карта-джерело:", sourceCard.title, "рівень", sourceCard.level);
      }
    }
  }

  // Duel wins (prefer summary; fallback to ProgressionSystem state)
  let wins = asInt(data?.duel?.wins);
  if (!wins && wins !== 0) wins = 0;
  if (wins === 0) {
    try {
      const st = window.ProgressionSystem?.getState?.();
      const w = asInt(st?.duel?.wins);
      if (w > 0) wins = w;
    } catch {
      // ignore
    }
  }
  try {
    const lineEl = document.getElementById("resultWinsLine");
    const leagueId = String(data?.league?.id || "");
    const icon = leagueId ? getDuelLeagueIconPath(leagueId) : "";
    const iconHtml = icon ? `<img class="duel-result-league-icon" src="${icon}" alt="" title="">` : "";
    if (lineEl) lineEl.innerHTML = `Перемог у дуелях: ${iconHtml}<b>${fmtNumAbs(wins)}</b>`;
  } catch {
    setText("resultWinsLine", `Перемог у дуелях: ${fmtNumAbs(wins)}`);
  }

  // Daily gold line
  const goldToday = asInt(data?.rewards?.goldToday);
  const goldLimit = asInt(data?.rewards?.goldLimit);
  if (goldLimit > 0) setText("resultTodayLine", `Сьогодні здобуто: ${fmtNumAbs(goldToday)} з ${fmtNumAbs(goldLimit)}`);
  else setText("resultTodayLine", "Сьогодні здобуто: —");

  // Battle log
  const logRoot = document.getElementById("battleLog");
  const entries = Array.isArray(data?.battleLog) ? data.battleLog : [];
  if (logRoot) {
    if (!entries.length) {
      logRoot.innerHTML = `<div class="duel-result-battle__empty">Немає журналу бою.</div>`;
    } else {
      logRoot.innerHTML = entries
        .slice(-12)
        .reverse()
        .map((e) => {
          const t = asInt(e?.turn);
          const slot = asInt(e?.playerIdx) + 1;

          const pName = String(e?.pName || "Ваша карта");
          const eName = String(e?.eName || "Карта ворога");

          const pD = asInt(e?.pDmg);
          const eD = asInt(e?.eDmg);

          const pEl = String(e?.pEl || "");
          const eEl = String(e?.eEl || "");

          const pM = Number(e?.pMult);
          const eM = Number(e?.eMult);
          const pm = Number.isFinite(pM) ? pM : 1;
          const em = Number.isFinite(eM) ? eM : 1;

          const swords = swordIconForMult(pm, em);
          const pBg = miniArtBg(e?.pArt, pEl);
          const eBg = miniArtBg(e?.eArt, eEl);

          return `
            <div class="duel-result-battle__row duel-result-battle__row--mini">
              <div class="duel-mini-meta">Хід ${t} • Слот ${slot}</div>
              <div class="duel-mini-line">
                <div class="duel-mini-card elem-${escHtml(pEl)}" title="${escHtml(pName)}">
                  <div class="duel-mini-card__art" style="background-image: ${pBg};"></div>
                </div>
                <div class="duel-mini-num duel-mini-num--p" title="Ви: ×${pm}">${fmtNumAbs(pD)}</div>
                <img class="duel-mini-swords" src="${swords}" alt="" title="Ви: ×${pm} • Ворог: ×${em}">
                <div class="duel-mini-num duel-mini-num--e" title="Ворог: ×${em}">${fmtNumAbs(eD)}</div>
                <div class="duel-mini-card elem-${escHtml(eEl)}" title="${escHtml(eName)}">
                  <div class="duel-mini-card__art" style="background-image: ${eBg};"></div>
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  // Boss battle: unlock act on win, keep boss on lose, and grant trophy rewards.
  try {
    const isBoss = isBossBattle || String(data?.mode || "") === "boss";
    const bossActId = normActId(actParam || (data?.boss?.actId ? String(data.boss.actId) : ""));

    if (isBoss) {
      // Hide duel-only summary lines
      const lines = document.querySelector(".duel-result-simple-lines");
      if (lines) lines.hidden = true;

      const goldWrap = document.getElementById("rewardGoldWrap");
      const diaWrap = document.getElementById("rewardDiamondsWrap");
      const silverWrap = document.getElementById("rewardSilverWrap");
      const xpWrap = document.getElementById("rewardXpWrap");
      const trophyWrap = document.getElementById("rewardTrophyWrap");

      if (silverWrap) silverWrap.hidden = true;
      if (xpWrap) xpWrap.hidden = true;

      const rewardCfg = bossActId ? (BOSS_REWARDS[bossActId] || { gold: 0, diamonds: 0 }) : { gold: 0, diamonds: 0 };
      const trophyCfg = bossActId ? (BOSS_TROPHIES[bossActId] || null) : null;

      const earned = res === "win" && !!bossActId;

      const rewardsRoot = document.querySelector(".duel-result-rewards");
      if (rewardsRoot) rewardsRoot.hidden = !earned;

      const getLabel = document.getElementById("resultGetLabel");
      if (getLabel) getLabel.textContent = earned ? "Нагорода за боса:" : "Підготуйтеся і спробуйте ще раз.";

      if (earned && bossActId) {
        const st = loadCampaignState();
        const already = isBossDefeated(st, bossActId);
        if (!already) {
          setBossDefeated(st, bossActId, true);
          saveCampaignState(st);

          grantCurrency(rewardCfg);
          if (trophyCfg?.id) addExtraFoundId(trophyCfg.id);
          
          // Update task progress for getting campaign cards
          updateTaskProgress("t_campaign_cards_3", 1);
        }
        clearBossLastResult(bossActId);
      } else if (bossActId) {
        setBossLastResult(bossActId, res || "lose");
      }

      const rewardGold = earned ? Math.max(0, asInt(rewardCfg?.gold)) : 0;
      const rewardDia = earned ? Math.max(0, asInt(rewardCfg?.diamonds)) : 0;

      if (goldWrap) goldWrap.hidden = rewardGold <= 0;
      setText("rewardGold", fmtDelta(rewardGold));

      if (diaWrap) diaWrap.hidden = rewardDia <= 0;
      setText("rewardDiamonds", fmtDelta(rewardDia));

      if (trophyWrap) trophyWrap.hidden = !(earned && trophyCfg?.title);
      if (earned && trophyCfg?.title) setText("rewardTrophy", trophyCfg.title);

      // Clean up boss mode hints. Keep duelEnemy so "Ще раз" works even if boss data is missing.
      try { sessionStorage.removeItem("cardastika:battleMode"); } catch { /* ignore */ }
      try { localStorage.removeItem("cardastika:battleMode"); } catch { /* ignore */ }
      if (earned) {
        try { sessionStorage.removeItem("cardastika:bossBattle"); } catch { /* ignore */ }
        try { localStorage.removeItem("cardastika:bossBattle"); } catch { /* ignore */ }
      }
    }
  } catch {
    // ignore
  }
});

