const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractJson(raw) {
  const clean = String(raw || '').replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Resposta sem JSON válido.');
  return JSON.parse(clean.slice(start, end + 1));
}

function isRetryable(status, message = '') {
  return status === 408 || status === 409 || status === 429 || status >= 500 ||
    /timeout|temporar|overload|unavailable|rate limit|quota|resource exhausted/i.test(String(message));
}

async function callGroq(prompt, { temperature = 0.25, maxOutputTokens = 1800 } = {}) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada.');
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_completion_tokens: maxOutputTokens,
      response_format: { type: 'json_object' }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Groq HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return extractJson(data?.choices?.[0]?.message?.content || '');
}

async function callGemini(prompt, { temperature = 0.25, maxOutputTokens = 1800 } = {}) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada.');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          topP: 0.9,
          maxOutputTokens,
          responseMimeType: 'application/json'
        }
      })
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const raw = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return extractJson(raw);
}

async function attemptProvider(name, fn, prompt, options) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const data = await fn(prompt, options);
      console.log(`[AI Router] ${name} respondeu com sucesso.`);
      return { data, provider: name };
    } catch (error) {
      lastError = error;
      console.error(`[AI Router] Falha em ${name}:`, error?.message || error);
      if (attempt < 2 && isRetryable(error?.status, error?.message)) await sleep(700);
      else break;
    }
  }
  throw lastError || new Error(`${name} indisponível.`);
}

export async function generateJson(prompt, options = {}) {
  const providers = [];
  if (process.env.GROQ_API_KEY) providers.push(['groq', callGroq]);
  if (process.env.GEMINI_API_KEY) providers.push(['gemini', callGemini]);
  if (!providers.length) throw new Error('Nenhuma chave de IA configurada.');

  const errors = [];
  for (const [name, fn] of providers) {
    try {
      return await attemptProvider(name, fn, prompt, options);
    } catch (error) {
      errors.push(`${name}: ${error?.message || error}`);
    }
  }
  const finalError = new Error('Todos os provedores de IA ficaram indisponíveis.');
  finalError.details = errors;
  throw finalError;
}
