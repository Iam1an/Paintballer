class UnitAI {
  constructor(unit, index) {
    this.unit = unit;
    this.state = 'objective';
    this.status = 'Moving to OBJ';
    this.target = null;
    this.coverPoint = null;
    this.coverKey = null;      // "col,row" of reserved cover
    this.coverIdleTimer = 0;   // time spent in cover with nothing happening
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0.5 + Math.random();
    this.strafeAmplitude = 0.6 + Math.random() * 0.8;
    this.reevalTimer = Math.random() * 0.5;
    this.retreatTimer = 0;
    this.lastEnemyDist = Infinity;
    this.grouped = false;
    this.groupLeader = null;
    this.personalAngle = (index / 5) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;

    this.movePhase = Math.random() * Math.PI * 2;
    this.zigzagAngle = 0;
    this.zigzagTimer = 0;
    this.pauseTimer = 0;

    this.lookAngle = 0;
    this.lookTarget = 0;
    this.lookTimer = 0;
    this.lookSpeed = 3.5 + Math.random() * 1.5;
    this.lookBaseAngle = 0;  // tracks movement direction for look-relative sweeps

    this.idleAngle = Math.random() * Math.PI * 2;
    this.idleDir = Math.random() > 0.5 ? 1 : -1;
    this.idleChangeTimer = 4 + Math.random() * 6;

    this.scavTarget = null;
    this.scavLootTimer = 0;

    // TDM roaming
    this.roamTarget = null;
    this.roamTimer = 0;

    // A* pathfinding
    this.path = null;
    this.pathIdx = 0;
    this.pathTarget = null;
    this.pathTimer = 0;

    // Universal stuck detection
    this.stuckCheckX = 0;
    this.stuckCheckY = 0;
    this.stuckCheckTimer = 0;
    this.stuckDuration = 0;
  }
}

class AISystem {
  constructor(combat) {
    this.combat = combat;
    this._ais = new Map();
    this._idx = 0;
    this._reservedCrates = new Set();
    this._reservedCovers = new Set(); // "col,row" keys
  }

  register(unit, squad) {
    const ai = new UnitAI(unit, this._idx++);
    ai.squad = squad;
    this._ais.set(unit, ai);
  }
  getAI(unit) { return this._ais.get(unit); }

  _reserveCrate(id) { this._reservedCrates.add(id); }
  _releaseCrate(id) { this._reservedCrates.delete(id); }
  _isCrateReserved(id) { return this._reservedCrates.has(id); }

  _reserveCover(key) { if (key) this._reservedCovers.add(key); }
  _releaseCover(key) { if (key) this._reservedCovers.delete(key); }
  _isCoverReserved(key) { return this._reservedCovers.has(key); }

  /** Count same-team allies in aggressive states (pushing, engaging, melee) */
  _countAlliesAggressive(unit) {
    let count = 0;
    for (const [other, oai] of this._ais) {
      if (other === unit || other.dead || other.team !== unit.team) continue;
      if (oai.state === 'pushing' || oai.state === 'engaging') count++;
    }
    return count;
  }

  /** Release a unit's current cover reservation */
  _dropCover(ai) {
    this._releaseCover(ai.coverKey);
    ai.coverPoint = null;
    ai.coverKey = null;
    ai.coverIdleTimer = 0;
  }

  /** Find the best unreserved cover spot */
  _findUnreservedCover(unit, enemyX, enemyY, world, ai) {
    const ox = Math.cos(ai.personalAngle) * 20;
    const oy = Math.sin(ai.personalAngle) * 20;
    const spots = world.findCoverSpots(unit.x + ox, unit.y + oy, enemyX, enemyY);
    for (const s of spots) {
      if (!this._isCoverReserved(s.key)) return s;
    }
    return null;
  }

  setGrouped(unit, grouped, leader) {
    const ai = this._ais.get(unit);
    if (!ai) return;
    ai.grouped = grouped;
    ai.groupLeader = leader;
    if (grouped) { this._dropCover(ai); ai.state = 'grouped'; ai.status = 'Following'; }
    else if (ai.state === 'grouped') { ai.state = 'objective'; ai.status = 'Moving to OBJ'; }
  }

  /** Check if another same-team ally is too close to this unit's cover */
  _allyCrowdingCover(unit) {
    let count = 0;
    for (const [other, oai] of this._ais) {
      if (other === unit || other.dead || other.team !== unit.team) continue;
      if (oai.state !== 'in_cover') continue;
      const d = unit.distTo(other);
      if (d < 30) count++;
    }
    return count;
  }

