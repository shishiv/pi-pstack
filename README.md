# pi-pstack

Pacote independente de workflows verification-first para Pi.

O `pi-pstack` reúne contexto de produto, feature maps, prova na superfície real, evals de skills, revisão independente e autonomia conquistada por evidência. A proveniência do projeto fica isolada em [`UPSTREAM.md`](./UPSTREAM.md).

## O que está incluído

- 44 skills e 22 playbooks portados para Pi.
- Prompts opcionais para os papéis `poteto-agent`, `comment-sicko` e `benny-coordinator`.
- Delegação essencial por recursos do host no Herdr e por subprocesso Pi local nos demais ambientes.
- `/poteto-mode` persistente durante a sessão ativa.
- Feature maps, artifacts de navegador e receipts vinculados ao `HEAD` exato.
- Evals cegos entre modelos, com hard assertions que o judge não pode ignorar.
- Entrega em stacked PRs quando um backend compatível está disponível.
- Benny em modo draft-only: ele pode preparar uma draft PR, mas nunca faz merge ou deploy.

## Requisitos

- Pi `0.84.2` ou mais recente.

Delegação é parte essencial do pstack. O runtime segue [`docs/delegation.md`](./docs/delegation.md) e trata `HERDR_ENV` apenas como pista. Ele prefere os agents do host ou a CLI do Herdr somente quando essa capacidade está ativa e verificável. Caso contrário, inclusive dentro do Herdr, usa `pstack_delegate`, o fallback local de subprocesso Pi. Navegador, fontes externas, agendamento e entrega são capacidades opcionais. Playwright, backends de stack e providers de Slack ou tracker só são necessários para os fluxos que os utilizam.

## Instalação

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
3. Evals podem executar candidatos cegos entre modelos e aplicam assertions determinísticas antes do judge.
4. Uma revisão independente valida o mesmo `HEAD`.
5. O receipt reúne essas provas e fica vinculado ao SHA.
6. O merge atômico exige um receipt válido e checks verdes para cada PR incluído.

## Stacked PRs

O fluxo de entrega usa apenas um backend que o ambiente disponibilize e que passe pelo preflight. Os adapters opcionais traduzem operações para os CLIs oficiais e não mantêm um segundo grafo de branches.

O merge atômico exige um receipt por PR até o alvo. Gere cada receipt no checkout limpo do respectivo `HEAD` e mantenha os artifacts em caminhos imutáveis disponíveis durante a validação final. Se um digest de uma camada anterior não estiver disponível no checkout atual, o merge falha fechado.

## Benny

Benny é instalado por projeto em `.pi/pstack/benny/`. A configuração fica separada em `.pi/pstack/benny-config/`.

- `benny-triage` classifica relatos, deduplica tickets e responde somente no thread original.
- `benny-reproduce` exige duas reproduções independentes pela UI antes de tentar uma correção.
- Workers não recebem credenciais nem ações de escrita para Slack.
- Benny pode abrir uma draft PR. Ele nunca faz merge nem deploy.

Agendamento é opcional. Sem scheduler disponível, Benny continua executável sob demanda. Qualquer schedule permanece desativado até configuração, capability preflight e aprovação explícita.

## Desenvolvimento e prova

```bash
npm install
npm run verify
```

`npm run verify` executa os checks do pacote e as integrações locais com Pi, navegador e Benny. Upstream tools que exigem Bun, a CLI de entrega, providers externos e o eval ao vivo são opt-in. O eval ao vivo usa `scripts/grade-live-eval.mjs`.

Para provar que o commit atual pode ser instalado pelo Git:

```bash
npm run verify:pinned-git-install
```

Essa verificação cria um projeto npm temporário, instala o `HEAD` por SHA, importa `@shishiv/pi-pstack/benny` com jiti e confirma que o Pi descobre o pacote.

## Upstream e licença

Consulte [`UPSTREAM.md`](./UPSTREAM.md) para o contrato de sincronização manual e a proveniência detalhada.

O código é distribuído sob a licença MIT. O arquivo [`LICENSE`](./LICENSE) preserva os créditos do projeto original e deste port.
