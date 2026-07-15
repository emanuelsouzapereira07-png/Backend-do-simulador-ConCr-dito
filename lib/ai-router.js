const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function extractJson(raw) {
  const clean = String(raw || '').replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Resposta sem JSON válido.');
  return JSON.parse(clean.slice(start, end + 1));
}

function isRetryable(status, message = '') {
  return status === 408 || status === 409 || status === 429 || status >= 500 ||
    /timeout|temporar|overload|unavailable|high demand|rate limit|quota|resource exhausted/i.test(String(message));
}

async function fetchWithTimeout(url, init, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Tempo limite de ${timeoutMs}ms excedido.`);
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestGroq(prompt, options, useJsonMode = true) {
  const apiKey = env('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no deployment atual.');

  const { temperature = 0.25, maxOutputTokens = 1800 } = options;
  const model = env('GROQ_MODEL') || 'llama-3.3-70b-versatile';
  const body = {
    model,
    messages: [
      { role: 'system', content: 'Responda somente com um objeto JSON válido, sem markdown e sem texto fora do JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_completion_tokens: maxOutputTokens
  };

  if (useJsonMode) body.response_format = { type: 'json_object' };

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Groq HTTP ${response.status}`);
    error.status = response.status;
    error.provider = 'groq';
    throw error;
  }

  return extractJson(data?.choices?.[0]?.message?.content || '');
}

async function callGroq(prompt, options = {}) {
  try {
    return await requestGroq(prompt, options, true);
  } catch (error) {
    if (error?.status === 400 && /response_format|json/i.test(String(error?.message))) {
      console.warn('[AI Router] Groq rejeitou JSON Mode; tentando sem response_format.');
      return requestGroq(prompt, options, false);
    }
    throw error;
  }
}


async function requestCerebras(prompt, options = {}) {
  const apiKey = env('CEREBRAS_API_KEY');
  if (!apiKey) throw new Error('CEREBRAS_API_KEY não configurada no deployment atual.');
  const { temperature = 0.25, maxOutputTokens = 1800 } = options;
  const model = env('CEREBRAS_MODEL') || 'llama-3.3-70b';
  const response = await fetchWithTimeout('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
    body: JSON.stringify({
      model,
      messages:[
        {role:'system',content:'Responda somente com um objeto JSON válido, sem markdown e sem texto fora do JSON.'},
        {role:'user',content:prompt}
      ],
      temperature,
      max_completion_tokens:maxOutputTokens,
      response_format:{type:'json_object'}
    })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data?.error?.message||`Cerebras HTTP ${response.status}`);error.status=response.status;error.provider='cerebras';throw error;}
  return extractJson(data?.choices?.[0]?.message?.content||'');
}
async function callCerebras(prompt, options = {}) {
  try { return await requestCerebras(prompt, options); }
  catch(error){
    if(error?.status===400 && /response_format|json/i.test(String(error?.message))){
      const apiKey=env('CEREBRAS_API_KEY');
      const model=env('CEREBRAS_MODEL')||'llama-3.3-70b';
      const {temperature=0.25,maxOutputTokens=1800}=options;
      const response=await fetchWithTimeout('https://api.cerebras.ai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'system',content:'Retorne somente JSON válido.'},{role:'user',content:prompt}],temperature,max_completion_tokens:maxOutputTokens})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const e=new Error(data?.error?.message||`Cerebras HTTP ${response.status}`);e.status=response.status;throw e;}
      return extractJson(data?.choices?.[0]?.message?.content||'');
    }
    throw error;
  }
}

async function requestGemini(prompt, options, model) {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no deployment atual.');

  const { temperature = 0.25, maxOutputTokens = 1800 } = options;
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    error.provider = 'gemini';
    error.model = model;
    throw error;
  }

  const raw = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return extractJson(raw);
}

async function callGemini(prompt, options = {}) {
  const configured = env('GEMINI_MODEL');
  const models = [...new Set([configured, 'gemini-3.5-flash', 'gemini-flash-latest'].filter(Boolean))];
  let lastError;

  for (const model of models) {
    try {
      console.log(`[AI Router] Tentando Gemini com ${model}...`);
      return await requestGemini(prompt, options, model);
    } catch (error) {
      lastError = error;
      console.error(`[AI Router] Gemini ${model} falhou (${error?.status || 'sem status'}): ${error?.message || error}`);
      // 401/403 indicam chave/permissão; não adianta testar outro modelo.
      if (error?.status === 401 || error?.status === 403) break;
      // Em 429/5xx ou modelo indisponível, tenta o próximo alias/modelo.
    }
  }

  throw lastError || new Error('Gemini indisponível.');
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
      if (attempt < 2 && isRetryable(error?.status, error?.message)) await sleep(900);
      else break;
    }
  }
  throw lastError || new Error(`${name} indisponível.`);
}

export function getAiEnvironmentStatus() {
  return {
    groqConfigured: Boolean(env('GROQ_API_KEY')),
    cerebrasConfigured: Boolean(env('CEREBRAS_API_KEY')),
    geminiConfigured: Boolean(env('GEMINI_API_KEY')),
    groqModel: env('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    cerebrasModel: env('CEREBRAS_MODEL') || 'llama-3.3-70b',
    geminiModel: env('GEMINI_MODEL') || 'gemini-3.5-flash',
    vercelEnvironment: env('VERCEL_ENV') || 'local/unknown',
    gitCommit: env('VERCEL_GIT_COMMIT_SHA').slice(0, 7) || null
  };
}

export async function generateJson(prompt, options = {}) {
  const status = getAiEnvironmentStatus();
  console.log('========== AI ROUTER ==========');
  console.log('[AI Router] Ambiente:', JSON.stringify(status));

  const providers = [];
  if (status.groqConfigured) providers.push(['groq', callGroq]);
  if (status.cerebrasConfigured) providers.push(['cerebras', callCerebras]);
  if (status.geminiConfigured) providers.push(['gemini', callGemini]);

  if (!providers.length) {
    const error = new Error('Nenhuma chave de IA foi encontrada no deployment atual. Faça um novo deployment após cadastrar as variáveis.');
    error.details = ['GROQ_API_KEY ausente', 'CEREBRAS_API_KEY ausente', 'GEMINI_API_KEY ausente'];
    throw error;
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
