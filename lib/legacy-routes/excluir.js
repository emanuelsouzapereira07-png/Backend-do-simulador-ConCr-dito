function json(res, status, body){ res.status(status).json(body); }
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return json(res,405,{error:'Use POST'});
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) return json(res,500,{error:'Supabase não configurado.'});
  const id=req.body?.id; if(!id) return json(res,400,{error:'id obrigatório'});
  try{
    const r=await fetch(`${url}/rest/v1/trainings?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{'apikey':key,'Authorization':`Bearer ${key}`}});
    const text=await r.text(); if(!r.ok) return json(res,500,{error:text});
    return json(res,200,{ok:true});
  }catch(e){ return json(res,500,{error:e.message}); }
}
