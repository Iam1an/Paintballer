class Unit {
  constructor(x, y, team, className, squadIdx, unitIdx) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.team = team;
    this.className = className || 'rifleman';
    this.classDef = CONFIG.CLASSES[this.className];
    this.squadIdx = squadIdx || 0;
    this.isLeader = unitIdx === 0;

    this.hp = this.classDef ? this.classDef.hp : (team === 'player' ? 100 : CONFIG.ENEMY.HP);
    this.maxHp = this.hp;
    this.aimAngle = 0;
    this.fireCooldown = 0;
    this.dead = false;
    this.clipSize = this.classDef ? this.classDef.clipSize : 30;
    this.ammo = this.clipSize;
    this.maxAmmo = this.clipSize;
    this.reserve = this.classDef ? this.classDef.reserveAmmo : 30;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadTime = this.classDef ? this.classDef.reloadTime : 2.0;
    this.medkits = this.classDef ? this.classDef.medkits : 1;
    this.grenades = this.classDef ? this.classDef.grenades : 0;
    this.radius = CONFIG.UNIT.RADIUS;
    this.medkitTimer = 0;
    this.usingMedkit = false;
    this.meleeCooldown = 0;
    this.meleeSwing = 0;
    this.barricadeCooldown = 0;
    this.sprintTimer = 0;
    this.sprintCooldown = 0;
  }

  get maxSpeed() {
    const base = this.classDef ? this.classDef.speed : (this.team === 'player' ? 92 : CONFIG.ENEMY.SPEED);
    const sprinted = (this.sprintTimer > 0 && this.classDef?.sprintMul) ? base * this.classDef.sprintMul : base;
    return this._inWater ? sprinted * CONFIG.WORLD.WATER_SPEED_MUL : sprinted;
  }

  get fireRate() { return this.classDef ? this.classDef.fireRate : 0.3; }
  get damage() { return this.classDef ? this.classDef.damage : 18; }
  get range() {
    if (!this.classDef) return 8;
    // Scoped rifleman gets extended range
    if (this._scoped && this.classDef.scopeRange) return this.classDef.scopeRange;
    return this.classDef.range;
  }
  // range getter defined above
  get bulletSpeed() { return this.classDef ? this.classDef.bulletSpeed : 350; }
  get spread() { return this.classDef ? this.classDef.spread : 0.04; }

  update(dt) {
    if (this.dead) return;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.meleeCooldown > 0) this.meleeCooldown -= dt;
    if (this.meleeSwing > 0) this.meleeSwing -= dt;
    if (this.barricadeCooldown > 0) this.barricadeCooldown -= dt;
    if (this.sprintTimer > 0) this.sprintTimer -= dt;
    if (this.sprintCooldown > 0) this.sprintCooldown -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.clipSize - this.ammo;
        const give = Math.min(needed, this.reserve);
        this.ammo += give;
        this.reserve -= give;
        this.reloading = false;
        this.reloadTimer = 0;
      }
    }
    if (this.ammo <= 0 && this.reserve > 0 && !this.reloading) this.startReload();
    if (this.medkitTimer > 0) {
      this.medkitTimer -= dt;
      this.usingMedkit = true;
      if (this.medkitTimer <= 0) { this.medkitTimer = 0; this.usingMedkit = false; this.heal(40); }
    }
  }

  startMedkit() {
    if (this.dead || this.medkits <= 0 || this.usingMedkit || this.hp >= this.maxHp) return false;
    this.medkits--;
    this.medkitTimer = CONFIG.UNIT.MEDKIT_TIME;
    this.usingMedkit = true;
    return true;
  }

  startReload() {
    if (this.dead || this.reloading || this.reserve <= 0 || this.ammo >= this.clipSize) return false;
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
    return true;
  }

  aimAt(wx, wy) { this.aimAngle = Math.atan2(wy - this.y, wx - this.x); }
  canFire() { return !this.dead && this.fireCooldown <= 0 && this.ammo > 0 && !this.usingMedkit && !this.reloading; }

  fire() { this.fireCooldown = this.fireRate; this.ammo--; }

  takeDamage(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  heal(amt) { if (!this.dead) this.hp = Math.min(this.maxHp, this.hp + amt); }

  physics(dt, world, allUnits) {
    if (this.dead) return;
    const T = CONFIG.TILE;
    const gc = Math.floor(this.x / T), gr = Math.floor(this.y / T);
    const onWater = world.inBounds(gc, gr) && world.ground[gr][gc] === 'water';
    const ruin = world.getRuin(gc, gr);
    this._inWater = onWater && (!ruin || ruin.type !== 'wood_floor');

    const friction = this._inWater ? 12 : 8;
    this.vx *= Math.max(0, 1 - friction * dt);
    this.vy *= Math.max(0, 1 - friction * dt);
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > this.maxSpeed) { this.vx = (this.vx / speed) * this.maxSpeed; this.vy = (this.vy / speed) * this.maxSpeed; }

    for (const other of allUnits) {
      if (other === this || other.dead) continue;
      const dx = this.x - other.x, dy = this.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 18 && dist > 0.1) { const push = (18 - dist) * 0.3; this.vx += (dx / dist) * push; this.vy += (dy / dist) * push; }
    }

    const circles = world.getCircleObstacles(this.x, this.y, 48);
    for (const obs of circles) {
      const dx = this.x - obs.cx, dy = this.y - obs.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = this.radius + obs.radius;
      if (dist < minDist && dist > 0.1) {
        const overlap = minDist - dist;
        const nx = dx / dist, ny = dy / dist;
        this.x += nx * overlap; this.y += ny * overlap;
        const dot = this.vx * nx + this.vy * ny;
        if (dot < 0) { this.vx -= nx * dot * 1.2; this.vy -= ny * dot * 1.2; }
      }
    }

    const hwPush = world.halfWallCollision(this.x, this.y, this.radius);
    if (hwPush) {
      this.x += hwPush.x; this.y += hwPush.y;
      const len = Math.sqrt(hwPush.x * hwPush.x + hwPush.y * hwPush.y);
      if (len > 0.01) {
        const nx = hwPush.x / len, ny = hwPush.y / len;
        const dot = this.vx * nx + this.vy * ny;
        if (dot < 0) { this.vx -= nx * dot * 1.1; this.vy -= ny * dot * 1.1; }
      }
    }

    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const r = this.radius;
    if (this._canMove(nx, this.y, r, world)) this.x = nx; else this.vx *= -0.1;
    if (this._canMove(this.x, ny, r, world)) this.y = ny; else this.vy *= -0.1;
    this.x = Math.max(r, Math.min(this.x, CONFIG.MAP_PX_W - r));
    this.y = Math.max(r, Math.min(this.y, CONFIG.MAP_PX_H - r));
  }

  accelerate(dx, dy, force) {
    if (this.dead) return;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    const f = force || this.maxSpeed * 12;
    this.vx += (dx / len) * f * (1 / 60);
    this.vy += (dy / len) * f * (1 / 60);
  }

  inputMove(dx, dy) {
    if (this.dead) return;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    this.vx += (dx / len) * this.maxSpeed * 0.6;
    this.vy += (dy / len) * this.maxSpeed * 0.6;
  }

  _canMove(px, py, r, world) {
    const T = CONFIG.TILE;
    const checks = [
      { c: Math.floor((px - r) / T), r: Math.floor((py - r) / T) },
      { c: Math.floor((px + r) / T), r: Math.floor((py - r) / T) },
      { c: Math.floor((px - r) / T), r: Math.floor((py + r) / T) },
      { c: Math.floor((px + r) / T), r: Math.floor((py + r) / T) },
    ];
    for (const pt of checks) { if (world.isSolid(pt.c, pt.r)) return false; }
    return true;
  }

  distTo(other) { return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2); }
}

