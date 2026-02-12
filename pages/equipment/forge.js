import {
  quickForgeAllPossible,
  getEquipmentSummary,
} from "../../src/core/equipment-system.js";

function q(sel, root = document) {
  return root.querySelector(sel);
}

function qa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

let activeMode = "items";

function renderSummary(message = "") {
  const summary = getEquipmentSummary();

  const tabs = qa(".forge-tab");
  const itemsTab = tabs.find((x) => x.dataset.tab === "items");
  const artsTab = tabs.find((x) => x.dataset.tab === "artifacts");

  if (itemsTab) q(".forge-tab__count", itemsTab).textContent = String(summary.counts.items);
  if (artsTab) q(".forge-tab__count", artsTab).textContent = String(summary.counts.artifacts);

  const hint = q(".forge-rules__text");
  if (hint) {
    hint.textContent = "Швидкокузня: переплавляє спорядження однакової рідкості та типу, шанс результату 100%.";
  }

  const speech = q(".forge-promo__speech p");
  if (speech) {
    if (message) {
      speech.textContent = message;
      return;
    }
    speech.textContent = `Золото: ${summary.gold}. Обраний режим: ${activeMode === "items" ? "Речі" : "Артефакти"}.`;
  }
}

function bindTabs() {
  qa(".forge-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      qa(".forge-tab").forEach((x) => x.classList.remove("is-active"));
      tab.classList.add("is-active");
      activeMode = tab.dataset.tab === "artifacts" ? "artifacts" : "items";
      renderSummary();
    });
  });
}

function bindForgeAction() {
  const btn = q(".forge-action__btn");
  if (!btn) return;
  btn.textContent = "Швидкокузня";
  btn.addEventListener("click", () => {
    const result = quickForgeAllPossible({ mode: activeMode });
    if (!result?.ok) {
      renderSummary("Не вдалося виконати переплавку.");
      return;
    }
    if (!result.produced.length) {
      renderSummary("Підходящого спорядження для переплавки не знайдено.");
      return;
    }

    const total = result.produced.reduce((s, x) => s + Number(x.amount || 0), 0);
    renderSummary(`Переплавлено ${total} шт. Витрачено золота: ${result.spentGold}.`);
    if (typeof window.updateGlobalHUD === "function") {
      window.updateGlobalHUD();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindForgeAction();
  renderSummary();
});

