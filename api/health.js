import { json } from './_utils.js';
export default async function handler(req,res){return json(res,200,{ok:true,service:'simulador-concredito-v14',time:new Date().toISOString(),supabase:!!process.env.SUPABASE_URL,gemini:!!process.env.GEMINI_API_KEY});}
