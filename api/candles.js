// api/candles.js — получаем свечи с Bybit (без API ключа, публичный endpoint)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol, start, end, exchange } = req.query;

  if (!symbol || !start) {
    return res.status(400).json({ error: 'symbol and start required' });
  }

  try {
    // Определяем интервал свечей исходя из длины сделки
    const startMs = parseInt(start);
    const endMs = end ? parseInt(end) : Date.now();
    const durationMs = endMs - startMs;
    
    let interval = '15'; // 15 минут по умолчанию
    if (durationMs > 7 * 24 * 60 * 60 * 1000) interval = '240'; // > 7 дней → 4ч
    else if (durationMs > 24 * 60 * 60 * 1000) interval = '60'; // > 1 дня → 1ч
    else if (durationMs > 4 * 60 * 60 * 1000) interval = '30'; // > 4ч → 30м
    else if (durationMs < 30 * 60 * 1000) interval = '1'; // < 30м → 1м

    // Берём свечи с запасом по 20% с каждой стороны
    const padding = durationMs * 0.3;
    const fromMs = Math.floor(startMs - padding);
    const toMs = Math.ceil(endMs + padding);

    // Пробуем Bybit (работает без ключа)
    const url = `https://api.bybit.com/v5/market/kline?symbol=${symbol}&interval=${interval}&start=${fromMs}&end=${toMs}&limit=200&category=linear`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.retCode !== 0) {
      // Пробуем спот если фьючерс не найден
      const spotUrl = `https://api.bybit.com/v5/market/kline?symbol=${symbol}&interval=${interval}&start=${fromMs}&end=${toMs}&limit=200&category=spot`;
      const spotResp = await fetch(spotUrl);
      const spotData = await spotResp.json();
      
      if (spotData.retCode !== 0) {
        return res.status(400).json({ error: `Candles not found for ${symbol}` });
      }
      
      const candles = (spotData.result?.list || []).reverse().map(c => ({
        time: Math.floor(parseInt(c[0]) / 1000),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));
      return res.status(200).json({ candles, interval });
    }

    const candles = (data.result?.list || []).reverse().map(c => ({
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
