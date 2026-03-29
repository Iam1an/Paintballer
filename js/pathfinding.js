/**
 * A* grid pathfinding. Returns array of {x, y} world-pixel waypoints, or null if no path.
 * Caches paths briefly to avoid recomputing every frame.
 */
const Pathfinder = {
  _cache: new Map(),
  _cacheTimer: 0,

  /** Clear stale cache entries periodically */
  tick(dt) {
    this._cacheTimer += dt;
    if (this._cacheTimer > 1) {
      this._cache.clear();
      this._cacheTimer = 0;
    }
  },

  /** Find path from (sx,sy) to (tx,ty) in world pixels. Returns waypoint array or null. */
  findPath(sx, sy, tx, ty, world) {
    const T = CONFIG.TILE;
    const sc = Math.floor(sx / T), sr = Math.floor(sy / T);
    const tc = Math.floor(tx / T), tr = Math.floor(ty / T);

    // Same tile — no path needed
    if (sc === tc && sr === tr) return [{ x: tx, y: ty }];

    // Check cache
    const key = `${sc},${sr}-${tc},${tr}`;
    if (this._cache.has(key)) return this._cache.get(key);

    // A*
    const open = [{ c: sc, r: sr, g: 0, f: 0, parent: null }];
    const closed = new Set();
    const gMap = new Map();
    gMap.set(`${sc},${sr}`, 0);

    const heuristic = (c, r) => Math.abs(c - tc) + Math.abs(r - tr);

    let found = null;
    let iterations = 0;
    const maxIter = 800; // increased for complex ruin layouts

    while (open.length > 0 && iterations++ < maxIter) {
      // Find lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const cur = open[bestIdx];
      open.splice(bestIdx, 1);

      if (cur.c === tc && cur.r === tr) { found = cur; break; }

      const curKey = `${cur.c},${cur.r}`;
      if (closed.has(curKey)) continue;
      closed.add(curKey);

      // 8-directional neighbors
      const neighbors = [
        { c: cur.c - 1, r: cur.r, cost: 1 },
        { c: cur.c + 1, r: cur.r, cost: 1 },
        { c: cur.c, r: cur.r - 1, cost: 1 },
        { c: cur.c, r: cur.r + 1, cost: 1 },
        { c: cur.c - 1, r: cur.r - 1, cost: 1.41 },
        { c: cur.c + 1, r: cur.r - 1, cost: 1.41 },
        { c: cur.c - 1, r: cur.r + 1, cost: 1.41 },
        { c: cur.c + 1, r: cur.r + 1, cost: 1.41 },
      ];

      for (const n of neighbors) {
        if (!world.inBounds(n.c, n.r) || world.isSolidForPath(n.c, n.r)) continue;

        // For diagonals, check that both adjacent cardinal tiles are free (no corner cutting)
        if (n.cost > 1) {
          if (world.isSolidForPath(cur.c, n.r) || world.isSolidForPath(n.c, cur.r)) continue;
        }

        // Water tiles cost more — AI avoids wading but can if needed
        // Wood floors on water cost nothing extra (bridges)
        if (world.getGround(n.c, n.r) === 'water') {
          const nRuin = world.getRuin(n.c, n.r);
          if (nRuin && nRuin.type === 'wood_floor') {
            // Bridge — normal cost, no penalty
          } else {
            n.cost += 4; // strongly prefer dry land / bridges
          }
        }

        const nKey = `${n.c},${n.r}`;
        if (closed.has(nKey)) continue;

        const ng = cur.g + n.cost;
        const prev = gMap.get(nKey);
        if (prev !== undefined && ng >= prev) continue;

        gMap.set(nKey, ng);
        open.push({ c: n.c, r: n.r, g: ng, f: ng + heuristic(n.c, n.r), parent: cur });
      }
    }

    if (!found) {
      this._cache.set(key, null);
      return null;
    }

    // Reconstruct path
    const rawPath = [];
    let node = found;
    while (node) {
      rawPath.unshift({ x: (node.c + 0.5) * T, y: (node.r + 0.5) * T });
      node = node.parent;
    }

    // Simplify: skip waypoints the unit can walk straight to (line-of-sight pruning)
    const simplified = [rawPath[0]];
    let i = 0;
    while (i < rawPath.length - 1) {
      let furthest = i + 1;
      for (let j = i + 2; j < rawPath.length; j++) {
        if (this._lineOfSight(rawPath[i].x, rawPath[i].y, rawPath[j].x, rawPath[j].y, world)) {
          furthest = j;
        } else break;
      }
      simplified.push(rawPath[furthest]);
      i = furthest;
    }

    this._cache.set(key, simplified);
    return simplified;
  },

  /** Check if a straight line between two points is clear of solids */
  _lineOfSight(x1, y1, x2, y2, world) {
    const T = CONFIG.TILE;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist / (T * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t, py = y1 + dy * t;
      if (world.isSolidForPath(Math.floor(px / T), Math.floor(py / T))) return false;
    }
    return true;
  },
};
