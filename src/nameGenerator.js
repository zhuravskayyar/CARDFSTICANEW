/**
 * Генератор імен в українському стилі
 */

const nameGeneratorConfig = {
  mageFirstNames: [
    "Мар'ян", 'Василь', 'Богдан', 'Ігор', 'Бронислав',
    'Святослав', 'Владислав', 'Казимир', 'Максим', 'Артем',
    'Даміан', 'Венцель', 'Тарас', 'Давид', 'Юрій',
    'Остап', 'Федір', 'Семен', 'Демид', 'Ростислав'  ],
  mageLastNames: [
    'Чарівник', 'Ворожей', 'Маг', 'Обережник', 'Волхв',
    'Кудесник', 'Гадатель', 'Чаклун', 'Чарівничок', 'Магіонок',
    'Поворотник', 'Огнебород', 'Вітріянко', 'Звіздозрач', 'Стихієць'  ],
  warriorFirstNames: [
    'Святослав', 'Ярослав', 'Мстислав', 'Ніколас', 'Вікінг',
    'Болеслав', 'Казимир', 'Костянтин', 'Фемісан', 'Лев',
    'Рибалт', 'Бірон', 'Артем', 'Лауро', 'Грім'  ],
  warriorLastNames: [
    'Щитоносець', 'Мечник', 'Гарнець', 'Грізний', 'Сміливець',
    'Чумак', 'Хоругвиця', 'Потай', 'Запорож', 'Добрий',
    'Стерегач', 'Вигнанець', 'Біловус', 'Чорнявко', 'Ярмарко'  ],
  priestNames: [
    'Феодосій', 'Кирило', 'Мефодій', 'Нестор', 'Климент',
    'Григорій', 'Софрон', 'Петро', 'Павло', 'Сергій'  ],
  priestLastNames: [
    'Святий', 'Благочестивий', 'Смиренний', 'Праведник', 'Книжник',
    'Відлюдник', 'Чернець', 'Пустельник', 'Молитвеник', 'Служитель'  ]
};

/**
 * Генерує випадкове ім\'я для противника
 * @param {string} type - тип персонажа ('mage', 'warrior', 'priest')
 * @returns {string} Повне ім\'я
 */
export function generateEnemyName(type = 'mage') {
  const config = nameGeneratorConfig;

  // Мапа типів до масивів імен
  const typeMap = {
    mage: { first: config.mageFirstNames, last: config.mageLastNames },
    warrior: { first: config.warriorFirstNames, last: config.warriorLastNames },
    priest: { first: config.priestNames, last: config.priestLastNames }
  };

  // Вибираємо тип або fallback до mage
  const names = typeMap[type] || typeMap.mage;

  // Допоміжна функція для випадкового вибору
  const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];

  const firstName = getRandomElement(names.first);
  const lastName = getRandomElement(names.last);

  return `${firstName} ${lastName}`;
}

/**
 * Генерує випадкове число для рівня
 * @returns {number}
 */
export function generateEnemyLevel() {
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * Генерує інформацію про противника
 * @returns {object} { name, level, type }
 */
export function generateEnemy() {
  const types = ['mage', 'warrior', 'priest'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  return {
    name: generateEnemyName(type),
    level: generateEnemyLevel(),
    type: type
  };
}

