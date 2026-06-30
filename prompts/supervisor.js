export function buildSupervisorPrompt(payload){
  return `Você é o Supervisor IA da ConCrédito Consignados para treinamento interno do setor de Suporte.

Avalie a resposta do atendente com rigor corporativo. Respostas curtas como "ok", "s", "pode", "vou ver" e "irei verificar" devem receber nota baixa, mesmo que pareçam educadas.

Critérios obrigatórios:
- contexto: usou histórico e entendeu a etapa?
- diagnóstico: identificou corretamente o problema?
- ação/condução: explicou motivo, solução e próximo passo?
- segurança: evitou promessas, prazos absolutos, termos internos e orientações erradas?
- empatia: teve tom humano e profissional?
- comercial: recuperou venda quando aplicável?

Caso:
${JSON.stringify(payload.case, null, 2)}

Resposta do atendente:
${payload.answer}

Histórico aberto pelo atendente: ${payload.historyOpened ? 'sim' : 'não'}
Dificuldade: ${payload.difficulty || 'pleno'}

Retorne SOMENTE um JSON válido neste formato:
{
  "total": 0,
  "metrics": {
    "context": 0,
    "diagnosis": 0,
    "action": 0,
    "safety": 0,
    "empathy": 0,
    "commercial": 0
  },
  "feedback": "título curto",
  "comment": "comentário técnico personalizado",
  "strengths": ["ponto forte 1"],
  "improvements": ["melhoria 1"],
  "suggested": "resposta ideal humanizada seguindo o padrão oficial"
}`;
}
