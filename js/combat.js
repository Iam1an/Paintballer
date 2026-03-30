class CombatSystem {
  constructor() {
    this.bullets = [];
    this.grenades = [];
    this.healZones = [];
    this.effects = new EffectSystem();
    this.listenerX = 0;
    this.listenerY = 0;
    this.networkMode = false;
    this.pendingMeleeHits = []; // melee hits to send over network
    this.pendingLootRemovals = []; // crate removals to send over network
  }

  fireBullet(unit, target) {
    if (!unit.canFire()) return;
    unit.fire();

    // Lead shots — aim where the target will be
    let aimAngle = unit.aimAngle;
    if (target && unit.classDef?.leadShots && !target.dead) {
      const dx = target.x - unit.x, dy = target.y - unit.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const bulletTime = dist / unit.bulletSpeed;
      const leadX = target.x + target.vx * bulletTime * 0.7;
      const leadY = target.y + target.vy * bulletTime * 0.7;
      aimAngle = Math.atan2(leadY - unit.y, leadX - unit.x);
      unit.aimAngle = aimAngle; // turn to face lead point
    }

    const spreadAngle = aimAngle + (Math.random() - 0.5) * unit.spread * 2;
    const speed = unit.bulletSpeed;
    this.bullets.push({
      x: unit.x + Math.cos(spreadAngle) * 12,
      y: unit.y + Math.sin(spreadAngle) * 12,
      dx: Math.cos(spreadAngle) * speed,
      dy: Math.sin(spreadAngle) * speed,
      team: unit.team,
      damage: unit.damage,
      life: 1.5,
    });

    // Audio — distance-based volume
    if (typeof Audio !== 'undefined' && Audio.gunshot) {
      const dist = Math.sqrt((unit.x - this.listenerX) ** 2 + (unit.y - this.listenerY) ** 2);
      const maxDist = CONFIG.TILE * 25;
      let type = 'rifle';
      if (unit.classDef) {
        if (unit.className === 'machinegunner') type = 'mg';
        else if (unit.className === 'grenadier') type = 'smg';
      }
      Audio.gunshot(dist, maxDist, type);
    }
  }

  throwGrenade(unit, targetX, targetY) {
    if (unit.dead || unit.grenades <= 0) return false;
    const T = CONFIG.TILE;
    const dx = targetX - unit.x, dy = targetY - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxRange = CONFIG.GRENADE.THROW_RANGE * T;
    const clampedDist = Math.min(dist, maxRange);
    const speed = CONFIG.GRENADE.THROW_SPEED;
    const travelTime = clampedDist / speed;

    unit.grenades--;
    this.grenades.push({
      x: unit.x, y: unit.y,
      tx: unit.x + (dx / dist) * clampedDist,
      ty: unit.y + (dy / dist) * clampedDist,
      dx: (dx / dist) * speed, dy: (dy / dist) * speed,
      team: unit.team,
      fuse: travelTime + CONFIG.GRENADE.FUSE_TIME,
      travelLeft: travelTime,
      landed: false,
    });
    return true;
  }

  spawnBarricade(unit, world) {
    if (unit.dead || unit.barricadeCooldown > 0) return false;
    if (!unit.classDef || unit.classDef.ability !== 'barricade') return false;

    const T = CONFIG.TILE;
    const angle = unit.aimAngle;

    // Snap to nearest cardinal direction
    let cardinalAngle;
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) cardinalAngle = 0;           // right
    else if (a < Math.PI * 0.75) cardinalAngle = Math.PI * 0.5;                 // down
    else if (a < Math.PI * 1.25) cardinalAngle = Math.PI;                        // left
    else cardinalAngle = Math.PI * 1.5;                                           // up

    const dirX = Math.round(Math.cos(cardinalAngle));
    const dirY = Math.round(Math.sin(cardinalAngle));
    const placeCol = Math.floor(unit.x / T) + dirX * 2;
    const placeRow = Math.floor(unit.y / T) + dirY * 2;

    // 3-block barricade perpendicular to cardinal direction
    const perpX = -dirY;
    const perpY = dirX;

    const positions = [
      { c: placeCol - perpX, r: placeRow - perpY, type: 'barricade_wall' },
      { c: placeCol, r: placeRow, type: 'half_wall' },
      { c: placeCol + perpX, r: placeRow + perpY, type: 'barricade_wall' },
    ];

    // Check all positions are free
    for (const p of positions) {
      if (!world.isFree(p.c, p.r)) return false;
    }

    // Place them
    for (const p of positions) {
      if (p.type === 'half_wall') {
        // Half wall faces the cardinal direction
        let edge;
        if (dirX === 1) edge = 'right';
        else if (dirX === -1) edge = 'left';
        else if (dirY === 1) edge = 'bottom';
        else edge = 'top';
        const orient = (edge === 'top' || edge === 'bottom') ? 'h' : 'v';
        world.placeRuin('half_wall', p.c, p.r, { orient, edge });
      } else {
        world.placeRuin(p.type, p.c, p.r);
      }
    }

    unit.barricadeCooldown = 15; // 15 second cooldown
    return true;
  }

  /** Deploy AOE heal zone at the medic's position */
  deployHealZone(healer) {
    if (healer.dead) return false;
    if (!healer.classDef || healer.classDef.ability !== 'heal_aoe') return false;
    if (healer._healAoeCooldown > 0) return false;

    healer._healAoeCooldown = 15; // 15 second cooldown
    const T = CONFIG.TILE;
    this.healZones.push({
      x: healer.x,
      y: healer.y,
      team: healer.team,
      timer: healer.classDef.healFuse,
      maxTimer: healer.classDef.healFuse,
      radius: healer.classDef.healRadius * T,
      healAmount: healer.classDef.healAmount,
    });
    return true;
  }

  /** Start a melee swing */
  startMelee(attacker) {
    if (attacker.dead || attacker.usingMedkit) return false;
    if (attacker.meleeCooldown > 0) return false;
    attacker.meleeCooldown = CONFIG.UNIT.MELEE_COOLDOWN;
    attacker.meleeSwing = 0.2;
    return true;
  }

  /** Hit enemies in melee cone */
  resolveMeleeHits(attacker, enemies) {
    if (attacker.meleeSwing < 0.15) return;
    for (const target of enemies) {
      if (target.dead) continue;
      const dist = attacker.distTo(target);
      if (dist > CONFIG.UNIT.MELEE_RANGE) continue;
      const dx = target.x - attacker.x, dy = target.y - attacker.y;
      const angle = Math.atan2(dy, dx);
      let diff = angle - attacker.aimAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.0) continue;
      if (this.networkMode && target._isRemote) {
        // Don't damage remote units directly — send flat index over network
        const flatIdx = target.squadIdx * CONFIG.SQUAD.SQUAD_SIZE + target.unitIdx;
        this.pendingMeleeHits.push({ idx: flatIdx, damage: CONFIG.UNIT.MELEE_DAMAGE });
      } else {
        target.takeDamage(CONFIG.UNIT.MELEE_DAMAGE);
      }
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.1) { target.vx += (dx / len) * 80; target.vy += (dy / len) * 80; }
    }
  }

  tryMelee(attacker, enemies) {
    if (this.startMelee(attacker)) {
      this.resolveMeleeHits(attacker, enemies);
      this.effects.meleeSlash(attacker.x, attacker.y, attacker.aimAngle);
      return true;
    }
    return false;
  }

  update(dt, playerSquad, enemySquad, world, localArmy) {
    // Bullets
    for (const b of this.bullets) {
      b.x += b.dx * dt; b.y += b.dy * dt; b.life -= dt;
      const col = Math.floor(b.x / CONFIG.TILE);
      const row = Math.floor(b.y / CONFIG.TILE);
      if (world.isSolid(col, row)) {
        const ruin = world.getRuin(col, row);
        if (!ruin || !ruin.type || !RUINS[ruin.type]?.shootThrough) { b.life = 0; continue; }
      }
      // Circular obstacle collision (trees, rocks)
      const obstacles = world.getCircleObstacles(b.x, b.y, CONFIG.TILE);
      let hitObstacle = false;
      for (const obs of obstacles) {
        const odx = b.x - obs.cx, ody = b.y - obs.cy;
        if (odx * odx + ody * ody < obs.radius * obs.radius) { hitObstacle = true; break; }
      }
      if (hitObstacle) { b.life = 0; continue; }

      if (this.networkMode && localArmy) {
        // In network mode: remote bullets damage local units only
        // Local bullets hitting remote units are visual only (remote HP from network)
        if (b._remote) {
          // Remote bullet — can damage local army
          const targets = localArmy.alive;
          for (const u of targets) {
            const dx = u.x - b.x, dy = u.y - b.y;
            if (dx * dx + dy * dy < 12 * 12) { u.takeDamage(b.damage); b.life = 0; break; }
          }
        } else {
          // Local bullet — visual hit check only (no damage to remote units)
          const remoteTargets = (b.team === 'player' ? enemySquad : playerSquad).alive;
          for (const u of remoteTargets) {
            const dx = u.x - b.x, dy = u.y - b.y;
            if (dx * dx + dy * dy < 12 * 12) { b.life = 0; break; }
          }
        }
      } else {
        // Offline: original behavior
        const targets = b.team === 'player' ? enemySquad.alive : playerSquad.alive;
        for (const u of targets) {
          const dx = u.x - b.x, dy = u.y - b.y;
          if (dx * dx + dy * dy < 12 * 12) { u.takeDamage(b.damage); b.life = 0; break; }
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);

    // Grenades
    for (const g of this.grenades) {
      g.fuse -= dt;
      if (g.travelLeft > 0) {
        g.x += g.dx * dt; g.y += g.dy * dt;
        g.travelLeft -= dt;
        if (g.travelLeft <= 0) g.landed = true;
      }
      // Explode
      if (g.fuse <= 0 && !g._exploded) {
        g._exploded = true;
        const T = CONFIG.TILE;
        const blastPx = CONFIG.GRENADE.BLAST_RADIUS * T;
        this.effects.explosion(g.x, g.y, blastPx);
        if (typeof Audio !== 'undefined' && Audio.explosion) {
          const dist = Math.sqrt((g.x - this.listenerX) ** 2 + (g.y - this.listenerY) ** 2);
          Audio.explosion(dist, T * 35);
        }

        // No friendly fire — only damage the opposing team
        const targets = this.networkMode && localArmy
          ? (g.team === localArmy.team ? [] : localArmy.units)
          : (g.team === 'player' ? enemySquad.units : playerSquad.units);
        for (const u of targets) {
          if (u.dead) continue;
          const dx = u.x - g.x, dy = u.y - g.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < blastPx) {
            const falloff = 1 - (dist / blastPx);
            u.takeDamage(Math.floor(CONFIG.GRENADE.DAMAGE * falloff));
            if (dist > 0.1) {
              u.vx += (dx / dist) * 120 * falloff;
              u.vy += (dy / dist) * 120 * falloff;
            }
          }
        }
        // Knockback only (no damage) for friendly units
        const friendlies = this.networkMode && localArmy
          ? (g.team === localArmy.team ? localArmy.units : [])
          : (g.team === 'player' ? playerSquad.units : enemySquad.units);
        for (const u of friendlies) {
          if (u.dead) continue;
          const dx = u.x - g.x, dy = u.y - g.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < blastPx && dist > 0.1) {
            const falloff = 1 - (dist / blastPx);
            u.vx += (dx / dist) * 120 * falloff;
            u.vy += (dy / dist) * 120 * falloff;
          }
        }
      }
    }
    this.grenades = this.grenades.filter(g => g.fuse > 0);

    // Heal zones
    for (const h of this.healZones) {
      h.timer -= dt;
      if (h.timer <= 0 && !h._healed) {
        h._healed = true;
        this.effects.healBurst(h.x, h.y, h.radius);
        if (this.networkMode && localArmy) {
          // Only heal local army from local heal zones
          if (h.team === localArmy.team) {
            for (const u of localArmy.alive) {
              const dx = u.x - h.x, dy = u.y - h.y;
              if (dx * dx + dy * dy < h.radius * h.radius) u.heal(h.healAmount);
            }
          }
          // Remote heal zones are visual only — remote HP comes from network
        } else {
          const allies = h.team === 'player' ? playerSquad.alive : enemySquad.alive;
          for (const u of allies) {
            const dx = u.x - h.x, dy = u.y - h.y;
            if (dx * dx + dy * dy < h.radius * h.radius) u.heal(h.healAmount);
          }
        }
      }
    }
    this.healZones = this.healZones.filter(h => h.timer > -0.5);

    // Effects
    this.effects.update(dt);
  }
}
