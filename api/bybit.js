// api/bybit.js — Vercel Serverless Function
// Проксирует запросы к Bybit API v5

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { apiKey, apiSecret, startTime, endTime, category = 'spot' } = req.body || req.query;

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API key and secret required' });
  }

  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';

    const params = new URLSearchParams({
      category,
      limit: '200',
    });
    if (startTime) params.append('startTime', startTime);
    if (endTime) params.append('endTime', endTime);

    const paramStr = params.toString();
    const signPayload = `${timestamp}${apiKey}${recvWindow}${paramStr}`;
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(signPayload)
      .digest('hex');

    const url = `https://api.bybit.com/v5/execution/list?${paramStr}`;

    const response = await fetch(url, {
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.retCode !== 0) {
      return res.status(400).json({ error: data.retMsg || 'Bybit API error' });
    }

    const executions = data.result?.list || [];

    // Нормализуем под наш формат
    const normalized = executions.map(t => {
      const pnl = parseFloat(t.closedPnl || 0);
      return {
        id: `bybit_${t.execId}`,
        exchange: 'Bybit',
        date: new Date(parseInt(t.execTime)).toISOString().split('T')[0],
        ticker: t.symbol,
        direction: t.side === 'Buy' ? 'LONG' : 'SHORT',
        entry: parseFloat(t.execPrice),
        exit: parseFloat(t.execPrice),
        size: parseFloat(t.execQty),
        stopLoss: 0,
        takeProfit: 0,
        commission: parseFloat(t.execFee || 0),
        commissionAsset: t.feeCurrency || 'USDT',
        result: pnl,
        reason: 'Импорт с Bybit',
        emotion: 'Спокоен',
        aiAnalysis: null,
        raw: t,
      };
    });

    return res.status(200).json({ trades: normalized, total: normalized.length });
  } catch (error) {
    console.error('Bybit proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
