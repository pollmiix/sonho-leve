# Sonho Leve — loja de ventiladores

Site em HTML, CSS e JavaScript, com checkout PIX BlackCat por função Node.js compatível com Vercel.

A loja vende a RelaxSound a R$ 18,90 nas cores preto e cinza, com cinco fotos na galeria e quatro imagens na descrição. A página inicial exibe diretamente o produto RelaxSound; o catálogo de modalidades e o ventilador foram retirados. O servidor rejeita novas compras do ventilador, e o navegador ignora itens removidos de carrinhos antigos.

- `index.html`: página inicial com o produto RelaxSound, cores, galeria e carrinho.
- `loja.html`: lista de produtos físicos; `relaxsound.html`: página da máscara Bluetooth.
- `assets/produtos.js`: catálogo de produtos e preços em centavos, compartilhado pelo navegador e servidor. O servidor aceita somente os identificadores cadastrados e recalcula os valores.
- `carrinho-loja.html`: quantidade, remoção e subtotal; o navegador guarda o produto e a quantidade.
- `checkout-loja.html`: comprador, entrega, total com frete, PIX copia e cola e consulta do pagamento.
- O resultado do PIX aparece dentro da etapa Pagamento, com QR Code, valor e botão de cópia. O QR é gerado localmente a partir do código retornado pela BlackCat usando `assets/vendor/qrcode-generator.js` (v2.0.4, MIT; licença ao lado do arquivo). A recuperação de uma cobrança na sessão restaura o mesmo QR e não cria outra transação. O teste de navegador decodifica o QR com `tests/vendor/jsQR.js` e compara seu conteúdo ao copia e cola.
- `api/blackcat.js`: integração de servidor, validação dos valores e recibos de consulta assinados.
- `previa.html`: visualização das páginas em diferentes tamanhos.

O pagamento permanece indisponível até configurar as variáveis obrigatórias e publicar a função de servidor. Siga `PAYMENT-DEPLOYMENT.md`. Nenhuma chave privada deve ser incluída nos arquivos do site. A integração não foi validada com credenciais reais.

A entrega é acompanhada pelo vendedor no painel do gateway; não existe despacho automático nem banco de pedidos neste projeto. Complete foto, modelo, voltagem, disponibilidade, identificação do vendedor, atendimento e políticas da loja.

## Desenvolvimento e verificação

`python -m http.server 8000` permite visualizar as páginas, mas não executa a API. O pagamento requer hospedagem com funções Node.js e as variáveis indicadas na documentação.

Com Node.js 22 ou superior, execute `node tests/pagamento.test.cjs` e `node tests/relaxsound-payment.test.cjs`. Para conferir o catálogo, execute `node tests/catalogo-browser.cjs`; para conferir produto, galeria, carrinho e checkout com vários produtos, execute `node tests/relaxsound-browser.cjs`. Os testes de navegador utilizam Edge e apenas pagamentos fictícios locais, sem cobranças reais.
![alt text](image.png)
