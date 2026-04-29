import { OHLCVBar } from './alphaVantage';

export interface Bar5Min {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TrendResult {
  direction: 'Long' | 'Short' | 'None';
  sma20: number;
  lastClose: number;
  isEstablished: boolean;
}

export interface KeyLevels {
  resistance: number[];
  support: number[];
}

export interface BreakoutResult {
  isBreakout: boolean;
  direction: 'Long' | 'Short';
  level: number;   // the S/R level that was broken
  entry: number;
  stop: number;
  target: number;
}

/** Aggregate 1-minute bars into 5-minute bars */
export function aggregate5min(bars: OHLCVBar[]): Bar5Min[] {
  const groups = new Map<string, OHLCVBar[]>();

  for (const bar of bars) {
    const [datePart, timePart] = bar.time.split(' ');
    const [hours, minutes] = timePart.split(':').map(Number);
    const roundedMinutes = Math.floor(minutes / 5) * 5;
    const key = `${datePart} ${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}:00`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(bar);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, groupBars]) => ({
      time,
      open: groupBars[0].open,
      high: Math.max(...groupBars.map(b => b.high)),
      low: Math.min(...groupBars.map(b => b.low)),
      close: groupBars[groupBars.length - 1].close,
      volume: groupBars.reduce((sum, b) => sum + b.volume, 0),
    }));
}

/** Calculate simple moving average over the last `period` values */
function calcSma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

/**
 * Detect trend direction using 20-period SMA on 5-minute bars.
 * Requires SMA slope of ≥ 0.1% over 5 bars and price on the correct side of SMA.
 */
export function detectTrend(bars: Bar5Min[]): TrendResult {
  if (bars.length < 26) {
    return { direction: 'None', sma20: 0, lastClose: 0, isEstablished: false };
  }

  const closes = bars.map(b => b.close);
  const smaValues = calcSma(closes, 20);

  const last = smaValues.length - 1;
  const currentSma = smaValues[last];
  const prevSma = smaValues[last - 5];
  const lastClose = closes[last];

  // Slope must be at least 0.1% over 5 bars to be "established"
  const slope = Math.abs((currentSma - prevSma) / prevSma);
  const isEstablished = slope >= 0.001;

  let direction: 'Long' | 'Short' | 'None';
  if (!isEstablished) {
    direction = 'None';
  } else if (lastClose > currentSma && currentSma > prevSma) {
    direction = 'Long';
  } else if (lastClose < currentSma && currentSma < prevSma) {
    direction = 'Short';
  } else {
    direction = 'None';
  }

  return { direction, sma20: currentSma, lastClose, isEstablished };
}

/**
 * Identify key support and resistance levels from recent swing highs/lows.
 * Uses 3-bar look-around on last 60 bars; returns the 3 most recent of each.
 */
export function findKeyLevels(bars: Bar5Min[]): KeyLevels {
  const resistance: number[] = [];
  const support: number[] = [];

  const lookback = Math.min(bars.length, 60);
  const startIdx = bars.length - lookback;

  for (let i = startIdx + 3; i < bars.length - 3; i++) {
    const bar = bars[i];
    const prev = bars.slice(i - 3, i);
    const next = bars.slice(i + 1, i + 4);

    if (prev.every(b => b.high < bar.high) && next.every(b => b.high < bar.high)) {
      resistance.push(bar.high);
    }
    if (prev.every(b => b.low > bar.low) && next.every(b => b.low > bar.low)) {
      support.push(bar.low);
    }
  }

  return {
    resistance: resistance.slice(-3).sort((a, b) => b - a),
    support: support.slice(-3).sort((a, b) => a - b),
  };
}

/**
 * Detect a 5BP-style breakout in the last 3 bars.
 * Requires: close crosses S/R level AND volume ≥ 1.3x the 20-bar average before the window.
 * Returns the first valid breakout candidate, or null.
 */
export function detectBreakout(
  bars: Bar5Min[],
  levels: KeyLevels,
  direction: 'Long' | 'Short'
): BreakoutResult | null {
  if (bars.length < 10) return null;

  // Average volume of bars before the last 3 (the breakout window)
  const priorBars = bars.slice(0, -3);
  const avgVol = priorBars.reduce((sum, b) => sum + b.volume, 0) / priorBars.length;

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];

  if (direction === 'Long') {
    for (const resistanceLevel of levels.resistance) {
      const brokeAbove = lastBar.close > resistanceLevel && prevBar.close <= resistanceLevel;
      const volumeOk = lastBar.volume >= avgVol * 1.3;

      if (brokeAbove && volumeOk) {
        const entry = resistanceLevel * 1.001; // 0.1% above breakout level
        const recentLows = bars.slice(-4, -1).map(b => b.low);
        const stop = Math.min(...recentLows);
        const risk = entry - stop;
        if (risk <= 0) continue;
        const target = entry + risk * 2.0; // minimum 2:1 RRR
        return { isBreakout: true, direction, level: resistanceLevel, entry, stop, target };
      }
    }
  } else {
    for (const supportLevel of levels.support) {
      const brokeBelow = lastBar.close < supportLevel && prevBar.close >= supportLevel;
      const volumeOk = lastBar.volume >= avgVol * 1.3;

      if (brokeBelow && volumeOk) {
        const entry = supportLevel * 0.999; // 0.1% below breakout level
        const recentHighs = bars.slice(-4, -1).map(b => b.high);
        const stop = Math.max(...recentHighs);
        const risk = stop - entry;
        if (risk <= 0) continue;
        const target = entry - risk * 2.0;
        return { isBreakout: true, direction, level: supportLevel, entry, stop, target };
      }
    }
  }

  return null;
}
