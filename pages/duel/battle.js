(() => {
  let ENEMY_PROF = {};
  let CURRENT_DUEL = null;
  let selectedPlayerCard = null;
  let isTurnAnimating = false;

  const URL_PARAMS = new URLSearchParams(location.search || "");
  const BATTLE_MODE = String(URL_PARAMS.get("mode") || "").toLowerCase();
  const IS_BOSS_BATTLE = BATTLE_MODE === "boss";
  const IS_TUTORIAL_DUEL =
    URL_PARAMS.get("tutorial") === "1" &&
    localStorage.getItem("cardastika:tutorialStage") === "duel";
  const BOSS_ACT_ID = URL_PARAMS.get("act") ? String(URL_PARAMS.get("act")) : null;

  // ==========================================
  // КОНФІГУРАЦІЯ
  // ==========================================

  window.ELEMENTS = ["fire", "water", "air", "earth"];

  window.MULT = {
    fire:  { fire: 1.0, water: 0.5, air: 1.5, earth: 1.0 },
    water: { fire: 1.5, water: 1.0, air: 0.5, earth: 0.5 },
    air:   { fire: 0.5, water: 1.0, air: 1.0, earth: 1.5 },
    earth: { fire: 1.0, water: 1.5, air: 0.5, earth: 1.0 }
  };

  window.damage = function(attackerCard, defenderCard) {
    const aEl = attackerCard.element;
    const dEl = defenderCard.element;
    const mult = (window.MULT?.[aEl]?.[dEl]) ?? 1.0;
    const dmg = Math.round(attackerCard.power * mult);
    return { dmg, mult };
  };

  // ==========================================
  // УТИЛІТИ
  // ==========================================

  const q  = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => Array.from(r.querySelectorAll(s));
  const safeJSON = (raw)=>{ try{return JSON.parse(raw)} catch{return null} };
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const pick  = (arr)=>arr[Math.floor(Math.random()*arr.length)];
  const rint  = (a,b)=>a+Math.floor(Math.random()*(b-a+1));
  const DUEL_FX_CLASSES = ["duel-fx--gold", "duel-fx--red", "duel-fx--blue", "duel-fx--green"];
  const ATTACK_EASE = "cubic-bezier(.2,.9,.2,1)";
  const ATTACK_DASH_TO_CENTER_MS = 300;
  const ATTACK_DASH_TO_TARGET_MS = 140;
  const ATTACK_SWAP_MS = 260;
  const ATTACK_RETURN_MS = 240;
  const ATTACK_IMPACT_STOP_MS = 24;
  const isPerfLiteMotion = () => {
    if (document?.documentElement?.classList?.contains("perf-lite")) return true;
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return true;
      if (window.matchMedia?.("(pointer: coarse)")?.matches) return true;
    } catch {
      // ignore
    }
    return Number(window.navigator?.maxTouchPoints || 0) > 0;
  };
  const safeGetItem = (storage, key) => {
    try {
      return storage?.getItem?.(key) ?? null;
    } catch (e) {
      console.warn(`[storage] getItem failed: ${key}`, e);
      return null;
    }
  };
  const wait = (ms)=>new Promise((resolve)=>setTimeout(resolve, ms));
  const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const lerp = (a, b, t) => a + (b - a) * t;

  function easeInOutCubic(t){
    if (t < 0.5) return 4 * t * t * t;
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutBack(t){
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function rectCenter(el){
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  }

  function getCenterOfBoard(boardEl){
    const r = (boardEl || document.body).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function duelFxVariantForElement(element){
    const el = String(element || "").toLowerCase();
    if (el === "fire") return "red";
    if (el === "water") return "blue";
    if (el === "earth") return "green";
    return "gold";
  }

  function setDuelFxVariant(variant){
    const host = document.body;
    if (!host?.classList) return;
    const normalized = String(variant || "gold").toLowerCase();
    const targetClass = DUEL_FX_CLASSES.includes(`duel-fx--${normalized}`)
      ? `duel-fx--${normalized}`
      : "duel-fx--gold";
    host.classList.remove(...DUEL_FX_CLASSES);
    host.classList.add(targetClass);
  }

  async function animateArcTransform(el, fromX, fromY, toX, toY, opts = {}){
    if (!el) return;
    const dur = Math.max(1, Number(opts?.dur) || 320);
    const arc = Number(opts?.arc) || 110;
    const rotate = Number(opts?.rotate) || 8;
    const scaleUp = Number(opts?.scaleUp) || 1.10;
    const easing = typeof opts?.easing === "function" ? opts.easing : easeInOutCubic;
    const start = performance.now();
    let prevX = fromX;
    let prevY = fromY;
    let prevT = start;

    while (true) {
      const now = performance.now();
      const t = Math.min(1, (now - start) / dur);
      const e = easing(t);
      const x = lerp(fromX, toX, e);
      const yLin = lerp(fromY, toY, e);
      const hump = 4 * t * (1 - t);
      const y = yLin - arc * hump;

      const dt = Math.max(8, now - prevT);
      const speed = Math.hypot(x - prevX, y - prevY) / dt;
      setMotionBlur(el, speed * 1.6);
      prevX = x;
      prevY = y;
      prevT = now;

      const ang = (toX >= fromX ? 1 : -1) * rotate * (0.35 + 0.65 * hump);
      const s = 1 + (scaleUp - 1) * hump;
      const sx = s + 0.04 * hump;
      const sy = s - 0.04 * hump;
      el.style.transform = `translate(${x}px,${y}px) rotate(${ang}deg) scale(${sx},${sy})`;
      if (t >= 1) break;
      await raf();
    }

    setMotionBlur(el, 0);
  }

  function flipAnimate(elements, beforeRects, duration = ATTACK_SWAP_MS){
    const animations = elements.map((el) => {
      if (!el) return Promise.resolve();

      const before = beforeRects.get(el);
      if (!before) return Promise.resolve();

      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;

      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return Promise.resolve();

      el.classList.add("fx-flip");
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = "transform 0s";
      void el.getBoundingClientRect();

      return new Promise((resolve) => {
        const cleanup = () => {
          clearTimeout(timeoutId);
          el.style.transition = "";
          el.style.transform = "";
          el.classList.remove("fx-flip");
          el.removeEventListener("transitionend", onEnd);
          resolve();
        };

        const onEnd = (evt) => {
          if (evt.target !== el) return;
          cleanup();
        };

        const timeoutId = setTimeout(cleanup, duration + 80);
        el.addEventListener("transitionend", onEnd);
        el.style.transition = `transform ${duration}ms ${ATTACK_EASE}`;
        el.style.transform = "translate(0px, 0px)";
      });
    });

    return Promise.all(animations);
  }

  async function swapCardsWithFlip(attackerEl, defenderEl, duration = ATTACK_SWAP_MS){
    const attackerSlot = attackerEl?.closest(".battle-card-slot");
    const defenderSlot = defenderEl?.closest(".battle-card-slot");
    if (!attackerSlot || !defenderSlot || attackerSlot === defenderSlot) return;

    const beforeRects = new Map();
    beforeRects.set(attackerEl, attackerEl.getBoundingClientRect());
    beforeRects.set(defenderEl, defenderEl.getBoundingClientRect());

    const attackerPlaceholder = document.createComment("attacker-slot");
    const defenderPlaceholder = document.createComment("defender-slot");

    attackerSlot.replaceChild(attackerPlaceholder, attackerEl);
    defenderSlot.replaceChild(defenderPlaceholder, defenderEl);
    attackerSlot.replaceChild(defenderEl, attackerPlaceholder);
    defenderSlot.replaceChild(attackerEl, defenderPlaceholder);

    await flipAnimate([attackerEl, defenderEl], beforeRects, duration);
    refreshCardRefs();
  }

  function swapCardsInstant(attackerEl, defenderEl){
    const attackerSlot = attackerEl?.closest(".battle-card-slot");
    const defenderSlot = defenderEl?.closest(".battle-card-slot");
    if (!attackerSlot || !defenderSlot || attackerSlot === defenderSlot) return;

    const attackerPlaceholder = document.createComment("attacker-slot");
    const defenderPlaceholder = document.createComment("defender-slot");

    attackerSlot.replaceChild(attackerPlaceholder, attackerEl);
    defenderSlot.replaceChild(defenderPlaceholder, defenderEl);
    attackerSlot.replaceChild(defenderEl, attackerPlaceholder);
    defenderSlot.replaceChild(attackerEl, defenderPlaceholder);
    refreshCardRefs();
  }

  function showDamagePop(targetEl, dmg){
    if (!targetEl) return;
    const value = Math.max(0, Math.round(Number(dmg) || 0));
    if (!value) return;

    let dmgEl = targetEl.querySelector(".duel-dmg");
    if (!dmgEl) {
      dmgEl = document.createElement("div");
      dmgEl.className = "duel-dmg";
      targetEl.appendChild(dmgEl);
    }

    dmgEl.textContent = `-${value}`;
    dmgEl.classList.remove("show");
    void dmgEl.offsetWidth;
    dmgEl.classList.add("show");
  }

  function setMotionBlur(el, px){
    if (!el) return;
    const value = Math.max(0, Math.min(1.6, Number(px) || 0));
    el.style.setProperty("--mb", `${value.toFixed(2)}px`);
  }

  function spawnSparksAt(x, y, count = 5){
    if (isPerfLiteMotion()) return;

    for (let i = 0; i < count; i++) {
      const spark = document.createElement("div");
      spark.className = "fx-spark";
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;

      const ang = (Math.random() * Math.PI) + Math.PI;
      const dist = 20 + Math.random() * 46;
      const sx = Math.cos(ang) * dist;
      const sy = Math.sin(ang) * dist;
      spark.style.setProperty("--sx", `${sx.toFixed(1)}px`);
      spark.style.setProperty("--sy", `${sy.toFixed(1)}px`);

      document.body.appendChild(spark);
      requestAnimationFrame(() => {
        spark.style.animation = `fx-spark ${260 + Math.random() * 140}ms ease-out forwards`;
        spark.style.opacity = "1";
      });

      setTimeout(() => spark.remove(), 520);
    }
  }

  function triggerRecoil(targetEl, attackerEl){
    if (isPerfLiteMotion()) return;
    if (!targetEl || !attackerEl) return;
    const a = rectCenter(attackerEl);
    const t = rectCenter(targetEl);
    const vx = t.x - a.x;
    const vy = t.y - a.y;
    const len = Math.max(1, Math.hypot(vx, vy));
    const nx = vx / len;
    const ny = vy / len;

    targetEl.style.setProperty("--recoil-x", `${(nx * 10).toFixed(1)}px`);
    targetEl.style.setProperty("--recoil-y", `${(ny * 10).toFixed(1)}px`);
    targetEl.classList.remove("fx-recoil");
    void targetEl.offsetWidth;
    targetEl.classList.add("fx-recoil");
    setTimeout(() => targetEl.classList.remove("fx-recoil"), 220);
  }

  function cameraShake(boardEl){
    if (isPerfLiteMotion()) return;
    if (!boardEl?.classList) return;
    boardEl.classList.remove("fx-shake");
    void boardEl.offsetWidth;
    boardEl.classList.add("fx-shake");
    setTimeout(() => boardEl.classList.remove("fx-shake"), 180);
  }

  function triggerImpactFx(targetEl, boardEl, attackerEl = null){
    if (!targetEl) return;
    targetEl.classList.remove("fx-impact", "hit", "flash");
    void targetEl.offsetWidth;
    targetEl.classList.add("fx-impact", "hit", "flash");
    setTimeout(() => targetEl.classList.remove("fx-impact", "hit", "flash"), 260);
    cameraShake(boardEl);

    if (attackerEl) triggerRecoil(targetEl, attackerEl);

    const tc = rectCenter(targetEl);
    spawnSparksAt(tc.x, tc.y, 4 + Math.floor(Math.random() * 3));
  }

  async function animateAttack(attackerEl, targetEl, dmg = 0, boardEl = null, onImpact = null){
    const liteMotion = isPerfLiteMotion();
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (typeof onImpact === "function") onImpact();
    };

    if (!attackerEl || !targetEl) {
      finish();
      return;
    }

    if (typeof attackerEl.animate !== "function" || liteMotion) {
      await wait(ATTACK_IMPACT_STOP_MS);
      triggerImpactFx(targetEl, boardEl || els?.arena, attackerEl);
      showDamagePop(targetEl, dmg);
      if (liteMotion) {
        swapCardsInstant(attackerEl, targetEl);
      } else {
        await swapCardsWithFlip(attackerEl, targetEl, ATTACK_SWAP_MS);
      }
      finish();
      return;
    }

    const attackerSlot = attackerEl.closest(".battle-card-slot");
    const defenderSlot = targetEl.closest(".battle-card-slot");
    if (!attackerSlot || !defenderSlot) {
      triggerImpactFx(targetEl, boardEl || els?.arena, attackerEl);
      showDamagePop(targetEl, dmg);
      finish();
      return;
    }

    const a = rectCenter(attackerEl);
    const d = rectCenter(targetEl);
    const c = getCenterOfBoard(boardEl);
    const dxC = c.x - a.x;
    const dyC = c.y - a.y;
    const fromCenterX = a.x + dxC;
    const fromCenterY = a.y + dyC;
    const dxD = d.x - fromCenterX;
    const dyD = d.y - fromCenterY;

    const attackerPlaceholder = document.createComment("attacker-flight-slot");
    let swappedIntoAttackerSlot = false;
    const restore = {
      position: attackerEl.style.position,
      left: attackerEl.style.left,
      top: attackerEl.style.top,
      width: attackerEl.style.width,
      height: attackerEl.style.height,
      margin: attackerEl.style.margin,
      zIndex: attackerEl.style.zIndex,
      pointerEvents: attackerEl.style.pointerEvents,
      transformOrigin: attackerEl.style.transformOrigin,
      transform: attackerEl.style.transform,
      transition: attackerEl.style.transition,
    };

    const resetAttackerStyles = () => {
      try {
        attackerEl.getAnimations?.().forEach((anim) => anim.cancel());
      } catch (e) {
        // ignore animation cleanup errors
      }
      attackerEl.style.position = restore.position;
      attackerEl.style.left = restore.left;
      attackerEl.style.top = restore.top;
      attackerEl.style.width = restore.width;
      attackerEl.style.height = restore.height;
      attackerEl.style.margin = restore.margin;
      attackerEl.style.zIndex = restore.zIndex;
      attackerEl.style.pointerEvents = restore.pointerEvents;
      attackerEl.style.transformOrigin = restore.transformOrigin;
      attackerEl.style.transform = restore.transform;
      attackerEl.style.transition = restore.transition;
      attackerEl.style.removeProperty("--mb");
      attackerEl.classList.remove("duel-flight-original");
      attackerEl.classList.remove("fx-trail");
      attackerEl.classList.remove("fx-anticipate");
    };

    try {
      try {
        attackerEl.classList.add("fx-anticipate");
        setTimeout(() => attackerEl.classList.remove("fx-anticipate"), 140);
      } catch (e) {
        // ignore anticipation errors
      }
      await wait(60);

      attackerSlot.replaceChild(attackerPlaceholder, attackerEl);
      attackerEl.classList.add("duel-flight-original");
      attackerEl.classList.add("fx-trail");
      try {
        attackerEl.getAnimations?.().forEach((anim) => anim.cancel());
      } catch (e) {
        // ignore animation cleanup errors
      }
      attackerEl.style.position = "fixed";
      attackerEl.style.left = `${a.r.left}px`;
      attackerEl.style.top = `${a.r.top}px`;
      attackerEl.style.width = `${a.r.width}px`;
      attackerEl.style.height = `${a.r.height}px`;
      attackerEl.style.margin = "0";
      attackerEl.style.zIndex = "9999";
      attackerEl.style.pointerEvents = "none";
      attackerEl.style.transformOrigin = "center";
      document.body.appendChild(attackerEl);

      attackerEl.style.transform = "translate(0px,0px)";

      await animateArcTransform(attackerEl, 0, 0, dxC, dyC, {
        dur: ATTACK_DASH_TO_CENTER_MS,
        arc: 120,
        rotate: 8,
        scaleUp: 1.12,
      });

      await animateArcTransform(attackerEl, dxC, dyC, dxC + dxD, dyC + dyD, {
        dur: ATTACK_DASH_TO_TARGET_MS,
        arc: 40,
        rotate: 4,
        scaleUp: 1.06,
        easing: (t)=>1 - Math.pow(1 - t, 3),
      });

      await wait(ATTACK_IMPACT_STOP_MS);
      triggerImpactFx(targetEl, boardEl || els?.arena, attackerEl);
      showDamagePop(targetEl, dmg);

      const defenderSlotRect = defenderSlot.getBoundingClientRect();
      const toDefenderDx = defenderSlotRect.left - a.r.left;
      const toDefenderDy = defenderSlotRect.top - a.r.top;

      await animateArcTransform(
        attackerEl,
        dxC + dxD, dyC + dyD,
        toDefenderDx, toDefenderDy,
        {
          dur: ATTACK_RETURN_MS,
          arc: 30,
          rotate: 2,
          scaleUp: 1.02,
          easing: easeOutBack,
        }
      );

      attackerEl.classList.remove("fx-trail");

      const defenderBefore = new Map();
      defenderBefore.set(targetEl, targetEl.getBoundingClientRect());

      if (defenderSlot.contains(targetEl)) {
        defenderSlot.replaceChild(attackerEl, targetEl);
      } else {
        defenderSlot.appendChild(attackerEl);
      }

      if (attackerPlaceholder.parentNode === attackerSlot) {
        attackerSlot.replaceChild(targetEl, attackerPlaceholder);
        swappedIntoAttackerSlot = true;
      }

      await flipAnimate([targetEl], defenderBefore, ATTACK_SWAP_MS);

      resetAttackerStyles();
      refreshCardRefs();
      finish();
    } finally {
      if (attackerEl.parentNode === document.body) {
        if (swappedIntoAttackerSlot && defenderSlot) {
          defenderSlot.appendChild(attackerEl);
        } else if (attackerSlot && attackerPlaceholder.parentNode === attackerSlot) {
          attackerSlot.replaceChild(attackerEl, attackerPlaceholder);
        }
      }

      if (attackerPlaceholder.parentNode) {
        attackerPlaceholder.parentNode.removeChild(attackerPlaceholder);
      }

      resetAttackerStyles();
      refreshCardRefs();
      finish();
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

  function shuffle(arr) {
    return arr.slice().sort(() => Math.random() - 0.5);
  }

  function setLeagueBadge(rootEl, leagueId) {
    if (!rootEl) return;
    const id = String(leagueId || "").trim();
    if (!id) return;
    const badge = rootEl.querySelector(".battle-player__rarity");
    if (!badge) return;
    badge.innerHTML = `<img class="battle-player__league-icon" src="../../assets/icons/leagues/${escHtml(id)}.svg" alt="">`;
  }

  const ELEM_LABEL_UA = {
    fire: "Вогонь",
    water: "Вода",
    air: "Повітря",
    earth: "Земля",
  };

  const ELEM_ICON = {
    fire: "../../assets/icons/fire.svg",
    water: "../../assets/icons/water.svg",
    air: "../../assets/icons/air.svg",
    earth: "../../assets/icons/earth.svg",
  };

  function ensureTutorialBattleStyle() {
    if (!IS_TUTORIAL_DUEL) return;
    if (document.getElementById("tutorialBattleStyle")) return;
    const style = document.createElement("style");
    style.id = "tutorialBattleStyle";
    style.textContent = `
      .tutorial-battle-hint {
        margin-top: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid rgba(212, 177, 89, 0.45);
        background: rgba(17, 25, 36, 0.85);
        color: #e7edf7;
        font-size: 13px;
      }
      .tutorial-battle-hint__icon {
        width: 14px;
        height: 14px;
        vertical-align: -2px;
        margin: 0 3px 0 4px;
      }
      .tutorial-recommended-card {
        position: relative;
        box-shadow: 0 0 0 2px rgba(255, 222, 116, 0.9), 0 0 18px rgba(255, 222, 116, 0.55);
      }
      .tutorial-recommended-card::before {
        content: "↓";
        position: absolute;
        top: -28px;
        left: 50%;
        transform: translateX(-50%);
        color: #ffd978;
        font-size: 24px;
        font-weight: 700;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
        animation: tutorialArrowBounce 0.9s ease-in-out infinite;
        pointer-events: none;
      }
      @keyframes tutorialArrowBounce {
        0%, 100% { transform: translateX(-50%) translateY(0); }
        50% { transform: translateX(-50%) translateY(3px); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureTutorialHintHost() {
    if (!IS_TUTORIAL_DUEL) return null;
    let hint = document.getElementById("tutorialBattleHint");
    if (hint) return hint;
    const instr = document.querySelector(".battle-instructions");
    if (!instr) return null;
    hint = document.createElement("div");
    hint.id = "tutorialBattleHint";
    hint.className = "tutorial-battle-hint";
    instr.insertAdjacentElement("afterend", hint);
    return hint;
  }

  function bestTutorialMove() {
    if (!CURRENT_DUEL) return null;
    let best = null;
    for (let i = 0; i < (CURRENT_DUEL?.player?.hand?.length || 0); i++) {
      const pCard = CURRENT_DUEL.player.hand[i];
      const eCard = CURRENT_DUEL.enemy.hand[i];
      if (!pCard || !eCard) continue;
      const mult = (window.MULT?.[pCard.element]?.[eCard.element]) ?? 1;
      const dmg = Math.round((Number(pCard.power) || 0) * mult);
      if (!best || mult > best.mult || (mult === best.mult && dmg > best.dmg)) {
        best = { i, mult, dmg, pCard, eCard };
      }
    }
    return best;
  }

  function updateTutorialGuidance() {
    if (!IS_TUTORIAL_DUEL) return;
    ensureTutorialBattleStyle();
    const hint = ensureTutorialHintHost();
    els.playerBtns.forEach((btn) => btn.classList.remove("tutorial-recommended-card"));

    if (!CURRENT_DUEL || CURRENT_DUEL.finished) {
      if (hint) hint.textContent = "Навчальна дуель завершена.";
      return;
    }

    const move = bestTutorialMove();
    if (!move) return;
    const targetBtn = els.playerBtns[move.i];
    if (targetBtn) targetBtn.classList.add("tutorial-recommended-card");

    const stateText = move.mult > 1
      ? `<b style="color:#71e49a;">вигідний</b>`
      : move.mult < 1
        ? `<b style="color:#ff8e8e;">невигідний</b>`
        : `<b style="color:#d8e0ee;">нейтральний</b>`;

    const pName = ELEM_LABEL_UA[String(move.pCard?.element || "")] || "Стихія";
    const eName = ELEM_LABEL_UA[String(move.eCard?.element || "")] || "Стихія";
    const pIcon = ELEM_ICON[String(move.pCard?.element || "")] || "";
    const eIcon = ELEM_ICON[String(move.eCard?.element || "")] || "";
    if (hint) {
      hint.innerHTML = `⬇ Хід у слот ${move.i + 1}: ${stateText} (${move.mult.toFixed(1)}x). ` +
        `<img class="tutorial-battle-hint__icon" src="${pIcon}" alt="">${pName} проти ` +
        `<img class="tutorial-battle-hint__icon" src="${eIcon}" alt="">${eName}.`;
    }
  }

  // ==========================================
  // НОРМАЛІЗАЦІЯ КАРТ
  // ==========================================

  // Кеш artFile по id картки з cards.json
  let artFileCache = null;
  let artFileByTitleElementCache = null;
  const LEGACY_CARD_ID_ALIASES = {
    elem_01: "elem_flame_spark",
    elem_02: "elem_tide_drop",
    elem_03: "elem_gale_wisp",
    elem_04: "elem_stone_seed",
  };

  function titleElementKey(title, element) {
    const t = String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
    const e = String(element || "").toLowerCase().trim();
    if (!t) return "";
    return `${t}|${e || "*"}`;
  }

  function normalizeArtFileName(rawFile) {
    const s = String(rawFile || "").trim();
    if (!s) return "";
    if (/^(data:|https?:\/\/|\/)/i.test(s)) return s;
    if (s.startsWith("../../") || s.startsWith("../") || s.startsWith("./assets/") || s.startsWith("assets/")) return s;
    if (!/\.[a-z0-9]+$/i.test(s)) return `${s}.webp`;
    return s;
  }

  const SOURCE_ART_FILE_BY_ID = Object.freeze({
    source_fire: "istokfire.webp",
    source_water: "istokwater.webp",
    source_air: "istokair.webp",
    source_earth: "istokearth.webp",
    istokfire: "istokfire.webp",
    istokwater: "istokwater.webp",
    istokair: "istokair.webp",
    istokearth: "istokearth.webp",
  });

  function artFileFromCardId(cardId) {
    const id = String(cardId || "").trim();
    if (!id) return "";
    const mapped = SOURCE_ART_FILE_BY_ID[id.toLowerCase()];
    if (mapped) return mapped;
    return normalizeArtFileName(id);
  }

  function artUrlFromFileLike(rawFile) {
    const f = normalizeArtFileName(rawFile);
    if (!f) return "";
    if (/^(data:|https?:\/\/|\/)/i.test(f)) return f;
    if (f.startsWith("../../") || f.startsWith("../")) return f;
    if (f.startsWith("./assets/")) return `../../${f.slice(2)}`;
    if (f.startsWith("assets/")) return `../../${f}`;
    return `../../assets/cards/arts/${f}`;
  }

  function resolveCardArtUrl(raw, element) {
    const item = raw && typeof raw === "object" ? raw : {};
    const id = String(item.id ?? item.cardId ?? item.card_id ?? "").trim();
    const aliasId = id ? (LEGACY_CARD_ID_ALIASES[id] || "") : "";

    // ID-based art has priority project-wide.
    let artFile = artFileFromCardId(aliasId || id);

    if (!artFile && id && artFileCache) {
      artFile = artFileCache[id] || (aliasId ? artFileCache[aliasId] : "") || "";
    }

    if (!artFile && artFileByTitleElementCache) {
      const key = titleElementKey(item.name || item.title || item.id || "", element);
      if (key) artFile = artFileByTitleElementCache[key] || "";
    }

    if (!artFile) artFile = normalizeArtFileName(item.artFile || "");

    const byFile = artUrlFromFileLike(artFile);
    const byArt = artUrlFromFileLike(item.art || item.image || item.img || item.cover || "");
    const elementDefault = element ? `../../assets/cards/arts/${element}_001.webp` : "";
    return byFile || byArt || elementDefault || "";
  }
  
  async function loadArtFileCache() {
    if (artFileCache) return artFileCache;
    try {
      const r = await fetch("../../data/cards.json", { cache: "default" });
      if (!r.ok) return {};
      const json = await r.json();
      const cards = Array.isArray(json?.cards) ? json.cards : [];
      const cache = {};
      const byTitleElement = {};
      for (const c of cards) {
        if (!c || !c.id) continue;
        const id = String(c.id).trim();
        if (!id) continue;
        const idArtFile = artFileFromCardId(id);
        const legacyArtFile = normalizeArtFileName(c.artFile || "");
        cache[id] = idArtFile || legacyArtFile || "";
        const k = titleElementKey(c.title || c.name || c.id, c.element || "");
        if (k && !byTitleElement[k]) byTitleElement[k] = idArtFile || legacyArtFile || "";
      }
      artFileCache = cache;
      artFileByTitleElementCache = byTitleElement;
      return cache;
    } catch {
      artFileCache = {};
      artFileByTitleElementCache = {};
      return {};
    }
  }

  function normalizeCardForDuel(raw, fallbackId) {
    if (!raw || typeof raw !== "object") return null;

    const element = normalizeElement(raw.element || raw.elem || raw.type);
    if (!element) return null;

    let power = Number(raw.power ?? raw.basePower ?? raw.str ?? raw.attack ?? raw.value);
    if (!Number.isFinite(power) || power < 1) power = 1;
    power = Math.max(1, Math.round(power));

    const rarityRaw = Number(raw.rarity ?? raw.quality ?? 1);
    const rarity = Number.isFinite(rarityRaw) ? clamp(Math.round(rarityRaw), 1, 6) : 1;

    const art = resolveCardArtUrl(raw, element);

    return {
      uid: String(raw.uid || raw.id || fallbackId || Date.now()),
      id: raw.id ?? raw.cardId ?? raw.card_id ?? null,
      element,
      power,
      rarity,
      name: String(raw.name || raw.title || raw.id || element),
      art: art ? String(art) : null
    };
  }

  function normalizeElement(x){
    const s = String(x||"").toLowerCase();
    if (window.ELEMENTS.includes(s)) return s;
    if (s==="wind") return "air";
    return null;
  }

  function normalizeCard(raw, fallbackId){
    if (!raw || typeof raw!=="object") return null;
    const element = normalizeElement(raw.element || raw.elem || raw.type);
    let power = Number(raw.power ?? raw.basePower ?? raw.str ?? raw.attack ?? raw.value);
    if (!Number.isFinite(power) || power < 1) power = 1;
    if (!element) return null;

    const rarity = Number(raw.rarity ?? raw.quality ?? 1);
    
    const art = resolveCardArtUrl(raw, element);

    return {
      uid: String(raw.uid || raw.id || fallbackId || Date.now()),
      id: raw.id ?? raw.cardId ?? raw.card_id ?? null,
      name: String(raw.name || raw.title || raw.id || element),
      element,
      power: Math.max(1, Math.round(power)),
      rarity: Number.isFinite(rarity) ? clamp(Math.round(rarity),1,6) : 1,
      art: art ? String(art) : null
    };
  }

  // ==========================================
  // ЗАВАНТАЖЕННЯ КОЛОДИ
  // ==========================================

  function loadPlayerDeckOnly(){
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

    for (const k of KEYS){
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

  function calcHP(cards){
    return cards.reduce((s,c)=>s+(c?.power||0),0);
  }

  // ==========================================
  // ГЕНЕРУВАННЯ КОЛОДИ ПРОТИВНИКА
  // ==========================================

  function buildEnemyDeck(totalHp){
    // battle.html показує тільки 3 карти в руці, але дуельний движок працює з пулом з 9 карт.
    // Тому будуємо РІВНО 9 карт, сума `power` яких дорівнює `totalHp`.
    const count = 9;
    const hp = Math.max(1, Math.round(Number(totalHp) || 0));

    // Для "дорослих" HP тримаємо мінімум 12 на карту, щоб не виходили 10–13 при HP ~ 900.
    let minPower = (hp >= count * 12) ? 12 : 1;
    let remaining = hp - minPower * count;
    if (remaining < 0) {
      minPower = 1;
      remaining = hp - minPower * count;
    }

    // Розподіл залишку по 9 картах через випадкові ваги (щоб виходили значення ~ hp/9).
    const weights = Array.from({ length: count }, () => Math.random());
    const sumW = weights.reduce((s, w) => s + w, 0) || 1;
    const adds = weights.map(w => Math.floor((remaining * w) / sumW));

    // Добиваємо недостачу через найбільші дробові частини, щоб сума була точною.
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

    const baseName = IS_BOSS_BATTLE ? "Карта боса" : "Карта ворога";

    const cards = adds.map((add, i) => ({
      uid: `enemy:${Date.now()}:${i}`,
      name: `${baseName} ${i + 1}`,
      element: pick(window.ELEMENTS),
      power: Math.max(1, minPower + add),
      rarity: rint(1, 6),
      art: null
    }));

    // Фінальна страховка: якщо через округлення щось пішло не так — виправляємо останньою картою.
    const sum = cards.reduce((s, c) => s + (c.power || 0), 0);
    const fix = hp - sum;
    if (fix !== 0) {
      cards[cards.length - 1].power = Math.max(1, (cards[cards.length - 1].power || 1) + fix);
    }

    return cards;
  }

  // ==========================================
  // ДУЕЛЬ
  // ==========================================

  window.createDuel = function(playerDeck, enemyDeck) {
    const pNorm = playerDeck.map((c, i) => normalizeCardForDuel(c, `p${i}`)).filter(Boolean);
    const eNorm = enemyDeck.map((c, i) => normalizeCardForDuel(c, `e${i}`)).filter(Boolean);

    console.log("pNorm length:", pNorm.length, "eNorm length:", eNorm.length);

    if (pNorm.length < 3 || eNorm.length < 3) {
      throw new Error("Need at least 3 cards per side");
    }

    const pHP = pNorm.reduce((s, c) => s + c.power, 0);
    const eHP = eNorm.reduce((s, c) => s + c.power, 0);

    console.log("Duel pHP:", pHP, "eHP:", eHP);

    const duel = {
      turn: 0,
      player: {
        hp: pHP,
        maxHp: pHP,
        allCards: pNorm.slice(0, 9),
        drawPile: shuffle(pNorm.slice(0,9)),
        discardPile: [],
        hand: []
      },
      enemy: {
        hp: eHP,
        maxHp: eHP,
        allCards: eNorm.slice(0, 9),
        drawPile: shuffle(eNorm.slice(0,9)),
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
  };

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

    // Абсолютний фолбек: якщо все спорожніло (через погані дані/помилку) — перевиставляємо з allCards
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
      // повертаємо відкладені назад у drawPile (щоб не втратити карти)
      while (deferred.length) side.drawPile.unshift(deferred.pop());
      return c;
    }

    // якщо уникати вже нема як — повернемо будь-що (але не залишимо слот порожнім)
    if (deferred.length) return deferred.pop();
    return null;
  }

  function fillInitialHand(side, count) {
    side.hand = [];
    for (let i = 0; i < count; i++) {
      const c = drawCard(side);
      if (c) side.hand[i] = c;
    }
    // додаємо пропуски, якщо раптом зустрілися "пусті" записи
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

  window.playTurn = function(duel, idx){
    if (duel.finished) return duel;

    const pCard = duel.player.hand[idx];
    const eCard = duel.enemy.hand[idx];
    if (!pCard || !eCard) {
      // якщо слот раптом став порожнім — рефілимо і не ламаємо кліки
      if (!pCard) ensureSlotCard(duel.player, idx);
      if (!eCard) ensureSlotCard(duel.enemy, idx);
      return duel;
    } // дзеркально: якщо нема карти в одному зі слотів — хід не робимо

    const pHit = window.damage(pCard, eCard);
    const eHit = window.damage(eCard, pCard);

    console.log(`Mirror атака: слот ${idx} (${pCard.element} ${pCard.power}) vs (${eCard.element} ${eCard.power})`);
    console.log(`Дамаг: ви ${pHit.dmg} (x${pHit.mult}), ворог ${eHit.dmg} (x${eHit.mult})`);

    duel.enemy.hp -= pHit.dmg;
    duel.player.hp -= eHit.dmg;

    duel.lastTurn = { pIdx: idx, eIdx: idx, pCard, eCard, pHit, eHit };

    duel.log.push({
      turn: duel.turn++,
      playerIdx: idx,
      enemyIdx: idx,
      pId: pCard.id ?? null,
      eId: eCard.id ?? null,
      pEl: pCard.element,
      eEl: eCard.element,
      pPower: pCard.power,
      ePower: eCard.power,
      pName: String(pCard.name || pCard.title || pCard.id || pCard.element || "Карта"),
      eName: String(eCard.name || eCard.title || eCard.id || eCard.element || "Карта"),
      pArt: pCard.art ?? null,
      eArt: eCard.art ?? null,
      pDmg: pHit.dmg, pMult: pHit.mult,
      eDmg: eHit.dmg, eMult: eHit.mult
    });

    // "кладбище" (discard) + добір (draw): слот ніколи не має лишатись порожнім
    // Карту в discard кладемо завжди, а при доборі намагаємось уникнути її миттєвого повернення.
    discardCard(duel.player, pCard);
    const pNext = drawCard(duel.player, { avoidUids: new Set([pCard.uid]) });
    if (pNext) {
      duel.player.hand[idx] = pNext;
    } else {
      // якщо добір неможливий — не дублюємо карту в discard
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

    console.log(`HP після: гравець ${duel.player.hp}, ворог ${duel.enemy.hp}`);

    if (duel.player.hp <= 0 && duel.enemy.hp <= 0) duel.result = "draw";
    else if (duel.player.hp <= 0) duel.result = "lose";
    else if (duel.enemy.hp <= 0) duel.result = "win";

    if (duel.result) duel.finished = true;
    return duel;
  };

  // ==========================================
  // DOM ЕЛЕМЕНТИ
  // ==========================================

  const els = {
    enemyHp: q(".battle-player--enemy .battle-player__hp"),
    playerHp: q(".battle-player--self .battle-player__hp"),
    log: q(".battle-log__entries"),
    attackBtn: q("#attackBtn"),
    arena: q(".battle-arena-frame"),
    enemyBtns: qa(".battle-cards--enemy .ref-card"),
    playerBtns: qa(".battle-cards:not(.battle-cards--enemy) .ref-card"),
    multEls: qa(".battle-multipliers .battle-multiplier")
  };

  function refreshCardRefs(){
    els.enemyBtns = qa(".battle-cards--enemy .ref-card");
    els.playerBtns = qa(".battle-cards:not(.battle-cards--enemy) .ref-card");
  }

  // ==========================================
  // РЕНДЕРИНГ
  // ==========================================

  function setHP(el, hp, maxHp){
    if (!el) return;
    el.textContent = ` ${Math.max(0,hp)} / ${Math.max(1,maxHp)}`;
  }

  function setCardButton(btn, card){
    const isEnemy = !!btn.closest(".battle-cards--enemy");

    if (IS_BOSS_BATTLE && isEnemy) {
      btn.classList.add("is-mystery");

      btn.classList.remove("elem-fire", "elem-water", "elem-air", "elem-earth");
      for (let r = 1; r <= 6; r++) btn.classList.remove(`rarity-${r}`);
      btn.classList.add("rarity-1");

      const powerEl = btn.querySelector(".ref-card__power");
      if (powerEl) powerEl.textContent = "?";

      const artEl = btn.querySelector(".ref-card__art");
      if (artEl) artEl.style.backgroundImage = "";

      btn.dataset.uid = card.uid;
      btn.dataset.element = card.element;
      btn.dataset.power = String(card.power);
      return;
    }

    btn.classList.remove("is-mystery");

    const elemClass = `elem-${card.element}`;

    btn.classList.remove("elem-fire", "elem-water", "elem-air", "elem-earth");
    btn.classList.add(elemClass);

    for (let r = 1; r <= 6; r++) btn.classList.remove(`rarity-${r}`);
    btn.classList.add(`rarity-${card.rarity}`);

    const powerEl = btn.querySelector(".ref-card__power");
    if (powerEl) powerEl.textContent = String(card.power);

    const artEl = btn.querySelector(".ref-card__art");
    if (artEl) {
      if (card.art) {
        // Показуємо арт картки
        artEl.style.backgroundImage = `url('${card.art.replace(/'/g, "\\'")}')`;
        artEl.style.backgroundSize = "cover";
        artEl.style.backgroundPosition = "center";
      } else {
        // Фолбек на градієнт елементу
        artEl.style.backgroundImage = `linear-gradient(135deg, var(--color-${card.element}), var(--color-${card.element}-light))`;
      }
    }

    btn.dataset.uid = card.uid;
    btn.dataset.element = card.element;
    btn.dataset.power = String(card.power);
  }

  function updatePlayerMultiplierPreview(){
    if (!CURRENT_DUEL) return;

    const selectedCard = selectedPlayerCard !== null ? CURRENT_DUEL.player.hand[selectedPlayerCard] : null;

    for (let i=0;i<els.multEls.length;i++){
      const mEl = els.multEls[i];
      const pCard = selectedCard || CURRENT_DUEL.player.hand[i];
      const eCard = CURRENT_DUEL.enemy.hand[i];

      if (IS_BOSS_BATTLE) {
        mEl.innerHTML = `<span></span> x?`;
        mEl.classList.remove("battle-multiplier--bonus", "battle-multiplier--penalty");
        continue;
      }

      let mult = 1.0;
      if (pCard && eCard) mult = window.MULT[pCard.element][eCard.element];

      const txt = (mult % 1 === 0) ? `x${mult.toFixed(0)}` : `x${mult.toFixed(2).replace(/0+$/,"").replace(/\.$/,"")}`;
      mEl.innerHTML = `<span></span> ${txt}`;

      mEl.classList.remove("battle-multiplier--bonus", "battle-multiplier--penalty");
      if (mult > 1) mEl.classList.add("battle-multiplier--bonus");
      if (mult < 1) mEl.classList.add("battle-multiplier--penalty");
    }
  }

  function clearOutlines(){
    [...els.enemyBtns, ...els.playerBtns].forEach(b=>{
      b.style.outline = "";
      b.style.outlineOffset = "";
    });
  }

  function clearSelection(){
    selectedPlayerCard = null;
    clearOutlines();
  }

  function updateLog(){
    if (!els.log || !CURRENT_DUEL) return;
    els.log.innerHTML = '';
    const logs = CURRENT_DUEL.log.slice(-7).reverse();
    for (const entry of logs) {
      const t = Number(entry?.turn) ?? 0;
      const slot = (Number(entry?.playerIdx) ?? 0) + 1;
      const pm = Number.isFinite(Number(entry?.pMult)) ? Number(entry.pMult) : 1;
      const em = Number.isFinite(Number(entry?.eMult)) ? Number(entry.eMult) : 1;

      const pEl = String(entry?.pEl || "");
      const eEl = String(entry?.eEl || "");
      const pName = String(entry?.pName || "Ваша карта");
      const eName = String(entry?.eName || "Карта ворога");

      const swords = swordIconForMult(pm, em);
      const pBg = miniArtBg(entry?.pArt, pEl);
      const eBg = miniArtBg(entry?.eArt, eEl);

      const html = `
        <div class="duel-mini-meta">Хід ${t} • Слот ${slot}</div>
        <div class="duel-mini-line">
          <div class="duel-mini-card elem-${escHtml(pEl)}" title="${escHtml(pName)}">
            <div class="duel-mini-card__art" style="background-image: ${pBg};"></div>
          </div>
          <div class="duel-mini-num duel-mini-num--p" title="Ви: ×${pm}">${fmtNumAbs(entry?.pDmg)}</div>
          <img class="duel-mini-swords" src="${swords}" alt="" title="Ви: ×${pm} • Ворог: ×${em}">
          <div class="duel-mini-num duel-mini-num--e" title="Ворог: ×${em}">${fmtNumAbs(entry?.eDmg)}</div>
          <div class="duel-mini-card elem-${escHtml(eEl)}" title="${escHtml(eName)}">
            <div class="duel-mini-card__art" style="background-image: ${eBg};"></div>
          </div>
        </div>
      `;
      const d = document.createElement("div");
      d.className = "battle-log__entry";
      d.innerHTML = html;
      els.log.append(d);
    }
  }

  function renderAll(){
    if (!CURRENT_DUEL) return;
    refreshCardRefs();

    for (let i=0;i<els.playerBtns.length;i++){
      const btn = els.playerBtns[i];

      // авто-рефилл, если слот вдруг пустой
      if (!CURRENT_DUEL.player.hand[i]) {
        ensureSlotCard(CURRENT_DUEL.player, i);
      }

      const card = CURRENT_DUEL.player.hand[i];
      btn.disabled = !card;
      if (card) setCardButton(btn, card);
    }

    for (let i=0;i<els.enemyBtns.length;i++){
      const btn = els.enemyBtns[i];

      if (!CURRENT_DUEL.enemy.hand[i]) {
        ensureSlotCard(CURRENT_DUEL.enemy, i);
      }

      const card = CURRENT_DUEL.enemy.hand[i];
      btn.disabled = !card;
      if (card) setCardButton(btn, card);
    }

    setHP(els.playerHp, CURRENT_DUEL.player.hp, CURRENT_DUEL.player.maxHp);
    setHP(els.enemyHp, CURRENT_DUEL.enemy.hp, CURRENT_DUEL.enemy.maxHp);

    clearOutlines();
    if (selectedPlayerCard !== null) {
      els.playerBtns[selectedPlayerCard].style.outline = "3px solid yellow";
    }
    updatePlayerMultiplierPreview();
    updateTutorialGuidance();
    updateLog();
  }

  function endBattle(){
    const msg = CURRENT_DUEL.result === "win" ? "Перемога" : CURRENT_DUEL.result === "lose" ? "Поразка" : "Нічия";
    const logEl = document.createElement("div");
    logEl.className = "battle-log__entry";
    logEl.innerHTML = `<b>${msg}</b>`;
    if (els.log) els.log.prepend(logEl);

    const enemyMaxHp = Number(CURRENT_DUEL?.enemy?.maxHp ?? 0);
    const enemyHp = Number(CURRENT_DUEL?.enemy?.hp ?? 0);
    const damageDealt = Math.max(0, enemyMaxHp - Math.max(0, enemyHp)); // без "оверкілу"

    let payload = null;
    if (!IS_BOSS_BATTLE) {
      try {
        payload = window.ProgressionSystem?.applyDuelBattleResult?.({
          result: CURRENT_DUEL.result,
          enemyName: ENEMY_PROF?.name || "Ворог",
          playerHp: CURRENT_DUEL?.player?.hp,
          playerMaxHp: CURRENT_DUEL?.player?.maxHp,
          enemyHp: CURRENT_DUEL?.enemy?.hp,
          enemyMaxHp: CURRENT_DUEL?.enemy?.maxHp,
          damageDealt,
        }) || null;
      } catch (e) {
        console.warn("[battle] ProgressionSystem applyDuelBattleResult failed", e);
      }
    }

    if (!payload) {
      const enemyName = ENEMY_PROF?.name || (IS_BOSS_BATTLE ? "Бос" : "Ворог");

      payload = {
        result: CURRENT_DUEL.result,
        mode: IS_BOSS_BATTLE ? "boss" : "duel",
        boss: IS_BOSS_BATTLE ? { actId: BOSS_ACT_ID, name: enemyName, power: Math.max(0, Math.round(enemyMaxHp || 0)) } : null,
        enemyName,
        player: { hp: CURRENT_DUEL?.player?.hp, maxHp: CURRENT_DUEL?.player?.maxHp },
        enemy: { hp: CURRENT_DUEL?.enemy?.hp, maxHp: CURRENT_DUEL?.enemy?.maxHp },
        rewards: { silver: 0, gold: 0, goldDropped: false, goldToday: 0, goldLimit: 0 },
        xp: { gained: 0 },
        duel: { wins: 0, losses: 0, draws: 0 },
        league: { id: null, name: null, baseSilver: 0 },
        ts: Date.now(),
      };
    }

    // Attach compact battle log for result page
    try {
      const log = Array.isArray(CURRENT_DUEL?.log) ? CURRENT_DUEL.log.slice(-12) : [];
      payload.battleLog = log;
    } catch (e) {
      // ignore
    }

    try { sessionStorage.setItem("cardastika:duelResult", JSON.stringify(payload)); } catch(e) { console.warn("[battle] sessionStorage setItem failed (duelResult)", e); }
    // file:// navigation can drop sessionStorage between pages in some browsers; keep a localStorage copy as fallback
    try { localStorage.setItem("cardastika:duelResult", JSON.stringify(payload)); } catch(e) { console.warn("[battle] localStorage setItem failed (duelResult)", e); }

    if (!IS_BOSS_BATTLE) {
      try {
        import("../../src/campaign/campaign-events.js")
          .then((m) => m.emitCampaignEvent?.("duel_finished", { result: CURRENT_DUEL?.result }))
          .catch(() => {});
      } catch (e) {
        // ignore
      }
    }

    const resultUrl = IS_BOSS_BATTLE
      ? `./result.html?mode=boss${BOSS_ACT_ID ? `&act=${encodeURIComponent(BOSS_ACT_ID)}` : ""}`
      : IS_TUTORIAL_DUEL
        ? "./result.html?tutorial=1"
        : "./result.html";
    setTimeout(() => {
      location.href = resultUrl;
    }, 450);
  }

  function bindUI(){
    refreshCardRefs();

    async function runAttackAnimation(idx, dmg, onImpact){
      refreshCardRefs();
      const attackerBtn = els.playerBtns[idx];
      const defenderBtn = els.enemyBtns[idx];
      await animateAttack(attackerBtn, defenderBtn, dmg, els.arena, onImpact);
    }

    async function performTurnWithAnimation(idx){
      if (!CURRENT_DUEL || CURRENT_DUEL.finished || isTurnAnimating) return;

      // if slot is empty, refill first and do not spend animation on an invalid turn
      if (!CURRENT_DUEL.player.hand[idx] || !CURRENT_DUEL.enemy.hand[idx]) {
        ensureSlotCard(CURRENT_DUEL.player, idx);
        ensureSlotCard(CURRENT_DUEL.enemy, idx);
        renderAll();
        return;
      }

      const pCard = CURRENT_DUEL.player.hand[idx];
      const eCard = CURRENT_DUEL.enemy.hand[idx];
      const pHit = window.damage(pCard, eCard);
      setDuelFxVariant(duelFxVariantForElement(pCard?.element));

      isTurnAnimating = true;
      let turnApplied = false;
      const applyTurn = () => {
        if (turnApplied) return;
        turnApplied = true;
        try {
          CURRENT_DUEL = window.playTurn(CURRENT_DUEL, idx);
        } catch (e) {
          console.error("playTurn failed:", e);
          alert("Помилка ходу. Відкрий консоль (F12) щоб побачити деталі.");
          return;
        }

        renderAll();
        if (CURRENT_DUEL.finished) {
          endBattle();
        }
      };

      try {
        await runAttackAnimation(idx, pHit?.dmg ?? 0, applyTurn);
        if (!turnApplied) applyTurn();
      } catch (e) {
        console.error("attack animation failed:", e);
        if (!turnApplied) applyTurn();
      } finally {
        isTurnAnimating = false;
      }
    }

    // клік по своїй карті = дзеркальна атака 1в1 (слот i -> слот i)
    els.playerBtns.forEach((btn, idx)=>{
      btn.addEventListener("click", ()=> performTurnWithAnimation(idx));
    });

    // клік по карті ворога тепер дзеркальний — слот i атакує слот i
    els.enemyBtns.forEach((btn, idx)=>{
      btn.addEventListener("click", ()=> performTurnWithAnimation(idx));
    });
  }

  // ==========================================
  // ІНІЦІАЛІЗАЦІЯ
  // ==========================================

  async function init(){
    // Завантажити кеш артів перед стартом
    await loadArtFileCache();
    let collectionBonuses = null;
    let applyDeckCollectionBonuses = (deck) => deck;
    let applyHpCollectionBonuses = (hp) => hp;
    try {
      const collectionApi = await import("../../src/core/collection-bonuses.js");
      collectionBonuses = await collectionApi.getCollectionBattleBonuses();
      if (typeof collectionApi.applyCollectionBonusesToDeck === "function") {
        applyDeckCollectionBonuses = (deck) => collectionApi.applyCollectionBonusesToDeck(deck, collectionBonuses);
      }
      if (typeof collectionApi.applyCollectionBonusesToHp === "function") {
        applyHpCollectionBonuses = (hp) =>
          collectionApi.applyCollectionBonusesToHp(hp, collectionBonuses, {
            mode: IS_BOSS_BATTLE ? "boss" : "duel",
          });
      }
    } catch (e) {
      console.warn("[battle] failed to load collection bonuses", e);
    }

    try {
      const screenEl = document.getElementById("screen");
      if (screenEl && IS_BOSS_BATTLE) screenEl.classList.add("is-boss");

      const instrEl = document.querySelector(".battle-instructions");
      if (instrEl && IS_BOSS_BATTLE) instrEl.textContent = "Виберіть, чим ходити.";
      if (instrEl && IS_TUTORIAL_DUEL) {
        instrEl.textContent = "Слідуй підказці: стрілка показує рекомендовану карту для ходу.";
      }
    } catch (e) {
      // ignore
    }

    let playerDeck = loadPlayerDeckOnly();
    
    if (playerDeck.length < 3){
      console.warn(` Player deck has only ${playerDeck.length} valid card(s). Using fallback cards.`);
      playerDeck = [
        {uid:"dev1", element:"fire",  power:12, rarity:3},
        {uid:"dev2", element:"water", power:11, rarity:2},
        {uid:"dev3", element:"air",   power:10, rarity:2},
        {uid:"dev4", element:"earth", power:13, rarity:3},
      ];
    }

    // Flat item bonuses are applied before any percentage battle modifiers.
    let hpBonusFromEquipment = 0;
    try {
      const eqApi = window.EquipmentSystem;
      if (eqApi?.applyItemsToDeckAndHp) {
        const applied = eqApi.applyItemsToDeckAndHp(playerDeck, calcHP(playerDeck));
        if (Array.isArray(applied?.deck) && applied.deck.length) {
          playerDeck = applied.deck;
        }
        hpBonusFromEquipment = Math.max(0, Math.round(Number(applied?.profile?.hpBonus || 0)));
      }
    } catch (e) {
      console.warn("[battle] failed to apply equipment bonuses", e);
    }
    playerDeck = applyDeckCollectionBonuses(playerDeck);

    console.log("Player deck:", playerDeck);
    const dragonHpBonus = Math.max(0, Number(localStorage.getItem("cardastika:dragonHpBonus") || 0) || 0);
    let playerHp = calcHP(playerDeck) + hpBonusFromEquipment + dragonHpBonus;
    playerHp = applyHpCollectionBonuses(playerHp);
    console.log("Player HP calculated from deck:", playerHp);

    // Якщо duel.html вже показав HP — використовуємо його як source of truth для відображення в battle.html.
    // Для бою з босом НЕ підміняємо HP, бо boss-бій стартує напряму (без duel.html), і значення може бути "старим".
    if (!IS_BOSS_BATTLE) {
      try {
        const stored = Number(
          safeGetItem(sessionStorage, "cardastika:duelPlayerHp") ||
          safeGetItem(localStorage, "cardastika:duelPlayerHp") ||
          ""
        );
        if (Number.isFinite(stored) && stored > 0) {
          playerHp = Math.round(stored);
          console.log("[battle] playerHp overridden from duel:", playerHp);
        }
      } catch (e) {
        console.warn("[battle] failed to read duelPlayerHp", e);
      }
    }

    // Читаємо дані противника: спочатку sessionStorage, потім localStorage як fallback
    ENEMY_PROF = safeJSON(safeGetItem(sessionStorage, "cardastika:duelEnemy") || safeGetItem(localStorage, "cardastika:duelEnemy") || "null") || {};
    const enemyHp = Number(ENEMY_PROF?.hp) || Math.round(playerHp * (0.8 + Math.random() * 0.4));

    console.log("Final player HP:", playerHp);
    console.log("Enemy HP:", enemyHp);

    const enemyAll = buildEnemyDeck(enemyHp);
    try {
      const s = enemyAll.reduce((acc, c) => acc + (Number(c?.power) || 0), 0);
      console.log("[battle] enemy deck sum:", s, "expected:", enemyHp, "cards:", enemyAll.map(c => c.power));
    } catch (e) { /* ignore */ }

    try {
      CURRENT_DUEL = window.createDuel(playerDeck, enemyAll);
    } catch (e) {
      console.error("Duel init failed:", e);
      alert("Бій не стартував: проблема з колодою/даними. Відкрий консоль (F12) щоб побачити помилку.");
      return;
    }
    // Debug handle for console inspection
    try { window.__BATTLE_DUEL = CURRENT_DUEL; } catch (e) { /* ignore */ }

    // Гарантуємо, що відображені HP в бою точно співпадатимуть
    // з числом, яке було показане на екрані пошуку противника.
    // Перезаписуємо HP після створення дуелі (playerHp та enemyHp розраховані вище).
    try {
      if (CURRENT_DUEL && typeof playerHp === 'number' && Number.isFinite(playerHp)) {
        CURRENT_DUEL.player.hp = playerHp;
        CURRENT_DUEL.player.maxHp = playerHp;
      }
      if (CURRENT_DUEL && typeof enemyHp === 'number' && Number.isFinite(enemyHp)) {
        CURRENT_DUEL.enemy.hp = enemyHp;
        CURRENT_DUEL.enemy.maxHp = enemyHp;
      }
    } catch (e) {
      console.warn('[battle] failed to override duel HP', e);
    }

    // Діагностика: виведемо значення, щоб перевірити відповідність
    try {
      console.log('[battle:init] ENEMY_PROF from storage:', ENEMY_PROF);
      console.log('[battle:init] playerHp (calculated):', playerHp, 'enemyHp (from storage/fallback):', enemyHp);
      if (CURRENT_DUEL) console.log('[battle:init] CURRENT_DUEL.enemy hp/maxHp after override:', CURRENT_DUEL.enemy.hp, CURRENT_DUEL.enemy.maxHp);
    } catch (e) {
      /* ignore */
    }

    const enemyName = ENEMY_PROF?.name;
    if (enemyName) {
      const nameEl = document.getElementById("enemyName");
      if (nameEl) nameEl.innerHTML = `<span class="battle-player__rarity"></span> ${escHtml(enemyName)}`;
    }

    // League badge + player name/avatar (use progression state as source of truth)
    try {
      const st = window.ProgressionSystem?.getState?.() || null;
      const leagueId = String(st?.league?.id || "");

      const playerAccName = String(window.AccountSystem?.getActive?.()?.name || "Гравець");
      const playerNameEl = document.querySelector(".battle-player--self .battle-player__name");
      if (playerNameEl) playerNameEl.innerHTML = `<span class="battle-player__rarity"></span> ${escHtml(playerAccName)}`;

      setLeagueBadge(document.querySelector(".battle-player--self"), leagueId);
      setLeagueBadge(document.querySelector(".battle-player--enemy"), leagueId);

      // Аватар гравця - зі збереженого в localStorage (той самий що в HUD)
      const pAva = document.querySelector(".battle-player--self .battle-player__avatar img");
      if (pAva) {
        let savedAvatar = String(localStorage.getItem("cardastika:avatarUrl") || "").trim();
        // Валідація
        if (savedAvatar && !savedAvatar.startsWith("assets/")) {
          savedAvatar = "";
        }
        // Додаємо prefix для шляху з pages/duel/
        const avatarUrl = savedAvatar 
          ? "../../" + savedAvatar
          : "../../assets/cards/arts/fire_001.webp";
        pAva.src = avatarUrl;
      }

      // Аватар ворога - випадковий арт з його колоди
      const eAva = document.querySelector(".battle-player--enemy .battle-player__avatar img");
      if (eAva) {
        const enemyCardsWithArt = (CURRENT_DUEL?.enemy?.allCards || []).filter(c => c?.art);
        const eRandomArt = enemyCardsWithArt.length ? pick(enemyCardsWithArt).art : null;
        eAva.src = eRandomArt || "../../assets/cards/demo/earth_01.jpg";
      }
    } catch (e) {
      console.warn("[battle] league/avatar update failed", e);
    }

    bindUI();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
