#!/usr/bin/env node
/** Evolution runner — evolves AI parameters using a genetic algorithm */
const { initPopulation, evolveGeneration } = require('./ga');
const { applyGenome, GENOME_SCHEMA } = require('./genome');
const { computeFitness } = require('./fitness');
const { runSimulation } = require('./headless-sim');
const fs = require('fs');
const path = require('path');

// CLI args
const POP_SIZE = parseInt(process.argv.find(a => a.startsWith('--pop='))?.split('=')[1]) || 16;
const GENS = parseInt(process.argv.find(a => a.startsWith('--gens='))?.split('=')[1]) || 15;
const GAMES_PER = parseInt(process.argv.find(a => a.startsWith('--games='))?.split('=')[1]) || 3;

console.log(`\n=== AI EVOLUTION ===`);
console.log(`Population: ${POP_SIZE} | Generations: ${GENS} | Games per eval: ${GAMES_PER}`);
console.log(`Total simulations: ~${POP_SIZE * GENS * GAMES_PER}\n`);

let population = initPopulation(POP_SIZE);
let bestEver = null, bestFitEver = -Infinity;

const history = [];

for (let gen = 0; gen < GENS; gen++) {
  const genStart = Date.now();
  const fitnesses = [];

  for (let i = 0; i < population.length; i++) {
    const genome = population[i];
    let totalFitness = 0;

    for (let g = 0; g < GAMES_PER; g++) {
      try {
        const results = runSimulation(genome);
        totalFitness += computeFitness(results);
      } catch (e) {
        console.error(`  Sim error (gen ${gen}, ind ${i}, game ${g}):`, e.message);
        totalFitness += 0; // penalize crashes
      }
    }

    const avgFitness = totalFitness / GAMES_PER;
    fitnesses.push(avgFitness);

    if (avgFitness > bestFitEver) {
      bestFitEver = avgFitness;
      bestEver = { ...genome };
    }
  }

  const genBestFit = Math.max(...fitnesses);
  const genAvgFit = fitnesses.reduce((a, b) => a + b) / fitnesses.length;
  const elapsed = ((Date.now() - genStart) / 1000).toFixed(1);

  console.log(`Gen ${gen + 1}/${GENS} | Best: ${genBestFit.toFixed(2)} | Avg: ${genAvgFit.toFixed(2)} | All-time best: ${bestFitEver.toFixed(2)} | ${elapsed}s`);

  history.push({ gen: gen + 1, best: genBestFit, avg: genAvgFit, allTimeBest: bestFitEver });

  // Evolve next generation
  if (gen < GENS - 1) {
    population = evolveGeneration(population, fitnesses);
  }
}

console.log(`\n=== EVOLUTION COMPLETE ===\n`);
console.log(`Best fitness: ${bestFitEver.toFixed(2)}\n`);
console.log(`Best genome:`);
for (const s of GENOME_SCHEMA) {
  const val = bestEver[s.name];
  const def = s.default;
  const diff = ((val - def) / def * 100).toFixed(1);
  console.log(`  ${s.name.padEnd(20)} ${val.toFixed(3).padStart(8)} (default: ${def}, ${diff > 0 ? '+' : ''}${diff}%)`);
}

// Save results
const resultsPath = path.join(__dirname, 'results.json');
fs.writeFileSync(resultsPath, JSON.stringify({ bestGenome: bestEver, bestFitness: bestFitEver, history }, null, 2));
console.log(`\nResults saved to ${resultsPath}`);

// Print config.js snippet
console.log(`\n=== PASTE INTO config.js ===\n`);
console.log(`  AI: {`);
for (const s of GENOME_SCHEMA) {
  if (s.path === 'AI') {
    const val = s.type === 'int' ? Math.round(bestEver[s.name]) : parseFloat(bestEver[s.name].toFixed(3));
    console.log(`    ${s.name}: ${val},`);
  }
}
console.log(`  },`);
console.log(`\n  // In UNIT:`);
for (const s of GENOME_SCHEMA) {
  if (s.path === 'UNIT') {
    const val = s.type === 'int' ? Math.round(bestEver[s.name]) : parseFloat(bestEver[s.name].toFixed(3));
    console.log(`    ${s.name}: ${val},`);
  }
}
console.log('');
