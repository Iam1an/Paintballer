(() => {
  const SQ = CONFIG.SQUAD;
  const canvas = document.getElementById('game');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const T = CONFIG.TILE;
  let spawnCol, spawnRow, enemyCol, enemyRow;

  const camera = new Camera(canvas.width, canvas.height);
  const input = new Input(canvas, camera);

  // Game state — all reset on each new game
  let world, combat, objectives, renderer, playerArmy, enemyArmy, aiSystem;
  let currentSquadIdx = 0, selectedUnit = 0, numSquads = 1;
  let lootTimer = 0, lootTarget = null, squadGrouped = false;
  let gameStarted = false, gameOverTimer = 0;

  // Network state
  let networkMode = false;
  let localArmy = null, remoteArmy = null;
  let pendingRemoteState = null;
  let remoteBullets = [], remoteGrenades = [], remoteHealZones = [];
  let remoteBarricadeSet = new Set();
  let disconnected = false;
  let pendingLootRemovals = [];  // crate positions looted this tick
  let pendingMeleeHits = [];     // melee damage dealt to remote units this tick

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.resize(canvas.width, canvas.height);
  });

  // ── Start a new game ──
  function startGame(classSelections, gameMode, netConfig) {
    networkMode = !!netConfig;
    disconnected = false;
    pendingRemoteState = null;
    remoteBullets = []; remoteGrenades = []; remoteHealZones = [];
    remoteBarricadeSet = new Set();

    const isOnline = networkMode;
    const effectiveMode = isOnline ? 'skirmish' : gameMode;
    numSquads = effectiveMode === 'skirmish' ? 1 : SQ.SQUADS_PER_TEAM;

    // Set map size based on mode
    if (effectiveMode === 'skirmish') {
      CONFIG.MAP_W = 50; CONFIG.MAP_H = 50;
    } else {
      CONFIG.MAP_W = 100; CONFIG.MAP_H = 100;
    }
    CONFIG.MAP_PX_W = CONFIG.TILE * CONFIG.MAP_W;
    CONFIG.MAP_PX_H = CONFIG.TILE * CONFIG.MAP_H;
    spawnCol = 10; spawnRow = CONFIG.MAP_H - 10;
    enemyCol = CONFIG.MAP_W - 15; enemyRow = 10;

    // Fresh world — use seeded RNG for online
    let rng = null;
    if (netConfig) {
      WorldGen.setSeed(netConfig.seed);
      rng = WorldGen._rand.bind(WorldGen);
    } else {
      WorldGen._rng = null; // use Math.random for local
    }
    world = new World(rng);
    WorldGen.generate(world, spawnCol, spawnRow);

    combat = new CombatSystem();
    combat.networkMode = isOnline;
    objectives = new ObjectiveManager();
    if (rng) objectives.setRng(rng);
    if (isOnline || effectiveMode === 'skirmish') {
      // TDM — no objectives, elimination only
      objectives.init(world, 'tdm');
    } else {
      objectives.init(world, effectiveMode);
    }
    renderer = new Renderer(ctx, camera);
    renderer.initMinimap(world);

    // Determine class selections for each army
    let playerSelections, enemySelections;
    if (netConfig) {
      playerSelections = netConfig.hostSelections;
      enemySelections = netConfig.guestSelections;
    } else {
      playerSelections = classSelections;
      enemySelections = null; // AI defaults
    }

    // Fresh armies
    playerArmy = new TeamArmy('player');
    enemyArmy = new TeamArmy('enemy');
    aiSystem = new AISystem(combat);

    for (let s = 0; s < numSquads; s++) {
      const offset = s * 8;
      const pSq = new Squad('player',
        (spawnCol + offset + 0.5) * T,
        (spawnRow - s * 3 + 0.5) * T,
        SQ.SQUAD_SIZE, playerSelections[s], s
      );
      playerArmy.squads.push(pSq);

      const eSq = new Squad('enemy',
        (enemyCol - offset + 0.5) * T,
        (enemyRow + s * 3 + 0.5) * T,
        SQ.SQUAD_SIZE, enemySelections ? enemySelections[s] : [...SQ.DEFAULTS], s
      );
      enemyArmy.squads.push(eSq);

      // In online mode, only register AI for local army
      if (isOnline) {
        if (Net.isHost) {
          for (const u of pSq.units) aiSystem.register(u, pSq);
          for (const u of eSq.units) u._isRemote = true;
        } else {
          for (const u of eSq.units) aiSystem.register(u, eSq);
          for (const u of pSq.units) u._isRemote = true;
        }
      } else {
        for (const u of pSq.units) aiSystem.register(u, pSq);
        for (const u of eSq.units) aiSystem.register(u, eSq);
      }
    }

    // Set local/remote army references
    if (isOnline) {
      localArmy = Net.isHost ? playerArmy : enemyArmy;
      remoteArmy = Net.isHost ? enemyArmy : playerArmy;

      // Listen for state updates from remote
      Net.on('state', (msg) => { pendingRemoteState = msg; });
      Net.on('game_over', (msg) => { if (!Net.isHost) objectives.winner = msg.winner; });
      Net.on('opponent_left', () => {
        if (objectives.winner) return; // game already over, ignore
        disconnected = true;
        ui.showDisconnectOverlay(() => resetToMenu());
      });
    } else {
      localArmy = null;
      remoteArmy = null;
    }

    currentSquadIdx = 0;
    selectedUnit = 0;
    lootTimer = 0; lootTarget = null;
    squadGrouped = false;
    gameOverTimer = 0;
    gameStarted = true;

    ui.showGameHUD(numSquads);

    // Camera starts on local army's first unit
    const startArmy = (isOnline && !Net.isHost) ? enemyArmy : playerArmy;
    camera.follow(startArmy.squads[0].units[0].x, startArmy.squads[0].units[0].y, null, null, 1);
  }

  // ── Reset to menu ──
  function resetToMenu() {
    gameStarted = false;
    gameOverTimer = 0;
    networkMode = false;
    disconnected = false;
    localArmy = null; remoteArmy = null;
    Net.disconnect();
    // Hide game HUD
    ui.hud.style.display = 'none';
    ui.statusDisplay.style.display = 'none';
    ui.controlsHint.style.display = 'none';
    ui.hideDisconnectOverlay();
    // Show mode select
    ui.modeOverlay.classList.remove('hidden');
    ui.phase = 'mode_select';
  }

  const ui = new UI(
    (classSelections, gameMode) => { startGame(classSelections, gameMode); },
    (classSelections, serverMsg) => {
      // Online start — serverMsg has { seed, hostSelections, guestSelections }
      startGame(classSelections, 'online', {
        seed: serverMsg.seed,
        hostSelections: serverMsg.hostSelections,
        guestSelections: serverMsg.guestSelections,
      });
    }
  );

  // ── Input ──
  window.addEventListener('keydown', (e) => {
    // F11 or F to toggle fullscreen (when not typing)
    if (e.key === 'F11') {
      e.preventDefault();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
      return;
    }

    if (!gameStarted) return;
    if (objectives && objectives.winner) return;

    // In online mode, guest controls enemyArmy
    const myArmy = (networkMode && !Net.isHost) ? enemyArmy : playerArmy;

    if (e.key === 'Tab' && numSquads > 1) {
      e.preventDefault();
      currentSquadIdx = (currentSquadIdx + 1) % numSquads;
      selectedUnit = -1;
      const sq = myArmy.squads[currentSquadIdx];
      for (let i = 0; i < sq.units.length; i++) {
        if (!sq.units[i].dead) { selectedUnit = i; break; }
      }
      return;
    }

    const num = parseInt(e.key);
    if (num >= 1 && num <= SQ.SQUAD_SIZE) {
      const idx = num - 1;
      const sq = myArmy.squads[currentSquadIdx];
      if (!sq.units[idx].dead) selectedUnit = selectedUnit === idx ? -1 : idx;
    }
    if (e.key === 'p' || e.key === 'P') selectedUnit = -1;

    if (selectedUnit >= 0) {
      const foeArmy = (networkMode && !Net.isHost) ? playerArmy : enemyArmy;
      const leader = myArmy.squads[currentSquadIdx].units[selectedUnit];
      if ((e.key === 'q' || e.key === 'Q')) leader.startMedkit();
      if ((e.key === 'r' || e.key === 'R')) leader.startReload();
      if ((e.key === 'e' || e.key === 'E') && leader.classDef) {
        if (leader.classDef.ability === 'barricade') combat.spawnBarricade(leader, world);
        if (leader.classDef.ability === 'grenade') {
          const mw = camera.screenToWorld(input.mouse.x, input.mouse.y);
          combat.throwGrenade(leader, mw.wx, mw.wy);
        }
        if (leader.classDef.ability === 'sprint' && leader.sprintCooldown <= 0) {
          leader.sprintTimer = leader.classDef.sprintDuration;
          leader.sprintCooldown = leader.classDef.sprintCooldown;
        }
        if (leader.classDef.ability === 'heal_aoe') combat.deployHealZone(leader);
      }
    }

    if (e.key === 'g' || e.key === 'G') {
      squadGrouped = !squadGrouped;
      const sq = myArmy.squads[currentSquadIdx];
      const leader = selectedUnit >= 0 ? sq.units[selectedUnit] : sq.alive[0];
      if (leader && aiSystem) {
        for (const u of sq.units) aiSystem.setGrouped(u, squadGrouped, leader);
      }
    }
  });

  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (!gameStarted) {
      // Just keep the loop alive for when game starts
      requestAnimationFrame(loop);
      return;
    }

    // ── Game over hold ──
    if (objectives.winner) {
      gameOverTimer += dt;
      if (networkMode && Net.isHost && gameOverTimer < 0.1) Net.sendGameOver(objectives.winner);
      renderer.clear();
      renderer.beginFrame();
      renderer.drawGround(world);
      renderer.drawRuins(world);
      renderer.drawResources(world);
      renderer.drawObjectives(objectives);
      for (const u of enemyArmy.units) renderer.drawUnit(u, false);
      for (const sq of playerArmy.squads)
        for (let i = 0; i < sq.units.length; i++)
          renderer.drawUnit(sq.units[i], false);
      renderer.endFrame();

      // Determine winner label relative to local player
      let winLabel = objectives.winner;
      if (networkMode && !Net.isHost) {
        winLabel = objectives.winner === 'player' ? 'enemy' : 'player';
      }
      const myArmy = (networkMode && !Net.isHost) ? enemyArmy : playerArmy;
      const foeArmy = (networkMode && !Net.isHost) ? playerArmy : enemyArmy;
      const reason = myArmy.allDead ? 'Team eliminated'
        : foeArmy.allDead ? 'Enemy eliminated'
        : networkMode ? 'Team eliminated'
        : 'All objectives held for 15 seconds';
      renderer.drawGameOver(winLabel, reason);

      if (gameOverTimer >= 4) resetToMenu();
      requestAnimationFrame(loop);
      return;
    }

    if (disconnected) { requestAnimationFrame(loop); return; }

    // ── Determine controlled army ──
    const myArmy = (networkMode && !Net.isHost) ? enemyArmy : playerArmy;
    const foeArmy = (networkMode && !Net.isHost) ? playerArmy : enemyArmy;
    const allUnits = [...playerArmy.units, ...enemyArmy.units];
    const curSquad = myArmy.squads[currentSquadIdx];
    const camUnit = (selectedUnit >= 0 && !curSquad.units[selectedUnit].dead)
      ? curSquad.units[selectedUnit]
      : (myArmy.alive[0] || curSquad.units[0]);

    let mouseWX = camUnit.x, mouseWY = camUnit.y;
    if (input.mouse.x >= 0) {
      const mw = camera.screenToWorld(input.mouse.x, input.mouse.y);
      mouseWX = mw.wx; mouseWY = mw.wy;
    }

    // ── Player control ──
    if (selectedUnit >= 0) {
      const leader = curSquad.units[selectedUnit];
      if (!leader.dead) {
        let dx = 0, dy = 0;
        if (input.keys.w || input.keys.arrowup) dy -= 1;
        if (input.keys.s || input.keys.arrowdown) dy += 1;
        if (input.keys.a || input.keys.arrowleft) dx -= 1;
        if (input.keys.d || input.keys.arrowright) dx += 1;
        if (dx || dy) leader.inputMove(dx, dy);
        leader.aimAt(mouseWX, mouseWY);
        const isScoping = input.keys.shift && leader.classDef && leader.classDef.scopeLookAhead;
        leader._scoped = isScoping;
        camera.setScope(isScoping, null, leader.classDef?.scopeLookAhead);
        if (input.mouse.down && leader.canFire()) combat.fireBullet(leader);
        if (input.keys.v) combat.tryMelee(leader, foeArmy.alive);
        leader.update(dt);
      }
      if (leader.dead) selectedUnit = -1;
    } else {
      camera.setScope(false);
      let dx = 0, dy = 0;
      if (input.keys.w || input.keys.arrowup) dy -= 1;
      if (input.keys.s || input.keys.arrowdown) dy += 1;
      if (input.keys.a || input.keys.arrowleft) dx -= 1;
      if (input.keys.d || input.keys.arrowright) dx += 1;
      if (dx || dy) camera.pan(dx, dy, dt);
    }

    // ── AI updates ──
    if (networkMode) {
      // Only run AI for local army
      for (const sq of localArmy.squads) {
        for (let i = 0; i < sq.units.length; i++) {
          if (sq === curSquad && i === selectedUnit) continue;
          const u = sq.units[i];
          if (u.dead) continue;
          aiSystem.update(dt, u, remoteArmy.units, objectives, world);
          if (u.classDef?.ability === 'heal_aoe' && u._healAoeCooldown <= 0 && Math.random() < 0.005) {
            let hurtNearby = false;
            for (const a of localArmy.alive) { if (a !== u && a.hp < a.maxHp * 0.7 && u.distTo(a) < (u.classDef.healRadius || 3) * T * 1.5) { hurtNearby = true; break; } }
            if (hurtNearby) combat.deployHealZone(u);
          }
          if (u.classDef?.ability === 'grenade' && u.grenades > 0) {
            for (const e of remoteArmy.alive) { if (u.distTo(e) < CONFIG.GRENADE.THROW_RANGE * T && Math.random() < 0.003) { combat.throwGrenade(u, e.x, e.y); break; } }
          }
          if (u.classDef?.ability === 'sprint' && u.sprintCooldown <= 0) {
            const ai = aiSystem.getAI(u);
            if (ai && (ai.state === 'pushing' || ai.state === 'retreating')) { u.sprintTimer = u.classDef.sprintDuration; u.sprintCooldown = u.classDef.sprintCooldown; }
          }
          if (u.classDef?.ability === 'barricade' && u.barricadeCooldown <= 0) {
            const ai = aiSystem.getAI(u);
            if (ai && ai.state === 'in_cover' && Math.random() < 0.002) combat.spawnBarricade(u, world);
          }
        }
      }

      // Apply remote state
      if (pendingRemoteState) {
        const rs = pendingRemoteState;
        pendingRemoteState = null;
        let idx = 0;
        for (const sq of remoteArmy.squads) {
          for (const u of sq.units) {
            if (idx < rs.units.length) u.applyNetState(rs.units[idx++]);
          }
        }
        // Replace remote bullets (not append — avoids duplicates)
        if (rs.bullets) {
          combat.bullets = combat.bullets.filter(b => !b._remote);
          for (const b of rs.bullets) {
            combat.bullets.push({
              x: b.x, y: b.y, dx: b.dx, dy: b.dy,
              team: remoteArmy.team, damage: b.damage, life: b.life,
              _remote: true,
            });
          }
        }
        // Inject remote grenades
        if (rs.grenades) {
          combat.grenades = combat.grenades.filter(g => g.team === localArmy.team);
          for (const g of rs.grenades) {
            combat.grenades.push({
              x: g.x, y: g.y, tx: g.tx, ty: g.ty, dx: g.dx, dy: g.dy,
              team: remoteArmy.team, fuse: g.fuse, travelLeft: g.travelLeft, landed: g.landed,
            });
          }
        }
        // Inject remote heal zones
        if (rs.healZones) {
          combat.healZones = combat.healZones.filter(h => h.team === localArmy.team);
          for (const h of rs.healZones) {
            combat.healZones.push({
              x: h.x, y: h.y, team: remoteArmy.team,
              timer: h.timer, maxTimer: h.maxTimer, radius: h.radius, healAmount: h.healAmount,
            });
          }
        }
        // Inject remote barricades
        if (rs.barricades) {
          for (const b of rs.barricades) {
            const key = `${b.col},${b.row}`;
            if (!remoteBarricadeSet.has(key)) {
              remoteBarricadeSet.add(key);
              if (b.type === 'half_wall') {
                world.placeRuin('half_wall', b.col, b.row, { orient: b.orient, edge: b.edge });
              } else {
                world.placeRuin(b.type, b.col, b.row);
              }
            }
          }
        }
        // Apply remote melee hits to local units by flat index
        if (rs.meleeHits) {
          const localUnits = localArmy.units;
          for (const hit of rs.meleeHits) {
            if (hit.idx >= 0 && hit.idx < localUnits.length) {
              const u = localUnits[hit.idx];
              if (!u.dead) u.takeDamage(hit.damage);
            }
          }
        }
        // Remove looted crates
        if (rs.lootRemovals) {
          for (const lr of rs.lootRemovals) {
            world.removeResource(lr.col, lr.row);
          }
        }
      }

      // Interpolate remote units
      for (const u of remoteArmy.units) u.interpolateNet(dt);

      // Send local state at 20Hz
      if (Net.shouldSendState(dt)) {
        const snapshot = {
          units: Net.serializeUnits(localArmy),
          bullets: Net.serializeBullets(combat.bullets.filter(b => b.team === localArmy.team && !b._remote)),
          grenades: Net.serializeGrenades(combat.grenades.filter(g => g.team === localArmy.team)),
          healZones: Net.serializeHealZones(combat.healZones.filter(h => h.team === localArmy.team)),
        };
        // Include melee hits and loot removals
        if (combat.pendingMeleeHits.length > 0) {
          snapshot.meleeHits = combat.pendingMeleeHits;
          combat.pendingMeleeHits = [];
        }
        // Combine player + AI loot removals
        const allLootRemovals = [...pendingLootRemovals, ...combat.pendingLootRemovals];
        pendingLootRemovals = [];
        combat.pendingLootRemovals = [];
        if (allLootRemovals.length > 0) {
          snapshot.lootRemovals = allLootRemovals;
        }
        Net.sendState(snapshot);
      }
    } else {
      // ── Offline Player AI ──
      for (const sq of playerArmy.squads) {
        for (let i = 0; i < sq.units.length; i++) {
          if (sq === curSquad && i === selectedUnit) continue;
          const u = sq.units[i];
          if (u.dead) continue;
          aiSystem.update(dt, u, enemyArmy.units, objectives, world);
          if (u.classDef?.ability === 'heal_aoe' && u._healAoeCooldown <= 0 && Math.random() < 0.005) {
            let hurtNearby = false;
            for (const a of playerArmy.alive) { if (a !== u && a.hp < a.maxHp * 0.7 && u.distTo(a) < (u.classDef.healRadius || 3) * T * 1.5) { hurtNearby = true; break; } }
            if (hurtNearby) combat.deployHealZone(u);
          }
          if (u.classDef?.ability === 'grenade' && u.grenades > 0) {
            for (const e of enemyArmy.alive) { if (u.distTo(e) < CONFIG.GRENADE.THROW_RANGE * T && Math.random() < 0.003) { combat.throwGrenade(u, e.x, e.y); break; } }
          }
          if (u.classDef?.ability === 'sprint' && u.sprintCooldown <= 0) {
            const ai = aiSystem.getAI(u);
            if (ai && (ai.state === 'pushing' || ai.state === 'retreating')) { u.sprintTimer = u.classDef.sprintDuration; u.sprintCooldown = u.classDef.sprintCooldown; }
          }
        }
      }

      // ── Offline Enemy AI ──
      for (const sq of enemyArmy.squads) {
        for (const u of sq.units) {
          if (u.dead) continue;
          aiSystem.update(dt, u, playerArmy.units, objectives, world);
          if (u.classDef?.ability === 'heal_aoe' && u._healAoeCooldown <= 0 && Math.random() < 0.005) {
            let hurtNearby = false;
            for (const a of enemyArmy.alive) { if (a !== u && a.hp < a.maxHp * 0.7 && u.distTo(a) < (u.classDef.healRadius || 3) * T * 1.5) { hurtNearby = true; break; } }
            if (hurtNearby) combat.deployHealZone(u);
          }
          if (u.classDef?.ability === 'grenade' && u.grenades > 0) {
            for (const p of playerArmy.alive) { if (u.distTo(p) < CONFIG.GRENADE.THROW_RANGE * T && Math.random() < 0.003) { combat.throwGrenade(u, p.x, p.y); break; } }
          }
          if (u.classDef?.ability === 'sprint' && u.sprintCooldown <= 0) {
            const ai = aiSystem.getAI(u);
            if (ai && (ai.state === 'pushing' || ai.state === 'retreating')) { u.sprintTimer = u.classDef.sprintDuration; u.sprintCooldown = u.classDef.sprintCooldown; }
          }
          if (u.classDef?.ability === 'barricade' && u.barricadeCooldown <= 0) {
            const ai = aiSystem.getAI(u);
            if (ai && ai.state === 'in_cover' && Math.random() < 0.002) combat.spawnBarricade(u, world);
          }
        }
      }
    }

    // ── Audio listener position (camera center) ──
    combat.listenerX = camera.x + camera.viewW / 2;
    combat.listenerY = camera.y + camera.viewH / 2;

    // ── Status labels ──
    for (const sq of myArmy.squads) {
      for (let i = 0; i < sq.units.length; i++) {
        const u = sq.units[i];
        if (sq === curSquad && i === selectedUnit) u._aiStatus = u.usingMedkit ? 'Using Medkit' : u.reloading ? 'Reloading' : 'YOU';
        else { const ai = aiSystem.getAI(u); u._aiStatus = ai ? ai.status : ''; }
      }
    }
    for (const sq of foeArmy.squads) {
      for (const u of sq.units) {
        const ai = aiSystem.getAI(u); u._aiStatus = ai ? ai.status : '';
      }
    }

    Pathfinder.tick(dt);
    Pathfinder._cache.clear();
    // Physics: only run for non-remote units
    for (const u of allUnits) {
      if (!u._isRemote) u.physics(dt, world, allUnits);
    }
    combat.update(dt, playerArmy, enemyArmy, world, networkMode ? localArmy : null);
    objectives.update(dt, playerArmy, enemyArmy);

    // ── Looting ──
    let nearLoot = null;
    if (selectedUnit >= 0) {
      const leader = curSquad.units[selectedUnit];
      if (!leader.dead) {
        const col = Math.floor(leader.x / T), row = Math.floor(leader.y / T);
        for (let dr = -2; dr <= 2 && !nearLoot; dr++)
          for (let dc = -2; dc <= 2 && !nearLoot; dc++) {
            const res = world.getResource(col + dc, row + dr);
            if (res && CONFIG.RESOURCES[res.type].lootable) {
              const dist = Math.sqrt(((col + dc + 0.5) * T - leader.x) ** 2 + ((row + dr + 0.5) * T - leader.y) ** 2) / T;
              if (dist <= 2.5) nearLoot = res;
            }
          }
        if (nearLoot && input.keys.f) {
          if (lootTarget !== nearLoot) { lootTarget = nearLoot; lootTimer = 0; }
          lootTimer += dt;
          if (lootTimer >= CONFIG.UNIT.LOOT_TIME) {
            const items = world.getLoot(nearLoot.col, nearLoot.row);
            if (items) for (const { item, qty } of items) {
              if (item === 'ammo') leader.reserve += qty;
              if (item === 'medkit') leader.medkits += qty;
            }
            world.removeResource(nearLoot.col, nearLoot.row);
            if (networkMode) pendingLootRemovals.push({ col: nearLoot.col, row: nearLoot.row });
            lootTarget = null; lootTimer = 0;
          }
        } else { lootTarget = null; lootTimer = 0; }
      }
    } else { lootTarget = null; lootTimer = 0; }

    // ── Camera ──
    if (selectedUnit >= 0) camera.follow(camUnit.x, camUnit.y, mouseWX, mouseWY, dt);
    if (input.mouse.x >= 0) {
      const { col, row } = camera.screenToTile(input.mouse.x, input.mouse.y);
      input.mouse.col = col; input.mouse.row = row;
    }

    // ── Render ──
    renderer._showEnemyStatus = (selectedUnit < 0);
    renderer.clear();
    renderer.beginFrame();
    renderer.drawGround(world);
    renderer.drawRuins(world);
    renderer.drawResources(world);
    renderer.drawObjectives(objectives);

    for (const g of combat.grenades) {
      const gx = g.x - camera.x, gy = g.y - camera.y;
      if (g.landed) {
        ctx.fillStyle = g.fuse < 0.5 ? (Math.sin(g.fuse * 20) > 0 ? '#ff4400' : '#ffaa00') : '#555';
        ctx.beginPath(); ctx.arc(gx, gy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,100,0,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(gx, gy, CONFIG.GRENADE.BLAST_RADIUS * T, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(gx, gy, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (const h of combat.healZones) {
      const hx = h.x - camera.x, hy = h.y - camera.y;
      const pct = 1 - Math.max(0, h.timer) / h.maxTimer;
      const burst = h.timer <= 0;
      const pulse = burst ? 1 : (0.3 + 0.3 * Math.sin(pct * Math.PI * 8));
      ctx.strokeStyle = `rgba(80, 255, 120, ${pulse})`; ctx.lineWidth = burst ? 3 : 2;
      ctx.beginPath(); ctx.arc(hx, hy, h.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(80, 255, 120, ${burst ? 0.15 : 0.05})`;
      ctx.beginPath(); ctx.arc(hx, hy, h.radius, 0, Math.PI * 2); ctx.fill();
      if (!burst) {
        ctx.strokeStyle = 'rgba(80, 255, 120, 0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(hx, hy, h.radius * 0.3, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = burst ? 'rgba(80, 255, 120, 0.8)' : 'rgba(80, 255, 120, 0.4)';
      ctx.fillRect(hx - 5, hy - 1.5, 10, 3); ctx.fillRect(hx - 1.5, hy - 5, 3, 10);
    }

    for (const u of foeArmy.units) renderer.drawUnit(u, false);
    for (const sq of myArmy.squads) {
      for (let i = 0; i < sq.units.length; i++) {
        renderer.drawUnit(sq.units[i], sq === curSquad && i === selectedUnit);
      }
    }

    renderer.drawBullets(combat.bullets);
    combat.effects.draw(ctx, camera);
    renderer.endFrame();

    renderer.drawMinimap(myArmy, foeArmy, objectives);
    if (selectedUnit >= 0) renderer.drawAmmoHUD(curSquad.units[selectedUnit]);
    if (nearLoot && !input.keys.f) renderer.drawLootPrompt('[Hold F] Loot');
    if (lootTarget) renderer.drawLootProgress(lootTimer / CONFIG.UNIT.LOOT_TIME);
    if (selectedUnit >= 0) {
      const leader = curSquad.units[selectedUnit];
      if (leader.usingMedkit) renderer.drawLootProgress(1 - leader.medkitTimer / CONFIG.UNIT.MEDKIT_TIME);
    }
    if (selectedUnit < 0) renderer.drawLootPrompt('SPECTATOR — 1-6 unit, Tab squad');

    if (objectives.dominatingTeam && !objectives.winner) {
      renderer.drawDominationWarning(objectives.dominatingTeam, objectives.dominationTimer, objectives.DOMINATION_TIME);
    }

    ui.update(myArmy, foeArmy, currentSquadIdx, selectedUnit, squadGrouped);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
