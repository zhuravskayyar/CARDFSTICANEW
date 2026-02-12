import {
  EQUIPMENT_LIMITS,
  EQUIPMENT_ITEM_SLOTS,
  getEquipmentSummary,
  readEquipmentState,
  saveEquipmentState,
  equipItem,
  unequipItem,
  equipArtifact,
  unequipArtifact,
  seedDemoEquipmentIfEmpty,
} from "../../src/core/equipment-system.js";

const ITEM_SLOT_TO_DOM = {
  weapon: 'hand-left',
  hat: 'ring-left',
  armor: 'hand-right',
  boots: 'ring-right',
};

const ARTIFACT_TYPE_TO_DOM = {
  spear: 'boots-left',
  shield: 'pants',
  mirror: 'boots-right',
};

const RARITY_RANK = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  mythic: 6,
};

const ELEMENT_ICON = {
  fire: "../../assets/icons/fire.svg",
  water: "../../assets/icons/water.svg",
  air: "../../assets/icons/air.svg",
  earth: "../../assets/icons/earth.svg",
};

function q(sel, root = document) {
  return root.querySelector(sel);
}

function qa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function rarityName(rarity) {
  const map = {
    common: "Звичайна",
    uncommon: "Незвичайна",
    rare: "Рідкісна",
    epic: "Епічна",
    legendary: "Легендарна",
    mythic: "Міфічна",
  };
  return map[String(rarity || "").toLowerCase()] || "Невідома";
}

function bestItemForSlot(state, slot) {
  const equippedIds = new Set(Object.values(state?.equipped?.items || {}).filter(Boolean));
  const items = Array.isArray(state?.items) ? state.items : [];
  const candidates = items.filter((x) => x?.slot === slot && !equippedIds.has(x.id));
  candidates.sort((a, b) => (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0));
  return candidates[0] || null;
}

function bestArtifactForType(state, type) {
  const equippedIds = new Set(Object.values(state?.equipped?.artifacts || {}).filter(Boolean));
  const arts = Array.isArray(state?.artifacts) ? state.artifacts : [];
  const candidates = arts.filter((x) => x?.artifactType === type && !equippedIds.has(x.id));
  candidates.sort((a, b) => (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0));
  return candidates[0] || null;
}

function renderSlot(node, content) {
  if (!node) return;
  node.classList.toggle("is-empty", !content);
  node.classList.toggle("has-item", !!content);
  const inner = q(".equipment-slot__inner", node);
  if (!inner) return;

  if (!content) {
    inner.innerHTML = "";
    return;
  }

  const title = content.title || "";
  const icon = content.icon || "../../assets/icons/elements.svg";
  inner.innerHTML = `<img src="${icon}" alt="" class="equipment-slot__item" title="${title}">`;
}

