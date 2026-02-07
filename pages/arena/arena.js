/**
 * Arena screen logic
 */

class ArenaScreen {
  constructor() {
    this.minRating = 2000;
    this.userRating = 0; // буде завантажено з даних гравця
    this.init();
  }

  init() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Arena menu buttons
    const menuButtons = document.querySelectorAll('.arena-menu-item');
    menuButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleMenuAction(action);
      });
    });

    // Bottom navigation
    const botbarBtns = document.querySelectorAll('[data-route]');
    botbarBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const route = e.currentTarget.dataset.route;
        this.navigate(route);
      });
    });
  }

  handleMenuAction(action) {
    switch (action) {
      case 'rating':
        console.log('Opening arena rating...');
        // window.location.href = './arena-rating.html';
        break;
      case 'tasks':
        console.log('Opening arena tasks...');
        window.location.href = '../tasks/tasks.html';
        break;
      case 'shop':
        console.log('Opening arena shop...');
        window.location.href = '../../pages/shop/shop.html';
        break;
    }
  }

  navigate(route) {
    const routes = {
      home: '../../index.html',
      profile: '../../pages/profile/profile.html',
      guild: '#' // Placeholder for guild page
    };
    if (routes[route]) {
      window.location.href = routes[route];
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new ArenaScreen();
});
