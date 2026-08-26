# pi-pstack

Port público, independente e nativo para Pi do [pstack](https://github.com/cursor/plugins/tree/main/pstack).

> **Origem e créditos:** o pstack original foi criado por [Lauren Tan (@poteto)](https://github.com/poteto) e é publicado no repositório [`cursor/plugins`](https://github.com/cursor/plugins/tree/main/pstack). Este projeto adapta o pstack para o runtime do Pi. Ele não é uma distribuição oficial da Poteto nem do Cursor.

O `pi-pstack` preserva o método verification-first do projeto original: contexto de produto, feature maps, prova na superfície real, evals de skills, revisão independente e autonomia conquistada por evidência. A implementação usa contratos nativos do Pi, sem camada de compatibilidade com Cursor.

## O que está incluído

- 44 skills e 22 playbooks portados para Pi.
- Os agentes upstream `poteto-agent` e `comment-sicko`.
- Um `benny-coordinator` restrito para executar automações sem entregar credenciais a child agents.
- `/poteto-mode` persistente durante a sessão ativa.
- Feature maps, artifacts de navegador e receipts vinculados ao `HEAD` exato.
- Evals cegos entre modelos, com hard assertions que o judge não pode ignorar.
- Stacked PRs com `gh stack`.
- Benny em modo draft-only: ele pode preparar uma draft PR, mas nunca faz merge ou deploy.

## Requisitos

- Pi `0.84.2` ou mais recente.
- `pi-subagents` `0.54.0` ou mais recente.
- `@howaboua/pi-ask` `0.0.5` ou mais recente.
- `pi-mcp-adapter` `2.27.0` ou mais recente para fluxos que consultam MCP.
- Bun para as ferramentas locais que o utilizam.
- `portless` para fluxos locais que expõem serviços.
- Playwright Chromium para verificação de navegador.
- `github/gh-stack` como backend de stacked PRs.
- Um provider externo de Slack e tracker para executar Benny contra serviços reais.

## Instalação

Instale as dependências do host uma vez:

```bash
pi install npm:pi-subagents@0.54.0
pi install npm:@howaboua/pi-ask@0.0.5
pi install npm:pi-mcp-adapter@2.27.0
```

Instale uma tag ou commit fixo deste repositório:

```bash
pi install https://github.com/shishiv/pi-pstack@v0.2.0
```

Para instalar somente no projeto atual, acrescente `-l`. O pacote é distribuído por Git e não é publicado no registry do npm.

## Uso

```text
/poteto-mode on
/poteto-mode implemente a mudança e prove o fluxo real
/poteto-mode status
/poteto-mode off
```

As demais skills seguem a sintaxe nativa do Pi:

```text
/skill:how
/skill:interrogate
/skill:pstack-tdd
/skill:pstack-teach
/skill:pstack-reflect
/skill:create-verification-skill
/skill:maintain-verification-skill
```

As skills `pstack-tdd`, `pstack-teach` e `pstack-reflect` usam prefixo para coexistir com skills globais de mesmo propósito.

O modo sticky vale somente para a sessão ativa. O Pi restaura o estado pelo histórico da própria branch da sessão e não altera configurações globais.

## Cadeia de confiança

1. `create-verification-skill` registra o caminho real da pessoa usuária em um feature map.
2. O harness dirige a superfície real e captura screenshot, árvore de acessibilidade, DOM e trace.
3. Evals executam candidatos cegos entre modelos e aplicam assertions determinísticas antes do judge.
4. Uma revisão independente valida o mesmo `HEAD`.
5. O receipt reúne essas provas e fica vinculado ao SHA.
6. O merge atômico exige um receipt válido e checks verdes para cada PR incluído.

## Stacked PRs

`gh stack` é o backend de delivery. O pacote traduz operações para o CLI oficial e não mantém um segundo grafo de branches.

O merge atômico exige um receipt por PR até o alvo. Gere cada receipt no checkout limpo do respectivo `HEAD` e mantenha os artifacts em caminhos imutáveis disponíveis durante a validação final. Se um digest de uma camada anterior não estiver disponível no checkout atual, o merge falha fechado.

## Benny

Benny é instalado por projeto em `.pi/pstack/benny/`. A configuração fica separada em `.pi/pstack/benny-config/`.

- `benny-triage` classifica relatos, deduplica tickets e responde somente no thread original.
- `benny-reproduce` exige duas reproduções independentes pela UI antes de tentar uma correção.
- Workers não recebem credenciais nem ações de escrita para Slack.
- Benny pode abrir uma draft PR. Ele nunca faz merge nem deploy.

Os schedules ficam desativados até configuração, capability preflight e aprovação explícita.

## Desenvolvimento e prova

```bash
npm install
npm run verify:deterministic
npm run verify:browser
npm run verify
```

`npm run verify` executa a suíte determinística local. O julgamento ao vivo entre modelos é uma operação separada, executada por `scripts/grade-live-eval.mjs`.

Para provar que o commit atual pode ser instalado pelo Git:

```bash
npm run verify:pinned-git-install
```

Essa verificação cria um projeto npm temporário, instala o `HEAD` por SHA, importa `@shishiv/pi-pstack/benny` com jiti e confirma que o Pi descobre o pacote.

## Upstream e licença

O port usa como base o pstack `0.14.2`, no commit upstream [`4612556`](https://github.com/cursor/plugins/commit/46125561306434d8a1d7745d540d8932ab0cd2a2). Consulte [`UPSTREAM.md`](./UPSTREAM.md) para o contrato de sincronização manual e a proveniência detalhada.

O código é distribuído sob a licença MIT. O arquivo [`LICENSE`](./LICENSE) preserva os créditos do projeto original e deste port.
