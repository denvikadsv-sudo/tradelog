// api/binance.js — Vercel Serverless Function
// Проксирует запросы к Binance API, добавляет подпись HMAC-SHA256

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { apiKey, apiSecret, startTime, endTime, symbol } = req.body || req.query;

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API key and secret required' });
  }

  try {
    const timestamp = Date.now();
    let queryString = `timestamp=${timestamp}&limit=1000`;
    if (startTime) queryString += `&startTime=${startTime}`;
    if (endTime) queryString += `&endTime=${endTime}`;
    if (symbol) queryString += `&symbol=${symbol}`;

    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    // Получаем историю ордеров (исполненные)
    const url = `https://api.binance.com/api/v3/myTrades?${queryString}&signature=${signature}`;
    
    const response = await fetch(url, {
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.msg || 'Binance API error' });
    }

    const trades = await response.json();

    // Нормализуем под наш формат
    const normalized = trades.map(t => ({
      id: `binance_${t.id}`,
      exchange: 'Binance',
      date: new Date(t.time).toISOString().split('T')[0],
      ticker: t.symbol,
      direction: t.isBuyer ? 'LONG' : 'SHORT',
      entry: parseFloat(t.price),
      exit: parseFloat(t.price), // для myTrades entry=exit, нужна история ордеров
      size: parseFloat(t.qty),
      stopLoss: 0,
      takeProfit: 0,
      commission: parseFloat(t.commission),
      commissionAsset: t.commissionAsset,
      result: t.isBuyer
        ? parseFloat(t.quoteQty) * -1  // купили — потратили
        : parseFloat(t.quoteQty),       // продали — получили
      reason: 'Импорт с Binance',
      emotion: 'Спокоен',
      aiAnalysis: null,
      raw: t,
    }));

    return res.status(200).json({ trades: normalized, total: normalized.length });
  } catch (error) {
    console.error('Binance proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
