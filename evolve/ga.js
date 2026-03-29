/** Simple genetic algorithm engine */
const { createRandomGenome, createDefaultGenome, crossover, mutate } = require('./genome');

function tournamentSelect(population, fitnesses, tournamentSize = 3) {
  let bestIdx = -1, bestFit = -Infinity;
  for (let i = 0; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    if (fitnesses[idx] > bestFit) { bestFit = fitnesses[idx]; bestIdx = idx; }
  }
  return population[bestIdx];
}

function evolveGeneration(population, fitnesses, eliteCount = 2) {
  // Sort by fitness descending
  const indexed = population.map((g, i) => ({ g, f: fitnesses[i] }));
  indexed.sort((a, b) => b.f - a.f);

  const newPop = [];

  // Keep elites
  for (let i = 0; i < eliteCount; i++) {
    newPop.push({ ...indexed[i].g });
  }

  // Fill rest with offspring
  while (newPop.length < population.length) {
    const parentA = tournamentSelect(population, fitnesses);
    const parentB = tournamentSelect(population, fitnesses);
    let child = crossover(parentA, parentB);
    child = mutate(child, 0.15);
    newPop.push(child);
  }

  return newPop;
}

function initPopulation(size) {
  const pop = [createDefaultGenome()]; // seed with current defaults
  while (pop.length < size) {
    pop.push(createRandomGenome());
  }
  return pop;
}

module.exports = { tournamentSelect, evolveGeneration, initPopulation };