function renderSummary() {
  const summary = getEquipmentSummary();
  const state = readEquipmentState();

  const itemCount = Array.isArray(state.items) ? state.items.length : 0;
  const artCount = Array.isArray(state.artifacts) ? state.artifacts.length : 0;

  const tabs = qa(".equipment-tab");
  const itemsTab = tabs.find((x) => x.dataset.tab === "items");
  const artsTab = tabs.find((x) => x.dataset.tab === "artifacts");
  if (itemsTab) q(".equipment-tab__count", itemsTab).textContent = String(itemCount);
  if (artsTab) q(".equipment-tab__count", artsTab).textContent = String(artCount);

  const progress = q(".equipment-progress__text");
  if (progress) {
    progress.innerHTML = `Речі: <b>${summary.counts.items}</b> / ${EQUIPMENT_LIMITS.items} • Артефакти: <b>${summary.counts.artifacts}</b> / ${EQUIPMENT_LIMITS.artifacts}`;
  }

  const bonusValues = qa(".equipment-bonus__value");
  if (bonusValues.length >= 4) {
    bonusValues[0].textContent = `+${summary.itemBonus.elementBonus.fire}`;
    bonusValues[1].textContent = `+${summary.itemBonus.elementBonus.water}`;
    bonusValues[2].textContent = `+${summary.itemBonus.elementBonus.air}`;
    bonusValues[3].textContent = `+${summary.itemBonus.elementBonus.earth}`;
  }

  const itemById = new Map((state.items || []).map((x) => [x.id, x]));
  for (const [slot, domSlot] of Object.entries(ITEM_SLOT_TO_DOM)) {
    const dom = q(`.equipment-slot[data-slot="${domSlot}"]`);
    const id = state?.equipped?.items?.[slot] || "";
    const item = id ? itemById.get(id) : null;
    const icon = item?.element ? ELEMENT_ICON[item.element] : "../../assets/icons/elements.svg";
    const title = item ? `${rarityName(item.rarity)} • ${item.element}` : "";
    renderSlot(dom, item ? { icon, title } : null);
  }

  const artById = new Map((state.artifacts || []).map((x) => [x.id, x]));
  for (const [type, domSlot] of Object.entries(ARTIFACT_TYPE_TO_DOM)) {
    const dom = q(`.equipment-slot[data-slot="${domSlot}"]`);
    if (!dom) continue;
    const id = state?.equipped?.artifacts?.[type] || "";
    const art = id ? artById.get(id) : null;
    const icon = "../../assets/icons/elements.svg";
    const title = art ? `${type} • ${rarityName(art.rarity)}` : "";
    renderSlot(dom, art ? { icon, title } : null);
  }

  const rulesHint = q("#equipmentSetHint");
  if (rulesHint) {
    const setParts = [];
    if (summary.itemBonus.sets.unifiedRarity) setParts.push("Сет «Єдина рідкість» активний (+25%)");
    if (summary.itemBonus.sets.schoolOfElements) setParts.push("Сет «Школа всіх стихій» активний (бонус для всіх карт)");
    if (!setParts.length) setParts.push("Сети не активні");
    rulesHint.textContent = `${setParts.join(" • ")} • Бонус HP: +${summary.itemBonus.hpBonus}`;
  }
}

function bindTabs() {
  qa(".equipment-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      qa(".equipment-tab").forEach((x) => x.classList.remove("is-active"));
      tab.classList.add("is-active");
    });
  });
}

function bindSlotActions() {
  const stateReader = () => readEquipmentState();

  for (const [slot, domSlot] of Object.entries(ITEM_SLOT_TO_DOM)) {
    const dom = q(`.equipment-slot[data-slot="${domSlot}"]`);
    if (!dom) continue;
    dom.addEventListener("click", () => {
      const state = stateReader();
      const equippedId = state?.equipped?.items?.[slot] || "";
      if (equippedId) {
        unequipItem(slot);
        renderSummary();
        return;
      }
      const nextItem = bestItemForSlot(state, slot);
      if (!nextItem) return;
      equipItem(nextItem.id);
      renderSummary();
    });
  }

  for (const [type, domSlot] of Object.entries(ARTIFACT_TYPE_TO_DOM)) {
    const dom = q(`.equipment-slot[data-slot="${domSlot}"]`);
    if (!dom) continue;
    dom.addEventListener("click", () => {
      const state = stateReader();
      const equippedId = state?.equipped?.artifacts?.[type] || "";
      if (equippedId) {
        unequipArtifact(type);
        renderSummary();
        return;
      }
      const nextArt = bestArtifactForType(state, type);
      if (!nextArt) return;
      equipArtifact(nextArt.id);
      renderSummary();
    });
  }
}

function ensureControlPanel() {
  const host = q(".equipment-hint");
  if (!host || q(".equipment-controls", host)) return;
  const wrap = document.createElement("div");
  wrap.className = "equipment-controls";
  wrap.innerHTML = `
    <button class="equipment-action__btn" id="equipmentSeedBtn" type="button" style="margin-top:8px;">Додати демо-набір</button>
    <p id="equipmentSetHint" style="margin-top:10px; font-size:12px; color:#9ec7f0;"></p>
  `;
  host.appendChild(wrap);

  const seedBtn = q("#equipmentSeedBtn", wrap);
  seedBtn?.addEventListener("click", () => {
    seedDemoEquipmentIfEmpty();
    renderSummary();
  });
}

function normalizeLegacyProgressLimit() {
  const state = readEquipmentState();
  saveEquipmentState(state);
}

document.addEventListener("DOMContentLoaded", () => {
  normalizeLegacyProgressLimit();
  bindTabs();
  bindSlotActions();
  ensureControlPanel();
  renderSummary();
});

