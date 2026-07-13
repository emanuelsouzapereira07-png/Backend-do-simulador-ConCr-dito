import { buildSupervisorPrompt } from '../prompts/supervisor.js';
import { generateJson } from '../lib/ai-router.js';
import { cors, json } from './_utils.js';

function fallback() {
  return {
    total: 0,
    metrics: { context: 0, diagnosis: 0, action: 0, safety: 0, empathy: 0, commercial: 0 },
    feedback: 'A avaliação automática ficou temporariamente indisponível.',
    strengths: [],
    improvements: ['Tente novamente em alguns instantes.'],
    suggested: '',
    fallback: true
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return json(res, 405, fallback());
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return json(res, 200, fallback());

  try {
    const prompt = buildSupervisorPrompt(req.body || {});
    const { data, provider } = await generateJson(prompt, { temperature: 0.35, maxOutputTokens: 2200 });
    return json(res, 200, { ...data, provider });
  } catch (error) {
    console.error('[analisar] Todos os provedores falharam:', error?.details || error?.message || error);
    return json(res, 200, fallback());
  }
}
