import { cors, json } from './_utils.js';

const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(Number(n))?Number(n):min));
const text=(v,max=1200)=>String(v??'').trim().slice(0,max);

function fallback(reason='IA indisponível'){
  return {
    ok:false,
    message:'Entendi. Você consegue me explicar de forma mais direta qual é o próximo passo no meu caso?',
    end:false,
    outcome:'em andamento',
    mood:'confuso',
    trust:45,
    patience:55,
    stage:'entendimento',
    memory:{facts:[],questionsAnswered:[],openQuestions:['próximo passo']},
    analysis:{quality:45,resolution:'parcial',missing:['próximo passo claro'],note:reason},
    controller:{decision:'pedir_esclarecimento',reason}
  };
}

function extractJson(raw){
  const clean=String(raw||'').replace(/```json|```/gi,'').trim();
  const start=clean.indexOf('{');
  const end=clean.lastIndexOf('}');
  if(start<0||end<start) throw new Error('Resposta sem JSON válido.');
  return JSON.parse(clean.slice(start,end+1));
}

function normalizeHistory(history){
  if(!Array.isArray(history)) return [];
  return history.slice(-30).map((m,i)=>({
    index:i+1,
    author:m.kind==='agent'||m.autor==='atendente'?'atendente':'cliente',
    text:text(m.text||m.texto,1000),
    at:m.at||m.hora||null
  })).filter(m=>m.text);
}

function safePayload(body={}){
  const caseData=body.caseData||{};
  const state=body.estado||{};
  return {
    caseData:{
      id:text(caseData.id,120), title:text(caseData.title,200), product:text(caseData.product,120),
      situation:text(caseData.situation||caseData.category,500), difficulty:text(caseData.difficulty,40),
      profile:text(caseData.profile,80), initialMessage:text(caseData.message,800),
      background:Array.isArray(caseData.history)?caseData.history.slice(0,12).map(x=>text(x,500)):[],
      goal:text(caseData.goal,1000), approvedGuidance:text(caseData.ideal,1800),
      evaluationCriteria:text(caseData.criteria,1200), hint:text(caseData.hint,700),
      forbiddenTopics:Array.isArray(caseData.forbiddenTopics)?caseData.forbiddenTopics.slice(0,20).map(x=>text(x,100)):[]
    },
    client:{
      name:text(body.cliente?.nome,80), persona:text(body.cliente?.persona,80), style:text(body.cliente?.estilo,500),
      mood:text(body.cliente?.humor||state.humor,40), trust:clamp(body.cliente?.confianca??state.confianca??40),
      patience:clamp(body.cliente?.paciencia??state.paciencia??60), interest:clamp(body.cliente?.interesse??state.interesse??50),
      hiddenGoal:text(body.cliente?.objetivoOculto||caseData.goal,1000)
    },
    state:{
      stage:text(state.etapa||'relato',50), turns:clamp(state.turnos,0,99), memory:state.memoria&&typeof state.memoria==='object'?state.memoria:{},
      asked:Array.isArray(state.perguntasFeitas)?state.perguntasFeitas.slice(-20).map(x=>text(x,300)):[],
      lastNag:text(state.ultimaCobranca,500), attendantStatus:text(state.statusAtendente,40), mode:text(state.modo,50),
      responseDelayMs:clamp(state.tempoRespostaAtendenteMs,0,3600000), mayComplainDelay:!!state.podeReclamarDemora
    },
    history:normalizeHistory(body.history),
    lastAgentMessage:text(body.ultimaRespostaAtendente,1800)
  };
}

async function callGemini(prompt,{temperature=.25,maxOutputTokens=1800}={}){
  const model=process.env.GEMINI_MODEL||'gemini-2.0-flash';
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      contents:[{role:'user',parts:[{text:prompt}]}],
      generationConfig:{temperature,topP:.9,maxOutputTokens,responseMimeType:'application/json'}
    })
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data?.error?.message||`Gemini HTTP ${response.status}`);
  const raw=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  return extractJson(raw);
}

