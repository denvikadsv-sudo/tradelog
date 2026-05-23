// api/bybit.js — Vercel Serverless Function
// Поддержка Bybit UTA (Unified Trading Account) v5

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { apiKey, apiSecret, startTime, endTime } = req.body || req.query;

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API key and secret required' });
  }

  try {
    const timestamp = Date.now().toString();
    const recvWindow = '20000';

    // Пробуем разные категории для UTA
    const categories = ['linear', 'spot', 'inverse'];
    let allTrades = [];

    for (const category of categories) {
      try {
        const params = new URLSearchParams({ category, limit: '200' });
        if (startTime) params.append('startTime', startTime.toString());
        if (endTime) params.append('endTime', endTime.toString());

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

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          continue; // пропускаем если не JSON
        }

        if (data.retCode === 0 && data.result?.list?.length > 0) {
          const normalized = data.result.list.map(t => ({
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
            result: parseFloat(t.closedPnl || 0),
            reason: `Импорт с Bybit (${category})`,
            emotion: 'Спокоен',
            aiAnalysis: null,
          }));
          allTrades = [...allTrades, ...normalized];
        }
      } catch { continue; }
    }

    // Если execution/list пустой — пробуем order/history
    if (allTrades.length === 0) {
      for (const category of ['linear', 'spot']) {
        try {
          const params = new URLSearchParams({ category, limit: '200', orderStatus: 'Filled' });
          if (startTime) params.append('startTime', startTime.toString());
          if (endTime) params.append('endTime', endTime.toString());

          const paramStr = params.toString();
          const signPayload = `${timestamp}${apiKey}${recvWindow}${paramStr}`;
          const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(signPayload)
            .digest('hex');

          const url = `https://api.bybit.com/v5/order/history?${paramStr}`;

          const response = await fetch(url, {
            headers: {
              'X-BAPI-API-KEY': apiKey,
              'X-BAPI-SIGN': signature,
              'X-BAPI-TIMESTAMP': timestamp,
              'X-BAPI-RECV-WINDOW': recvWindow,
            },
          });

          const text = await response.text();
          let data;
          try { data = JSON.parse(text); } catch { continue; }

          if (data.retCode === 0 && data.result?.list?.length > 0) {
            const normalized = data.result.list.map(t => ({
              id: `bybit_order_${t.orderId}`,
              exchange: 'Bybit',
              date: new Date(parseInt(t.updatedTime)).toISOString().split('T')[0],
              ticker: t.symbol,
              direction: t.side === 'Buy' ? 'LONG' : 'SHORT',
              entry: parseFloat(t.avgPrice || t.price),
              exit: parseFloat(t.avgPrice || t.price),
              size: parseFloat(t.qty),
              stopLoss: parseFloat(t.stopLoss || 0),
              takeProfit: parseFloat(t.takeProfit || 0),
              commission: 0,
              result: 0,
              reason: `Импорт с Bybit (${category})`,
              emotion: 'Спокоен',
              aiAnalysis: null,
            }));
            allTrades = [...allTrades, ...normalized];
          }
        } catch { continue; }
      }
    }

    return res.status(200).json({ trades: allTrades, total: allTrades.length });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}