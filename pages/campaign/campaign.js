import "../../src/account.js";
import { CAMPAIGN } from "../../src/campaign/campaign-data.js";
import { emitCampaignEvent, getActiveAct } from "../../src/campaign/campaign-events.js";
import { getQuestProgress, isBossDefeated, isQuestClaimed, loadCampaignState, saveCampaignState, setQuestClaimed } from "../../src/campaign/campaign-state.js";

const BOSS_LAST_RESULT_KEY = "cardastika:bossLastResultByAct";

function asInt(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtK(n) {
  const v = asInt(n, 0);
  if (v >= 1_000_000) return `${Math.round(v / 100_000) / 10}M`;
  if (v >= 1_000) return `${Math.round(v / 100) / 10}K`;
  return String(v);
}

function fmtNum(n) {
  const v = Math.max(0, asInt(n, 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getBossLastResult(actId) {
  const id = String(actId || "").trim();
  if (!id) return "";
  try {
    const raw = localStorage.getItem(BOSS_LAST_RESULT_KEY);
    const parsed = raw ? safeParse(raw) : null;
    const map = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    const v = map ? map[id] : "";
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function bossCtaLabel(actId) {
  const last = getBossLastResult(actId);
  return last ? "Ще раз" : "Битися";
}

function listActQuests(act) {
  const qs = Array.isArray(act?.quests) ? act.quests : [];
  return qs.filter((q) => q && typeof q === "object" && q.id);
}

function isActCompleted(state, act) {
  const qs = listActQuests(act);
  return qs.length > 0 && qs.every((q) => isQuestClaimed(state, q.id)) && isBossDefeated(state, act?.id);
}

function areActQuestsClaimed(state, act) {
  const qs = listActQuests(act);
  return qs.length > 0 && qs.every((q) => isQuestClaimed(state, q.id));
}

function questDone(state, q) {
  const target = Math.max(1, asInt(q?.target, 1));
  return getQuestProgress(state, q.id) >= target;
}

function questPct(state, q) {
  const target = Math.max(1, asInt(q?.target, 1));
  const cur = Math.min(getQuestProgress(state, q.id), target);
  return clamp(Math.round((cur / target) * 100), 0, 100);
}

function actionForQuestType(type) {
  const t = String(type || "");
  if (t === "duel_finished") return { label: "Дуелі", href: "../duel/duel.html" };
  if (t === "shop_purchase") return { label: "Крамниця", href: "../shop/shop.html" };
  if (t === "card_upgraded") return { label: "Колода", href: "../deck/deck.html" };
  if (t === "profile_saved") return { label: "Профіль", href: "../profile/profile.html" };
  if (t === "reward_claimed") return { label: "Кампанія", href: "../campaign/campaign.html" };
  return null;
}

function getBossPowerForAct(act) {
  const v = Number(act?.bossPower);
  if (Number.isFinite(v) && v > 0) return Math.round(v);
  return 1500;
}

function startBossBattle(act) {
  if (!act?.id) return;

  const bossPower = getBossPowerForAct(act);
  const bossName = String(act?.boss || "Бос");

  const bossMeta = { mode: "boss", actId: String(act.id), bossName, bossPower, ts: Date.now() };

  try { sessionStorage.setItem("cardastika:battleMode", "boss"); } catch { /* ignore */ }
  try { localStorage.setItem("cardastika:battleMode", "boss"); } catch { /* ignore */ }
  try { sessionStorage.setItem("cardastika:bossBattle", JSON.stringify(bossMeta)); } catch { /* ignore */ }
  try { localStorage.setItem("cardastika:bossBattle", JSON.stringify(bossMeta)); } catch { /* ignore */ }

  const duelEnemy = { name: bossName, hp: bossPower };
  try { sessionStorage.setItem("cardastika:duelEnemy", JSON.stringify(duelEnemy)); } catch { /* ignore */ }
  try { localStorage.setItem("cardastika:duelEnemy", JSON.stringify(duelEnemy)); } catch { /* ignore */ }

  location.href = `../duel/battle.html?mode=boss&act=${encodeURIComponent(String(act.id))}`;
}

function updateHudFromAccount() {
  // Використовуємо глобальну функцію з ui-shell.js
  if (typeof window.updateGlobalHUD === "function") {
    window.updateGlobalHUD();
  }
}

function claimReward(q) {
  const st = loadCampaignState();
  if (isQuestClaimed(st, q.id)) return false;
  if (!questDone(st, q)) return false;

  const rewardGold = asInt(q?.reward?.gold, 0);
  const rewardDiamonds = asInt(q?.reward?.diamonds, 0);

  if (window.AccountSystem?.updateActive) {
    window.AccountSystem.updateActive((acc) => {
      acc.gold = Math.max(0, asInt(acc.gold, 0) + Math.max(0, rewardGold));
      acc.diamonds = Math.max(0, asInt(acc.diamonds, 0) + Math.max(0, rewardDiamonds));
      return null;
    });
  } else {
    localStorage.setItem("cardastika:gold", String(Math.max(0, asInt(localStorage.getItem("cardastika:gold"), 0) + rewardGold)));
    localStorage.setItem("cardastika:diamonds", String(Math.max(0, asInt(localStorage.getItem("cardastika:diamonds"), 0) + rewardDiamonds)));
  }

  setQuestClaimed(st, q.id, true);
  saveCampaignState(st);
  updateHudFromAccount();

  if (String(q?.type || "") !== "reward_claimed") {
    emitCampaignEvent("reward_claimed", { sourceQuestId: q.id });
  }

  return true;
}

function render() {
  const root = document.getElementById("campaignRoot");
  const subtitle = document.getElementById("campaignSubtitle");
  const progressEl = document.getElementById("campaignProgress");
  if (!root) return;

  const st = loadCampaignState();
  const activeAct = getActiveAct(st);

  const actsCompleted = CAMPAIGN.acts.filter((a) => isActCompleted(st, a)).length;
  if (progressEl) {
    const cur = Math.min(CAMPAIGN.acts.length, actsCompleted + 1);
    progressEl.textContent = `${cur} з ${CAMPAIGN.acts.length}`;
  }

  if (subtitle) {
    subtitle.textContent = `${CAMPAIGN.title} • Пройдіть випробування та здолайте босів.`;
  }

  root.innerHTML = "";

  const activeIndex = activeAct ? CAMPAIGN.acts.findIndex((a) => a.id === activeAct.id) : -1;
  const maxIndex = activeIndex >= 0 ? activeIndex : 0;

  for (let actIndex = 0; actIndex < CAMPAIGN.acts.length; actIndex += 1) {
    if (actIndex > maxIndex) break;
    const act = CAMPAIGN.acts[actIndex];
    const actWrap = document.createElement("section");
    actWrap.className = "campaign-act";

    const isActive = activeAct && act.id === activeAct.id;
    const done = isActCompleted(st, act);

    actWrap.innerHTML = `
      <div class="campaign-act__head ${isActive ? "is-active" : ""} ${done ? "is-done" : ""}">
        <div class="campaign-act__title">${act.title}</div>
        <div class="campaign-act__intro">${act.intro}</div>
        <div class="campaign-act__boss">Бос: <b>${act.boss}</b></div>
      </div>
      <div class="campaign-act__quests"></div>
    `;

    const list = actWrap.querySelector(".campaign-act__quests");

    for (const q of listActQuests(act)) {
      const target = Math.max(1, asInt(q.target, 1));
      const cur = Math.min(getQuestProgress(st, q.id), target);
      const doneQ = cur >= target;
      const claimed = isQuestClaimed(st, q.id);
      const pct = questPct(st, q);

      const card = document.createElement("div");
      card.className = `task-item campaign-task${doneQ ? " is-complete" : ""}${claimed ? " is-claimed" : ""}`;

      const rewards = `
        <span class="task-reward-inline">
          <img src="../../assets/icons/coin-gold.svg" alt="gold" class="icon icon--gold">
          <span class="task-reward__value">${fmtK(Math.max(0, asInt(q?.reward?.gold, 0)))}</span>
        </span>
        <span class="task-reward-inline">
          <img src="../../assets/icons/diamond.svg" alt="diamonds" class="icon icon--gold">
          <span class="task-reward__value">${fmtK(Math.max(0, asInt(q?.reward?.diamonds, 0)))}</span>
        </span>
      `;

      const go = actionForQuestType(q.type);
      const goLabel = go?.label || "Перейти";

      card.innerHTML = `
        <div class="task-header">
          <h3 class="task-title">${q.title}</h3>
        </div>
        <div class="task-progress">
          <span>Прогрес: <b>${cur} з ${target}</b></span>
          <span class="task-rewards-wrap">${rewards}</span>
        </div>
        <div class="task-bar" aria-hidden="true">
          <i style="width:${pct}%"></i>
        </div>
        <div class="task-actions">
          <button class="task-btn task-btn--go js-go" type="button" ${doneQ ? "hidden" : ""}><span>${goLabel}</span></button>
          <button class="task-btn task-btn--claim js-claim" type="button" ${(!doneQ || claimed) ? "disabled" : ""} ${doneQ ? "" : "hidden"}>
            <span>${claimed ? "Отримано" : "Забрати"}</span>
          </button>
        </div>
      `;

      const goBtn = card.querySelector(".js-go");
      if (goBtn && go?.href) {
        goBtn.addEventListener("click", () => (location.href = go.href));
      } else if (goBtn) {
        goBtn.disabled = true;
      }

      card.querySelector(".js-claim")?.addEventListener("click", () => {
        if (!claimReward(q)) return;
        render();
      });

      list?.appendChild(card);
    }

    const actBossDefeated = isBossDefeated(st, act.id);
    const showBossCard = areActQuestsClaimed(st, act) && !actBossDefeated;
    if (list && showBossCard) {
      const bossPower = getBossPowerForAct(act);
      const cta = bossCtaLabel(act.id);
      const bossCard = document.createElement("div");
      bossCard.className = "campaign-challenge campaign-challenge--boss";
      bossCard.innerHTML = `
        <div class="campaign-challenge__header">
          <h3 class="campaign-challenge__title">Бій з босом: ${act.boss}</h3>
        </div>
        <div class="campaign-challenge__content campaign-challenge__content--boss">
          <div class="campaign-challenge__progress">
            <span>Сила боса: <b>${fmtNum(bossPower)}</b></span>
          </div>
          <div class="campaign-challenge__rewards">
            <span class="campaign-challenge__reward is-boss">Карти боса приховані</span>
          </div>
        </div>
        <div class="campaign-challenge__actions">
          <button class="campaign-btn campaign-btn--secondary js-deck" type="button">В колоду</button>
          <button class="campaign-btn campaign-btn--primary js-boss" type="button">${cta}</button>
        </div>
      `;

      bossCard.querySelector(".js-deck")?.addEventListener("click", () => (location.href = "../deck/deck.html"));
      bossCard.querySelector(".js-boss")?.addEventListener("click", () => startBossBattle(act));
      list.appendChild(bossCard);
    }

    root.appendChild(actWrap);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateHudFromAccount();

  const params = new URLSearchParams(location.search || "");
  const wantBoss = params.get("boss") === "1";
  const st = loadCampaignState();
  const activeAct = getActiveAct(st);
  if (wantBoss && activeAct && areActQuestsClaimed(st, activeAct) && !isBossDefeated(st, activeAct.id)) {
    startBossBattle(activeAct);
    return;
  }

  render();
  window.addEventListener("campaign:updated", render);
});
