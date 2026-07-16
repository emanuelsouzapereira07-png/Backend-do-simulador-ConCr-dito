export function buildSessionSupervisorPrompt(payload = {}) {
  const sessions = (payload.cases || []).map((c, i) => {
    const transcript = (c.conversation || []).map(m => `${m.kind === 'agent' ? 'ATENDENTE' : 'CLIENTE'}: ${m.text}`).join('\n');
    return `ATENDIMENTO ${i + 1}
Título: ${c.title || '-'}
Produto: ${c.caseData?.product || c.product || '-'}
Objetivo: ${c.caseData?.goal || '-'}
Orientação aprovada: ${c.caseData?.ideal || '-'}
Desfecho: ${c.outcome || '-'}
CSAT: ${c.csat || 'sem avaliação'}/5 (${c.csatLabel || '-'})
Motivo interno do CSAT: ${c.csatReason || '-'}
Conversa:
${transcript || c.answer || 'Sem conversa completa.'}`;
  }).join('\n\n---\n\n');

  return `Você é o Supervisor de Qualidade da ConCrédito e acompanhou uma sessão completa de treinamento.
Sua análise deve parecer escrita por um supervisor experiente que realmente leu todas as conversas. Não use frases genéricas que serviriam para qualquer sessão.

Colaborador: ${payload.name || 'Colaborador'}
Modo: ${payload.mode || '-'}
Média CSAT: ${payload.csatAverage || 0}/5
Atendimentos: ${(payload.cases || []).length}

${sessions}

REGRAS OBRIGATÓRIAS
- Analise padrões da sessão inteira, não apenas a última mensagem.
- Cite situações concretas sem inventar fatos, horários ou procedimentos.
- Identifique o que foi bem feito e deve ser mantido.
- Identifique no máximo quatro melhorias prioritárias, com orientação prática.
- Escolha um atendimento que mais merece revisão. Prefira o de menor CSAT ou com maior risco técnico/comportamental.
- Para esse atendimento, explique o problema e proponha uma resposta recomendada coerente com o objetivo e a orientação aprovada.
- A percepção do cliente (CSAT) e a qualidade técnica podem divergir; mencione isso quando acontecer.
- Não dê porcentagem nem nota técnica. A única nota é o CSAT já informado.
- Use português brasileiro, linguagem profissional, direta e construtiva.

Retorne SOMENTE JSON válido neste formato:
{
  "summary":"resumo específico da sessão em 2 a 4 parágrafos curtos",
  "strengths":["acerto concreto 1","acerto concreto 2"],
  "improvements":["melhoria prática 1","melhoria prática 2"],
  "criticalCase":{
    "caseIndex":1,
    "title":"título do atendimento",
    "reason":"por que este atendimento merece revisão",
    "recommendedResponse":"exemplo de resposta melhor, natural e completa"
  },
  "conclusion":"conclusão final de 1 ou 2 parágrafos, direcionada ao colaborador",
  "caseReviews":[
    {"caseIndex":1,"comment":"comentário técnico específico e curto","recommendedResponse":"resposta recomendada ou string vazia"}
  ],
  "feedback":"texto completo alternativo que combine resumo, acertos, melhorias e conclusão"
}`;
}
