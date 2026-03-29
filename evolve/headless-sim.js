/** Headless game simulation — runs a full game with no canvas/DOM */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'js');

// Load order (matching index.html, minus DOM-dependent files)
const FILES = [
  'config.js', 'ruins.js', 'world.js', 'worldgen.js', 'camera.js',
  'squad.js', 'effects.js', 'combat.js', 'objectives.js',
  'pathfinding.js', 'ai.js',
];

let filesLoaded = false;
const fileContents = {};

function loadFiles() {
  if (filesLoaded) return;
  for (const f of FILES) {
    fileContents[f] = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
  }
  filesLoaded = true;
}

function runSimulation(genome, applyGenomeFn) {
  loadFiles();

  // Create a fresh sandbox with all game globals
  const sandbox = { Math, Array, Object, console, Infinity, parseInt, parseFloat, Set, Map };
  const ctx = vm.createContext(sandbox);

  // Load all game files into the sandbox
  for (const f of FILES) {
    vm.runInContext(fileContents[f], ctx, { filename: f });
  }

  // Apply genome to CONFIG
  if (genome && applyGenomeFn) {
    // We need to run applyGenome inside the sandbox context
    vm.runInContext(`
      (function(genome) {
        var SCHEMA_PATHS = ${JSON.stringify(genome)};
        for (var key in SCHEMA_PATHS) {
          if (CONFIG.AI.hasOwnProperty(key)) CONFIG.AI[key] = SCHEMA_PATHS[key];
          if (CONFIG.UNIT.hasOwnProperty(key)) CONFIG.UNIT[key] = SCHEMA_PATHS[key];
        }
      })(${JSON.stringify(genome)})
    `, ctx);
  }

  // Run simulation inside sandbox
  const resultCode = `
    (function() {
      var T = CONFIG.TILE;
      var SQ = CONFIG.SQUAD;
      var spawnCol = 10, spawnRow = CONFIG.MAP_H - 10;
      var enemyCol = CONFIG.MAP_W - 15, enemyRow = 10;

      var world = new World();
      WorldGen.generate(world, spawnCol, spawnRow);

      var combat = new CombatSystem();
      var objectives = new ObjectiveManager();
      objectives.init(world);

      var testArmy = new TeamArmy('player');
      var enemyArmy = new TeamArmy('enemy');
      var aiSystem = new AISystem(combat);

      var defaults = SQ.DEFAULTS;
      for (var s = 0; s < SQ.SQUADS_PER_TEAM; s++) {
        var offset = s * 8;
        var pSq = new Squad('player',
          (spawnCol + offset + 0.5) * T,
          (spawnRow - s * 3 + 0.5) * T,
          SQ.SQUAD_SIZE, defaults.slice(), s
        );
        testArmy.squads.push(pSq);

        var eSq = new Squad('enemy',
          (enemyCol - offset + 0.5) * T,
          (enemyRow + s * 3 + 0.5) * T,
          SQ.SQUAD_SIZE, defaults.slice(), s
        );
        enemyArmy.squads.push(eSq);

        for (var i = 0; i < pSq.units.length; i++) aiSystem.register(pSq.units[i], pSq);
        for (var i = 0; i < eSq.units.length; i++) aiSystem.register(eSq.units[i], eSq);
      }

      var dt = 1/30;
      var maxTicks = 3000;
      var tick = 0;

      for (tick = 0; tick < maxTicks; tick++) {
        var allUnits = testArmy.units.concat(enemyArmy.units);

        // Test team AI
        for (var si = 0; si < testArmy.squads.length; si++) {
          var sq = testArmy.squads[si];
          for (var ui = 0; ui < sq.units.length; ui++) {
            var u = sq.units[ui];
            if (u.dead) continue;
            aiSystem.update(dt, u, enemyArmy.units, objectives, world);
            if (u.classDef && u.classDef.ability === 'heal_aoe' && u.medkits > 0 && Math.random() < 0.01) {
              var hurtNearby = false;
              var allies = testArmy.alive;
              for (var ai2 = 0; ai2 < allies.length; ai2++) {
                if (allies[ai2] !== u && allies[ai2].hp < allies[ai2].maxHp * 0.7 && u.distTo(allies[ai2]) < (u.classDef.healRadius || 3) * T * 1.5) { hurtNearby = true; break; }
              }
              if (hurtNearby) combat.deployHealZone(u);
            }
            if (u.classDef && u.classDef.ability === 'grenade' && u.grenades > 0) {
              var enemies = enemyArmy.alive;
              for (var ei = 0; ei < enemies.length; ei++) {
                if (u.distTo(enemies[ei]) < (CONFIG.GRENADE ? CONFIG.GRENADE.THROW_RANGE : 7) * T && Math.random() < 0.003) {
                  combat.throwGrenade(u, enemies[ei].x, enemies[ei].y);
                  break;
                }
              }
            }
            if (u.classDef && u.classDef.ability === 'sprint' && u.sprintCooldown <= 0) {
              var uai = aiSystem.getAI(u);
              if (uai && (uai.state === 'pushing' || uai.state === 'retreating')) {
                u.sprintTimer = u.classDef.sprintDuration;
                u.sprintCooldown = u.classDef.sprintCooldown;
              }
            }
          }
        }

        // Enemy AI (uses default CONFIG values — not the evolved ones)
        for (var si = 0; si < enemyArmy.squads.length; si++) {
          var sq = enemyArmy.squads[si];
          for (var ui = 0; ui < sq.units.length; ui++) {
            var u = sq.units[ui];
            if (u.dead) continue;
            aiSystem.update(dt, u, testArmy.units, objectives, world);
            if (u.classDef && u.classDef.ability === 'heal_aoe' && u.medkits > 0 && Math.random() < 0.01) {
              var hurtNearby = false;
              var allies = enemyArmy.alive;
              for (var ai2 = 0; ai2 < allies.length; ai2++) {
                if (allies[ai2] !== u && allies[ai2].hp < allies[ai2].maxHp * 0.7 && u.distTo(allies[ai2]) < (u.classDef.healRadius || 3) * T * 1.5) { hurtNearby = true; break; }
              }
              if (hurtNearby) combat.deployHealZone(u);
            }
            if (u.classDef && u.classDef.ability === 'grenade' && u.grenades > 0) {
              var enemies = testArmy.alive;
              for (var ei = 0; ei < enemies.length; ei++) {
                if (u.distTo(enemies[ei]) < (CONFIG.GRENADE ? CONFIG.GRENADE.THROW_RANGE : 7) * T && Math.random() < 0.003) {
                  combat.throwGrenade(u, enemies[ei].x, enemies[ei].y);
                  break;
                }
              }
            }
            if (u.classDef && u.classDef.ability === 'sprint' && u.sprintCooldown <= 0) {
              var uai = aiSystem.getAI(u);
              if (uai && (uai.state === 'pushing' || uai.state === 'retreating')) {
                u.sprintTimer = u.classDef.sprintDuration;
                u.sprintCooldown = u.classDef.sprintCooldown;
              }
            }
            if (u.classDef && u.classDef.ability === 'barricade' && u.barricadeCooldown <= 0) {
              var uai = aiSystem.getAI(u);
              if (uai && uai.state === 'in_cover' && Math.random() < 0.002) combat.spawnBarricade(u, world);
            }
          }
        }

        Pathfinder.tick(dt);
        for (var i = 0; i < allUnits.length; i++) allUnits[i].physics(dt, world, allUnits);
        combat.update(dt, testArmy, enemyArmy, world);
        objectives.update(dt, testArmy, enemyArmy);

        if (testArmy.allDead || enemyArmy.allDead) break;

        var allHeld = true;
        for (var oi = 0; oi < objectives.points.length; oi++) {
          if (Math.abs(objectives.points[oi].control) < 0.99) { allHeld = false; break; }
        }
        if (allHeld) break;
      }

      // Collect results
      var testAlive = testArmy.alive.length;
      var testTotal = SQ.SQUADS_PER_TEAM * SQ.SQUAD_SIZE;
      var enemyAlive = enemyArmy.alive.length;
      var enemyTotal = testTotal;
      var testTotalHP = 0, testMaxHP = 0;
      var units = testArmy.units;
      for (var i = 0; i < units.length; i++) {
        testTotalHP += units[i].hp;
        testMaxHP += units[i].maxHp;
      }
      var objectivesHeld = 0;
      for (var oi = 0; oi < objectives.points.length; oi++) {
        if (objectives.points[oi].control > 0.5) objectivesHeld++;
      }

      return {
        testAlive: testAlive, testTotal: testTotal,
        enemyAlive: enemyAlive, enemyTotal: enemyTotal,
        testTotalHP: testTotalHP, testMaxHP: testMaxHP,
        objectivesHeld: objectivesHeld,
        ticksElapsed: tick, maxTicks: maxTicks,
      };
    })()
  `;

  return vm.runInContext(resultCode, ctx);
}

module.exports = { runSimulation };