function controllerPrompt(p){
  return `Você é o CONTROLADOR invisível de um simulador corporativo de atendimento da ConCrédito.
Analise a conversa inteira e a última resposta do atendente. Não escreva a fala do cliente ainda.

PRINCÍPIOS OBRIGATÓRIOS
- O caso e o produto são a fonte de verdade. Nunca misture produtos ou introduza assunto sem relação.
- Compare a resposta do atendente com OBJETIVO, ORIENTAÇÃO APROVADA e CRITÉRIOS.
- Julgue intenção e significado, não palavras-chave isoladas.
- Diferencie: resolveu, resolveu parcialmente, pediu dado necessário, fugiu do assunto, informação insegura, rudeza, ou promessa indevida.
- Só avance se a resposta realmente permitir avanço.
- Uma solicitação legítima de CPF/dados para consulta conta como próximo passo, quando coerente com a orientação aprovada.
- Reclamação de demora só é permitida se responseDelayMs >= 120000 ou mayComplainDelay=true.
- Não encerre por sucesso sem objetivo alcançado ou próximo passo aceito.
- Atualize humor, confiança e paciência de modo gradual e justificável.
- Crie no máximo uma nova dúvida, sempre compatível com o caso e ainda não respondida.
- Não use categorias internas como “Pendência”, “Dúvida”, “Consulta” ou “Autorização CTPS” na fala futura.

CASO E BASE OFICIAL
${JSON.stringify(p.caseData,null,2)}

CLIENTE
${JSON.stringify(p.client,null,2)}

ESTADO
${JSON.stringify(p.state,null,2)}

HISTÓRICO
${JSON.stringify(p.history,null,2)}

ÚLTIMA RESPOSTA DO ATENDENTE
${p.lastAgentMessage}

Responda SOMENTE JSON:
{
  "resolution":"resolveu|parcial|nao_resolveu|fugiu_do_assunto|inseguro|rude|promessa_indevida",
  "quality":0,
  "answeredPoints":[],
  "missingPoints":[],
  "contradictions":[],
  "nextAction":"aceitar_proximo_passo|fazer_pergunta_coerente|pedir_esclarecimento|corrigir_atendente|aguardar_verificacao|encerrar_sucesso|encerrar_desistencia",
  "newQuestion":"",
  "stage":"relato|entendimento|duvida|verificacao|decisao|fechamento",
  "mood":"tranquilo|desconfiado|confuso|irritado|ansioso|satisfeito|inseguro",
  "trust":0,
  "patience":0,
  "end":false,
  "outcome":"em andamento|aceitou|concluiu|desistiu|perdeu paciência",
  "memory":{"facts":[],"questionsAnswered":[],"openQuestions":[]},
  "reason":"explicação interna curta e objetiva"
}`;
}

function clientPrompt(p,plan){
  return `Você é SOMENTE o cliente de um atendimento da ConCrédito. Gere uma única mensagem natural em português brasileiro.

REGRAS ABSOLUTAS
1. A mensagem deve ser consequência direta da última resposta do atendente e do plano do controlador.
2. Nunca saia do produto/situação. Nunca misture CLT, FGTS, INSS, veículos, Bolsa Família, boleto ou quitação sem relação com o caso.
3. Não fale como supervisor, não dê nota, não explique regras e não diga que é IA.
4. Não invente fato interno, status, prazo, aprovação ou contrato que o cliente não poderia saber.
5. Não repita nenhuma frase recente nem a última cobrança.
6. Não use bordões fixos como “meu filho”. Respeite a persona sem caricatura.
7. Se o atendente respondeu corretamente e pediu um dado necessário, aceite o próximo passo ou faça uma dúvida final coerente.
8. Se foi parcial, pergunte apenas o ponto que falta. Se foi incoerente, aponte exatamente a incoerência.
9. Só reclame de demora quando o plano permitir.
10. Máximo de 2 frases curtas; sem texto técnico; caixa alta apenas se o humor for irritado e sem exagero.
11. Se end=true, escreva um encerramento compatível com outcome.

CASO
${JSON.stringify(p.caseData,null,2)}
CLIENTE
${JSON.stringify(p.client,null,2)}
HISTÓRICO
${JSON.stringify(p.history,null,2)}
ÚLTIMA RESPOSTA DO ATENDENTE
${p.lastAgentMessage}
PLANO DO CONTROLADOR
${JSON.stringify(plan,null,2)}

Responda SOMENTE JSON: {"message":"texto do cliente"}`;
}

