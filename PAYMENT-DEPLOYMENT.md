# Pagamento PIX BlackCat

O checkout usa `/api/blackcat` no servidor (função Node.js da Vercel) para criar cobranças PIX e consultar seu status. A chave privada nunca é enviada ao navegador. Documentação: https://docs.blackcatoficial.com/ .

## Condições confirmadas pelo vendedor

RelaxSound: R$ 18,90 por unidade. Frete grátis para todos os estados e Distrito Federal; prazo de entrega a confirmar com o vendedor. O servidor ignora preços enviados pelo navegador e calcula o total. O ventilador foi removido da venda.

Até 10 unidades por cor. O checkout envia `items: [{id, quantity}]`; os únicos identificadores permitidos são `relaxsound-preto` e `relaxsound-cinza`. Os preços vêm de `assets/produtos.js` no servidor. Identificadores removidos ou desconhecidos, linhas repetidas e quantidades inválidas são rejeitados antes de chamar a BlackCat. O formato antigo com apenas `quantity` não é mais aceito.

## Ativação na Vercel

1. Redefina as chaves no painel BlackCat: a chave anterior apareceu numa captura de tela. Não use a chave exposta.
2. Cadastre `BLACKCAT_API_KEY` como Secret no ambiente Production do projeto. Se for uma variável compartilhada da equipe, confirme sua disponibilidade no projeto.
3. Publique os arquivos atualizados com a raiz atual, sem framework ou comando de build. Não exclua `api/` da publicação. Use Node.js 22 ou superior.
4. Após mudar variáveis, faça um novo deployment.
5. Abra `/api/blackcat?action=config`. HTTP 200 confirma a configuração local; não valida a chave na BlackCat. A conta e a chave ainda precisam de verificação com o provedor, sem criação automática de cobranças de teste.

Somente `BLACKCAT_API_KEY` é obrigatória para este site. Não é necessária chave pública nem split para esse fluxo PIX.

Variáveis opcionais para alterar as condições confirmadas:

- `PAYMENT_SITE_URL`: origem HTTPS exata; padrão `https://loteria-taupe-iota.vercel.app`.
- `PAYMENT_SHIPPING_CENTS`: frete fixo por pedido em centavos; padrão `0`, conforme autorizado.
- `PAYMENT_ALLOWED_STATES`: UFs separadas por vírgula; padrão todos os estados e Distrito Federal.
- `PAYMENT_TOKEN_SECRET`: segredo independente de pelo menos 32 caracteres para assinar os recibos. Se ausente, o servidor deriva uma chave de assinatura por HMAC-SHA256 a partir da chave privada, com contexto próprio. Nesse caso, redefinir a chave privada invalida os recibos anteriores; consulte essas transações no painel do provedor.

Não coloque segredos no Git, no HTML ou no JavaScript público. O arquivo `.env.example` contém apenas um modelo, sem chave real.

## Funcionamento e limites

O checkout exige nome, e-mail, telefone, CPF válido e endereço para o produto físico. Esses dados são enviados ao gateway ao gerar a cobrança. Não são salvos no armazenamento do navegador. O vendedor acompanha as transações e endereços pelo painel BlackCat.

- `GET /api/blackcat?action=config`: preço, frete e UFs públicas, sem segredos.
- `POST /api/blackcat`: valida origem, JSON, comprador, quantidade e entrega; chama `/sales/create-sale` com `tangible: true`; retorna PIX copia e cola, ID e recibo assinado.
- `GET /api/blackcat?action=status&receipt=...`: verifica o recibo e consulta `/sales/{id}/status` na BlackCat; confere ID e valor antes de retornar o status.

O navegador guarda na sessão da aba apenas o código PIX, referência e recibo para permitir recuperação. O carrinho não é removido automaticamente. Nenhum status fornecido pelo navegador autoriza entrega.

Não há repetição automática da criação. Uma tentativa marca a sessão da aba; resposta perdida bloqueia nova criação nessa aba e orienta consultar o vendedor. Isso não é idempotência global: outra aba, outro dispositivo ou uma requisição direta ainda pode criar uma cobrança distinta. Em caso de timeout, verifique primeiro o painel BlackCat.

A consulta de pagamento é manual. Não há webhook, banco de pedidos, estoque, cálculo de frete por CEP ou despacho automático. Recibos de consulta expiram em sete dias; o PIX tem validade solicitada de um dia. O cadastro atual ainda informa modelo e voltagem a confirmar; conclua os dados e condições comerciais da loja antes de divulgar.

## Verificação

Com Node.js 22 ou superior:

    node tests/pagamento.test.cjs
    node tests/browser-smoke.cjs

Os testes usam respostas fictícias locais, sem dados de clientes e sem cobranças na BlackCat. O teste de navegador requer Chrome ou Edge. Um servidor HTTP estático permite visualizar o site, mas não executa as funções Node.js.
