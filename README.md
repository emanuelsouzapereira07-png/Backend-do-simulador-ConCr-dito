# Backend — Central ConCrédito v14

Backend preparado para Vercel, Gemini e Supabase.

## Rotas principais

- `GET /api/health` — verifica se backend está online.
- `POST /api/analisar` — avaliação com Gemini.
- `GET/POST/PUT/DELETE /api/cases` — gerenciar casos.
- `GET/POST /api/results` — salvar e listar resultados.
- `GET/POST /api/audit` — histórico de alterações.
- `GET/POST /api/notifications` — notificações.
- `GET /api/stats` — estatísticas dos casos.

## Senhas padrão

- Painel de Casos: `casos2026`
- Painel Gestor: `gestor2026`

Podem ser configuradas na Vercel com:

- `CASE_PANEL_PASSWORD`
- `MANAGER_PANEL_PASSWORD`

## Variáveis de ambiente

Copie `.env.example` e configure na Vercel:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CASE_PANEL_PASSWORD`
- `MANAGER_PANEL_PASSWORD`

## Banco de dados

Execute o arquivo `supabase_schema.sql` no SQL Editor do Supabase.

## Como publicar

1. Suba esta pasta como repositório do backend.
2. Importe o repositório na Vercel.
3. Configure as variáveis de ambiente.
4. Execute o SQL no Supabase.
5. Use a URL da Vercel no frontend quando quiser integrar online.
