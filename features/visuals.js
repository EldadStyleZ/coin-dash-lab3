/* Offline pixel sprites. Core owns physics; the enemy module owns behaviors. */
(function () {
  'use strict';
  const prefix = 'coin-dash-pixel-';
  const enemyColors = [0xff667d, 0xb68cff, 0xffad5b, 0x6dcaff, 0xf779d7, 0xa4d967];
  const playerPixels = [
    '.....OOOOOO.....', '....OHHHHHHO....', '...OHHHHHHHHO...', '...OHHWWWWWKO...',
    '..OOHKDDDDDKOO..', '..OHKDDWWDDDKO..', '..OHKDDWWDDDKO..', '..OHKKKKKKKKKO..',
    '..OHHHHHHHHHHO..', '.OOOHHHWWWHHOOO.', '.OHOHHHWWWHHOHO.', '.OHOHHHHHHHHOHO.',
    '.OOOHHHHHHHHOOO.', '...OKKKOOKKKO...', '...OKKKOOKKKO...', '...OOOO..OOOO...'
  ];
  const enemyPixels = [
    '..OO........OO..', '.OCCO......OCCO.', '.OCCOOOOOOOOCCO.', '..OCCCCCCCCCCO..',
    '.OCCCHHHHHHCCCO.', '.OCCKKKKKKKKCCO.', '.OCKWWKKKKWWKCO.', '.OCKWWKKKKWWKCO.',
    '.OCKKKKKKKKKKCO.', '.OCCCCCCCCCCCCO.', '..OCCCKKKKCCCO..', '...OCCCCCCCCO...',
    '..OOOCCCCCCOOO..', '.OCCOOOOOOOOCCO.', '.OCCO......OCCO.', '..OO........OO..'
  ];
  const coinPixels = [
    '.....OOOOOO.....', '...OOHHHHHHOO...', '..OHYYYYYYYYHO..', '.OHYYYHHHHYYYHO.',
    '.OYYYHYYYYHYYYO.', 'OHYYYHYYYYHYYYKO', 'OHYYYHYYYYHYYYKO', 'OHYYYHYYYYHYYYKO',
    'OHYYYHYYYYHYYYKO', 'OHYYYHYYYYHYYYKO', 'OHYYYHYYYYHYYYKO', '.OKYYYHHHHYYYKO.',
    '.OKYYYYYYYYYYKO.', '..OKYYYYYYYYKO..', '...OOKKKKKKOO...', '.....OOOOOO.....'
  ];
  function texture(scene, key, pixels, colors) {
    if (scene.textures.exists(key)) return;
    const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    try {
      pixels.forEach((row, y) => {
        [...row].forEach((pixel, x) => {
          if (pixel === '.') return;
          graphics.fillStyle(colors[pixel], 1);
          graphics.fillRect(x * 2, y * 2, 2, 2);
        });
      });
      graphics.generateTexture(key, 32, 32);
      // NEAREST is 1 in the pinned Phaser runtime.
      scene.textures.get(key).setFilter(1);
    } finally {
      graphics.destroy();
    }
  }
  function prepare(scene) {
    texture(scene, prefix + 'player', playerPixels, {
      O: 0x092734, H: 0x76f4ca, K: 0x29b69e, D: 0x183b54, W: 0xe4fff7
    });
    texture(scene, prefix + 'coin', coinPixels, {
      O: 0x724b25, H: 0xfff1a5, Y: 0xffcf58, K: 0xdc8e33
    });
    enemyColors.forEach((color, index) => texture(scene, prefix + 'enemy-' + index, enemyPixels, {
      O: 0x23213a, C: color, H: 0xffe4ec, K: 0x372d4b, W: 0xffffff
    }));
  }
  function createPlayer(scene, x, y) {
    prepare(scene);
    return scene.add.sprite(x, y, prefix + 'player').setDisplaySize(28, 28);
  }
  function createEnemy(scene, x, y, index, type = 'drone') {
    prepare(scene);
    const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
    const colorIndex = ((safeIndex % enemyColors.length) + enemyColors.length) % enemyColors.length;
    const enemy = scene.add.sprite(x, y, prefix + 'enemy-' + colorIndex).setDisplaySize(28, 28);
    enemy.setData('index', index);
    enemy.setData('type', type);
    enemy.setData('color', enemyColors[colorIndex]);
    return enemy;
  }
  function createCoin(scene, x, y) {
    prepare(scene);
    return scene.add.sprite(x, y, prefix + 'coin').setDisplaySize(20, 20);
  }
  window.CoinDashVisuals = { prepare, createPlayer, createEnemy, createCoin };
}());