class Squad {
  constructor(team, cx, cy, count, classes, squadIdx) {
    this.team = team;
    this.squadIdx = squadIdx || 0;
    this.units = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist = i === 0 ? 0 : CONFIG.UNIT.FOLLOW_DIST;
      const cls = classes ? classes[i] : 'rifleman';
      this.units.push(new Unit(
        cx + Math.cos(angle) * dist,
        cy + Math.sin(angle) * dist,
        team, cls, squadIdx, i
      ));
    }
  }

  get alive() { return this.units.filter(u => !u.dead); }
  get allDead() { return this.alive.length === 0; }

  get leader() {
    // Find current leader
    for (const u of this.units) if (u.isLeader && !u.dead) return u;
    // Leader is dead — promote next alive unit
    for (const u of this.units) {
      if (!u.dead) { u.isLeader = true; return u; }
    }
    return this.units[0]; // all dead fallback
  }
}

/** Holds all squads for a team — exposes flat .units and .alive for combat compatibility */
class TeamArmy {
  constructor(team) {
    this.team = team;
    this.squads = [];
  }

  get units() {
    const all = [];
    for (const s of this.squads) for (const u of s.units) all.push(u);
    return all;
  }

  get alive() { return this.units.filter(u => !u.dead); }
  get allDead() { return this.alive.length === 0; }
}
