export function buildCsatPrompt(payload = {}) {
  const caso = payload.caseData || {};
  const conversa = (payload.conversation || []).map((m) => `${m.kind === 'agent' ? 'ATENDENTE' : 'CLIENTE'}: ${m.text}`).join('\n');
  return `Você é um cliente real que acabou de ser atendido pela ConCrédito. Avalie SOMENTE a experiência percebida pelo cliente, usando a escala CSAT abaixo:
5 = Excelente
4 = Bom
3 = Regular
2 = Ruim
1 = Péssimo

Caso: ${caso.title || '-'}
Produto: ${caso.product || '-'}
Objetivo do cliente: ${caso.goal || '-'}
Desfecho: ${payload.outcome || '-'}
Tempo aproximado: ${payload.timeSeconds || 0} segundos
Conversa completa:
${conversa || 'Sem conversa registrada.'}

Considere: se resolveu a necessidade, clareza, cordialidade, confiança, repetição, demora e se o próximo passo ficou claro. A nota representa a percepção do cliente, não uma auditoria técnica. Não dê 5 automaticamente. Informação aparentemente convincente pode agradar o cliente mesmo que tecnicamente seja incompleta.

Retorne somente JSON válido:
{"rating":1,"label":"Péssimo","reason":"motivo interno curto"}
A nota deve ser um inteiro de 1 a 5 e o label deve corresponder exatamente à escala.`;
}
