import { SQSHandler, SQSRecord } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getIntradayBars, filterBarsByDate } from './utils/twelveData';
import { aggregate5min, detectTrend, findKeyLevels, detectBreakout } from './utils/technicalAnalysis';
import { calculateRRR, getRiskPercent, getPositionSize, validateMiniStructure } from './utils/tradeRuleEngine';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

const TRADE_SIGNALS_TABLE = process.env.TRADE_SIGNALS_TABLE!;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY!;

interface ScanMessage {
  symbol: string;
  marketDate: string;
  scanRunId: string;
  tickerIndex: number;
  totalTickers: number;
}

async function writeSignal(
  marketDate: string,
  symbol: string,
  scanRunId: string,
  data: Record<string, unknown>
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30-day retention
  await docClient.send(new PutCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Item: { marketDate, symbol, scanRunId, scannedAt: Date.now(), expiresAt, ...data },
  }));
}

/** Atomically increment completedTickers. Returns the new count. */
async function incrementCompleted(marketDate: string, scanRunId: string): Promise<number> {
  const result = await docClient.send(new UpdateCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Key: { marketDate, symbol: '_META_' },
    UpdateExpression: 'ADD completedTickers :one',
    ExpressionAttributeValues: { ':one': 1 },
    ReturnValues: 'UPDATED_NEW',
  }));
  return result.Attributes?.completedTickers as number;
}

async function markScanComplete(marketDate: string, scanRunId: string, isError: boolean): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TRADE_SIGNALS_TABLE,
    Key: { marketDate, symbol: '_META_' },
    UpdateExpression: 'SET scanStatus = :status',
    ExpressionAttributeValues: { ':status': isError ? 'failed' : 'completed' },
  }));
}

async function processOneTicker(msg: ScanMessage): Promise<void> {
  const { symbol, marketDate, scanRunId, totalTickers } = msg;
  let hadError = false;

  try {
    console.log(`Scanning ${symbol} (${msg.tickerIndex + 1}/${totalTickers})...`);

    const allBars = await getIntradayBars(symbol, TWELVE_DATA_API_KEY);
    const todayBars = filterBarsByDate(allBars, marketDate);

    if (todayBars.length < 30) {
      await writeSignal(marketDate, symbol, scanRunId, {
        signalType: 'Filtered',
        filterReason: `Insufficient bar data (${todayBars.length} bars)`,
      });
      return;
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
      return;
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
      return;
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
      return;
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
  } catch (err) {
    hadError = true;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error scanning ${symbol}: ${errMsg}`);
    try {
      await writeSignal(marketDate, symbol, scanRunId, { signalType: 'Error', filterReason: errMsg });
    } catch { /* swallow secondary write failure */ }
  } finally {
    // Always increment — even on error — so _META_ reaches totalTickers and scan can complete
    const newCount = await incrementCompleted(marketDate, scanRunId);
    if (newCount >= totalTickers) {
      await markScanComplete(marketDate, scanRunId, hadError);
      console.log(`Scan run ${scanRunId} complete: ${newCount}/${totalTickers} tickers processed`);
    }
  }
}

/** SQS event handler — processes exactly one ticker per invocation */
export const handler: SQSHandler = async (event) => {
  // batch_size=1 so there will always be exactly one record
  const record: SQSRecord = event.Records[0];
  const msg: ScanMessage = JSON.parse(record.body);
  await processOneTicker(msg);
};
