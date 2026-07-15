import { cors, json, supabase, checkPassword } from './_utils.js';
function actionOf(req){return String(req.query?.action||req.body?.action||'cases').toLowerCase();}

async function cases(req,res){
  if(req.method==='GET'){const items=await supabase('cases?select=*&order=created_at.desc');return json(res,200,{items});}
  if(!checkPassword(req,'case')) return json(res,401,{error:'Senha do Painel de Casos inválida.'});
  if(req.method==='POST'){const row={...req.body,updated_at:new Date().toISOString(),created_at:req.body.created_at||new Date().toISOString()};const item=await supabase('cases',{method:'POST',body:JSON.stringify(row)});return json(res,200,{ok:true,item:item?.[0]});}
  if(req.method==='PUT'){const {id,...data}=req.body||{};if(!id)return json(res,400,{error:'id obrigatório'});const item=await supabase(`cases?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...data,updated_at:new Date().toISOString()})});return json(res,200,{ok:true,item:item?.[0]});}
  if(req.method==='DELETE'){const id=req.query.id||req.body?.id;if(!id)return json(res,400,{error:'id obrigatório'});await supabase(`cases?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});return json(res,200,{ok:true});}
  return json(res,405,{error:'Método não permitido'});
}

async function audit(req,res){
  if(req.method==='GET'){if(!checkPassword(req,'manager'))return json(res,401,{error:'Senha do gestor inválida.'});const items=await supabase('audit_logs?select=*&order=created_at.desc&limit=1000');return json(res,200,{items});}
  if(req.method==='POST'){if(!checkPassword(req,'case'))return json(res,401,{error:'Senha inválida.'});const item=await supabase('audit_logs',{method:'POST',body:JSON.stringify({...req.body,created_at:new Date().toISOString()})});return json(res,200,{ok:true,item:item?.[0]});}
  return json(res,405,{error:'Método não permitido'});
}

export default async function handler(req,res){
  cors(res);if(req.method==='OPTIONS')return res.status(200).end();
  try{const action=actionOf(req);if(action==='audit')return audit(req,res);return cases(req,res);}catch(error){return json(res,500,{error:error?.message||String(error)});}
}
