import { cors, json } from './_utils.js';
import { generateJson } from '../lib/ai-router.js';

const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(Number(n))?Number(n):min));
const text=(v,max=1200)=>String(v??'').trim().slice(0,max);

function fallback(payload=null){
  const safeReason='IA principal temporariamente indisponível. O atendimento continuou pelo modo de contingência.';
  const last=text(payload?.lastAgentMessage,1800).toLowerCase();
  const product=text(payload?.caseData?.product,120).toLowerCase();
  const title=text(payload?.caseData?.title,200).toLowerCase();
  const recent=(payload?.history||[]).filter(m=>m.author==='cliente').slice(-8).map(m=>String(m.text||'').toLowerCase());

  const pick=(options)=>{
    const found=options.find(x=>!recent.includes(x.toLowerCase()));
    return found||options[options.length-1];
  };

  let message='Você pode me explicar melhor como vamos seguir com o meu caso?';
  let stage='entendimento';
  let resolution='parcial';
  let missing=['próximo passo claro'];
  let decision='pedir_esclarecimento';
  let quality=45;

  const isVehicle=/ve[ií]culo|carro|refinanciamento/.test(`${product} ${title}`);
  const asksDocs=/document|crlv|renavam/.test(last);
  const asksCpf=/cpf|dados pessoais|nome completo/.test(last);
  const saysPossible=/\b(sim|consegue|é possível|podemos|dá para)\b/.test(last);
  const mentionsAnalysis=/an[aá]lis|simula|consulta/.test(last);
  const mentionsValue=/valor|parcela|taxa|libera/.test(last);
  const tooShort=last.length<18;

  if(isVehicle){
    if(asksDocs){
      message=pick([
        'Certo. Quais documentos do veículo e pessoais eu preciso enviar?',
        'Tudo bem. Você pode listar a documentação necessária e dizer por onde devo enviar?',
        'Quais documentos exatamente você precisa para fazer a análise?'
      ]);
      stage='verificacao'; quality=62; missing=['lista de documentos','canal de envio']; decision='fazer_pergunta_coerente';
    }else if(asksCpf){
      message=pick([
        'Certo, posso informar o CPF. Você precisa de mais algum dado para consultar?',
        'Tudo bem. Além do CPF, qual outra informação você precisa para verificar?'
      ]);
      stage='verificacao'; quality=66; missing=['demais dados necessários']; decision='aceitar_proximo_passo';
    }else if(saysPossible){
      message=pick([
        'Certo. Como funciona o refinanciamento e quais documentos preciso enviar?',
        'Entendi. Qual é o próximo passo para fazer uma simulação com o veículo quitado?'
      ]);
      stage='duvida'; quality=58; missing=['explicação do processo','documentos']; decision='fazer_pergunta_coerente';
    }else if(mentionsAnalysis){
      message=pick([
        'Certo. O que você precisa para fazer essa análise?',
        'Tudo bem. Como faço para iniciar a simulação?'
      ]);
      stage='verificacao'; quality=60; missing=['dados para análise']; decision='aceitar_proximo_passo';
    }else if(mentionsValue){
      message=pick([
        'Entendi. Esse valor depende da avaliação do veículo ou da minha renda?',
        'Certo. Como vocês calculam o valor que pode ser liberado?'
      ]);
      stage='duvida'; quality=57; missing=['critério do valor']; decision='fazer_pergunta_coerente';
    }else if(tooShort){
      message=pick([
        'Você pode me explicar melhor como funciona e o que preciso fazer agora?',
        'Não entendi muito bem. Qual é o próximo passo para eu conseguir uma simulação?'
      ]);
      quality=30; missing=['explicação clara','próximo passo']; decision='pedir_esclarecimento';
    }else{
      message=pick([
        'Entendi. Então qual é o próximo passo para dar andamento?',
        'Certo. O que você precisa de mim para continuar a análise?'
      ]);
    }
  }else if(asksDocs){
    message=pick([
      'Certo. Quais documentos exatamente eu preciso enviar?',
      'Tudo bem. Você pode listar os documentos e dizer por onde devo enviar?'
    ]);
    stage='verificacao'; quality=60; missing=['documentos necessários']; decision='fazer_pergunta_coerente';
  }else if(asksCpf){
    message=pick([
      'Certo, posso informar o CPF. Você precisa de mais algum dado?',
      'Tudo bem. Além do CPF, o que mais você precisa para consultar?'
    ]);
    stage='verificacao'; quality=64; decision='aceitar_proximo_passo'; missing=['demais dados necessários'];
  }else if(tooShort){
    message=pick([
      'Você pode me explicar melhor o que devo fazer agora?',
      'Não entendi. Qual é o próximo passo no meu caso?'
    ]);
    quality=30;
  }else{
    message=pick([
      'Entendi. O que você precisa de mim para seguir com o atendimento?',
      'Certo. Qual é o próximo passo para resolver isso?'
    ]);
  }

  return {
    ok:true,
    fallback:true,
    message,
    end:false,
    outcome:'em andamento',
    mood:'confuso',
    trust:45,
    patience:55,
    stage,
    memory:{facts:[],questionsAnswered:[],openQuestions:missing},
    analysis:{quality,resolution,missing,note:safeReason},
    controller:{decision,reason:'Modo de contingência local contextual acionado automaticamente.'}
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
11. Se end=true, encerre de forma definitiva e natural, sem fazer nenhuma pergunta nova:
   - encerrar_sucesso: confirme que ficou claro/resolvido e agradeça brevemente.
   - encerrar_desistencia: diga que não continuará ou que buscará outra alternativa e finalize.
   Nunca use ponto de interrogação quando end=true.

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
  return applyAutomaticEndingRules(plan,p);
}

function currentTurnCount(p){
  const historyTurns=p.history.filter(m=>m.author==='atendente').length;
  return Math.max(Number(p.state.turns)||0,historyTurns);
}

function applyAutomaticEndingRules(plan,p){
  const turns=currentTurnCount(p);
  const resolvedWell=plan.resolution==='resolveu' && plan.quality>=82;
  const excellentPartial=plan.resolution==='parcial' && plan.quality>=92 && plan.missingPoints.length===0;
  const acceptedClearStep=plan.nextAction==='aceitar_proximo_passo' && plan.quality>=88 && plan.missingPoints.length<=1;
  const severeFailure=['rude','promessa_indevida'].includes(plan.resolution);
  const veryBad=plan.quality<=20 || plan.trust<=10 || plan.patience<=8;
  const repeatedWeak=turns>=4 && plan.quality<=30 && plan.trust<=25;

  if(resolvedWell || excellentPartial || acceptedClearStep){
    plan.end=true;
    plan.outcome='concluiu';
    plan.nextAction='encerrar_sucesso';
    plan.stage='fechamento';
    plan.mood='satisfeito';
    plan.trust=Math.max(plan.trust,82);
    plan.patience=Math.max(plan.patience,45);
    plan.reason='O atendente resolveu o objetivo do cliente ou apresentou um próximo passo claro e suficiente.';
    return plan;
  }

  if(severeFailure || veryBad || repeatedWeak){
    plan.end=true;
    plan.outcome=plan.patience<=8?'perdeu paciência':'desistiu';
    plan.nextAction='encerrar_desistencia';
    plan.stage='fechamento';
    plan.mood=plan.resolution==='rude'?'irritado':'desconfiado';
    plan.trust=Math.min(plan.trust,12);
    plan.patience=Math.min(plan.patience,10);
    plan.reason=severeFailure
      ? 'O atendimento teve uma falha grave que tornou inadequado continuar.'
      : 'A resposta foi muito fraca ou a confiança/paciência do cliente chegou ao limite.';
    return plan;
  }

  // Trava de segurança contra conversas infinitas.
  if(turns>=8){
    const reasonablySolved=plan.quality>=60 && ['resolveu','parcial'].includes(plan.resolution);
    plan.end=true;
    plan.stage='fechamento';
    if(reasonablySolved){
      plan.outcome='concluiu';
      plan.nextAction='encerrar_sucesso';
      plan.mood='satisfeito';
      plan.reason='O limite máximo de turnos foi atingido e o atendimento apresentou solução suficiente.';
    }else{
      plan.outcome='desistiu';
      plan.nextAction='encerrar_desistencia';
      plan.mood=plan.patience<=25?'irritado':'desconfiado';
      plan.reason='O limite máximo de turnos foi atingido sem solução suficiente para o cliente.';
    }
  }

  return plan;
}

function forceFinalMessage(message,plan){
  if(!plan.end) return message;
  let m=String(message||'').replace(/\?/g,'.').replace(/\s+/g,' ').trim();
  const asksSomething=/\b(como|qual|quais|quando|onde|pode|consegue|preciso|devo)\b.*[.?]?$/i.test(m);
  if(plan.nextAction==='encerrar_sucesso'){
    if(!m || asksSomething) return 'Perfeito, agora ficou tudo claro. Obrigado pelo atendimento!';
    if(!/[.!]$/.test(m)) m+='.';
    return m;
  }
  if(plan.nextAction==='encerrar_desistencia'){
    if(!m || asksSomething) return 'Entendi. Nesse caso, não vou continuar e vou buscar outra alternativa. Obrigado.';
    if(!/[.!]$/.test(m)) m+='.';
    return m;
  }
  return m;
}

function sanitizeMessage(message,p,plan){
  let m=forceFinalMessage(text(message,700).replace(/\s+/g,' ').trim(),plan);
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
  if(plan.end && /\?/.test(m)) m=forceFinalMessage('',plan);
  return m;
}

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return json(res,405,fallback());
  const payload=safePayload(req.body||{});
  if(!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) return json(res,200,fallback(payload));
  if(!payload.lastAgentMessage) return json(res,400,fallback(payload));
  try{
    const { data: rawPlan, provider: controllerProvider } = await generateJson(controllerPrompt(payload),{temperature:.15,maxOutputTokens:1800});
    const plan=validatePlan(rawPlan,payload);
    let generated;
    try{
      ({ data: generated } = await generateJson(clientPrompt(payload,plan),{temperature:.72,maxOutputTokens:500}));
      generated.message=sanitizeMessage(generated.message,payload,plan);
    }catch(firstError){
      const retryPrompt=clientPrompt(payload,{...plan,reason:`${plan.reason}. REVISÃO OBRIGATÓRIA: evite repetição, mistura de produto e reclamação de demora sem base.`});
      ({ data: generated } = await generateJson(retryPrompt,{temperature:.45,maxOutputTokens:500}));
      generated.message=sanitizeMessage(generated.message,payload,plan);
    }
    return json(res,200,{
      ok:true, message:generated.message, end:plan.end, outcome:plan.outcome,
      mood:plan.mood, trust:plan.trust, patience:plan.patience, stage:plan.stage, memory:plan.memory,
      analysis:{quality:plan.quality,resolution:plan.resolution,missing:plan.missingPoints,note:plan.reason,answered:plan.answeredPoints,contradictions:plan.contradictions},
      controller:{decision:plan.nextAction,reason:plan.reason,provider:controllerProvider}
    });
  }catch(error){
    console.error('[cliente] Falha na IA principal:', error?.message||error);
    return json(res,200,fallback(payload));
  }
}
