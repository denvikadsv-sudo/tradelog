import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { apiKey, apiSecret, startTime, endTime } = req.body || req.query;
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'API key and secret required' });

  const timestamp = Date.now().toString();
  const recvWindow = '20000';
  let allTrades = [];

  async function bybitRequest(endpoint, extraParams = {}) {
    const params = new URLSearchParams({ limit: '200', ...extraParams });
    if (startTime) params.append('startTime', startTime.toString());
    if (endTime) params.append('endTime', endTime.toString());
    const paramStr = params.toString();
    const signature = crypto.createHmac('sha256', apiSecret)
      .update(`${timestamp}${apiKey}${recvWindow}${paramStr}`).digest('hex');
    const response = await fetch(`https://api.bybit.com${endpoint}?${paramStr}`, {
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
      },
    });
    const text = await response.text();
    try { return JSON.parse(text); } catch { return null; }
  }

  try {
    // 1. Закрытые позиции (фьючерсы UTA) — самый важный endpoint
    for (const category of ['linear', 'inverse']) {
      const data = await bybitRequest('/v5/position/closed-pnl', { category });
      if (data?.retCode === 0 && data.result?.list?.length > 0) {
        const normalized = data.result.list.map(t => ({
          id: `bybit_pnl_${t.orderId}`,
          exchange: 'Bybit',
          date: new Date(parseInt(t.updatedTime)).toISOString().split('T')[0],
          ticker: t.symbol,
          direction: t.side === 'Sell' ? 'LONG' : 'SHORT',
          entry: parseFloat(t.avgEntryPrice || 0),
          exit: parseFloat(t.avgExitPrice || 0),
          size: parseFloat(t.qty || 0),
          stopLoss: 0,
          takeProfit: 0,
          commission: parseFloat(t.cumEntryFee || 0) + parseFloat(t.cumExitFee || 0),
          result: Math.round(parseFloat(t.closedPnl || 0) * 100) / 100,
          reason: `Импорт с Bybit (${category})`,
          emotion: 'Спокоен',
          aiAnalysis: null,
        }));
        allTrades = [...allTrades, ...normalized];
      }
    }

    // 2. История исполнений (если закрытых позиций нет)
    if (allTrades.length === 0) {
      for (const category of ['linear', 'spot', 'inverse']) {
        const data = await bybitRequest('/v5/execution/list', { category });
        if (data?.retCode === 0 && data.result?.list?.length > 0) {
          const normalized = data.result.list.map(t => ({
            id: `bybit_exec_${t.execId}`,
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
            result: Math.round(parseFloat(t.closedPnl || 0) * 100) / 100,
            reason: `Импорт с Bybit (${category})`,
            emotion: 'Спокоен',
            aiAnalysis: null,
          }));
          allTrades = [...allTrades, ...normalized];
        }
      }
    }

    // 3. История ордеров (спот)
    if (allTrades.length === 0) {
      const data = await bybitRequest('/v5/order/history', { category: 'spot', orderStatus: 'Filled' });
      if (data?.retCode === 0 && data.result?.list?.length > 0) {
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
          reason: 'Импорт с Bybit (spot)',
          emotion: 'Спокоен',
          aiAnalysis: null,
        }));
        allTrades = [...allTrades, ...normalized];
      }
    }

    return res.status(200).json({ trades: allTrades, total: allTrades.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}