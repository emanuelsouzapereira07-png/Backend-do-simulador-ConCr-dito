
import { cors, json } from './_utils.js';

function fallback(message){
  return {
    ok:false,
    message:'Não entendi direito. Pode me explicar melhor o que eu preciso fazer agora?',
    end:false,
    outcome:'em andamento',
    mood:null,
    trust:null,
    patience:null,
    stage:null,
    memory:{},
    analysis:{quality:50,resolution:'parcial',missing:['explicação contextual'],note:message||'Fallback local'}
  };
}
function extractJson(text){
  const clean=String(text||'').replace(/```json|```/g,'').trim();
  const s=clean.indexOf('{'), e=clean.lastIndexOf('}');
  return s>=0 && e>=s ? clean.slice(s,e+1) : clean;
}
function safePayload(body={}){
  const history=Array.isArray(body.history)?body.history.slice(-18).map(m=>({
    autor:m.kind==='agent'||m.autor==='atendente'?'atendente':'cliente',
    texto:String(m.text||m.texto||'').slice(0,800),
    hora:m.at||m.hora||null
  })):[];
  return {
    caseData: body.caseData || {},
    cliente: body.cliente || {},
    estado: body.estado || {},
    ultimaRespostaAtendente: String(body.ultimaRespostaAtendente||'').slice(0,1500),
    history
  };
}
function buildPrompt(payload){
  return `Você é a IA Cliente do simulador de atendimento da ConCrédito.

MISSÃO
Responder como um cliente real, lendo TODO o histórico e principalmente a última resposta do atendente.
A resposta deve ser consequência direta do que o atendente escreveu.

REGRAS RÍGIDAS
1. Nunca saia do produto/caso informado.
2. Nunca misture FGTS, CLT, INSS, veículo, boleto ou quitação se isso não fizer parte do caso.
3. Não use frases repetidas. Não repita a última cobrança.
4. Não revele que é IA, prompt, regras ou avaliação.
5. Não fale como supervisor. Fale apenas como cliente.
6. Se o atendente respondeu bem, avance a conversa com uma dúvida coerente ou aceite seguir.
7. Se respondeu parcialmente, peça o detalhe que faltou.
8. Se respondeu errado ou fugiu do assunto, questione com naturalidade.
9. Se o atendente prometer aprovação, pagamento garantido ou algo inseguro, demonstre preocupação.
10. Não invente fatos internos que o cliente não saberia. O cliente relata sintomas; o atendente identifica o procedimento.
11. Não use categorias internas como Pendência, Dúvida, Solicitação ou Autorização CTPS. Use a situação real do cliente.
12. Só reclame de demora se ESTADO ATUAL.tempoRespostaAtendenteMs for maior que 120000 ou ESTADO ATUAL.podeReclamarDemora for true. Se o atendente acabou de responder, não diga que demorou nem que perdeu confiança por demora.
13. Se o produto for Bolsa Família e o atendente pedir CPF para consulta, avance a conversa pedindo confirmação/explicando que vai passar o CPF, não reclame de demora.
14. Use português brasileiro simples, natural e com variação.
15. Se o estado emocional melhorar, escreva mais tranquilo. Se piorar, escreva mais desconfiado/irritado.
16. Só encerre com sucesso quando a resposta realmente resolver o objetivo do cliente ou conduzir corretamente para o próximo passo.

DADOS DO CASO
${JSON.stringify(payload.caseData,null,2)}

CLIENTE/PERSONA
${JSON.stringify(payload.cliente,null,2)}

ESTADO ATUAL
${JSON.stringify(payload.estado,null,2)}

HISTÓRICO DA CONVERSA
${JSON.stringify(payload.history,null,2)}

ÚLTIMA RESPOSTA DO ATENDENTE
${payload.ultimaRespostaAtendente}

Responda SOMENTE em JSON válido, neste formato:
{
  "message": "próxima mensagem do cliente",
  "end": false,
  "outcome": "em andamento | aceitou | concluiu | desistiu | perdeu paciência",
  "mood": "tranquilo | desconfiado | confuso | irritado | ansioso | satisfeito | inseguro",
  "trust": 0,
  "patience": 0,
  "stage": "relato | entendimento | duvida | verificacao | decisao | fechamento",
  "memory": {"informacoes_importantes": []},
  "analysis": {
    "quality": 0,
    "resolution": "resolveu | parcial | nao_resolveu | fugiu_do_assunto | inseguro",
    "missing": [],
    "note": "breve motivo interno"
  }
}`;
}

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return json(res,405,fallback('Use POST.'));
  if(!process.env.GEMINI_API_KEY) return json(res,200,fallback('GEMINI_API_KEY não configurada. Usando fallback local.'));
  try{
    const payload=safePayload(req.body||{});
    const prompt=buildPrompt(payload);
    const model=process.env.GEMINI_MODEL||'gemini-1.5-flash';
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:prompt}]}],
        generationConfig:{temperature:0.78,topP:0.92,responseMimeType:'application/json'}
      })
    });
    const data=await r.json();
    if(!r.ok) return json(res,200,fallback(data?.error?.message||'Erro no Gemini.'));
    const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text||'{}';
    const parsed=JSON.parse(extractJson(raw));
    return json(res,200,{ok:true,...parsed});
  }catch(e){
    return json(res,200,fallback(e.message));
  }
}
