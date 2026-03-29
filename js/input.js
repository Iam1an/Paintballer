class Input {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.keys = {};
    this.mouse = { x: 0, y: 0, col: -1, row: -1, down: false };
    this.onLeftClick = null;
    this.onRightClick = null;

    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      const { col, row } = camera.screenToTile(this.mouse.x, this.mouse.y);
      this.mouse.col = col;
      this.mouse.row = row;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const { col, row } = camera.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
      if (this.onLeftClick) this.onLeftClick(col, row, e);
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const { col, row } = camera.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
      if (this.onRightClick) this.onRightClick(col, row);
    });
  }
}
