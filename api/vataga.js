// api/vataga.js — Vercel Serverless Function
// Подключение к Ватаге (MOEX брокер) через их API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { apiKey, dateFrom, dateTo } = req.body || req.query;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key required' });
  }

  try {
    // Ватага использует Alor API (совместимость)
    // Документация: https://alor.dev/docs
    const baseUrl = 'https://api.alor.ru';

    // Шаг 1: Обмен токена на JWT
    const tokenResp = await fetch(`${baseUrl}/refresh?refreshToken=${apiKey}`, {
      method: 'POST',
    });

    if (!tokenResp.ok) {
      return res.status(401).json({ error: 'Неверный API ключ Ватаги' });
    }

    const tokenData = await tokenResp.json();
    const jwt = tokenData.AccessToken;

    // Шаг 2: Получаем список портфелей
    const portfolioResp = await fetch(`${baseUrl}/client/v2/portfolios`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const portfolios = await portfolioResp.json();
    const portfolio = portfolios?.[0];

    if (!portfolio) {
      return res.status(404).json({ error: 'Портфели не найдены' });
    }

    // Шаг 3: Получаем историю сделок
    const params = new URLSearchParams({ format: 'Simple' });
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);

    const tradesResp = await fetch(
      `${baseUrl}/md/v2/clients/${portfolio.exchange}/${portfolio.portfolio}/trades?${params}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );

    if (!tradesResp.ok) {
      return res.status(tradesResp.status).json({ error: 'Ошибка получения сделок' });
    }

    const trades = await tradesResp.json();

    // Нормализуем под наш формат
    const normalized = (Array.isArray(trades) ? trades : []).map(t => ({
      id: `vataga_${t.id || t.tradeNo}`,
      exchange: 'Ватага',
      date: new Date(t.date || t.time).toISOString().split('T')[0],
      ticker: t.symbol || t.ticker,
      direction: t.side === 'buy' || t.buySell === 'B' ? 'LONG' : 'SHORT',
      entry: parseFloat(t.price),
      exit: parseFloat(t.price),
      size: Math.abs(parseFloat(t.qty || t.quantity || 1)),
      stopLoss: 0,
      takeProfit: 0,
      commission: parseFloat(t.commission || t.brokerFee || 0),
      commissionAsset: 'RUB',
      result: parseFloat(t.profit || t.pnl || 0),
      reason: 'Импорт с Ватаги',
      emotion: 'Спокоен',
      aiAnalysis: null,
      raw: t,
    }));

    return res.status(200).json({ trades: normalized, total: normalized.length });
  } catch (error) {
    console.error('Vataga proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
