import { cors, json, supabase, checkPassword } from './_utils.js';

function actionOf(req){return String(req.query?.action||req.body?.action||'').toLowerCase();}
function queryValue(req,name){return req.query?.[name] ?? req.body?.[name];}

async function results(req,res){
  if(req.method==='GET'){
    if(!checkPassword(req,'manager')) return json(res,401,{error:'Senha do gestor inválida.'});
    const items=await supabase('results?select=*&order=created_at.desc&limit=1000');
    return json(res,200,{items});
  }
  if(req.method==='POST'){
    const p=req.body||{};
    const row={id:p.id||`resultado_${Date.now()}`,seller_name:p.name||p.seller_name||'Sem nome',seller_team:p.team||p.seller_team||'Sem time',mode:p.mode,average:p.average,csat_average:p.csatAverage||p.csat_average||null,csat_count:p.csatCount||p.csat_count||0,supervisor_feedback:p.supervisorFeedback||p.supervisor_feedback||'',xp:p.xp,solved:p.solved,cases:p.cases||[],created_at:p.at||new Date().toISOString()};
    const item=await supabase('results',{method:'POST',body:JSON.stringify(row)});
    return json(res,200,{ok:true,item:item?.[0]});
  }
  return json(res,405,{error:'Método não permitido'});
}

async function salvar(req,res){
  if(req.method!=='POST') return json(res,405,{error:'Use POST'});
  const p=req.body||{};
  const row={id:p.id||`treino_${Date.now()}_${Math.random().toString(16).slice(2)}`,seller_name:p.seller_name||p.nome||'Sem nome',seller_team:p.seller_team||p.equipe||'Sem time',created_at:p.created_at||new Date().toISOString(),started_at:p.started_at,ended_at:p.ended_at,duration_seconds:p.duration_seconds,difficulty:p.difficulty,mode:p.mode,target_cases:p.target_cases,solved:p.solved,score:p.score,average:p.average,csat_average:p.csatAverage||p.csat_average||null,csat_count:p.csatCount||p.csat_count||0,supervisor_feedback:p.supervisorFeedback||p.supervisor_feedback||'',xp:p.xp,rank:p.rank,metrics:p.metrics||{},cases:p.cases||[]};
  const item=await supabase('trainings',{method:'POST',body:JSON.stringify(row)});
  return json(res,200,{ok:true,item:item?.[0]});
}

async function excluir(req,res){
  if(req.method!=='POST' && req.method!=='DELETE') return json(res,405,{error:'Use POST ou DELETE'});
  const id=queryValue(req,'id'); if(!id) return json(res,400,{error:'id obrigatório'});
  await supabase(`trainings?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});
  return json(res,200,{ok:true});
}

async function treinamentos(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Use GET'});
  const items=await supabase('trainings?select=*&order=created_at.desc&limit=1000');
  return json(res,200,{items});
}

async function stats(req,res){
  if(!checkPassword(req,'manager')) return json(res,401,{error:'Senha do gestor inválida.'});
  const allResults=await supabase('results?select=*&order=created_at.desc&limit=5000');
  const allCases=await supabase('cases?select=*');
  const caseStats={};
  for(const r of allResults||[]) for(const c of r.cases||[]){caseStats[c.caseId]??={uses:0,total:0,errors:0,time:0};caseStats[c.caseId].uses++;caseStats[c.caseId].total+=Number(c.score||0);caseStats[c.caseId].errors+=Number(c.score||0)<70?1:0;caseStats[c.caseId].time+=Number(c.time||0);}
  return json(res,200,{summary:{results:allResults.length,cases:allCases.length},case_stats:caseStats});
}

async function notifications(req,res){
  if(req.method==='GET'){const items=await supabase('notifications?select=*&order=created_at.desc&limit=100');return json(res,200,{items});}
  if(req.method==='POST'){if(!checkPassword(req,'manager'))return json(res,401,{error:'Senha do gestor inválida.'});const item=await supabase('notifications',{method:'POST',body:JSON.stringify({...req.body,created_at:new Date().toISOString()})});return json(res,200,{ok:true,item:item?.[0]});}
  return json(res,405,{error:'Método não permitido'});
}

export default async function handler(req,res){
  cors(res); if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const action=actionOf(req);
    if(action==='results') return results(req,res);
    if(action==='salvar') return salvar(req,res);
    if(action==='excluir') return excluir(req,res);
    if(action==='treinamentos') return treinamentos(req,res);
    if(action==='stats') return stats(req,res);
    if(action==='notifications') return notifications(req,res);
    return json(res,400,{error:'Ação administrativa inválida.'});
  }catch(error){return json(res,500,{error:error?.message||String(error)});}
}
