class World {
  constructor(rng) {
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    this._rng = rng || Math.random;

    this.biome = Array.from({ length: H }, () => Array(W).fill('forest'));
    this.ground = Array.from({ length: H }, () => Array(W).fill('grass'));
    this.groundVar = Array.from({ length: H }, () =>
      Array.from({ length: W }, () => Math.floor(this._rng() * 4))
    );

    // Resources (multi-tile)
    this.resObjects = new Map();
    this.resCells = Array.from({ length: H }, () => Array(W).fill(0));
    this._resNextId = 1;

    // Ruins
    this.ruins = new Map();

    // Loot containers: Map<resourceId -> [{item, qty}]>
    this.loot = new Map();
  }

  // ── Ground ──
  setGround(col, row, type) { if (this.inBounds(col, row)) this.ground[row][col] = type; }
  setGroundRect(c, r, w, h, type) {
    for (let rr = r; rr < r + h; rr++)
      for (let cc = c; cc < c + w; cc++) this.setGround(cc, rr, type);
  }
  getGround(col, row) { return this.inBounds(col, row) ? this.ground[row][col] : 'grass'; }

  // ── Resources ──
  placeResource(type, col, row, size) {
    size = size || 1;
    for (let rr = row; rr < row + size; rr++)
      for (let cc = col; cc < col + size; cc++) {
        if (!this.inBounds(cc, rr) || this.resCells[rr][cc] !== 0) return 0;
        if (this.ruins.has(`${cc},${rr}`)) return 0;
      }
    const def = CONFIG.RESOURCES[type];
    if (!def) return 0;
    const id = this._resNextId++;
    this.resObjects.set(id, { id, type, col, row, size, hp: def.hp, maxHp: def.hp });
    for (let rr = row; rr < row + size; rr++)
      for (let cc = col; cc < col + size; cc++) this.resCells[rr][cc] = id;

    // Auto-populate loot for crates
    if (def.lootable) {
      const items = [];
      if (this._rng() < 0.7) items.push({ item: 'ammo', qty: 5 + Math.floor(this._rng() * 15) });
      if (this._rng() < 0.4) items.push({ item: 'medkit', qty: 1 + Math.floor(this._rng() * 2) });
      if (items.length === 0) {
        items.push(this._rng() < 0.6
          ? { item: 'ammo', qty: 5 + Math.floor(this._rng() * 15) }
          : { item: 'medkit', qty: 1 + Math.floor(this._rng() * 2) });
      }
      this.loot.set(id, items);
    }
    return id;
  }

  getResource(col, row) {
    if (!this.inBounds(col, row)) return null;
    const id = this.resCells[row][col];
    return id > 0 ? this.resObjects.get(id) || null : null;
  }

  removeResource(col, row) {
    const res = this.getResource(col, row);
    if (!res) return;
    for (let rr = res.row; rr < res.row + res.size; rr++)
      for (let cc = res.col; cc < res.col + res.size; cc++)
        if (this.inBounds(cc, rr)) this.resCells[rr][cc] = 0;
    this.loot.delete(res.id);
    this.resObjects.delete(res.id);
  }

  getLoot(col, row) {
    const res = this.getResource(col, row);
    if (!res) return null;
    return this.loot.get(res.id) || null;
  }

  // ── Ruins ──
  getRuin(col, row) { return this.ruins.get(`${col},${row}`) || null; }
  placeRuin(type, col, row, data) {
    const ruin = { type, col, row };
    if (data) Object.assign(ruin, data);
    this.ruins.set(`${col},${row}`, ruin);
  }

  // ── Queries ──
  isFree(col, row) {
    if (!this.inBounds(col, row)) return false;
    return this.resCells[row][col] === 0 && !this.ruins.has(`${col},${row}`);
  }

  /** Tile-based solid check for unit movement (circular types and half walls excluded — handled in physics) */
  isSolid(col, row) {
    if (!this.inBounds(col, row)) return true;
    const res = this.getResource(col, row);
    const circularTypes = { tree: 1, dead_tree: 1, rock: 1 };
    if (res && CONFIG.RESOURCES[res.type].solid && !circularTypes[res.type]) return true;
    const ruin = this.getRuin(col, row);
    if (ruin && RUINS[ruin.type].solid && ruin.type !== 'half_wall') return true;
    return false;
  }