  update(dt, unit, enemies, objectives, world) {
    const ai = this._ais.get(unit);
    if (!ai || unit.dead) return;

    const T = CONFIG.TILE;
    // Riflemen with sightRange spot enemies further
    const sightTiles = (unit.classDef && unit.classDef.sightRange) || CONFIG.AI.AGGRO_RANGE;
    const aggroRange = sightTiles * T;
    const fireRange = unit.range * T;
    const accel = unit.maxSpeed * 12;

    unit.update(dt);
    // No team-specific advantages — both sides play by same rules

    // ── Timers ──
    ai.reevalTimer -= dt;
    ai.strafeTimer -= dt;
    ai.movePhase += dt * 1.3;
    ai.zigzagTimer -= dt;
    ai.idleChangeTimer -= dt;
    ai.lookTimer -= dt;

    if (ai.strafeTimer <= 0) {
      ai.strafeDir *= -1;
      ai.strafeTimer = 0.4 + Math.random() * 0.8;
      ai.strafeAmplitude = 0.5 + Math.random() * 1.0;
    }
    if (ai.zigzagTimer <= 0) {
      ai.zigzagAngle = (Math.random() - 0.5) * 0.8;
      ai.zigzagTimer = 1.0 + Math.random() * 2.0;
    }
    if (ai.idleChangeTimer <= 0) {
      ai.idleDir *= -1;
      ai.idleAngle += (Math.random() - 0.5) * 0.8;
      ai.idleChangeTimer = 5 + Math.random() * 8;
    }
    // Track movement direction as look base
    const unitSpeed = Math.sqrt(unit.vx * unit.vx + unit.vy * unit.vy);
    if (unitSpeed > 10) ai.lookBaseAngle = Math.atan2(unit.vy, unit.vx);

    if (ai.lookTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.1) {
        // Glance behind
        ai.lookTarget = ai.lookBaseAngle + Math.PI + (Math.random() - 0.5) * 0.8;
      } else if (roll < 0.35) {
        // Sharp look left
        ai.lookTarget = ai.lookBaseAngle - (0.8 + Math.random() * 1.2);
      } else if (roll < 0.6) {
        // Sharp look right
        ai.lookTarget = ai.lookBaseAngle + (0.8 + Math.random() * 1.2);
      } else if (roll < 0.8) {
        // Quick forward snap
        ai.lookTarget = ai.lookBaseAngle + (Math.random() - 0.5) * 0.4;
      } else {
        // Wide sweep to random angle
        ai.lookTarget = ai.lookAngle + (Math.random() - 0.5) * 3.0;
      }
      ai.lookTimer = 0.5 + Math.random() * 1.5; // much faster look changes
    }
    if (ai.pauseTimer > 0) ai.pauseTimer -= dt;

    // Smooth but fast look interpolation
    let lookDiff = ai.lookTarget - ai.lookAngle;
    while (lookDiff > Math.PI) lookDiff -= Math.PI * 2;
    while (lookDiff < -Math.PI) lookDiff += Math.PI * 2;
    ai.lookAngle += lookDiff * Math.min(1, ai.lookSpeed * dt);

