import OpenAI from 'openai';
import { buildSupervisorPrompt } from '../prompts/supervisor.js';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function fallbackJson(message){
  return {
    total: 0,
    metrics: { context:0, diagnosis:0, action:0, safety:0, empathy:0, commercial:0 },
    feedback: 'Erro na análise',
    comment: message,
    strengths: [],
    improvements: ['Verifique a configuração do backend e da OPENAI_API_KEY.'],
    suggested: ''
  };
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json(fallbackJson('Método não permitido. Use POST.'));
  if(!process.env.OPENAI_API_KEY) return res.status(500).json(fallbackJson('OPENAI_API_KEY não configurada na Vercel.'));

  try{
    const payload = req.body || {};
    const prompt = buildSupervisorPrompt(payload);

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Você avalia atendimentos de suporte da ConCrédito com rigor, clareza e retorno apenas em JSON válido.' },
        { role: 'user', content: prompt }
      ]
    });

    const content = completion.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  }catch(error){
    return res.status(500).json(fallbackJson(error.message || 'Erro desconhecido no backend.'));
  }
}
