// Відкрий консоль браузера (F12) і виконай цей код для встановлення рейтингу:

// Варіант 1 - через ProgressionSystem
if (window.ProgressionSystem) {
  window.ProgressionSystem.updateState((s) => {
    s.duel = s.duel || {};
    s.duel.rating = 2500;
  });
  console.log("Рейтинг встановлено через ProgressionSystem");
}

// Варіант 2 - через localStorage напряму
localStorage.setItem("cardastika:progression", JSON.stringify({duel:{rating:2500}}));
console.log("Рейтинг встановлено напряму");

// Оновіть сторінку після виконання!
