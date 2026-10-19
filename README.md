# D'Napoles — app de pedidos da rede

App próprio da D'Napoles (3 lojas em João Pessoa/PB): pedidos pelo celular (PWA), roteamento automático para a loja certa, painel ao vivo por loja, cozinha (KDS), comanda 80 mm e painel de configurações onde tudo é editável.

Arquitetura e decisões: [`ARCHITECTURE.md`](../ARCHITECTURE.md) (pasta acima, Fase 0).

## Subir localmente (Docker)

```bash
docker compose up --build
```

- App do cliente: http://localhost:3000
- Painel: http://localhost:3000/login

No primeiro start o banco é criado e recebe o seed (3 lojas reais, cardápio inicial, usuários). Localmente as lojas ficam sempre abertas e o PIX é simulado (botão "Simular pagamento"), para testar a qualquer hora.

### Usuários iniciais (senha `dnapoles123`, troque no painel em Equipe)

| Usuário | Acesso |
|---|---|
| `dono@dnapoles.local` | Tudo, nas 3 lojas |
| `gerente.cristo@dnapoles.local` / `gerente.manaira@…` / `gerente.bancarios@…` | Configurações da própria loja |
| `atendente.cristo@dnapoles.local` / `atendente.manaira@…` / `atendente.bancarios@…` | Pedidos e KDS da própria loja |
| `cozinha.cristo@dnapoles.local` / `cozinha.manaira@…` / `cozinha.bancarios@…` | Só o KDS da própria loja |

## O que tem nesta fase

- **Cliente (PWA instalável):** escolhe entrega (bairro + endereço) ou retirada; o sistema escolhe a loja com menor tempo estimado (fila da cozinha + preparo + área); montador de pizza tamanho → até 3 sabores → tirar ingrediente → borda → adicionais; combos; carrinho; PIX, cartão ou dinheiro com troco; acompanhamento ao vivo.
- **Painel da loja:** pedidos ao vivo com alerta sonoro, confirmar, cancelar com motivo, saiu/entregue, pausar a loja com 1 clique (clientes vão para a próxima loja que entrega), transferir pedido entre lojas (dono), comanda 80 mm.
- **KDS:** tela escura com botões grandes, ordem por horário, destaque para "SEM CEBOLA", desfazer em 10 s.
- **Configurações (tudo editável):** dados e horários de cada loja; áreas de entrega por bairro, raio ou desenho no mapa; conta de recebimento por loja (credenciais cifradas); impressoras; cardápio central (tamanhos, faixas de preço, sabores, bordas, adicionais, produtos, combos por dia da semana, regra da meio a meio); ajustes por loja (preço, esgotado, exclusivo); equipe e papéis.
- **Segurança:** cada atendente só vê a própria loja (checado no servidor em toda consulta); preço sempre recalculado no servidor; LGPD: opt-in de marketing separado e desmarcado.

## Desenvolvimento

```bash
cp .env.example .env              # ajuste DATABASE_URL e REDIS_URL
npm install
npx prisma migrate deploy && npm run db:seed
npm run dev
npm test                          # regras de preço, frete, roteamento, horário, comanda
npx next build && npm run test:e2e   # fluxo completo no navegador (Playwright)
```

## Rodar na nuvem

A mesma imagem Docker roda em qualquer nuvem. Precisa de: um Postgres 16, um Redis 7 (opcional se rodar uma única instância) e estas variáveis:

| Variável | Produção |
|---|---|
| `DATABASE_URL` | URL do Postgres gerenciado |
| `REDIS_URL` | URL do Redis (opcional com 1 instância) |
| `APP_SECRET` | Texto aleatório longo (ex.: `openssl rand -base64 48`). Obrigatório. |
| `APP_URL` | `https://pedidos.seudominio.com.br` |
| `DEMO_ALWAYS_OPEN` | `false` |
| `ENABLE_FAKE_PAYMENTS` | `false` quando o gateway real estiver integrado |
| `SEED_PASSWORD` | Senha inicial dos usuários (troque depois) |

O container aplica as migrações e o seed (só se o banco estiver vazio) ao iniciar. Health check: `GET /api/health`.

### Teste gratuito — Render (link público, sem cartão)
1. Suba este código para um repositório no GitHub.
2. Em render.com, entre com o GitHub e clique em **New → Blueprint**, escolhendo o repositório. O `render.yaml` cria o app e o banco no plano gratuito.
3. Ao terminar, o Render mostra o link `https://dnapoles-xxxx.onrender.com`.

Limites do plano gratuito: o app "dorme" após 15 min sem acesso (o primeiro acesso depois disso leva cerca de 1 min) e o Postgres gratuito expira em 30 dias.

### Outras opções pagas (Railway, Fly.io etc.)
A mesma imagem Docker funciona; basta configurar as variáveis acima.

### Opção C — VPS no Brasil (ex.: Hostinger, Magalu Cloud, AWS São Paulo)
Instale Docker, copie o projeto, crie um `.env` com as variáveis de produção e rode `docker compose up -d --build`, com um proxy HTTPS (Caddy ou Nginx) na frente. Faça backup diário do volume `pgdata`.

## Próximas fases

Integração do PIX real (gateway escolhido pelo dono), WhatsApp com agente de IA (Fase 2), entregadores, CRM e fidelidade (Fase 3), dashboards e estoque (Fase 4).
