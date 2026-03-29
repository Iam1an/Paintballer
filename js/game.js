(() => {
  const SQ = CONFIG.SQUAD;
  const canvas = document.getElementById('game');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const T = CONFIG.TILE;
  const spawnCol = 10, spawnRow = CONFIG.MAP_H - 10;
  const enemyCol = CONFIG.MAP_W - 15, enemyRow = 10;

  const camera = new Camera(canvas.width, canvas.height);
  const input = new Input(canvas, camera);

  // Game state — all reset on each new game
  let world, combat, objectives, renderer, playerArmy, enemyArmy, aiSystem;
  let currentSquadIdx = 0, selectedUnit = 0, numSquads = 1;
  let lootTimer = 0, lootTarget = null, squadGrouped = false;
  let gameStarted = false, gameOverTimer = 0;

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.resize(canvas.width, canvas.height);
  });

  // ── Start a new game ──
  function startGame(classSelections, gameMode) {
    numSquads = gameMode === 'skirmish' ? 1 : SQ.SQUADS_PER_TEAM;

    // Fresh world
    world = new World();
    WorldGen.generate(world, spawnCol, spawnRow);

    combat = new CombatSystem();
    objectives = new ObjectiveManager();
    objectives.init(world);
    renderer = new Renderer(ctx, camera);
    renderer.initMinimap(world);

    // Fresh armies
    playerArmy = new TeamArmy('player');
    enemyArmy = new TeamArmy('enemy');
    aiSystem = new AISystem(combat);

    for (let s = 0; s < numSquads; s++) {
      const offset = s * 8;
      const pSq = new Squad('player',
        (spawnCol + offset + 0.5) * T,
        (spawnRow - s * 3 + 0.5) * T,
        SQ.SQUAD_SIZE, classSelections[s], s
      );
      playerArmy.squads.push(pSq);

      const eSq = new Squad('enemy',
        (enemyCol - offset + 0.5) * T,
        (enemyRow + s * 3 + 0.5) * T,
        SQ.SQUAD_SIZE, [...SQ.DEFAULTS], s
      );
      enemyArmy.squads.push(eSq);

      for (const u of pSq.units) aiSystem.register(u, pSq);
      for (const u of eSq.units) aiSystem.register(u, eSq);
    }

    currentSquadIdx = 0;
    selectedUnit = 0;
    lootTimer = 0; lootTarget = null;
    squadGrouped = false;
    gameOverTimer = 0;
    gameStarted = true;

    ui.showGameHUD(numSquads);
    camera.follow(playerArmy.squads[0].units[0].x, playerArmy.squads[0].units[0].y, null, null, 1);
  }

  // ── Reset to menu ──
  function resetToMenu() {
    gameStarted = false;
    gameOverTimer = 0;
    // Hide game HUD
    ui.hud.style.display = 'none';
    ui.statusDisplay.style.display = 'none';
    ui.controlsHint.style.display = 'none';
    // Show mode select
    ui.modeOverlay.classList.remove('hidden');
    ui.phase = 'mode_select';
  }

  const ui = new UI((classSelections, gameMode) => {
    startGame(classSelections, gameMode);
  });

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

    if (e.key === 'Tab' && numSquads > 1) {
      e.preventDefault();
      currentSquadIdx = (currentSquadIdx + 1) % numSquads;
      selectedUnit = -1;
      const sq = playerArmy.squads[currentSquadIdx];
      for (let i = 0; i < sq.units.length; i++) {
        if (!sq.units[i].dead) { selectedUnit = i; break; }
      }
      return;
    }

    const num = parseInt(e.key);
    if (num >= 1 && num <= SQ.SQUAD_SIZE) {
      const idx = num - 1;
      const sq = playerArmy.squads[currentSquadIdx];
      if (!sq.units[idx].dead) selectedUnit = selectedUnit === idx ? -1 : idx;
    }
    if (e.key === 'p' || e.key === 'P') selectedUnit = -1;

    if (selectedUnit >= 0) {
      const leader = playerArmy.squads[currentSquadIdx].units[selectedUnit];
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
      const sq = playerArmy.squads[currentSquadIdx];
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
      // Keep rendering the final frame
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

      const reason = playerArmy.allDead ? 'Team eliminated'
        : enemyArmy.allDead ? 'Enemy eliminated'
        : 'All objectives held for 15 seconds';
      renderer.drawGameOver(objectives.winner, reason);

      if (gameOverTimer >= 4) resetToMenu();
      requestAnimationFrame(loop);
      return;
    }

    const allUnits = [...playerArmy.units, ...enemyArmy.units];
    const curSquad = playerArmy.squads[currentSquadIdx];
    const camUnit = (selectedUnit >= 0 && !curSquad.units[selectedUnit].dead)
      ? curSquad.units[selectedUnit]
      : (playerArmy.alive[0] || curSquad.units[0]);

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
        if (input.keys.v) combat.tryMelee(leader, enemyArmy.alive);
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

    // ── Player AI ──
    for (const sq of playerArmy.squads) {
      for (let i = 0; i < sq.units.length; i++) {
        if (sq === curSquad && i === selectedUnit) continue;
        const u = sq.units[i];
        if (u.dead) continue;
        aiSystem.update(dt, u, enemyArmy.units, objectives, world);
        if (u.classDef?.ability === 'heal_aoe' && u.medkits > 0 && Math.random() < 0.01) {
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

    // ── Enemy AI ──
    for (const sq of enemyArmy.squads) {
      for (const u of sq.units) {
        if (u.dead) continue;
        aiSystem.update(dt, u, playerArmy.units, objectives, world);
        if (u.classDef?.ability === 'heal_aoe' && u.medkits > 0 && Math.random() < 0.01) {
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

    // ── Audio listener position (camera center) ──
    combat.listenerX = camera.x + camera.viewW / 2;
    combat.listenerY = camera.y + camera.viewH / 2;

    // ── Status labels ──
    for (const sq of playerArmy.squads) {
      for (let i = 0; i < sq.units.length; i++) {
        const u = sq.units[i];
        if (sq === curSquad && i === selectedUnit) u._aiStatus = u.usingMedkit ? 'Using Medkit' : u.reloading ? 'Reloading' : 'YOU';
        else { const ai = aiSystem.getAI(u); u._aiStatus = ai ? ai.status : ''; }
      }
    }
    for (const sq of enemyArmy.squads) {
      for (const u of sq.units) {
        const ai = aiSystem.getAI(u); u._aiStatus = ai ? ai.status : '';
      }
    }

    Pathfinder.tick(dt);
    Pathfinder._cache.clear(); // fresh paths each tick cycle
    for (const u of allUnits) u.physics(dt, world, allUnits);
    combat.update(dt, playerArmy, enemyArmy, world);
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

    for (const u of enemyArmy.units) renderer.drawUnit(u, false);
    for (const sq of playerArmy.squads) {
      for (let i = 0; i < sq.units.length; i++) {
        renderer.drawUnit(sq.units[i], sq === curSquad && i === selectedUnit);
      }
    }

    renderer.drawBullets(combat.bullets);
    combat.effects.draw(ctx, camera);
    renderer.endFrame();

    renderer.drawMinimap(playerArmy, enemyArmy, objectives);
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

    ui.update(playerArmy, enemyArmy, currentSquadIdx, selectedUnit, squadGrouped);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
