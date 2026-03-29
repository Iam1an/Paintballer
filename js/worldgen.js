const WorldGen = {
  _grids: {},

  _makeNoise(key) {
    const s = 16;
    const gw = Math.ceil(CONFIG.MAP_W / s) + 2;
    const gh = Math.ceil(CONFIG.MAP_H / s) + 2;
    this._grids[key] = Array.from({ length: gh }, () =>
      Array.from({ length: gw }, () => Math.random())
    );
  },

  _sample(key, col, row) {
    const s = 16;
    const gx = col / s, gy = row / s;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const g = this._grids[key];
    const a = g[y0]?.[x0] || 0, b = g[y0]?.[x0 + 1] || 0;
    const c = g[y0 + 1]?.[x0] || 0, d = g[y0 + 1]?.[x0 + 1] || 0;
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  },

  // ── Main entry ──

  generate(world, spawnCol, spawnRow) {
    this._makeNoise('urban');
    this._makeNoise('moisture');
    this._assignBiomes(world);
    this._paintGround(world, spawnCol, spawnRow);
    this._generateUrban(world, spawnCol, spawnRow);
    this._generateNature(world, spawnCol, spawnRow);
  },

  // ── Biome assignment ──

  _assignBiomes(world) {
    for (let r = 0; r < CONFIG.MAP_H; r++) {
      for (let c = 0; c < CONFIG.MAP_W; c++) {
        const u = this._sample('urban', c, r);
        const m = this._sample('moisture', c, r);

        let biome;
        if (u > CONFIG.WORLD.URBAN_THRESHOLD) {
          biome = 'urban';
        } else if (m > CONFIG.WORLD.DESERT_THRESHOLD) {
          biome = 'desert';
        } else {
          biome = 'forest';
        }
        world.biome[r][c] = biome;
      }
    }
  },

  _paintGround(world, spawnCol, spawnRow) {
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    const clear = CONFIG.WORLD.SPAWN_CLEAR + 8; // bigger clear zone for water
    // Enemy spawn (top-right)
    const enemyCol = W - 15, enemyRow = 10;

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const b = world.biome[r][c];
        if (b === 'urban') { world.setGround(c, r, 'concrete'); continue; }
        if (b === 'desert') { world.setGround(c, r, 'sand'); continue; }
        // forest stays grass
      }
    }

    // Add water using a third noise layer — only in forest and desert, away from spawns
    this._makeNoise('water');
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const b = world.biome[r][c];
        if (b !== 'forest' && b !== 'desert') continue;
        if (Math.abs(c - spawnCol) < clear && Math.abs(r - spawnRow) < clear) continue;
        if (Math.abs(c - enemyCol) < clear && Math.abs(r - enemyRow) < clear) continue;

        const w = this._sample('water', c, r);
        if (w > 0.65) world.setGround(c, r, 'water');
      }
    }

    // Generate bridges over narrow water crossings
    this._generateBridges(world);
  },

  _generateBridges(world) {
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H;

    // Scan for horizontal bridge opportunities
    for (let r = 2; r < H - 2; r++) {
      for (let c = 0; c < W; c++) {
        if (world.ground[r][c] !== 'water') continue;
        // Find the start of a water strip going right
        if (c > 0 && world.ground[r][c - 1] === 'water') continue; // not the start

        // Measure water width
        let width = 0;
        while (c + width < W && world.ground[r][c + width] === 'water') width++;
        if (width < 2 || width > 4) continue; // only bridge 2-4 wide

        // Check that water extends vertically too (it's a real crossing, not an edge)
        let vertExtent = 0;
        for (let dr = -1; dr >= -3; dr--) {
          if (r + dr >= 0 && world.ground[r + dr]?.[c] === 'water') vertExtent++;
          else break;
        }
        if (vertExtent < 1) continue;

        // Place bridge — wood floor tiles across the water
        if (Math.random() < 0.4) { // not every crossing gets a bridge
          for (let bc = c; bc < c + width; bc++) {
            if (!world.ruins.has(`${bc},${r}`)) {
              world.placeRuin('wood_floor', bc, r);
            }
          }
        }
      }
    }

    // Scan for vertical bridge opportunities
    for (let c = 2; c < W - 2; c++) {
      for (let r = 0; r < H; r++) {
        if (world.ground[r]?.[c] !== 'water') continue;
        if (r > 0 && world.ground[r - 1]?.[c] === 'water') continue;

        let height = 0;
        while (r + height < H && world.ground[r + height]?.[c] === 'water') height++;
        if (height < 2 || height > 4) continue;

        let horizExtent = 0;
        for (let dc = -1; dc >= -3; dc--) {
          if (c + dc >= 0 && world.ground[r]?.[c + dc] === 'water') horizExtent++;
          else break;
        }
        if (horizExtent < 1) continue;

        if (Math.random() < 0.4) {
          for (let br = r; br < r + height; br++) {
            if (!world.ruins.has(`${c},${br}`)) {
              world.placeRuin('wood_floor', c, br);
            }
          }
        }
      }
    }
  },

  // ── Urban generation (only in urban biome) ──

  _generateUrban(world, spawnCol, spawnRow) {
    const clear = CONFIG.WORLD.SPAWN_CLEAR + 3;

    // Roads through urban zones
    this._generateRoads(world, spawnCol, spawnRow);

    // Ruins in urban zones
    const placed = [];
    for (let i = 0; i < 16; i++) {
      let col, row, att = 0;
      const w = 5 + Math.floor(Math.random() * 5);
      const h = 5 + Math.floor(Math.random() * 5);

      do {
        col = 3 + Math.floor(Math.random() * (CONFIG.MAP_W - w - 6));
        row = 3 + Math.floor(Math.random() * (CONFIG.MAP_H - h - 6));
        att++;
      } while (att < 60 && (
        !this._isUrbanRect(world, col, row, w, h) ||
        (Math.abs(col + w / 2 - spawnCol) < clear && Math.abs(row + h / 2 - spawnRow) < clear) ||
        placed.some(p => this._rectsOverlap(col - 2, row - 2, w + 4, h + 4, p.c, p.r, p.w, p.h))
      ));
      if (att >= 60) continue;
      placed.push({ c: col, r: row, w, h });
      this._stampRuin(world, col, row, w, h, Math.random() < 0.3);
    }

    // Cars on roads in urban zones (3x3 each)
    for (let i = 0; i < 10; i++) {
      let att = 0, cc, cr;
      do {
        cc = Math.floor(Math.random() * (CONFIG.MAP_W - 4));
        cr = Math.floor(Math.random() * (CONFIG.MAP_H - 4));
        att++;
      } while (att < 40 && (
        world.biome[cr]?.[cc] !== 'urban' ||
        (Math.abs(cc - spawnCol) <= CONFIG.WORLD.SPAWN_CLEAR && Math.abs(cr - spawnRow) <= CONFIG.WORLD.SPAWN_CLEAR)
      ));
      if (att < 40) {
        world.placeResource('car_wreck', cc, cr, 3);
      }
    }

    // Extra rubble in urban/water (non-solid, decorative)
    for (let i = 0; i < 25; i++) {
      const c = Math.floor(Math.random() * CONFIG.MAP_W);
      const r = Math.floor(Math.random() * CONFIG.MAP_H);
      const b = world.biome[r]?.[c];
      if (b === 'urban' && world.isFree(c, r)) {
        if (Math.abs(c - spawnCol) > CONFIG.WORLD.SPAWN_CLEAR || Math.abs(r - spawnRow) > CONFIG.WORLD.SPAWN_CLEAR) {
          world.placeResource('rubble', c, r, 1);
        }
      }
    }
  },

  _isUrbanRect(world, col, row, w, h) {
    // At least 60% of tiles should be urban
    let urban = 0, total = w * h;
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++)
        if (world.biome[r]?.[c] === 'urban') urban++;
    return urban / total >= 0.6;
  },

  _generateRoads(world, spawnCol, spawnRow) {
    const clear = CONFIG.WORLD.SPAWN_CLEAR;
    for (let i = 0; i < 10; i++) {
      const horiz = Math.random() > 0.5;
      const W = CONFIG.MAP_W, H = CONFIG.MAP_H;

      if (horiz) {
        const row = 5 + Math.floor(Math.random() * (H - 10));
        const start = Math.floor(Math.random() * W);
        const len = 12 + Math.floor(Math.random() * 25);
        for (let c = start; c < Math.min(start + len, W); c++) {
          if (world.biome[row]?.[c] !== 'urban') continue;
          if (Math.abs(c - spawnCol) <= clear && Math.abs(row - spawnRow) <= clear) continue;
          world.setGround(c, row, 'road');
          if (world.inBounds(c, row + 1)) world.setGround(c, row + 1, 'road');
        }
      } else {
        const col = 5 + Math.floor(Math.random() * (W - 10));
        const start = Math.floor(Math.random() * H);
        const len = 12 + Math.floor(Math.random() * 25);
        for (let r = start; r < Math.min(start + len, H); r++) {
          if (world.biome[r]?.[col] !== 'urban') continue;
          if (Math.abs(col - spawnCol) <= clear && Math.abs(r - spawnRow) <= clear) continue;
          world.setGround(col, r, 'road');
          if (world.inBounds(col + 1, r)) world.setGround(col + 1, r, 'road');
        }
      }
    }
  },

  _stampRuin(world, col, row, w, h, isShop) {
    world.setGroundRect(col, row, w, h, 'concrete');

    for (let c = col; c < col + w; c++) {
      for (let r = row; r < row + h; r++) {
        const isEdge = c === col || c === col + w - 1 || r === row || r === row + h - 1;
        if (!isEdge) continue;

        const midC = col + Math.floor(w / 2);
        const midR = row + Math.floor(h / 2);
        if ((c === midC || c === midC + 1) && (r === row || r === row + h - 1)) {
          world.placeRuin('ruin_door', c, r); continue;
        }
        if ((r === midR || r === midR + 1) && (c === col || c === col + w - 1)) {
          world.placeRuin('ruin_door', c, r); continue;
        }
        if (Math.random() < 0.7) {
          // No half walls on corners
          const isCorner = (c === col || c === col + w - 1) && (r === row || r === row + h - 1);
          const roll = Math.random();
          if (isCorner || roll < 0.4) world.placeRuin('ruin_wall', c, r);
          else if (roll < 0.7) world.placeRuin('ruin_wall_damaged', c, r);
          else {
            // Edge direction: which side of the building this wall faces outward
            let edge;
            if (r === row) edge = 'top';
            else if (r === row + h - 1) edge = 'bottom';
            else if (c === col) edge = 'left';
            else edge = 'right';
            const orient = (edge === 'top' || edge === 'bottom') ? 'h' : 'v';
            world.placeRuin('half_wall', c, r, { orient, edge });
          }
        }
      }
    }

    // Interior walls — some solid floors, some half walls for cover
    for (let c = col + 1; c < col + w - 1; c++)
      for (let r = row + 1; r < row + h - 1; r++) {
        const roll = Math.random();
        if (roll < 0.15) world.placeRuin('ruin_floor', c, r);
        else if (roll < 0.22) world.placeRuin('half_wall', c, r, { orient: Math.random() > 0.5 ? 'h' : 'v' });
      }

    if (isShop) {
      const cr = row + 2;
      for (let c2 = col + 2; c2 < col + w - 2; c2++)
        if (!world.ruins.has(`${c2},${cr}`)) world.placeRuin('shop_counter', c2, cr);
    }

    // More loot crates
    const crateCount = 2 + Math.floor(Math.random() * 4);
    for (let n = 0; n < crateCount; n++) {
      const lc = col + 1 + Math.floor(Math.random() * (w - 2));
      const lr = row + 1 + Math.floor(Math.random() * (h - 2));
      if (world.isFree(lc, lr)) world.placeResource('loot_crate', lc, lr, 1);
    }

    for (let n = 0; n < 4; n++) {
      const rc = col - 1 + Math.floor(Math.random() * (w + 2));
      const rr = row - 1 + Math.floor(Math.random() * (h + 2));
      if (world.inBounds(rc, rr) && world.isFree(rc, rr)) world.placeResource('rubble', rc, rr, 1);
    }
  },

  _rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  },

  // ── Nature generation (forest, water, desert — never on urban/road/concrete) ──

  _generateNature(world, spawnCol, spawnRow) {
    const clear = CONFIG.WORLD.SPAWN_CLEAR;

    // Forest: dense tree clusters + bushes
    for (let i = 0; i < 25; i++) {
      this._placeCluster(world, spawnCol, spawnRow, clear, 'forest', (w, px, py) => {
        const ground = w.getGround(px, py);
        if (ground === 'road' || ground === 'concrete') return;
        const roll = Math.random();
        const size = roll < 0.4 ? 1 : roll < 0.75 ? 2 : 3;
        w.placeResource('tree', px, py, size);
      });
    }

    // Rocks in desert
    for (let i = 0; i < 6; i++) {
      this._placeCluster(world, spawnCol, spawnRow, clear, 'desert', (w, px, py) => {
        w.placeResource('rock', px, py, 1);
      });
    }

    // Desert: sparse rocks
    for (let i = 0; i < 8; i++) {
      this._placeCluster(world, spawnCol, spawnRow, clear, 'desert', (w, px, py) => {
        const size = Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : 3;
        w.placeResource('rock', px, py, size);
      });
    }

    // Rock clusters in forests too
    for (let i = 0; i < 10; i++) {
      this._placeCluster(world, spawnCol, spawnRow, clear, 'forest', (w, px, py) => {
        const ground = w.getGround(px, py);
        if (ground === 'road' || ground === 'concrete') return;
        const size = Math.random() < 0.5 ? 1 : 2;
        w.placeResource('rock', px, py, size);
      });
    }

    // Scattered bushes (forest + water edges, never road/concrete)
    for (let i = 0; i < 100; i++) {
      const c = Math.floor(Math.random() * CONFIG.MAP_W);
      const r = Math.floor(Math.random() * CONFIG.MAP_H);
      if (Math.abs(c - spawnCol) <= clear && Math.abs(r - spawnRow) <= clear) continue;
      const biome = world.biome[r]?.[c];
      const ground = world.getGround(c, r);
      if (biome === 'urban' || ground === 'road' || ground === 'concrete' || ground === 'sand' || ground === 'water') continue;
      if (world.isFree(c, r)) world.placeResource('bush', c, r, 1);
    }

    // Scattered dead trees in water/desert
    for (let i = 0; i < 30; i++) {
      const c = Math.floor(Math.random() * CONFIG.MAP_W);
      const r = Math.floor(Math.random() * CONFIG.MAP_H);
      if (Math.abs(c - spawnCol) <= clear && Math.abs(r - spawnRow) <= clear) continue;
      const biome = world.biome[r]?.[c];
      const ground = world.getGround(c, r);
      if (ground === 'road' || ground === 'concrete') continue;
      if (biome === 'desert' && world.isFree(c, r)) {
        world.placeResource('dead_tree', c, r, 1);
      }
    }
  },

  _placeCluster(world, spawnCol, spawnRow, clear, targetBiome, placeFn) {
    let cx, cy, att = 0;
    do {
      cx = 3 + Math.floor(Math.random() * (CONFIG.MAP_W - 6));
      cy = 3 + Math.floor(Math.random() * (CONFIG.MAP_H - 6));
      att++;
    } while (att < 40 && (
      world.biome[cy]?.[cx] !== targetBiome ||
      (Math.abs(cx - spawnCol) <= clear + 3 && Math.abs(cy - spawnRow) <= clear + 3)
    ));
    if (att >= 40) return;

    const count = 3 + Math.floor(Math.random() * 6);
    let px = cx, py = cy;
    for (let n = 0; n < count; n++) {
      if (world.inBounds(px, py) && world.isFree(px, py) && !world.ruins.has(`${px},${py}`)) {
        placeFn(world, px, py);
      }
      const step = 1 + Math.floor(Math.random() * 3);
      const dir = Math.floor(Math.random() * 4);
      if (dir === 0) px += step; else if (dir === 1) px -= step;
      else if (dir === 2) py += step; else py -= step;
      px = Math.max(1, Math.min(px, CONFIG.MAP_W - 4));
      py = Math.max(1, Math.min(py, CONFIG.MAP_H - 4));
    }
  },
};