    // ── Universal stuck detection ──
    ai.stuckCheckTimer -= dt;
    if (ai.stuckCheckTimer <= 0) {
      const movedX = unit.x - ai.stuckCheckX;
      const movedY = unit.y - ai.stuckCheckY;
      const movedDist = Math.sqrt(movedX * movedX + movedY * movedY);

      // States where standing still is OK
      const idleStates = { 'Holding OBJ': true, 'With Leader': true, 'Looting...': true, 'Using Medkit': true, 'In Cover': true, 'Reloading': true };
      if (!idleStates[ai.status] && movedDist < 8) {
        ai.stuckDuration += 1.0;
      } else {
        ai.stuckDuration = Math.max(0, ai.stuckDuration - 0.5);
      }

      ai.stuckCheckX = unit.x;
      ai.stuckCheckY = unit.y;
      ai.stuckCheckTimer = 1.0;

      // If stuck for 2+ seconds, force unstick
      if (ai.stuckDuration >= 2) {
        ai.stuckDuration = 0;
        if (!ai._unstickAttempts) ai._unstickAttempts = 0;
        ai._unstickAttempts++;

        // Release any reservations
        if (ai.scavTarget) { this._releaseCrate(ai.scavTarget.id); ai.scavTarget = null; }
        this._dropCover(ai);
        ai.path = null;
        ai.pathTarget = null;
        ai.scavLootTimer = 0;

        // Find nearest walkable tile by scanning outward
        const uc = Math.floor(unit.x / T), ur = Math.floor(unit.y / T);
        let escX = null, escY = null;
        const searchR = 2 + ai._unstickAttempts;
        outer:
        for (let r = 1; r <= searchR; r++) {
          for (let a = 0; a < 8; a++) {
            const angle = (a / 8) * Math.PI * 2 + ai._unstickAttempts * 0.7;
            const tc = uc + Math.round(Math.cos(angle) * r);
            const tr = ur + Math.round(Math.sin(angle) * r);
            if (world.inBounds(tc, tr) && !world.isSolid(tc, tr) && !world.isSolidForPath(tc, tr)) {
              escX = (tc + 0.5) * T;
              escY = (tr + 0.5) * T;
              break outer;
            }
          }
        }

        if (escX !== null) {
          const dx = escX - unit.x, dy = escY - unit.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 1) {
            unit.vx = (dx / len) * unit.maxSpeed * 1.2;
            unit.vy = (dy / len) * unit.maxSpeed * 1.2;
          }
        } else {
          // Fallback: random burst
          const escAngle = Math.random() * Math.PI * 2;
          unit.vx = Math.cos(escAngle) * unit.maxSpeed * 1.2;
          unit.vy = Math.sin(escAngle) * unit.maxSpeed * 1.2;
        }

        // After 4+ attempts, teleport to nearest open tile
        if (ai._unstickAttempts >= 4 && escX !== null) {
          unit.x = escX;
          unit.y = escY;
          unit.vx = 0;
          unit.vy = 0;
          ai._unstickAttempts = 0;
        }

        ai.state = 'objective';
        ai.status = 'Unsticking';
      } else if (ai.stuckDuration <= 0) {
        ai._unstickAttempts = 0; // reset when moving freely
      }
    }

    // ── Find closest enemy ──
    let closest = null, closestDist = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = unit.distTo(e);
      if (d < closestDist) { closestDist = d; closest = e; }
    }
    const enemyPushing = closest && closestDist < ai.lastEnemyDist - 8;
    const enemyRetreating = closest && closestDist > ai.lastEnemyDist + 15;
    ai.lastEnemyDist = closest ? closestDist : Infinity;

    // ── Grenade dodge — run from nearby landed grenades ──
    let dodging = false;
    for (const g of this.combat.grenades) {
      if (!g.landed) continue;
      if (g.team === unit.team) continue; // don't dodge your own team's grenades
      const gdx = unit.x - g.x, gdy = unit.y - g.y;
      const gdist = Math.sqrt(gdx * gdx + gdy * gdy);
      const blastPx = CONFIG.GRENADE.BLAST_RADIUS * T;
      if (gdist < blastPx * 1.3) {
        // RUN AWAY from grenade
        if (gdist > 0.1) {
          unit.accelerate(gdx / gdist, gdy / gdist, accel * 1.5);
        } else {
          unit.accelerate(Math.random() - 0.5, Math.random() - 0.5, accel * 1.5);
        }
        ai.status = 'DODGE!';
        dodging = true;
        break;
      }
    }
    if (dodging) {
      // Still shoot while dodging
      if (closest && closestDist <= fireRange) {
        unit.aimAt(closest.x, closest.y);
        if (unit.canFire()) this.combat.fireBullet(unit, closest);
      }
      return; // skip all other state logic this frame
    }

    // ── Line of sight to closest enemy (used by multiple states) ──
    const enemyLOS = closest && closestDist < aggroRange
      && Pathfinder._lineOfSight(unit.x, unit.y, closest.x, closest.y, world);

    // ── Out of ammo — melee rush, follow leader, or scavenge ──
    const totalAmmo = unit.ammo + unit.reserve;
    if (totalAmmo <= 0 && !unit.reloading) {
      // Check if any crates exist to scavenge
      const anyCrate = this._findAnyCrate(unit, world);

      if (closest && closestDist < aggroRange) {
        unit.aimAt(closest.x, closest.y);
        if (closestDist <= CONFIG.UNIT.MELEE_RANGE * 2) {
          // In melee range — always fight
          this.combat.tryMelee(unit, [closest]);
          this._navigateTo(unit, closest.x, closest.y, accel * 1.3, dt, world, ai);
          unit.aimAt(closest.x, closest.y);
          ai.status = 'Melee Rush!';
        } else if (anyCrate && !enemyLOS) {
          // Enemy nearby but no line of sight — prioritize looting
          this._dropCover(ai);
          ai.state = 'scavenging'; ai.status = 'Scavenging';
          ai.scavTarget = null; ai.scavLootTimer = 0;
        } else if (anyCrate) {
          // Has LOS but crates exist — fall through to scavenging below
        } else {
          // No ammo, no crates — melee charge the enemy
          this._navigateTo(unit, closest.x, closest.y, accel, dt, world, ai);
          unit.aimAt(closest.x, closest.y);
          ai.status = 'Charging!';
        }
        if (!anyCrate) return;
      } else if (!anyCrate) {
        // No enemies, no ammo, no crates — just follow leader or go to objective
        ai.status = 'No Ammo';
        // Don't enter scavenging — let objective/follower state handle movement
      }
      // If crates exist, let the normal scavenging priority handle it below
    }

    // ── Priority checks ──
    const enemyInSight = closest && closestDist < aggroRange;

    // Low HP — ALWAYS retreat to heal, even in combat
    if (!unit.dead
        && unit.hp < unit.maxHp * CONFIG.UNIT.HEAL_THRESHOLD
        && unit.medkits > 0 && !unit.usingMedkit
        && ai.state !== 'healing' && ai.state !== 'grouped') {
      this._dropCover(ai);
      ai.state = 'healing'; ai.status = 'Healing';
    }
    // Low ammo — only scavenge when no enemies visible
    if (!enemyInSight
        && (unit.ammo + unit.reserve) <= CONFIG.UNIT.LOW_AMMO
        && ai.state !== 'scavenging' && ai.state !== 'grouped' && ai.state !== 'healing') {
      // Only scavenge if crates actually exist
      const hasCrates = this._findAnyCrate(unit, world);
      if (hasCrates) {
        this._dropCover(ai);
        ai.state = 'scavenging'; ai.status = 'Scavenging';
        ai.scavTarget = null; ai.scavLootTimer = 0;
      }
    }

    switch (ai.state) {
      case 'grouped': {
        ai.status = 'Following';
        if (!ai.grouped) { ai.state = 'objective'; break; }
        if (ai.groupLeader && !ai.groupLeader.dead) {
          const leader = ai.groupLeader;
          const tx = leader.x + Math.cos(ai.personalAngle) * CONFIG.UNIT.FOLLOW_DIST;
          const ty = leader.y + Math.sin(ai.personalAngle) * CONFIG.UNIT.FOLLOW_DIST;
          const dx = tx - unit.x, dy = ty - unit.y;
          if (dx * dx + dy * dy > 12 * 12) unit.accelerate(dx, dy, accel);
        }
        if (closest && closestDist < fireRange) {
          unit.aimAt(closest.x, closest.y);
          if (unit.canFire()) this.combat.fireBullet(unit, closest);
          if (closestDist < aggroRange * 0.6) { ai.state = 'engaging'; ai.target = closest; ai.status = 'Engaging'; }
        } else { unit.aimAngle = ai.lookAngle; }
        break;
      }

      case 'healing': {
        ai.status = unit.usingMedkit ? 'Using Medkit' : 'Healing';
        if (!ai.coverPoint || ai.reevalTimer <= 0) {
          if (closest) {
            const spot = this._findUnreservedCover(unit, closest.x, closest.y, world, ai);
            if (spot) { ai.coverPoint = spot; }
          }
          ai.reevalTimer = CONFIG.AI.REEVAL_INTERVAL;
        }
        if (ai.coverPoint) {
          const cdx = ai.coverPoint.x - unit.x, cdy = ai.coverPoint.y - unit.y;
          if (cdx * cdx + cdy * cdy > 144) this._navigateTo(unit, ai.coverPoint.x, ai.coverPoint.y, accel * 1.2, dt, world, ai);
        } else if (closest) {
          const fleeX = unit.x + (unit.x - closest.x), fleeY = unit.y + (unit.y - closest.y);
          this._navigateTo(unit, fleeX, fleeY, accel * 1.1, dt, world, ai);
        }
        if (closest && closestDist <= fireRange) {
          unit.aimAt(closest.x, closest.y);
          if (unit.canFire()) this.combat.fireBullet(unit, closest);
        }
        const safe = !closest || closestDist > fireRange * 0.5;
        const atCover = ai.coverPoint && Math.sqrt((ai.coverPoint.x - unit.x) ** 2 + (ai.coverPoint.y - unit.y) ** 2) < 15;
        if ((safe || atCover) && !unit.usingMedkit && unit.medkits > 0) unit.startMedkit();
        if (!unit.usingMedkit && unit.hp > unit.maxHp * CONFIG.UNIT.HEAL_THRESHOLD) {
          ai.state = 'objective'; ai.status = 'Moving to OBJ'; ai.coverPoint = null;
        }
        break;
      }

      case 'scavenging': {
        ai.status = 'Scavenging';
        // Done if ammo restocked or at max
        if ((unit.ammo + unit.reserve) > CONFIG.UNIT.LOW_AMMO + 10) {
          if (ai.scavTarget) this._releaseCrate(ai.scavTarget.id);
          ai.state = 'objective'; ai.status = 'Moving to OBJ'; ai.scavTarget = null; break;
        }
        // Shoot at enemies in range while scavenging
        if (closest && closestDist <= fireRange) {
          unit.aimAt(closest.x, closest.y);
          if (unit.canFire()) this.combat.fireBullet(unit, closest);
        }
        // Abort scavenging if heavily engaged
        if (closest && closestDist < aggroRange * 0.5) {
          if (ai.scavTarget) this._releaseCrate(ai.scavTarget.id);
          ai.state = 'engaging'; ai.target = closest; ai.status = 'Engaging'; ai.scavTarget = null; break;
        }
        // Track how long we've been trying to reach current crate
        if (!ai._scavAttemptTimer) ai._scavAttemptTimer = 0;
        ai._scavAttemptTimer += dt;

        if (!ai.scavTarget || ai.reevalTimer <= 0 || ai._scavAttemptTimer > 6) {
          // If we spent 6+ seconds on this crate, blacklist it and find another
          if (ai.scavTarget) {
            this._releaseCrate(ai.scavTarget.id);
            if (ai._scavAttemptTimer > 6) ai._blacklistedCrate = ai.scavTarget.id;
          }
          ai.scavTarget = this._findAnyCrate(unit, world, ai._blacklistedCrate);
          if (ai.scavTarget) this._reserveCrate(ai.scavTarget.id);
          ai.reevalTimer = 3;
          ai._scavAttemptTimer = 0;
        }
        if (ai.scavTarget) {
          // If the crate was looted by someone else, move on
          if (!world.resObjects.has(ai.scavTarget.id)) {
            this._releaseCrate(ai.scavTarget.id);
            ai.scavTarget = null; ai._scavAttemptTimer = 0;
            ai.state = 'objective'; ai.status = 'Moving to OBJ'; break;
          }
          const cx = (ai.scavTarget.col + 0.5) * T, cy = (ai.scavTarget.row + 0.5) * T;
          const dist = Math.sqrt((cx - unit.x) ** 2 + (cy - unit.y) ** 2);
          if (dist > T * 2) {
            this._navigateTo(unit, cx, cy, accel, dt, world, ai);
            ai.scavLootTimer = 0;
          } else {
            ai.scavLootTimer += dt; ai.status = 'Looting...';
            if (ai.scavLootTimer >= CONFIG.UNIT.LOOT_TIME) {
              const items = world.getLoot(ai.scavTarget.col, ai.scavTarget.row);
              if (items) for (const { item, qty } of items) {
                if (item === 'ammo') unit.reserve += qty;
                if (item === 'medkit') unit.medkits += qty;
              }
              this._releaseCrate(ai.scavTarget.id);
              world.removeResource(ai.scavTarget.col, ai.scavTarget.row);
              ai.scavTarget = null; ai.scavLootTimer = 0;
              ai._scavAttemptTimer = 0; ai._blacklistedCrate = null;
            }
          }
        } else { ai.state = 'objective'; ai.status = 'Moving to OBJ'; }
        break;
      }

      case 'objective': {
        // Non-leaders follow their squad leader
        if (!unit.isLeader && ai.squad && ai.squad.leader && !ai.squad.leader.dead) {
          const ldr = ai.squad.leader;
          const tx = ldr.x + Math.cos(ai.personalAngle) * CONFIG.UNIT.FOLLOW_DIST * 1.3;
          const ty = ldr.y + Math.sin(ai.personalAngle) * CONFIG.UNIT.FOLLOW_DIST * 1.3;
          const fdx = tx - unit.x, fdy = ty - unit.y;
          const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
          if (fdist > 20) {
            ai.status = 'Following Leader';
            this._navigateTo(unit, tx, ty, accel, dt, world, ai);
          } else {
            ai.status = 'With Leader';
            unit.accelerate(Math.cos(ai.idleAngle) * ai.idleDir, Math.sin(ai.idleAngle) * ai.idleDir, accel * 0.08);
            unit.aimAngle = ai.lookAngle;
          }
          // ALWAYS shoot at visible enemies, even while following
          if (closest && closestDist <= fireRange) {
            unit.aimAt(closest.x, closest.y);
            if (unit.canFire()) this.combat.fireBullet(unit, closest);
          }
          // Transition to full engagement when close
          if (closest && closestDist < aggroRange) {
            ai.state = 'engaging'; ai.target = closest; ai.coverPoint = null; ai.reevalTimer = 0; ai.status = 'Engaging';
          }
          break;
        }
        // Leaders and leaderless units pick objectives or roam (TDM)
        const obj = objectives.points.length > 0 ? objectives.getNearestUnheld(unit.x, unit.y, unit.team) : null;
        if (obj) {
          const spread = CONFIG.AI.OBJECTIVE_SPREAD;
          const tx = obj.x + Math.cos(ai.personalAngle) * spread;
          const ty = obj.y + Math.sin(ai.personalAngle) * spread;
          const dx = tx - unit.x, dy = ty - unit.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > T * 2) {
            ai.status = 'Moving to OBJ';
            const nearbyCrate = (unit.reserve < (unit.classDef?.reserveAmmo || 30)) ? this._findNearbyCrate(unit, world, T) : null;
            if (nearbyCrate) {
              ai.scavTarget = nearbyCrate; this._reserveCrate(nearbyCrate.id);
              ai.scavLootTimer = 0; ai.state = 'looting_opportunity'; ai.status = 'Looting'; break;
            }
            if (ai.pauseTimer <= 0) {
              this._navigateTo(unit, tx, ty, accel, dt, world, ai);
              if (Math.random() < 0.0004) ai.pauseTimer = 0.2 + Math.random() * 0.4;
            }
          } else {
            ai.status = 'Holding OBJ';
            const nearbyCrateIdle = (unit.reserve < (unit.classDef?.reserveAmmo || 30)) ? this._findNearbyCrate(unit, world, T) : null;
            if (nearbyCrateIdle) {
              ai.scavTarget = nearbyCrateIdle; this._reserveCrate(nearbyCrateIdle.id);
              ai.scavLootTimer = 0; ai.state = 'looting_opportunity'; ai.status = 'Looting'; break;
            }
            unit.accelerate(Math.cos(ai.idleAngle) * ai.idleDir, Math.sin(ai.idleAngle) * ai.idleDir, accel * 0.08);
            unit.aimAngle = ai.lookAngle;
          }
          // Shoot at visible enemies while moving to or holding obj
          if (closest && closestDist <= fireRange) {
            unit.aimAt(closest.x, closest.y);
            if (unit.canFire()) this.combat.fireBullet(unit, closest);
          }
        } else {
          // TDM roaming — pick a point biased toward map center / enemy side
          ai.roamTimer -= dt;
          if (!ai.roamTarget || ai.roamTimer <= 0) {
            const W = CONFIG.MAP_PX_W, H = CONFIG.MAP_PX_H;
            const bias = unit.team === 'player' ? 0.6 : 0.4; // push toward enemy side
            const rx = (0.15 + Math.random() * 0.7) * W;
            const ry = (1 - bias + (Math.random() - 0.5) * 0.6) * H;
            ai.roamTarget = { x: Math.max(T, Math.min(rx, W - T)), y: Math.max(T, Math.min(ry, H - T)) };
            ai.roamTimer = 6 + Math.random() * 6; // pick new spot every 6-12s
          }
          const dx = ai.roamTarget.x - unit.x, dy = ai.roamTarget.y - unit.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > T * 3) {
            ai.status = 'Hunting';
            const nearbyCrate = (unit.reserve < (unit.classDef?.reserveAmmo || 30)) ? this._findNearbyCrate(unit, world, T) : null;
            if (nearbyCrate) {
              ai.scavTarget = nearbyCrate; this._reserveCrate(nearbyCrate.id);
              ai.scavLootTimer = 0; ai.state = 'looting_opportunity'; ai.status = 'Looting'; break;
            }
            this._navigateTo(unit, ai.roamTarget.x, ai.roamTarget.y, accel, dt, world, ai);
          } else {
            ai.status = 'Scanning';
            ai.roamTarget = null; // pick new spot next frame
            unit.accelerate(Math.cos(ai.idleAngle) * ai.idleDir, Math.sin(ai.idleAngle) * ai.idleDir, accel * 0.08);
            unit.aimAngle = ai.lookAngle;
          }
          if (closest && closestDist <= fireRange) {
            unit.aimAt(closest.x, closest.y);
            if (unit.canFire()) this.combat.fireBullet(unit, closest);
          }
        }
        if (closest && closestDist < aggroRange) {
          ai.state = 'engaging'; ai.target = closest; ai.coverPoint = null; ai.reevalTimer = 0; ai.status = 'Engaging';
        }
        break;
      }

      case 'looting_opportunity': {
        ai.status = 'Looting';
        if (closest && closestDist < aggroRange) {
          if (ai.scavTarget) this._releaseCrate(ai.scavTarget.id);
          ai.state = 'engaging'; ai.target = closest; ai.status = 'Engaging'; ai.scavTarget = null; break;
        }
        if (!ai.scavTarget || !world.resObjects.has(ai.scavTarget.id)) {
          if (ai.scavTarget) this._releaseCrate(ai.scavTarget.id);
          ai.scavTarget = null; ai.state = 'objective'; ai.status = 'Moving to OBJ'; break;
        }
        const cx = (ai.scavTarget.col + 0.5) * T, cy = (ai.scavTarget.row + 0.5) * T;
        const dist = Math.sqrt((cx - unit.x) ** 2 + (cy - unit.y) ** 2);
        if (dist > T * 2) { this._navigateTo(unit, cx, cy, accel, dt, world, ai); }
        else {
          ai.scavLootTimer += dt;
          if (ai.scavLootTimer >= CONFIG.UNIT.LOOT_TIME) {
            const items = world.getLoot(ai.scavTarget.col, ai.scavTarget.row);
            if (items) for (const { item, qty } of items) {
              if (item === 'ammo') unit.reserve += qty;
              if (item === 'medkit') unit.medkits += qty;
            }
            this._releaseCrate(ai.scavTarget.id);
            world.removeResource(ai.scavTarget.col, ai.scavTarget.row);
            ai.scavTarget = null; ai.scavLootTimer = 0;
            ai.state = 'objective'; ai.status = 'Moving to OBJ';
          }
        }
        unit.aimAngle = ai.lookAngle;
        break;
      }

      case 'engaging': {
        ai.status = 'Engaging';
        if (!closest || closestDist > aggroRange * 1.4) {
          this._dropCover(ai); ai.state = 'objective'; ai.target = null; ai.status = 'Moving to OBJ'; break;
        }
        ai.target = closest;
        unit.aimAt(closest.x, closest.y);

        // ALWAYS try to shoot first
        if (closestDist <= fireRange && unit.canFire()) this.combat.fireBullet(unit, closest);

        // Melee if close enough
        if (closestDist <= CONFIG.UNIT.MELEE_RANGE) {
          this.combat.tryMelee(unit, [closest]);
        }

        // If 2+ allies are already aggressive, switch to covering fire — but with LOS, stay aggressive
        if (!enemyLOS && this._countAlliesAggressive(unit) >= 2 && ai.reevalTimer <= 0) {
          ai.state = 'covering_fire'; ai.status = 'Covering';
          ai.coverPoint = null;
          break;
        }

        // With direct LOS, push instead of seeking cover
        if (enemyLOS && closestDist > CONFIG.UNIT.MELEE_RANGE * 2 && ai.reevalTimer <= 0) {
          ai.reevalTimer = CONFIG.AI.REEVAL_INTERVAL * 0.5;
          if (Math.random() < 0.6) {
            this._dropCover(ai); ai.state = 'pushing'; ai.status = 'Pushing'; break;
          }
        }

        if (!ai.coverPoint || ai.reevalTimer <= 0) {
          this._dropCover(ai);
          const spot = this._findUnreservedCover(unit, closest.x, closest.y, world, ai);
          if (spot) {
            ai.coverPoint = spot; ai.coverKey = spot.key;
            this._reserveCover(spot.key);
          }
          ai.reevalTimer = CONFIG.AI.REEVAL_INTERVAL;
        }

        if (ai.coverPoint) {
          const cdx = ai.coverPoint.x - unit.x, cdy = ai.coverPoint.y - unit.y;
          if (cdx * cdx + cdy * cdy > 100) {
            const perp = this._perpToEnemy(unit, closest, ai);
            unit.accelerate(cdx * 0.6 + perp.x * 60, cdy * 0.6 + perp.y * 60, accel);
          } else {
            ai.state = 'in_cover'; ai.status = 'In Cover'; ai.coverIdleTimer = 0;
          }
        } else {
          this._dynamicStrafe(unit, closest, ai, accel, fireRange);
        }
        break;
      }

      case 'in_cover': {
        ai.status = 'In Cover';
        if (!closest || closestDist > aggroRange * 1.5) {
          this._dropCover(ai); ai.state = 'objective'; ai.target = null; ai.status = 'Moving to OBJ'; break;
        }
        ai.target = closest;
        unit.aimAt(closest.x, closest.y);
        if (closestDist <= fireRange && unit.canFire()) this.combat.fireBullet(unit, closest);

        // Peek strafe
        if (ai.coverPoint) {
          const cdx = ai.coverPoint.x - unit.x, cdy = ai.coverPoint.y - unit.y;
          const perp = this._perpToEnemy(unit, closest, ai);
          unit.accelerate(cdx * 0.4 + perp.x * 25, cdy * 0.4 + perp.y * 25, accel * 0.4);
        }

        // Cover crowding check — if ally is too close, reposition
        if (this._allyCrowdingCover(unit) > 0) {
          this._dropCover(ai);
          ai.state = 'repositioning'; ai.status = 'Repositioning';
          break;
        }

        // Cover staleness — nothing happening for a while
        if (!enemyPushing && !enemyRetreating) {
          ai.coverIdleTimer += dt;
        } else {
          ai.coverIdleTimer = 0;
        }

        // With direct LOS on enemy, leave cover quickly to push
        if (enemyLOS && ai.reevalTimer <= 0) {
          ai.reevalTimer = CONFIG.AI.REEVAL_INTERVAL * 0.4;
          if (Math.random() < 0.7) {
            this._dropCover(ai); ai.state = 'pushing'; ai.status = 'Pushing'; break;
          }
        }

        if (ai.reevalTimer <= 0) {
          ai.reevalTimer = CONFIG.AI.REEVAL_INTERVAL;

          if (enemyRetreating) { this._dropCover(ai); ai.state = 'pushing'; ai.status = 'Pushing'; break; }
          if (enemyPushing && Math.random() < CONFIG.AI.RETREAT_CHANCE) {
            this._dropCover(ai); ai.state = 'retreating'; ai.retreatTimer = CONFIG.AI.RETREAT_DURATION; ai.status = 'Retreating'; break;
          }

          // Stale cover — advance or reposition after 2-4s
          if (ai.coverIdleTimer > 2 + Math.random() * 2) {
            this._dropCover(ai);
            if (Math.random() < 0.5) { ai.state = 'pushing'; ai.status = 'Advancing'; }
            else { ai.state = 'repositioning'; ai.status = 'Repositioning'; }
            break;
          }
        }
        break;
      }

      case 'repositioning': {
        ai.status = 'Repositioning';
        if (!closest || closestDist > aggroRange * 1.5) {
          ai.state = 'objective'; ai.status = 'Moving to OBJ'; break;
        }
        unit.aimAt(closest.x, closest.y);

        // Find new unreserved cover
        if (!ai.coverPoint) {
          const spot = this._findUnreservedCover(unit, closest.x, closest.y, world, ai);
          if (spot) {
            ai.coverPoint = spot; ai.coverKey = spot.key;
            this._reserveCover(spot.key);
          } else {
            // No cover available — just strafe
            this._dynamicStrafe(unit, closest, ai, accel, fireRange);
            if (closestDist <= fireRange && unit.canFire()) this.combat.fireBullet(unit, closest);
            if (ai.reevalTimer <= 0) { ai.state = 'engaging'; ai.reevalTimer = 0.5; }
            break;
          }
        }

        if (ai.coverPoint) {
          const cdx = ai.coverPoint.x - unit.x, cdy = ai.coverPoint.y - unit.y;
          if (cdx * cdx + cdy * cdy > 100) {
            const perp = this._perpToEnemy(unit, closest, ai);
            unit.accelerate(cdx * 0.7 + perp.x * 40, cdy * 0.7 + perp.y * 40, accel);
          } else {
            ai.state = 'in_cover'; ai.status = 'In Cover'; ai.coverIdleTimer = 0;
          }
        }
        if (closestDist <= fireRange && unit.canFire()) this.combat.fireBullet(unit, closest);
        break;
      }

      // ── COVERING FIRE — scan other directions, strafe wider, shoot when enemies visible ──
      case 'covering_fire': {
        ai.status = 'Covering';
        if (!closest || closestDist > aggroRange * 1.5) {
          ai.state = 'objective'; ai.status = 'Moving to OBJ'; break;
        }

        // If no allies are aggressive anymore, go back to engaging
        if (this._countAlliesAggressive(unit) < 2) {
          ai.state = 'engaging'; ai.status = 'Engaging'; break;
        }

        // Melee if close
        if (closestDist <= CONFIG.UNIT.MELEE_RANGE) {
          this.combat.tryMelee(unit, [closest]); ai.status = 'Melee!'; break;
        }

        // Wider strafing — perpendicular to the fight direction
        const perp = this._perpToEnemy(unit, closest, ai);
        unit.accelerate(perp.x * 100, perp.y * 100, accel * 0.6);

        // Scan in different directions than the enemy — check flanks
        // Alternate between looking at enemy and scanning periphery
        if (Math.sin(ai.movePhase * 2) > 0.3) {
          unit.aimAt(closest.x, closest.y);
        } else {
          // Look to the side the enemy isn't
          const scanAngle = Math.atan2(closest.y - unit.y, closest.x - unit.x)
            + ai.strafeDir * (0.8 + Math.sin(ai.movePhase * 1.5) * 0.6);
          unit.aimAngle = scanAngle;
        }

        // Fire when looking at enemy
        if (closestDist <= fireRange && unit.canFire()) {
          const aimDiff = Math.abs(Math.atan2(closest.y - unit.y, closest.x - unit.x) - unit.aimAngle);
          if (aimDiff < 0.5 || aimDiff > Math.PI * 2 - 0.5) {
            this.combat.fireBullet(unit, closest);
          }
        }

        if (ai.reevalTimer <= 0) {
          ai.reevalTimer = CONFIG.AI.REEVAL_INTERVAL * 1.5;
          // Occasionally switch back to engaging
          if (Math.random() < 0.1) { ai.state = 'engaging'; ai.status = 'Engaging'; }
        }
        break;
      }

      case 'pushing': {
        ai.status = 'Pushing';
        if (!closest || closestDist > aggroRange * 1.5) { ai.state = 'objective'; ai.status = 'Moving to OBJ'; break; }
        ai.target = closest;
        unit.aimAt(closest.x, closest.y);
        // Shoot while pushing
        if (closestDist <= fireRange && unit.canFire()) this.combat.fireBullet(unit, closest);
        // Melee if close
        if (closestDist <= CONFIG.UNIT.MELEE_RANGE) this.combat.tryMelee(unit, [closest]);

        // Use pathfinding to reach enemy instead of direct charge
        this._navigateTo(unit, closest.x, closest.y, accel, dt, world, ai);
        unit.aimAt(closest.x, closest.y);
        // Only stop pushing if enemy pushes back aggressively
        if (closestDist < CONFIG.UNIT.MELEE_RANGE * 2 || (enemyPushing && closestDist < fireRange * 0.3)) {
          ai.state = 'engaging'; ai.coverPoint = null; ai.status = 'Engaging';
        }
        break;
      }

      case 'retreating': {
        ai.status = 'Retreating';
        ai.retreatTimer -= dt;
        if (ai.retreatTimer <= 0 || !closest) { ai.state = 'objective'; ai.status = 'Moving to OBJ'; break; }
        unit.aimAt(closest.x, closest.y);
        // Retreat away from enemy using pathfinding
        const edx = unit.x - closest.x, edy = unit.y - closest.y;
        const elen = Math.sqrt(edx * edx + edy * edy);
        if (elen > 1) {
          const retreatX = unit.x + (edx / elen) * T * 5;
          const retreatY = unit.y + (edy / elen) * T * 5;
          this._navigateTo(unit, retreatX, retreatY, accel, dt, world, ai);
          unit.aimAt(closest.x, closest.y);
        }
        if (closestDist <= fireRange && unit.canFire()) this.combat.fireBullet(unit, closest);
        break;
      }
    }
  }

  /** Navigate to (tx,ty) using A* pathfinding */
  _navigateTo(unit, tx, ty, accel, dt, world, ai) {
    ai.pathTimer -= dt;

    // Repath if target moved significantly or no path
    const needRepath = !ai.path || ai.pathTimer <= 0
      || !ai.pathTarget
      || Math.abs(ai.pathTarget.x - tx) > 64
      || Math.abs(ai.pathTarget.y - ty) > 64;

    if (needRepath) {
      ai.path = Pathfinder.findPath(unit.x, unit.y, tx, ty, world);
      ai.pathIdx = 0;
      ai.pathTarget = { x: tx, y: ty };
      ai.pathTimer = 1.0 + Math.random() * 0.5; // repath every ~1-1.5s
    }

    if (!ai.path || ai.path.length === 0) {
      // No path found — move directly (best effort)
      unit.accelerate(tx - unit.x, ty - unit.y, accel);
      unit.aimAngle = ai.lookAngle;
      return;
    }

    // Follow waypoints
    if (ai.pathIdx >= ai.path.length) ai.pathIdx = ai.path.length - 1;
    const wp = ai.path[ai.pathIdx];
    const dx = wp.x - unit.x, dy = wp.y - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 12 && ai.pathIdx < ai.path.length - 1) {
      ai.pathIdx++; // reached waypoint, advance
    } else {
      unit.accelerate(dx, dy, accel);
    }
    unit.aimAngle = ai.lookAngle;
  }

  _findNearbyCrate(unit, world, T) {
    const range = CONFIG.UNIT.LOOT_RANGE * T;
    let best = null, bestDist = Infinity;
    for (const res of world.resObjects.values()) {
      if (!CONFIG.RESOURCES[res.type].lootable || this._isCrateReserved(res.id)) continue;
      const cx = (res.col + 0.5) * T, cy = (res.row + 0.5) * T;
      const d = Math.sqrt((unit.x - cx) ** 2 + (unit.y - cy) ** 2);
      if (d < range && d < bestDist) { bestDist = d; best = res; }
    }
    return best;
  }

  _findAnyCrate(unit, world, blacklistId) {
    let best = null, bestDist = Infinity;
    for (const res of world.resObjects.values()) {
      if (!CONFIG.RESOURCES[res.type].lootable || this._isCrateReserved(res.id)) continue;
      if (blacklistId && res.id === blacklistId) continue;
      const T = CONFIG.TILE;
      const d = Math.sqrt((unit.x - (res.col + 0.5) * T) ** 2 + (unit.y - (res.row + 0.5) * T) ** 2);
      if (d < bestDist) { bestDist = d; best = res; }
    }
    return best;
  }

  _perpToEnemy(unit, enemy, ai) {
    const dx = enemy.x - unit.x, dy = enemy.y - unit.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return { x: 0, y: 0 };
    return { x: (-dy / len) * ai.strafeDir * ai.strafeAmplitude, y: (dx / len) * ai.strafeDir * ai.strafeAmplitude };
  }

  _dynamicStrafe(unit, enemy, ai, accel, fireRange) {
    const dx = enemy.x - unit.x, dy = enemy.y - unit.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const perp = this._perpToEnemy(unit, enemy, ai);
    let fwd = 0;
    if (len > fireRange * 0.7) fwd = 0.5;
    else if (len < fireRange * 0.3) fwd = -0.4;
    unit.accelerate(perp.x * 80 + (dx / len) * fwd * 60, perp.y * 80 + (dy / len) * fwd * 60, accel);
  }
}
