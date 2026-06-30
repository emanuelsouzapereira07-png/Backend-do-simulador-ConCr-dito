export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.status(200).json({ok:true, service:'academia-vendas-concredito', time:new Date().toISOString(), supabase:!!process.env.SUPABASE_URL, gemini:!!process.env.GEMINI_API_KEY});
}
