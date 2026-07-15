import { buildCsatPrompt } from '../prompts/csat.js';
import { generateJson } from '../lib/ai-router.js';
import { cors, json } from './_utils.js';

const LABELS = {1:'Péssimo',2:'Ruim',3:'Regular',4:'Bom',5:'Excelente'};
function fallback(payload={}){
  const outcome=String(payload.outcome||'').toLowerCase();
  let rating=3;
  if(/aceitou|conclu[ií]do|concluiu|resolvido/.test(outcome)) rating=4;
  if(/desistiu|paci[eê]ncia|demora|abandono/.test(outcome)) rating=1;
  return {rating,label:LABELS[rating],reason:'Avaliação estimada pelo modo de contingência.',fallback:true};
}
export default async function handler(req,res){
  cors(res); if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return json(res,405,{error:'Use POST'});
  try{
    const {data,provider}=await generateJson(buildCsatPrompt(req.body||{}),{temperature:0.2,maxOutputTokens:500});
    const rating=Math.max(1,Math.min(5,Math.round(Number(data?.rating)||3)));
    return json(res,200,{rating,label:LABELS[rating],reason:String(data?.reason||'').slice(0,300),provider});
  }catch(error){ console.error('[csat]',error?.details||error?.message||error); return json(res,200,fallback(req.body||{})); }
}
