(() => {
  "use strict";

  const BP_ITEMS_KEY = "cardastika:magicItems";

  const ITEM_NAME_TO_ID = {
    "Знижка в крамниці": "shop_discount",
    "Кристал магії": "magic_crystal",
    "Настойка старого Дуайта": "old_dwight_tincture",
    "Дозвіл на полювання": "hunting_permit",
    "Спадок дядька Сема": "uncle_sam_legacy",
    "Чудесне зцілення": "miracle_healing",
    "Серце дракона": "dragon_heart",
    "Фокус-покус": "focus_pocus",
    "Кам'яний щит": "stone_shield",
    "Четвертий ключ": "fourth_key",
    "Грамота Гірського короля": "mountain_king_charter",
    "Золотий Вексель Корони": "golden_crown_bill",
    "Золоті ножиці гномів": "golden_dwarf_scissors",
    "Золотий молот гномів": "golden_dwarf_hammer",
    "Грамота Золотого Дракона": "golden_dragon_charter",
    "Вексель Царства Драконів": "dragon_kingdom_bill",
    "Сталевий щит": "steel_shield",
    "Чудові пасатижі гномів": "dwarf_pliers",
    "Чарівна палітра ельфів": "elf_palette"
  };

  function safeParse(raw, fallback = null) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function readItems() {
    const raw = safeParse(localStorage.getItem(BP_ITEMS_KEY), null);
    if (!raw || typeof raw !== "object") return {};
    return raw;
  }

  function readCount(items, id) {
    if (!id) return 0;
    const entry = items[id];
    if (typeof entry === "number") return Math.max(0, Math.round(entry));
    if (entry && typeof entry === "object") return Math.max(0, Math.round(Number(entry.count) || 0));
    return 0;
  }

  function updateMyItems() {
    const items = readItems();
    const cards = Array.from(document.querySelectorAll(".myi-item"));
    let ownedUnique = 0;

    for (const card of cards) {
      const nameEl = card.querySelector(".myi-item-name");
      const countEl = card.querySelector(".myi-item-count");
      if (!nameEl || !countEl) continue;

      const name = String(nameEl.textContent || "").trim();
      const mappedId = ITEM_NAME_TO_ID[name] || "";
      const count = readCount(items, mappedId);

      if (count > 0) ownedUnique += 1;

      countEl.textContent = `${count}/1`;
      card.classList.toggle("is-owned", count > 0);
    }

    const counterValue = document.querySelector(".myi-counter-value");
    const counterTotal = document.querySelector(".myi-counter-total");
    if (counterValue) counterValue.textContent = String(ownedUnique);
    if (counterTotal) counterTotal.textContent = String(cards.length);
  }

  document.addEventListener("DOMContentLoaded", updateMyItems);
})();

