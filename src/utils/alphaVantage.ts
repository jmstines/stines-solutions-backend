import https from 'https';

export interface OHLCVBar {
  time: string;   // "YYYY-MM-DD HH:MM:SS"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BASE_URL = 'https://www.alphavantage.co/query';

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
 * Fetch 1-minute intraday bars for a symbol from Alpha Vantage.
 * Returns bars sorted oldest-first.
 * Throws on rate-limit ("Note"), API error ("Error Message"), or missing data.
 */
export async function getIntradayBars(symbol: string, apiKey: string): Promise<OHLCVBar[]> {
  const url = `${BASE_URL}?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=1min&outputsize=full&apikey=${apiKey}`;

  const raw = await httpsGet(url);
  const json = JSON.parse(raw);

  // Alpha Vantage returns 200 OK even for errors — check payload keys
  if (json['Note']) {
    throw new Error(`Alpha Vantage rate limit hit for ${symbol}: ${json['Note']}`);
  }
  if (json['Error Message']) {
    throw new Error(`Alpha Vantage error for ${symbol}: ${json['Error Message']}`);
  }
  if (json['Information']) {
    throw new Error(`Alpha Vantage API plan restriction for ${symbol}: ${json['Information']}`);
  }

  const timeSeries = json['Time Series (1min)'];
  if (!timeSeries || typeof timeSeries !== 'object') {
    throw new Error(`No intraday data returned for ${symbol}`);
  }

  const bars: OHLCVBar[] = Object.entries(timeSeries)
    .map(([time, values]: [string, any]) => ({
      time,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseFloat(values['5. volume']),
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
