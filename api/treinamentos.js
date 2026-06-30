function json(res, status, body){ res.status(status).json(body); }
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='GET') return json(res,405,{error:'Use GET'});
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) return json(res,500,{error:'Supabase não configurado.'});
  try{
    const r=await fetch(`${url}/rest/v1/trainings?select=*&order=created_at.desc&limit=1000`,{headers:{'apikey':key,'Authorization':`Bearer ${key}`}});
    const text=await r.text(); if(!r.ok) return json(res,500,{error:text});
    return json(res,200,{items:JSON.parse(text)});
  }catch(e){ return json(res,500,{error:e.message}); }
}
