/* Fixed obstacles and level palettes. Enemy steering remains owned by its module. */
(function (root) {
  'use strict';
  const BOUNDS = Object.freeze({ left: 16, right: 784, top: 44, bottom: 484 });
  const LAYOUT = Object.freeze([
    Object.freeze({ x: 210, y: 150, width: 104, height: 28 }),
    Object.freeze({ x: 590, y: 150, width: 28, height: 88 }),
    Object.freeze({ x: 210, y: 374, width: 28, height: 88 }),
    Object.freeze({ x: 590, y: 374, width: 104, height: 28 })
  ]);
  const PALETTES = Object.freeze([
    Object.freeze({ name: 'teal', background: 0x101f25, grid: 0x4b827e, obstacle: 0x28574f, edge: 0x79e8cf }),
    Object.freeze({ name: 'purple', background: 0x20182c, grid: 0x85649e, obstacle: 0x533c6c, edge: 0xd5a4ff }),
    Object.freeze({ name: 'blue', background: 0x111d30, grid: 0x527faa, obstacle: 0x294e77, edge: 0x91c9ff }),
    Object.freeze({ name: 'orange', background: 0x261b13, grid: 0x99754f, obstacle: 0x65472c, edge: 0xffca89 })
  ]);

  class CoinDashArena {
    constructor(scene) {
      this.scene = scene;
      this.destroyed = false;
      this.layout = LAYOUT;
      this.colliders = [];
      this.attachedPlayer = null;
      this.attachedDrones = null;
      this.paletteIndex = -1;
      this.background = scene.add.rectangle(400, 250, 800, 500, PALETTES[0].background).setDepth(-20);
      this.grid = scene.add.grid(400, 250, 800, 500, 32, 32, 0, 0, PALETTES[0].grid, 0.24).setDepth(-19);
      this.obstacles = scene.physics.add.staticGroup();
      this.shapes = LAYOUT.map(rect => {
        const shape = scene.add.rectangle(rect.x, rect.y, rect.width, rect.height, PALETTES[0].obstacle)
          .setStrokeStyle(2, PALETTES[0].edge, 1).setDepth(-1);
        scene.physics.add.existing(shape, true);
        // A Rectangle's exact unscaled bounds are also its static collision bounds.
        shape.body.setSize(rect.width, rect.height);
        shape.body.updateFromGameObject();
        this.obstacles.add(shape);
        return shape;
      });
      this.gameElement = root.document ? root.document.getElementById('game') : null;
      this.previousBorder = this.gameElement ? this.gameElement.style.borderColor : '';
      this.borderColor = null;
      this.setLevel(scene.level || 1);
    }

    isClear(x, y, radius = 20) {
      if (this.destroyed || ![x, y, radius].every(Number.isFinite) || radius < 0) return false;
      if (x - radius < BOUNDS.left || x + radius > BOUNDS.right ||
          y - radius < BOUNDS.top || y + radius > BOUNDS.bottom) return false;
      // Expanded rectangles intentionally leave conservative clearance at corners.
      return !LAYOUT.some(rect => x >= rect.x - rect.width / 2 - radius &&
        x <= rect.x + rect.width / 2 + radius &&
        y >= rect.y - rect.height / 2 - radius && y <= rect.y + rect.height / 2 + radius);
    }

    attach(player, drones) {
      if (this.destroyed) return;
      if (player === this.attachedPlayer && drones === this.attachedDrones) return;
      this.colliders.forEach(collider => collider.destroy());
      this.colliders = [];
      this.attachedPlayer = player;
      this.attachedDrones = drones;
      if (player) this.colliders.push(this.scene.physics.add.collider(player, this.obstacles));
      if (drones) {
        for (const enemy of drones.getChildren()) enemy.body?.setBounce(1, 1);
        this.colliders.push(this.scene.physics.add.collider(drones, this.obstacles));
      }
    }

    setLevel(level) {
      if (this.destroyed) return;
      const safeLevel = Number.isSafeInteger(level) && level >= 1 ? level : 1;
      const index = (safeLevel - 1) % PALETTES.length;
      if (index === this.paletteIndex) return;
      this.paletteIndex = index;
      this.palette = PALETTES[index];
      this.background.setFillStyle(this.palette.background, 1);
      this.grid.setOutlineStyle(this.palette.grid, 0.24);
      this.shapes.forEach(shape => shape.setFillStyle(this.palette.obstacle, 1).setStrokeStyle(2, this.palette.edge, 1));
      if (this.gameElement) {
        this.gameElement.style.borderColor = '#' + this.palette.edge.toString(16).padStart(6, '0');
        this.borderColor = this.gameElement.style.borderColor;
      }
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.colliders.forEach(collider => collider.destroy());
      this.colliders = [];
      // Phaser may already have cleared scene objects when a shutdown handler runs.
      if (this.obstacles.scene) this.obstacles.destroy(true);
      for (const object of [this.grid, this.background]) if (object.scene) object.destroy();
      if (this.gameElement && this.gameElement.style.borderColor === this.borderColor) {
        this.gameElement.style.borderColor = this.previousBorder;
      }
      this.attachedPlayer = null;
      this.attachedDrones = null;
      this.shapes = [];
      this.gameElement = null;
      this.scene = null;
    }
  }

  root.CoinDashArena = CoinDashArena;
})(typeof window !== 'undefined' ? window : globalThis);
