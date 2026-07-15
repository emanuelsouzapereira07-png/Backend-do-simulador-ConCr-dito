import { buildSessionSupervisorPrompt } from '../prompts/supervisor-session.js';
import { generateJson } from '../lib/ai-router.js';
import { cors, json } from './_utils.js';
function fallback(){return {feedback:'Durante esta sessão, revise com atenção se cada cliente recebeu uma orientação correta e um próximo passo claro. Mantenha a cordialidade e a objetividade que funcionaram bem, mas evite encerrar conversas antes de confirmar que a dúvida foi realmente resolvida. Nos próximos treinamentos, priorize respostas completas, seguras e adaptadas ao contexto de cada cliente.',fallback:true};}
export default async function handler(req,res){
  cors(res); if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return json(res,405,{error:'Use POST'});
  try{
    const {data,provider}=await generateJson(buildSessionSupervisorPrompt(req.body||{}),{temperature:0.35,maxOutputTokens:1800});
    return json(res,200,{feedback:String(data?.feedback||fallback().feedback).trim(),provider});
  }catch(error){console.error('[supervisor-sessao]',error?.details||error?.message||error);return json(res,200,fallback());}
}
