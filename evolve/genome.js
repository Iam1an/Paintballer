/** Genome schema — defines evolvable parameters, their ranges, and where they live in CONFIG */
const GENOME_SCHEMA = [
  { name: 'AGGRO_RANGE',     path: 'AI',   min: 8,   max: 30,  default: 18,  type: 'float' },
  { name: 'COVER_SEARCH',    path: 'AI',   min: 2,   max: 12,  default: 6,   type: 'int' },
  { name: 'STRAFE_SPEED',    path: 'AI',   min: 0.3, max: 2.5, default: 1.0, type: 'float' },
  { name: 'RETREAT_CHANCE',  path: 'AI',   min: 0.0, max: 0.8, default: 0.2, type: 'float' },
  { name: 'RETREAT_DURATION',path: 'AI',   min: 1,   max: 8,   default: 4,   type: 'float' },
  { name: 'REEVAL_INTERVAL', path: 'AI',   min: 0.3, max: 3.0, default: 1.2, type: 'float' },
  { name: 'OBJECTIVE_SPREAD',path: 'AI',   min: 10,  max: 120, default: 50,  type: 'float' },
  { name: 'SEPARATION_DIST', path: 'AI',   min: 10,  max: 50,  default: 28,  type: 'float' },
  { name: 'HEAL_THRESHOLD',  path: 'UNIT', min: 0.1, max: 0.7, default: 0.3, type: 'float' },
  { name: 'LOW_AMMO',        path: 'UNIT', min: 1,   max: 15,  default: 5,   type: 'int' },
];

function createRandomGenome() {
  const g = {};
  for (const s of GENOME_SCHEMA) {
    let val = s.min + Math.random() * (s.max - s.min);
    if (s.type === 'int') val = Math.round(val);
    g[s.name] = val;
  }
  return g;
}

function createDefaultGenome() {
  const g = {};
  for (const s of GENOME_SCHEMA) g[s.name] = s.default;
  return g;
}

function applyGenome(genome, config) {
  for (const s of GENOME_SCHEMA) {
    config[s.path][s.name] = genome[s.name];
  }
}

function crossover(a, b) {
  const child = {};
  for (const s of GENOME_SCHEMA) {
    child[s.name] = Math.random() < 0.5 ? a[s.name] : b[s.name];
  }
  return child;
}

function mutate(genome, rate = 0.15) {
  const g = { ...genome };
  for (const s of GENOME_SCHEMA) {
    if (Math.random() < rate) {
      const range = s.max - s.min;
      let val = g[s.name] + (Math.random() - 0.5) * range * 0.2;
      val = Math.max(s.min, Math.min(s.max, val));
      if (s.type === 'int') val = Math.round(val);
      g[s.name] = val;
    }
  }
  return g;
}

module.exports = { GENOME_SCHEMA, createRandomGenome, createDefaultGenome, applyGenome, crossover, mutate };
