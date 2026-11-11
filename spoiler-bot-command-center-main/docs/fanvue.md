# Integração Fanvue

A integração é opcional e limitada às contas que um administrador liberar em **Administração → Contas cadastradas**. Sem liberação, conexão e ativação de vendas, o gateway já usado pela conta continua sendo utilizado.

## Preparação do app Fanvue

1. Crie o app na área de desenvolvedores Fanvue e confirme que a categoria e os produtos da conta estão expressamente autorizados para checkout links. Não habilite a integração se a Fanvue não aprovar essa categoria.
2. Cadastre a redirect URI exata: `https://SEU-DOMINIO/api/public/fanvue/callback`.
3. Configure os escopos OAuth `read:self`, `read:creator`, `write:creator` e `offline_access`.
4. Configure no servidor (nunca no navegador):
   - `FANVUE_CLIENT_ID`
   - `FANVUE_CLIENT_SECRET`
   - `FANVUE_REDIRECT_URI` com a URI exata acima
   - `FANVUE_TOKEN_ENCRYPTION_KEY`, uma chave aleatória de 32 bytes codificada em Base64. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   - `PUBLIC_BASE_URL` como domínio público HTTPS do app, se o serviço não o detectar automaticamente.
5. Aplique a migration `20261109110000_fanvue_checkout_beta.sql` no Supabase.
6. Libere a conta do lojista no painel admin. Ele conecta sua própria conta Fanvue em **Gateways** e define o preço USD de cada plano.
7. Mantenha `FANVUE_LIVE_CHECKOUT_ENABLED=false` até a aprovação da conta/produtos e a validação do app. Só então, se permitido, configure `true` no servidor e ative as vendas no painel.

O callback cadastra automaticamente o webhook `https://SEU-DOMINIO/api/public/fanvue/webhook` para os eventos de aprovação, falha e reembolso. Não cadastre uma segunda inscrição manual para esse mesmo fluxo.

## Comportamento

- O preço brasileiro atual do plano permanece separado do preço base Fanvue em USD.
- O checkout oficial Fanvue determina a apresentação local e os métodos disponíveis para cada comprador. O sistema não detecta país nem promete que um método específico estará habilitado pela Fanvue.
- Enquanto a conta não ativar vendas Fanvue, o fluxo atual permanece inalterado. Ao ativar, novas compras desse lojista usam Fanvue no site e Telegram; o Bot-Taxa não é aplicado a pedidos Fanvue.
- Uma confirmação só libera acesso após evento assinado. A volta do comprador do checkout não confirma pagamento.
- Ao pausar vendas, novos pedidos deixam de usar Fanvue; webhooks continuam ativos para concluir pedidos já iniciados.
- Tokens OAuth e segredos de webhook são criptografados com AES-256-GCM no backend. A chave de criptografia deve permanecer estável e secreta; perdê-la exige reconectar as contas.

## Escopos e revisão

Se a Fanvue mantiver escopos novos como pendentes, atualize a configuração OAuth do app conforme o painel da Fanvue e aguarde a revisão. Criadores que autorizaram o app antes da aprovação podem precisar autorizar novamente. A integração não contorna a revisão nem as regras de conteúdo da plataforma.
