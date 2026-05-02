import https from 'https';

export interface OHLCVBar {
  time: string;   // "YYYY-MM-DD HH:MM:SS"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BASE_URL = 'https://api.twelvedata.com/time_series';

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Fetch 1-minute intraday bars for a symbol from Twelve Data.
 * Returns bars sorted oldest-first.
 * Free tier: 800 calls/day, 8 calls/min.
 * Throws on rate-limit, API error, or missing data.
 */
export async function getIntradayBars(symbol: string, apiKey: string): Promise<OHLCVBar[]> {
  // outputsize=390 covers a full 6.5-hour trading day of 1-min bars
  const url = `${BASE_URL}?symbol=${encodeURIComponent(symbol)}&interval=1min&outputsize=390&apikey=${apiKey}`;

  const raw = await httpsGet(url);
  const json = JSON.parse(raw);

  if (json.status === 'error') {
    throw new Error(`Twelve Data error for ${symbol}: ${json.message}`);
  }

  const values: Array<Record<string, string>> = json.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`No intraday data returned for ${symbol}`);
  }

  const bars: OHLCVBar[] = values
    .map((v) => ({
      time: v.datetime,           // already "YYYY-MM-DD HH:MM:SS"
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume),
    }))
    .sort((a, b) => a.time.localeCompare(b.time)); // oldest first

  return bars;
}

/** Filter bars to a specific market date (YYYY-MM-DD prefix) */
export function filterBarsByDate(bars: OHLCVBar[], marketDate: string): OHLCVBar[] {
  return bars.filter(bar => bar.time.startsWith(marketDate));
}

/** Sleep for ms milliseconds — used for rate limit compliance */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
