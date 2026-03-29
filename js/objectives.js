class ObjectiveManager {
  constructor() {
    this.points = [];
    this.dominationTimer = 0;    // seconds one team has held all 3
    this.dominatingTeam = null;  // 'player' | 'enemy' | null
    this.DOMINATION_TIME = 15;   // seconds to win by domination
    this.winner = null;          // 'player' | 'enemy' | null
  }

  /** Place 3 objectives: player side, center, enemy side */
  init(world) {
    const T = CONFIG.TILE;
    const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
    const labels = ['ALPHA', 'BRAVO', 'CHARLIE'];

    // Three zones along the diagonal (bottom-left to top-right)
    // ALPHA near player spawn (bottom-left), BRAVO center, CHARLIE near enemy (top-right)
    const zones = [
      { cMin: 10, cMax: Math.floor(W * 0.35), rMin: Math.floor(H * 0.65), rMax: H - 10 },  // player side
      null, // center — fixed
      { cMin: Math.floor(W * 0.65), cMax: W - 10, rMin: 10, rMax: Math.floor(H * 0.35) },   // enemy side
    ];

    for (let i = 0; i < 3; i++) {
      let spot;
      if (i === 1) {
        // BRAVO — absolute center of map
        spot = { c: Math.floor(W / 2), r: Math.floor(H / 2) };
      } else {
        const z = zones[i];
        spot = this._findBestSpot(world, z.cMin, z.cMax, z.rMin, z.rMax);
      }
      this.points.push({
        x: (spot.c + 0.5) * T,
        y: (spot.r + 0.5) * T,
        col: spot.c,
        row: spot.r,
        control: 0,
        label: labels[i],
      });
    }
  }

  /** Find the best open spot in a zone, preferring urban areas */
  _findBestSpot(world, cMin, cMax, rMin, rMax) {
    let best = null, bestScore = -1;
    for (let att = 0; att < 60; att++) {
      const c = cMin + Math.floor(Math.random() * (cMax - cMin));
      const r = rMin + Math.floor(Math.random() * (rMax - rMin));
      if (!world.inBounds(c, r) || !world.isFree(c, r)) continue;
      // Prefer urban, accept anything
      let score = 1;
      if (world.biome[r]?.[c] === 'urban') score += 5;
      // Prefer spots with open space around them
      let openCount = 0;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++)
          if (world.inBounds(c + dc, r + dr) && world.isFree(c + dc, r + dr)) openCount++;
      score += openCount * 0.2;
      if (score > bestScore) { bestScore = score; best = { c, r }; }
    }
    // Fallback: center of zone
    if (!best) best = { c: Math.floor((cMin + cMax) / 2), r: Math.floor((rMin + rMax) / 2) };
    return best;
  }

  /** Update capture progress based on units near points */
  update(dt, playerSquad, enemySquad) {
    const T = CONFIG.TILE;
    const capRadius = CONFIG.OBJECTIVES.CAPTURE_RADIUS * T;
    const rate = CONFIG.OBJECTIVES.CAPTURE_RATE;

    for (const obj of this.points) {
      let playerCount = 0, enemyCount = 0;
      for (const u of playerSquad.alive) {
        if (Math.sqrt((u.x - obj.x) ** 2 + (u.y - obj.y) ** 2) <= capRadius) playerCount++;
      }
      for (const u of enemySquad.alive) {
        if (Math.sqrt((u.x - obj.x) ** 2 + (u.y - obj.y) ** 2) <= capRadius) enemyCount++;
      }

      // Contested = no progress
      if (playerCount > 0 && enemyCount > 0) continue;
      if (playerCount > 0) obj.control = Math.min(1, obj.control + rate * playerCount * dt);
      else if (enemyCount > 0) obj.control = Math.max(-1, obj.control - rate * enemyCount * dt);
    }

    // Check domination — all 3 held by one team
    let playerHeld = 0, enemyHeld = 0;
    for (const obj of this.points) {
      if (obj.control >= 0.99) playerHeld++;
      else if (obj.control <= -0.99) enemyHeld++;
    }

    if (playerHeld === 3) {
      if (this.dominatingTeam === 'player') this.dominationTimer += dt;
      else { this.dominatingTeam = 'player'; this.dominationTimer = 0; }
    } else if (enemyHeld === 3) {
      if (this.dominatingTeam === 'enemy') this.dominationTimer += dt;
      else { this.dominatingTeam = 'enemy'; this.dominationTimer = 0; }
    } else {
      this.dominatingTeam = null;
      this.dominationTimer = 0;
    }

    if (this.dominationTimer >= this.DOMINATION_TIME) {
      this.winner = this.dominatingTeam;
    }

    // Check elimination
    if (playerSquad.allDead) this.winner = 'enemy';
    if (enemySquad.allDead) this.winner = 'player';
  }

  /** Get the best objective for a team to go to */
  getBestObjective(team) {
    // Prefer uncaptured, then enemy-held
    let best = null, bestScore = -Infinity;
    for (const obj of this.points) {
      let score;
      if (team === 'player') {
        score = -obj.control; // prefer low control (enemy/neutral)
      } else {
        score = obj.control;  // prefer high control (player/neutral)
      }
      if (score > bestScore) { bestScore = score; best = obj; }
    }
    return best;
  }

  /** Get nearest uncapped objective for a team */
  getNearestUnheld(ux, uy, team) {
    let best = null, bestDist = Infinity;
    for (const obj of this.points) {
      const held = (team === 'player' && obj.control >= 0.99) || (team === 'enemy' && obj.control <= -0.99);
      if (held) continue;
      const d = Math.sqrt((ux - obj.x) ** 2 + (uy - obj.y) ** 2);
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    return best || this.points[0];
  }
}
