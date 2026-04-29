// Backend adaptation of the 5BP trade rule engine.
// Pure functions — no UI or browser dependencies.

export type Direction = 'Long' | 'Short';
export type StopType = 'SwingPoint' | 'BIT1' | 'BIT2' | 'BIT3Plus';

/** Risk-reward ratio */
export function calculateRRR(
  entry: number,
  stop: number,
  target: number,
  direction: Direction
): number {
  if (direction === 'Long') {
    const risk = entry - stop;
    const reward = target - entry;
    if (risk <= 0) return 0;
    return reward / risk;
  } else {
    const risk = stop - entry;
    const reward = entry - target;
    if (risk <= 0) return 0;
    return reward / risk;
  }
}

/** Risk % based on RRR tier table */
export function getRiskPercent(rrr: number): number {
  if (rrr < 2.0) return 1.0;
  if (rrr <= 2.5) return 1.25;
  if (rrr <= 3.0) return 1.5;
  if (rrr <= 3.5) return 1.75;
  return 2.0;
}

/** Number of shares and dollar risk given account size */
export function getPositionSize(
  accountSize: number,
  riskPercent: number,
  entry: number,
  stop: number,
  direction: Direction
): { shares: number; dollarRisk: number } {
  const dollarRisk = (accountSize * riskPercent) / 100;
  const stopDistance = direction === 'Long' ? entry - stop : stop - entry;
  if (stopDistance <= 0) return { shares: 0, dollarRisk: 0 };
  const shares = Math.floor(dollarRisk / stopDistance);
  return { shares, dollarRisk };
}

function getMaxRRR(stopType: StopType, direction: Direction): number {
  if (stopType === 'SwingPoint') return Infinity;
  if (stopType === 'BIT1') return direction === 'Long' ? 6.0 : 4.5;
  if (stopType === 'BIT2') return direction === 'Long' ? 5.0 : 3.5;
  return 3.25; // BIT3Plus
}

/** Step 2.3 — Mini-structure RRR validation */
export function validateMiniStructure(
  rrr: number,
  stopType: StopType,
  direction: Direction
): { pass: boolean; reason: string } {
  const minRRR = stopType === 'SwingPoint' ? 2.0 : 2.25;
  const maxRRR = getMaxRRR(stopType, direction);

  if (rrr < minRRR) {
    return {
      pass: false,
      reason: `RRR ${rrr.toFixed(2)} is below minimum ${minRRR} for ${stopType} stop.`,
    };
  }
  if (rrr > maxRRR) {
    return {
      pass: false,
      reason: `RRR ${rrr.toFixed(2)} exceeds max ${maxRRR} for ${stopType} ${direction} stop.`,
    };
  }
  return {
    pass: true,
    reason: `RRR ${rrr.toFixed(2)} is within valid range [${minRRR}, ${maxRRR === Infinity ? '∞' : maxRRR}].`,
  };
}