function validatePlan(raw,p){
  const allowedRes=new Set(['resolveu','parcial','nao_resolveu','fugiu_do_assunto','inseguro','rude','promessa_indevida']);
  const allowedAction=new Set(['aceitar_proximo_passo','fazer_pergunta_coerente','pedir_esclarecimento','corrigir_atendente','aguardar_verificacao','encerrar_sucesso','encerrar_desistencia']);
  const plan={
    resolution:allowedRes.has(raw.resolution)?raw.resolution:'parcial',
    quality:clamp(raw.quality,0,100), answeredPoints:Array.isArray(raw.answeredPoints)?raw.answeredPoints.slice(0,8).map(x=>text(x,250)):[],
    missingPoints:Array.isArray(raw.missingPoints)?raw.missingPoints.slice(0,8).map(x=>text(x,250)):[],
    contradictions:Array.isArray(raw.contradictions)?raw.contradictions.slice(0,6).map(x=>text(x,250)):[],
    nextAction:allowedAction.has(raw.nextAction)?raw.nextAction:'pedir_esclarecimento', newQuestion:text(raw.newQuestion,500),
    stage:text(raw.stage||p.state.stage,50), mood:text(raw.mood||p.client.mood,40), trust:clamp(raw.trust??p.client.trust), patience:clamp(raw.patience??p.client.patience),
    end:!!raw.end, outcome:text(raw.outcome||'em andamento',50), memory:raw.memory&&typeof raw.memory==='object'?raw.memory:{}, reason:text(raw.reason,700)
  };
  if(plan.end && !['encerrar_sucesso','encerrar_desistencia'].includes(plan.nextAction)) plan.end=false;
  if(plan.nextAction==='encerrar_sucesso' && !['resolveu','parcial'].includes(plan.resolution)) { plan.end=false; plan.nextAction='pedir_esclarecimento'; }
  if(p.state.responseDelayMs<120000 && !p.state.mayComplainDelay && /demor|aguard|tempo/i.test(plan.newQuestion)) plan.newQuestion='';
  return plan;
}

function sanitizeMessage(message,p,plan){
  let m=text(message,700).replace(/\s+/g,' ').trim();
  const recent=p.history.slice(-8).filter(x=>x.author==='cliente').map(x=>x.text.toLowerCase());
  if(!m) throw new Error('Mensagem vazia.');
  if(recent.includes(m.toLowerCase())) throw new Error('Mensagem repetida.');
  if(p.state.responseDelayMs<120000 && !p.state.mayComplainDelay && /demorou|demora|aguardando há|perdi a confiança por/i.test(m)) throw new Error('Reclamação de demora incoerente.');
  const product=(p.caseData.product||'').toLowerCase();
  const forbidden=[];
  if(!product.includes('fgts')) forbidden.push('fgts');
  if(!product.includes('inss')) forbidden.push('inss');
  if(!product.includes('veículo')&&!product.includes('veiculo')) forbidden.push('veículo','carro quitado');
  if(!product.includes('trabalhador')&&!product.includes('clt')) forbidden.push('carteira de trabalho','ctps');
  if(forbidden.some(x=>m.toLowerCase().includes(x))) throw new Error('Mensagem misturou produto.');
  if(/pendência|autorização ctps/i.test(m)) throw new Error('Categoria interna indevida.');
  return m;
}

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return json(res,405,fallback('Use POST.'));
  if(!process.env.GEMINI_API_KEY) return json(res,200,fallback('GEMINI_API_KEY não configurada.'));
  const payload=safePayload(req.body||{});
  if(!payload.lastAgentMessage) return json(res,400,fallback('Resposta do atendente vazia.'));
  try{
    const rawPlan=await callGemini(controllerPrompt(payload),{temperature:.15,maxOutputTokens:1800});
    const plan=validatePlan(rawPlan,payload);
    let generated;
    try{
      generated=await callGemini(clientPrompt(payload,plan),{temperature:.72,maxOutputTokens:500});
      generated.message=sanitizeMessage(generated.message,payload,plan);
    }catch(firstError){
      const retryPrompt=clientPrompt(payload,{...plan,reason:`${plan.reason}. REVISÃO OBRIGATÓRIA: evite repetição, mistura de produto e reclamação de demora sem base.`});
      generated=await callGemini(retryPrompt,{temperature:.45,maxOutputTokens:500});
      generated.message=sanitizeMessage(generated.message,payload,plan);
    }
    return json(res,200,{
      ok:true, message:generated.message, end:plan.end, outcome:plan.outcome,
      mood:plan.mood, trust:plan.trust, patience:plan.patience, stage:plan.stage, memory:plan.memory,
      analysis:{quality:plan.quality,resolution:plan.resolution,missing:plan.missingPoints,note:plan.reason,answered:plan.answeredPoints,contradictions:plan.contradictions},
      controller:{decision:plan.nextAction,reason:plan.reason}
    });
  }catch(error){
    return json(res,200,fallback(error.message));
  }
}
