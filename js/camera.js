class Camera {
  constructor(viewW, viewH) {
    this.zoom = 2;
    this.screenW = viewW;
    this.screenH = viewH;
    this.viewW = viewW / this.zoom;
    this.viewH = viewH / this.zoom;
    this.x = 0;
    this.y = 0;
    this.scoped = false;
    this.scopeLookAhead = 18;
  }

  setScope(on, scopeZoom, scopeLookAhead) {
    this.scoped = on;
    this.scopeLookAhead = on ? (scopeLookAhead || 120) : 18;
  }

  follow(px, py, mouseWX, mouseWY, dt) {

    const lookAhead = this.scopeLookAhead;

    let tx = px, ty = py;
    if (mouseWX != null && mouseWY != null) {
      const dx = mouseWX - px, dy = mouseWY - py;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        if (this.scoped) {
          // Scope: camera pushes significantly toward mouse
          const pull = Math.min(len, lookAhead);
          tx += (dx / len) * pull;
          ty += (dy / len) * pull;
        } else {
          const strength = Math.min(len, 80) / 80;
          tx += (dx / len) * lookAhead * strength;
          ty += (dy / len) * lookAhead * strength;
        }
      }
    }

    const goalX = tx - this.viewW / 2;
    const goalY = ty - this.viewH / 2;

    const smooth = 1 - Math.pow(this.scoped ? 0.005 : 0.02, dt);
    this.x += (goalX - this.x) * smooth;
    this.y += (goalY - this.y) * smooth;
    this.clamp();
  }

  clamp() {
    const maxX = CONFIG.MAP_PX_W - this.viewW;
    const maxY = CONFIG.MAP_PX_H - this.viewH;
    this.x = maxX <= 0 ? maxX / 2 : Math.max(0, Math.min(this.x, maxX));
    this.y = maxY <= 0 ? maxY / 2 : Math.max(0, Math.min(this.y, maxY));
  }

  screenToWorld(sx, sy) {
    return { wx: sx / this.zoom + this.x, wy: sy / this.zoom + this.y };
  }

  screenToTile(sx, sy) {
    const { wx, wy } = this.screenToWorld(sx, sy);
    return { col: Math.floor(wx / CONFIG.TILE), row: Math.floor(wy / CONFIG.TILE) };
  }

  pan(dx, dy, dt) {
    const speed = 250 * dt;
    this.x += dx * speed; this.y += dy * speed;
    this.clamp();
  }

  resize(w, h) {
    this.screenW = w; this.screenH = h;
    this.viewW = w / this.zoom; this.viewH = h / this.zoom;
    this.clamp();
  }
}
