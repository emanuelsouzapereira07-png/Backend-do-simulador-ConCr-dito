import { buildSupervisorPrompt } from '../prompts/supervisor.js';

function fallbackJson(message){
  return {
    total: 0,
    metrics: { context:0, diagnosis:0, action:0, safety:0, empathy:0, commercial:0 },
    feedback: 'Erro na análise',
    comment: message,
    strengths: [],
    improvements: ['Verifique a configuração do backend e da GEMINI_API_KEY na Vercel.'],
    suggested: ''
  };
}

function extractJson(text){
  if(!text) return '{}';
  const clean = text.replace(/```json|```/g,'').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  return start >= 0 && end >= start ? clean.slice(start, end + 1) : clean;
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json(fallbackJson('Método não permitido. Use POST.'));
  if(!process.env.GEMINI_API_KEY) return res.status(500).json(fallbackJson('GEMINI_API_KEY não configurada na Vercel.'));

  try{
    const prompt = buildSupervisorPrompt(req.body || {});
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, responseMimeType: 'application/json' }
      })
    });

    const geminiData = await geminiRes.json();
    if(!geminiRes.ok){
      return res.status(500).json(fallbackJson(geminiData?.error?.message || 'Erro ao chamar Gemini.'));
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(extractJson(text));
    return res.status(200).json(parsed);
  }catch(error){
    return res.status(500).json(fallbackJson(error.message || 'Erro desconhecido no backend.'));
  }
}
