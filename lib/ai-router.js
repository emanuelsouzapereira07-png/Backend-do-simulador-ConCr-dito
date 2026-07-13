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

async function requestGroq(prompt, options, useJsonMode = true) {
  const { temperature = 0.25, maxOutputTokens = 1800 } = options;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: 'Responda somente com um objeto JSON válido, sem markdown e sem texto fora do JSON.'
      },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_completion_tokens: maxOutputTokens
  };

  if (useJsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.error?.message || `Groq HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return extractJson(data?.choices?.[0]?.message?.content || '');
}

async function callGroq(prompt, options = {}) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada.');

  try {
    return await requestGroq(prompt, options, true);
  } catch (error) {
    // Algumas contas/modelos podem rejeitar response_format. Nesse caso,
    // repete uma vez sem JSON Mode, mantendo a instrução de JSON no prompt.
    if (error?.status === 400 && /response_format|json/i.test(String(error?.message))) {
      console.warn('[AI Router] Groq rejeitou JSON Mode; tentando sem response_format.');
      return requestGroq(prompt, options, false);
    }
    throw error;
  }
}

async function callGemini(prompt, { temperature = 0.25, maxOutputTokens = 1800 } = {}) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada.');

  // Modelo atualizável pelo Vercel. O padrão foi alterado para um modelo mais novo.
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
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
      console.log(`[AI Router] Tentando ${name} (tentativa ${attempt}/2)...`);
      const data = await fn(prompt, options);
      console.log(`[AI Router] ${name} respondeu com sucesso.`);
      return { data, provider: name };
    } catch (error) {
      lastError = error;
      console.error(`[AI Router] Falha em ${name} (${error?.status || 'sem status'}): ${error?.message || error}`);

      if (attempt < 2 && isRetryable(error?.status, error?.message)) {
        await sleep(700);
      } else {
        break;
      }
    }
  }

  throw lastError || new Error(`${name} indisponível.`);
}

export async function generateJson(prompt, options = {}) {
  console.log('========== AI ROUTER ==========');
  console.log('[AI Router] GROQ_API_KEY disponível:', Boolean(process.env.GROQ_API_KEY));
  console.log('[AI Router] GEMINI_API_KEY disponível:', Boolean(process.env.GEMINI_API_KEY));
  console.log('[AI Router] GROQ_MODEL:', process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
  console.log('[AI Router] GEMINI_MODEL:', process.env.GEMINI_MODEL || 'gemini-3.5-flash');

  const providers = [];
  if (process.env.GROQ_API_KEY) providers.push(['groq', callGroq]);
  if (process.env.GEMINI_API_KEY) providers.push(['gemini', callGemini]);

  if (!providers.length) {
    throw new Error('Nenhuma chave de IA configurada.');
  }

  const errors = [];

  for (const [name, fn] of providers) {
    try {
      return await attemptProvider(name, fn, prompt, options);
    } catch (error) {
      errors.push(`${name}: ${error?.message || error}`);
    }
  }

  console.error('[AI Router] Todos os provedores falharam:', errors.join(' | '));

  const finalError = new Error('Todos os provedores de IA ficaram indisponíveis.');
  finalError.details = errors;
  throw finalError;
}
