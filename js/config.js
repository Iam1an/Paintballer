const CONFIG = {
  TILE: 32,
  MAP_W: 100,
  MAP_H: 100,

  COLORS: {
    GRASS:    ['#3a6b22', '#3d7024', '#387020', '#3b6e26'],
    WATER:    ['#2a5577', '#275070', '#2d587a', '#2a5274'],
    SAND:     ['#c2b280', '#bfaf7c', '#c5b584', '#c0b07e'],
    CONCRETE: ['#7a7a7a', '#767676', '#7e7e7e', '#747474'],
    ROAD:     ['#4a4a4a', '#484848', '#4c4c4c', '#464646'],
    GRID_LINE: 'rgba(0,0,0,0.06)',
  },

  CLASSES: {
    rifleman: {
      name: 'Rifleman', desc: 'Long range marksman. High damage, accurate. E to sprint (50% speed boost).',
      speed: 100, hp: 100,
      fireRate: 0.5, damage: 26, range: 11, clipSize: 7, reserveAmmo: 35, reloadTime: 1.8,
      bulletSpeed: 520, spread: 0.02,
      medkits: 1, grenades: 0,
      ability: 'sprint',
      sprintDuration: 3,
      sprintCooldown: 10,
      sprintMul: 1.5,
      sightRange: 20,       // tiles — longest vision
      scopeLookAhead: 220,  // px — scope pushes camera far out
      scopeRange: 15,       // tiles — extended range while scoped
      icon: '◎', color: '#55bb55',
    },
    machinegunner: {
      name: 'Machine Gunner', desc: 'Suppressive fire. Huge clip, fast fire, can deploy barricade. Slow.',
      speed: 68, hp: 120,
      fireRate: 0.1, damage: 11, range: 7, clipSize: 60, reserveAmmo: 60, reloadTime: 3.5,
      bulletSpeed: 320, spread: 0.09,
      medkits: 1, grenades: 0,
      ability: 'barricade',
      icon: '⫼', color: '#ccaa33',
    },
    medic: {
      name: 'Medic', desc: 'Healer. Pistol + extra medkits, E to heal nearby allies.',
      speed: 92, hp: 90,
      fireRate: 0.4, damage: 22, range: 8, clipSize: 12, reserveAmmo: 64, reloadTime: 1.2,
      bulletSpeed: 380, spread: 0.05,
      leadShots: true,      // AI leads targets
      medkits: 5, grenades: 0,
      ability: 'heal_aoe',
      healRadius: 3,        // tiles
      healAmount: 35,
      healFuse: 2.0,        // seconds to charge
      icon: '+', color: '#44ccaa',
    },
    grenadier: {
      name: 'Grenadier', desc: 'Explosives expert. SMG + grenades. High spread.',
      speed: 88, hp: 100,
      fireRate: 0.14, damage: 9, range: 6, clipSize: 25, reserveAmmo: 125, reloadTime: 2.2,
      bulletSpeed: 300, spread: 0.13,
      medkits: 1, grenades: 3,
      ability: 'grenade',
      icon: 'G', color: '#cc7733',
    },
  },

  GRENADE: {
    THROW_RANGE: 7,    // tiles
    THROW_SPEED: 180,  // px/sec
    FUSE_TIME: 0.8,    // seconds after landing
    BLAST_RADIUS: 3,   // tiles
    DAMAGE: 95,
  },

  SQUAD: {
    SQUADS_PER_TEAM: 5,
    SQUAD_SIZE: 6,
    DEFAULTS: ['rifleman', 'rifleman', 'rifleman', 'machinegunner', 'medic', 'grenadier'],
  },

  UNIT: {
    RADIUS: 8,
    FOLLOW_DIST: 40,
    LOOT_TIME: 1.5,
    LOW_AMMO: 11,
    HEAL_THRESHOLD: 0.429,
    LOOT_RANGE: 6,
    MEDKIT_TIME: 2.0,
    MELEE_RANGE: 36,
    MELEE_DAMAGE: 35,
    MELEE_COOLDOWN: 0.35,
    HEAL_ALLY_RANGE: 40,
  },

  ENEMY: {
    SPEED: 76,
    HP: 85,
    FIRE_RATE: 0.4,
    RANGE: 7,
  },

  AI: {
    AGGRO_RANGE: 20,
    COVER_SEARCH: 5,
    STRAFE_SPEED: 1.533,
    RETREAT_CHANCE: 0.474,
    RETREAT_DURATION: 4.236,
    PUSH_DISTANCE: 3,
    REEVAL_INTERVAL: 2.177,
    SEPARATION_DIST: 50,
    SEPARATION_FORCE: 120,
    OBJECTIVE_SPREAD: 111,
  },

  OBJECTIVES: {
    CAPTURE_RADIUS: 2.5,
    CAPTURE_RATE: 0.15,
  },

  LOOT: {
    ammo:   { name: 'Ammo',   icon: 'A', color: '#cc9933' },
    medkit: { name: 'Medkit', icon: '+', color: '#44cc44' },
  },

  RESOURCES: {
    tree:       { hp: 999, solid: true },
    dead_tree:  { hp: 999, solid: true },
    rock:       { hp: 999, solid: true },
    bush:       { hp: 999, solid: false },
    car_wreck:  { hp: 999, solid: true },
    rubble:     { hp: 999, solid: false },
    loot_crate: { hp: 999, solid: true, lootable: true },
  },

  NET: {
    TICK_RATE: 20,
    INTERP_BUFFER: 0.05,
  },

  WORLD: {
    SPAWN_CLEAR: 6,
    URBAN_THRESHOLD: 0.62,
    DESERT_THRESHOLD: 0.68,
    WATER_THRESHOLD: 0.48,
    WATER_SPEED_MUL: 0.7,
    FOG_RADIUS: 10,
  },
};

CONFIG.MAP_PX_W = CONFIG.TILE * CONFIG.MAP_W;
CONFIG.MAP_PX_H = CONFIG.TILE * CONFIG.MAP_H;
