export function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}
export function json(res,status,body){cors(res);return res.status(status).json(body)}
export async function supabase(path, options={}){
  const url=process.env.SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{'Content-Type':'application/json','apikey':key,'Authorization':`Bearer ${key}`,'Prefer':'return=representation',...(options.headers||{})}});
  const text=await r.text(); if(!r.ok) throw new Error(text); return text?JSON.parse(text):null;
}
export function checkPassword(req,type){const pass=req.headers.authorization?.replace('Bearer ','')||req.body?.password||req.query?.password; const expected=type==='manager'?(process.env.MANAGER_PANEL_PASSWORD||'gestor2026'):(process.env.CASE_PANEL_PASSWORD||'casos2026'); return pass===expected;}
