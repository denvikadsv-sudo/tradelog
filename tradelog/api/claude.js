// api/claude.js — Vercel Serverless Function
// Проксирует запросы к Groq API (бесплатная альтернатива Claude)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { system, messages, max_tokens = 1500 } = req.body;

  // GROQ_API_KEY задаётся в переменных окружения Vercel
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Groq API key not configured' });
  }

  try {
    // Groq использует OpenAI-совместимый формат
    const groqMessages = [];
    if (system) groqMessages.push({ role: 'system', content: system });
    groqMessages.push(...messages);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // лучшая бесплатная модель Groq
        max_tokens,
        messages: groqMessages,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });
    }

    // Приводим ответ к формату который ожидает фронтенд (как у Claude)
    const normalized = {
      content: [{ type: 'text', text: data.choices?.[0]?.message?.content || '' }]
    };

    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
