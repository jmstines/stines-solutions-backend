import { ScheduledHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { getIntradayBars, filterBarsByDate, sleep } from './utils/twelveData';
import { aggregate5min, detectTrend, findKeyLevels, detectBreakout } from './utils/technicalAnalysis';
import { calculateRRR, getRiskPercent, getPositionSize, validateMiniStructure } from './utils/tradeRuleEngine';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TRADE_SIGNALS_TABLE = process.env.TRADE_SIGNALS_TABLE!;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY!;
// Comma-separated watchlist; default starter list based on historical trade log
const WATCHLIST = (process.env.WATCHLIST || 'AAPL,MSFT,NVDA,AMZN,TSLA,AMD,NFLX,META,GOOGL,GPRO').split(',').map(s => s.trim());
// 8 seconds between calls = 7.5 calls/min (respects free-tier rate limit of 8 req/min)
const RATE_LIMIT_DELAY_MS = 8_000;

/** Get the current market date as YYYY-MM-DD in Eastern Time */
function getMarketDate(): string {
  const etDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = etDate.getFullYear();
  const m = String(etDate.getMonth() + 1).padStart(2, '0');
  const d = String(etDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isWeekday(): boolean {
  const etDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etDate.getDay(); // 0=Sun, 6=Sat
  return day >= 1 && day <= 5;
}

async function writeSignal(
  marketDate: string,
  symbol: string,
  scanRunId: string,
  data: Record<string, unknown>
): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Item: { marketDate, symbol, scanRunId, scannedAt: Date.now(), ...data },
  }));
}

export const handler: ScheduledHandler = async () => {
  if (!isWeekday()) {
    console.log('Weekend — skipping trade scan');
    return;
  }

  const marketDate = getMarketDate();
  const scanRunId = randomUUID();
  console.log(`Trade scan starting: marketDate=${marketDate} runId=${scanRunId} tickers=${WATCHLIST.length}`);

  // Mark scan as in-progress
  await writeSignal(marketDate, '_META_', scanRunId, {
    scanStatus: 'processing',
    totalTickers: WATCHLIST.length,
    completedTickers: 0,
  });

  let completedTickers = 0;
  const errors: string[] = [];

  for (let i = 0; i < WATCHLIST.length; i++) {
    const symbol = WATCHLIST[i];

    // Rate-limit: wait before every call except the first
    if (i > 0) await sleep(RATE_LIMIT_DELAY_MS);

    try {
      console.log(`Scanning ${symbol} (${i + 1}/${WATCHLIST.length})...`);

      const allBars = await getIntradayBars(symbol, TWELVE_DATA_API_KEY);
      const todayBars = filterBarsByDate(allBars, marketDate);

      if (todayBars.length < 30) {
        await writeSignal(marketDate, symbol, scanRunId, {
          signalType: 'Filtered',
          filterReason: `Insufficient bar data (${todayBars.length} bars)`,
        });
        completedTickers++;
        continue;
      }

      const bars5min = aggregate5min(todayBars);
      const trend = detectTrend(bars5min);

      if (trend.direction === 'None') {
        await writeSignal(marketDate, symbol, scanRunId, {
          signalType: 'Filtered',
          filterReason: 'No established trend detected',
          lastClose: trend.lastClose,
          sma20: trend.sma20,
        });
        completedTickers++;
        continue;
      }

      const levels = findKeyLevels(bars5min);
      const breakout = detectBreakout(bars5min, levels, trend.direction);

      if (!breakout) {
        await writeSignal(marketDate, symbol, scanRunId, {
          signalType: 'Filtered',
          filterReason: 'No 5BP breakout detected',
          direction: trend.direction,
          levels,
        });
        completedTickers++;
        continue;
      }

      const { entry, stop, target, direction, level: breakoutLevel } = breakout;
      const rrr = calculateRRR(entry, stop, target, direction);
      const miniResult = validateMiniStructure(rrr, 'SwingPoint', direction);

      if (!miniResult.pass) {
        await writeSignal(marketDate, symbol, scanRunId, {
          signalType: 'Filtered',
          filterReason: `RRR check failed: ${miniResult.reason}`,
          direction,
          entry: Math.round(entry * 100) / 100,
          stop: Math.round(stop * 100) / 100,
          target: Math.round(target * 100) / 100,
          rrr: Math.round(rrr * 100) / 100,
          breakoutLevel: Math.round(breakoutLevel * 100) / 100,
        });
        completedTickers++;
        continue;
      }

      const riskPercent = getRiskPercent(rrr);
      // Use a default $100k account for position sizing; user adjusts in UI
      const { shares, dollarRisk } = getPositionSize(100_000, riskPercent, entry, stop, direction);

      console.log(`${symbol}: CANDIDATE ${direction} entry=${entry.toFixed(2)} stop=${stop.toFixed(2)} target=${target.toFixed(2)} RRR=${rrr.toFixed(2)}`);

      await writeSignal(marketDate, symbol, scanRunId, {
        signalType: 'Candidate',
        direction,
        entry: Math.round(entry * 100) / 100,
        stop: Math.round(stop * 100) / 100,
        target: Math.round(target * 100) / 100,
        rrr: Math.round(rrr * 100) / 100,
        riskPercent,
        shares,
        dollarRisk: Math.round(dollarRisk * 100) / 100,
        breakoutLevel: Math.round(breakoutLevel * 100) / 100,
        step21Pass: true,
        step22Pass: true,
        step23Pass: true,
        // Step 2.4 confluence must be verified manually before trading
        step24Note: 'Manual confluence review required before trading',
      });

      completedTickers++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error scanning ${symbol}: ${msg}`);
      errors.push(`${symbol}: ${msg}`);

      // Still attempt to write an error record so the frontend knows it failed
      try {
        await writeSignal(marketDate, symbol, scanRunId, {
          signalType: 'Error',
          filterReason: msg,
        });
      } catch { /* swallow secondary write failure */ }
    }
  }

  const finalStatus = errors.length === WATCHLIST.length ? 'failed' : 'completed';

  await writeSignal(marketDate, '_META_', scanRunId, {
    scanStatus: finalStatus,
    totalTickers: WATCHLIST.length,
    completedTickers,
    errors: errors.length > 0 ? errors : undefined,
  });

  console.log(`Scan complete: ${completedTickers}/${WATCHLIST.length} tickers, status=${finalStatus}`);
};
