import { cors, json } from './_utils.js';
import { getAiEnvironmentStatus } from '../lib/ai-router.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return json(res, 405, { ok: false, message: 'Método não permitido.' });

  const status = getAiEnvironmentStatus();
  return json(res, 200, {
    ok: status.groqConfigured || status.geminiConfigured,
    ...status,
    note: status.groqConfigured
      ? 'A chave da Groq está disponível neste deployment.'
      : 'A chave da Groq não está disponível neste deployment. Faça um novo deployment depois de salvar a variável no Vercel.'
  });
}