  /** Pixel-precise half-wall collision check. Returns push vector or null. */
  halfWallCollision(px, py, radius) {
    const T = CONFIG.TILE;
    const col = Math.floor(px / T), row = Math.floor(py / T);

    // Check this tile and neighbors
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const tc = col + dc, tr = row + dr;
        const ruin = this.getRuin(tc, tr);
        if (!ruin || ruin.type !== 'half_wall') continue;

        const edge = ruin.edge || 'top';
        const thick = T * 0.3;
        const tileX = tc * T, tileY = tr * T;

        // Half wall bounding box based on edge
        let wx, wy, ww, wh;
        if (edge === 'top') { wx = tileX; wy = tileY; ww = T; wh = thick; }
        else if (edge === 'bottom') { wx = tileX; wy = tileY + T - thick; ww = T; wh = thick; }
        else if (edge === 'left') { wx = tileX; wy = tileY; ww = thick; wh = T; }
        else { wx = tileX + T - thick; wy = tileY; ww = thick; wh = T; }

        // Circle vs AABB collision
        const closestX = Math.max(wx, Math.min(px, wx + ww));
        const closestY = Math.max(wy, Math.min(py, wy + wh));
        const dx = px - closestX, dy = py - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < radius && dist > 0.01) {
          return { x: (dx / dist) * (radius - dist), y: (dy / dist) * (radius - dist) };
        }
      }
    }
    return null;
  }

  /** Full solid check for pathfinding (includes circular types — paths should avoid trees) */
  isSolidForPath(col, row) {
    if (!this.inBounds(col, row)) return true;
    const res = this.getResource(col, row);
    if (res && CONFIG.RESOURCES[res.type].solid) return true;
    const ruin = this.getRuin(col, row);
    if (ruin && RUINS[ruin.type].solid) return true;
    // Check if a nearby circular obstacle's collision radius overlaps this tile
    if (this._circleBlocksTile(col, row)) return true;
    return false;
  }

  /** Check if any circular resource's collision radius overlaps the center of this tile */
  _circleBlocksTile(col, row) {
    const T = CONFIG.TILE;
    const px = (col + 0.5) * T, py = (row + 0.5) * T;
    const roundTypes = { tree: true, dead_tree: true, rock: true };
    const searchR = 3; // check nearby tiles for large resources
    for (let dr = -searchR; dr <= searchR; dr++) {
      for (let dc = -searchR; dc <= searchR; dc++) {
        const res = this.getResource(col + dc, row + dr);
        if (!res || !roundTypes[res.type] || !CONFIG.RESOURCES[res.type].solid) continue;
        const sz = res.size * T;
        const cx = res.col * T + sz / 2;
        const cy = res.row * T + sz / 2;
        const radius = sz * 0.42 + CONFIG.UNIT.RADIUS;
        const dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy < radius * radius) return true;
      }
    }
    return false;
  }

  inBounds(col, row) { return col >= 0 && col < CONFIG.MAP_W && row >= 0 && row < CONFIG.MAP_H; }

  /** Get circular obstacles near a pixel position for smooth collision.
   *  Returns array of {cx, cy, radius} for resources that have round shapes. */
  getCircleObstacles(px, py, range) {
    const T = CONFIG.TILE;
    const col = Math.floor(px / T), row = Math.floor(py / T);
    const r = Math.ceil(range / T) + 1;
    const results = [];
    const seen = new Set();
    const roundTypes = { tree: true, dead_tree: true, rock: true };

    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const res = this.getResource(col + dc, row + dr);
        if (!res || seen.has(res.id) || !roundTypes[res.type]) continue;
        if (!CONFIG.RESOURCES[res.type].solid) continue;
        seen.add(res.id);
        const sz = res.size * T;
        results.push({
          cx: res.col * T + sz / 2,
          cy: res.row * T + sz / 2,
          radius: sz * 0.42,
        });
      }
    }
    return results;
  }

  /** Find nearest loot crate to a position */
  findNearestCrate(px, py) {
    let best = null, bestDist = Infinity;
    for (const res of this.resObjects.values()) {
      if (!CONFIG.RESOURCES[res.type].lootable) continue;
      const T = CONFIG.TILE;
      const cx = (res.col + 0.5) * T, cy = (res.row + 0.5) * T;
      const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (d < bestDist) { bestDist = d; best = res; }
    }
    return best;
  }

  /** Find cover tiles near (ux,uy) shielded from (ex,ey). Returns array of {x, y, key}. */
  findCoverSpots(ux, uy, ex, ey, radius) {
    const T = CONFIG.TILE;
    const ucol = Math.floor(ux / T), urow = Math.floor(uy / T);
    const r = radius || CONFIG.AI.COVER_SEARCH;
    const results = [];

    const dx = ex - ux, dy = ey - uy;
    const elen = Math.sqrt(dx * dx + dy * dy);
    if (elen < 1) return results;
    const enx = dx / elen, eny = dy / elen;

    // Check the main enemy direction plus ±45° for more cover options
    const angles = [
      { cx: Math.round(enx), cy: Math.round(eny) },
    ];
    // Add diagonals if main direction is cardinal
    if (Math.abs(enx) > 0.3 && Math.abs(eny) > 0.3) {
      angles.push({ cx: Math.round(enx), cy: 0 });
      angles.push({ cx: 0, cy: Math.round(eny) });
    } else {
      const perpX = -eny, perpY = enx;
      angles.push({ cx: Math.round(enx + perpX * 0.7), cy: Math.round(eny + perpY * 0.7) });
      angles.push({ cx: Math.round(enx - perpX * 0.7), cy: Math.round(eny - perpY * 0.7) });
    }

    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const tc = ucol + dc, tr = urow + dr;
        if (!this.inBounds(tc, tr) || this.isSolid(tc, tr)) continue;

        // Check if any shield direction has a solid tile
        let shielded = false;
        for (const a of angles) {
          const cc = tc + a.cx, cr = tr + a.cy;
          if (this.inBounds(cc, cr) && this.isSolid(cc, cr)) { shielded = true; break; }
        }
        if (!shielded) continue;

        const px = (tc + 0.5) * T, py = (tr + 0.5) * T;
        const d = Math.sqrt((px - ux) ** 2 + (py - uy) ** 2);
        results.push({ x: px, y: py, key: `${tc},${tr}`, dist: d });
      }
    }

    results.sort((a, b) => a.dist - b.dist);
    return results;
  }
}
