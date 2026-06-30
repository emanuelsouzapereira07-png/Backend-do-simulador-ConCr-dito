function json(res, status, body){ res.status(status).json(body); }
export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return json(res,405,{error:'Use POST'});
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) return json(res,500,{error:'Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.'});
  try{
    const payload=req.body || {};
    const row={
      id: payload.id || `treino_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      seller_name: payload.seller_name || payload.nome || 'Sem nome',
      seller_team: payload.seller_team || payload.equipe || 'Sem time',
      created_at: payload.created_at || new Date().toISOString(),
      started_at: payload.started_at,
      ended_at: payload.ended_at,
      duration_seconds: payload.duration_seconds,
      difficulty: payload.difficulty,
      mode: payload.mode,
      target_cases: payload.target_cases,
      solved: payload.solved,
      score: payload.score,
      average: payload.average,
      xp: payload.xp,
      rank: payload.rank,
      metrics: payload.metrics || {},
      cases: payload.cases || []
    };
    const r=await fetch(`${url}/rest/v1/trainings`,{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':`Bearer ${key}`,'Prefer':'return=representation'},body:JSON.stringify(row)});
    const text=await r.text();
    if(!r.ok) return json(res,500,{error:text});
    return json(res,200,{ok:true,item:JSON.parse(text)[0]});
  }catch(e){ return json(res,500,{error:e.message}); }
}
