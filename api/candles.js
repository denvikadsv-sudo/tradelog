export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol, start, end, interval = '15' } = req.query;
  if (!symbol || !start) return res.status(400).json({ error: 'symbol and start required' });

  const startMs = parseInt(start);
  const endMs = end ? parseInt(end) : Date.now();

  async function fetchBybit(category, iv) {
    const url = `https://api.bybit.com/v5/market/kline?symbol=${symbol}&interval=${iv}&start=${startMs}&end=${endMs}&limit=500&category=${category}`;
    const r = await fetch(url);
    const text = await r.text();
    try { return JSON.parse(text); } catch { return null; }
  }

  try {
    let data = await fetchBybit('linear', interval);
    if (!data || data.retCode !== 0 || !data.result?.list?.length) {
      data = await fetchBybit('spot', interval);
    }
    if (!data || data.retCode !== 0 || !data.result?.list?.length) {
      data = await fetchBybit('inverse', interval);
    }
    if (!data || data.retCode !== 0) {
      return res.status(400).json({ error: `Candles not found for ${symbol}` });
    }

    const candles = (data.result.list || []).reverse().map(c => ({
      time: Math.floor(parseInt(c[0]) / 1000),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));

    return res.status(200).json({ candles, interval });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
