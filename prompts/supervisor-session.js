export function buildSessionSupervisorPrompt(payload = {}) {
  const sessions = (payload.cases || []).map((c, i) => {
    const transcript = (c.conversation || []).map(m => `${m.kind === 'agent' ? 'ATENDENTE' : 'CLIENTE'}: ${m.text}`).join('\n');
    return `ATENDIMENTO ${i + 1}
Caso: ${c.title || '-'}
Produto: ${c.caseData?.product || c.product || '-'}
Objetivo: ${c.caseData?.goal || '-'}
Desfecho: ${c.outcome || '-'}
CSAT: ${c.csat || 'sem avaliação'}/5
Conversa:
${transcript || c.answer || 'Sem conversa completa.'}`;
  }).join('\n\n---\n\n');
  return `Você é o Supervisor de Qualidade da ConCrédito. Analise todos os atendimentos de uma sessão de treinamento como um supervisor experiente, e não como um corretor que compara frases com uma resposta oficial.

Colaborador: ${payload.name || 'Colaborador'}
Modo: ${payload.mode || '-'}
Média CSAT: ${payload.csatAverage || 0}/5
Atendimentos: ${(payload.cases || []).length}

${sessions}

Escreva um feedback único, útil e humano, em português brasileiro, com aproximadamente 4 a 7 parágrafos curtos. Analise a conversa inteira e os padrões da sessão. Mencione acertos concretos que devem ser mantidos, oportunidades concretas de melhoria e explique como melhorar nos próximos atendimentos. Considere procedimentos, segurança da informação, clareza, próximo passo, empatia e recuperação comercial quando aplicável. Não invente fatos. Não atribua porcentagem nem nota técnica. Não use listas, títulos ou markdown no texto.

Retorne somente JSON válido:
{"feedback":"texto completo do supervisor"}`;
}
