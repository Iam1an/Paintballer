/** Compute fitness score from simulation results */
function computeFitness(results) {
  const {
    testAlive, testTotal,
    enemyAlive, enemyTotal,
    testTotalHP, testMaxHP,
    objectivesHeld,
    ticksElapsed, maxTicks,
  } = results;

  const killRatio = (enemyTotal - enemyAlive) / enemyTotal;
  const survivalRatio = testAlive / testTotal;
  const objRatio = objectivesHeld / 3;
  const hpRatio = testTotalHP / testMaxHP;
  const speedBonus = 1 - (ticksElapsed / maxTicks);

  return (
    40 * killRatio +
    30 * survivalRatio +
    20 * objRatio +
    10 * hpRatio -
    5 * (1 - speedBonus)
  );
}

module.exports = { computeFitness };
