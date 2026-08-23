# pi-pstack

Port privado e nativo do [pstack](https://github.com/cursor/plugins/tree/main/pstack) para o Pi. O pacote mantém o método verification-first: contexto de produto, feature maps, prova na superfície real, evals de skills e autonomia conquistada por evidência.

## Requisitos

- Pi `0.84.2` ou mais recente.
- `pi-subagents` `0.54.0` ou mais recente.
- `@howaboua/pi-ask` `0.0.5` ou mais recente.
- `pi-mcp-adapter` `2.27.0` ou mais recente para fluxos que consultam MCP.
- Bun para as ferramentas locais que o utilizam.
- `portless` para os fluxos locais que expõem serviços.
- Playwright Chromium para verificação de navegador.
- `github/gh-stack` como backend padrão de stacked PRs.
- Um provider externo de Slack e tracker, com suas credenciais e configuração, para os fluxos Benny.
- Graphite `gt` como pré-requisito externo somente quando o backend opcional for selecionado.

## Instalação

Instale as dependências do host uma vez:

```bash
pi install npm:pi-subagents@0.54.0
pi install npm:@howaboua/pi-ask@0.0.5
pi install npm:pi-mcp-adapter@2.27.0
```

Instale este pacote privado por uma tag ou commit fixo:

```bash
pi install https://github.com/shishiv/pi-pstack@<ref>
```

Para um único projeto, acrescente `-l`.

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
/skill:create-verification-skill
/skill:maintain-verification-skill
```

O modo sticky vale somente para a sessão ativa. Ele é restaurado pelo histórico da própria branch da sessão e não altera configurações globais.

## Cadeia de confiança

1. `create-verification-skill` registra o caminho real do usuário em um feature map.
2. O harness dirige a superfície real e captura screenshot, árvore de acessibilidade, DOM e trace.
3. Evals executam candidatos cegos entre modelos e aplicam assertions determinísticas antes do judge.
4. Uma revisão independente valida o mesmo `HEAD`.
5. O receipt reúne essas provas e fica vinculado ao SHA.
6. Somente um receipt completo pode liberar auto-merge.

## Stacked PRs

`gh stack` é o backend padrão. O adapter Graphite só aparece quando `gt` está instalado. O pacote apenas traduz operações para os CLIs oficiais. Ele não mantém um segundo grafo de branches.

## Benny

Benny é instalado por projeto em `.pi/pstack/benny/`. Sua configuração fica separada em `.pi/pstack/benny-config/`.

- `benny-triage` classifica relatos, deduplica tickets e responde apenas no thread original.
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

`npm run verify` é a suíte determinística local: não instala este pacote de um Git remoto e não executa julgamento por modelos ao vivo. O julgamento ao vivo é uma operação separada (`scripts/grade-live-eval.mjs`).

Para provar manualmente a distribuição do commit exato publicado no origin privado, usando as credenciais Git já configuradas:

```bash
npm run verify:pinned-git-install
```

Essa verificação cria um projeto npm temporário, instala `HEAD` por SHA, importa `@shishiv/pi-pstack/benny` com jiti e confirma que o pacote é descoberto pelo Pi. Ela é deliberadamente local/credenciada e não faz parte de `npm run verify` nem de CI determinístico; o `HEAD` precisa estar publicado no origin.

## Atualização do upstream

Leia [`UPSTREAM.md`](./UPSTREAM.md). Cada atualização compara o novo commit do upstream com o commit registrado, classifica cada mudança e executa os evals afetados antes da suíte completa. Não existe camada de compatibilidade com Cursor.
