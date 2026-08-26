# Plano de implementação: pi-pstack + pbrain

## Visão geral

Evoluir o pi-pstack para usar memória durável do pbrain sem fundir os dois produtos. O pi-pstack continua dono de execução, verificação, receipts e entrega. O pbrain continua dono do vault `brain/**`, contexto, reflexão, planejamento e revisão orientada por princípios. A integração entra por uma interface pequena e opcional: descobrir capacidade, ler contexto autorizado e publicar candidatos de aprendizado para confirmação explícita.

## Estado verificado

- pi-pstack está em `main`, limpo, versão `0.2.0`, com 44 skills, 22 playbooks, extensão `poteto-mode`, evidence receipts e entrega protegida.
- pbrain está no branch limpo `namespace-package-skills`, versão `0.2.0`, com uma extensão e seis skills prefixadas.
- Ambos exigem Pi `>=0.84.2`, pi-subagents `>=0.54.0` e `@howaboua/pi-ask >=0.0.5`.
- Não há colisão nominal entre os diretórios de skills atuais.
- Há sobreposição conceitual: princípios do pi-pstack também aparecem no starter vault do pbrain. Carregar os dois indiscriminadamente desperdiça contexto e cria duas fontes de verdade.
- O pbrain já injeta contexto via `before_agent_start`; o poteto-mode também altera o prompt nesse evento. A integração precisa provar composição independente da ordem de carregamento.

## Delta source-first para T1/T2

A revisão de escopo foi feita contra três fontes concretas:

- `cursor/plugins@46125561306434d8a1d7745d540d8932ab0cd2a2`, caminho `pstack/`: o upstream fornece skills, agentes e scripts auxiliares, mas não contém extensão Pi, núcleo de sessão, protocolo entre pacotes ou testes RPC/install. Portanto, ele é fonte de semântica e princípios, não de implementação runtime.
- `brainmaxxing@7556e35`: a extensão publicada usa marcadores próprios para substituir seu bloco em `before_agent_start`, calcula orçamento com `ctx.getContextUsage()`, limita a contribuição a 16 KiB, consulta `ctx.cwd` e confiança a cada turno, e mantém leitura do vault fora de qualquer escrita implícita.
- Worktree read-only `brainmaxxing:t3-pbrain-v1-provider`: o candidato ainda não commitado publica `pbrain/v1` por `globalThis[Symbol.for("pbrain/v1")]`, carrega schemas fechados e versionados, limita payloads e valida paths/trust. Os 13 testes focados e o typecheck passaram, mas esse estado continua evidência de integração em curso, não contrato lançado.

### Absorver ou adaptar

1. Usar o princípio upstream de boundary discipline: descobrir capabilities no boundary e converter dados externos em um estado interno pequeno. O pi-pstack mantém o preflight obrigatório separado do diagnóstico opcional.
2. Adaptar a descoberta para o símbolo global versionado já publicado pelo provider em desenvolvimento. O consumidor valida estruturalmente somente o mínimo necessário para T2 e não importa arquivos internos do pbrain.
3. Medir contribuição de prompt em bytes UTF-8 e registrar `ctx.getContextUsage()` quando disponível. Qualquer conversão bytes/tokens permanece explicitamente rotulada como estimativa.
4. Preservar ownership de composição: cada extensão remove ou evita somente o próprio bloco. O pi-pstack não remove, reordena nem reescreve marcadores do pbrain.
5. Adaptar o harness runtime do pbrain: usar o SDK público para observar o prompt real sem chamada de modelo, além de RPC/install em HOME temporário. Cobrir standalone e os dois pacotes juntos sem ler o vault real do usuário.
6. Manter requests futuros com `cwd` absoluto e estado de confiança explícito. Schemas fechados, limites de payload e validação bilateral pertencem a T3.
7. Manter allowlists de pacote e testes de árvore para provar que pi-pstack não publica nem escreve `brain/**`, `.brainmaxxing/**` ou código pertencente ao provider.

### Manter fora

- Não copiar catálogo, leitura de vault, migração, reflexão, reviewer workflow ou montagem do bloco Brainmaxxing para o pi-pstack.
- Não criar um segundo transporte por event bus para `pbrain/v1`; isso duplicaria o símbolo global já escolhido pelo provider e criaria duas fontes de discovery.
- Não portar setup de modelos, comandos ou detalhes Cursor-only do upstream. A adaptação continua Pi-native.
- Não promover os schemas não commitados do pbrain a fonte vendorizada. O consumidor terá validação mínima própria até T3 fechar o contrato bilateral.
- Não introduzir Firstmate, Herdr ou outro orquestrador nesta linha de trabalho.

## Decisões de arquitetura

1. **Dois pacotes, um protocolo opcional.** Não copiar código, skills ou vault do pbrain para o pi-pstack. Não adicionar pbrain como dependência obrigatória.
2. **Donos explícitos.**
   - pi-pstack: execução, feature maps, evals, artifacts, review evidence, receipts, stack e delivery.
   - pbrain: memória, princípios, contexto, reflexão, meditação e histórico.
3. **Seam profundo e versionado.** Criar no pi-pstack um módulo `BrainCapability` com poucas operações de alto valor, descoberto por capacidade e não por import profundo do pacote.
4. **Leitura automática, escrita explícita.** O pi-pstack pode consumir contexto read-only. Escritas no vault passam por comando/skill explícita do pbrain e nunca acontecem durante lifecycle, receipt ou merge.
5. **Integração degradável.** Sem pbrain, o comportamento atual do pi-pstack permanece idêntico. Com pbrain incompatível ou inválido, falhar apenas a integração e apresentar diagnóstico acionável.
6. **Uma fonte para princípios ativos.** Quando pbrain estiver ativo, o vault é a fonte de princípios do projeto. As skills `principle-*` do pi-pstack permanecem disponíveis como catálogo/fallback, mas não são injetadas em massa.
7. **Semântica antes de automação.** Primeiro melhorar o núcleo do pi-pstack e definir contratos de dados; só depois conectar os pacotes.

## Interface proposta

Contrato conceitual `pbrain/v1`:

- `status(cwd) -> available | unavailable | incompatible`, incluindo versão e diagnóstico.
- `context(cwd, budget) -> { text, inventoryHash, omittedEntries }`, sempre read-only e limitado.
- `principles(cwd) -> { ids, digests }`, sem duplicar o conteúdo completo quando já estiver no prompt.
- `proposeLearning(candidate) -> proposal`, que apenas prepara uma proposta revisável; não grava silenciosamente.

Eventos produzidos pelo pi-pstack para reflexão:

- `delivery.completed`
- `verification.failed`
- `review.revised`
- `human.corrected`

Cada candidato deve carregar repositório, SHA, origem da evidência, resumo sanitizado e idempotency key. Logs brutos, secrets, transcript inteiro e artifacts binários ficam fora.

## Grafo de dependências

```text
T1 baseline e métricas
  -> T2 núcleo de sessão/capabilities do pi-pstack
      -> T3 contrato pbrain/v1
          -> T4 contexto e princípios na execução
          -> T5 reflexão baseada em receipts
              -> T6 UX, docs e instalação conjunta
                  -> T7 E2E e release
```

## Fase 1: melhorar o pi-pstack antes da integração

### T1: Fixar baseline funcional e de contexto

**Descrição:** Medir o comportamento atual em instalação isolada, inicialização, poteto-mode, criação/validação de receipt e consumo de prompt.

**Critérios de aceitação:**

- Fixtures reproduzem pstack sozinho e pstack+pbrain.
- Métricas registram bytes adicionados, estimativa de tokens, uso real reportado pelo Pi e tempo dos principais hooks.
- A execução sem pbrain vira teste de regressão obrigatório.

**Verificação:**

- `npm run verify:deterministic`
- RPC real confirma comandos e skills atuais.
- SDK público captura o prompt standalone e combinado sem chamada de modelo.
- Snapshot do prompt não contém duplicação de blocos/princípios e cada extensão preserva o bloco da outra.

**Dependências:** nenhuma.

**Escopo estimado:** M.

### T2: Criar um núcleo único de sessão e capability preflight

**Descrição:** Tirar da extensão a coordenação espalhada de estado, confiança, recursos carregados e capabilities opcionais, escondendo-a atrás de uma interface pequena.

**Critérios de aceitação:**

- `poteto-mode.ts` delega descoberta e composição a módulos testáveis.
- Estado permanece isolado por sessão/branch e restaura sem vazar para outra sessão.
- Ausência ou falha de capability opcional não altera o fluxo standalone.
- Discovery usa `Symbol.for("pbrain/v1")`, valida somente a superfície mínima e não importa o pacote provider.
- O pacote e o runtime do pi-pstack não leem nem escrevem `brain/**` ou `.brainmaxxing/**`.

**Verificação:**

- Testes unitários de lifecycle, restauração e isolamento.
- Teste deliberado com capability inválida confirma fail-soft.
- Teste de package ownership rejeita caminhos do pbrain no artefato publicado.

**Dependências:** T1.

**Escopo estimado:** M.

## Checkpoint A

- Baseline standalone verde.
- Extensão mais fina e comportamento público inalterado.
- Métricas de contexto disponíveis para comparar a integração.

## Fase 2: conectar memória ao trabalho real

### T3: Definir e provar o protocolo opcional `pbrain/v1`

**Descrição:** Implementar um adapter no pi-pstack e a capability correspondente no pbrain, sem import profundo e com negociação explícita de versão.

**Critérios de aceitação:**

- Descoberta distingue ausente, incompatível, não confiável e saudável.
- Payloads têm schema versionado, limites e validação nos dois lados.
- Nenhum pacote escreve em diretórios pertencentes ao outro.

**Verificação:**

- Contract tests executados contra versões compatível, ausente e incompatível.
- Testes de paths hostis, symlinks, payload excessivo e projeto não confiável.

**Dependências:** T2.

**Escopo estimado:** M em cada repositório.

### T4: Usar o cérebro em planejamento, revisão e poteto-mode

**Descrição:** Incorporar contexto e princípios relevantes do pbrain nos pontos onde eles mudam decisões, sem injetar o vault inteiro e sem duplicar skills.

**Critérios de aceitação:**

- Poteto-mode recebe um bloco delimitado, determinístico e com orçamento próprio.
- `brain-plan` pode produzir feature-map/verification intent consumível pelo pi-pstack.
- `brain-review` pode referenciar review evidence e princípios por ID/digest.
- Ordem de carregamento das extensões não altera o prompt final nem duplica blocos.

**Verificação:**

- Testes de composição nas duas ordens de extensão.
- Fixtures de vault vazio, pequeno, grande, quebrado e ausente.
- Comparação cega confirma que contexto integrado melhora decisões sem exceder o orçamento definido em T1.

**Dependências:** T3.

**Escopo estimado:** M em cada repositório.

### T5: Fechar o loop de aprendizado com receipts

**Descrição:** Converter resultados estruturados do pi-pstack em candidatos de aprendizado revisáveis pelo pbrain.

**Critérios de aceitação:**

- Falha de verificação, revisão corrigida e entrega concluída geram candidatos idempotentes.
- Nenhum candidato contém secret, dump de transcript ou conteúdo não autorizado.
- Reexecutar o mesmo receipt não duplica proposta.
- Apenas uma ação explícita do usuário promove a proposta ao vault.

**Verificação:**

- Testes de redaction, deduplicação, SHA/origem e rejeição de receipt stale.
- E2E: erro real -> correção -> receipt -> proposta -> aprovação -> novo contexto.

**Dependências:** T3 e T4.

**Escopo estimado:** M em cada repositório.

## Checkpoint B

- pstack funciona igual sem pbrain.
- Com pbrain, contexto relevante chega uma vez e dentro do orçamento.
- Um ciclo completo de aprendizado foi provado sem escrita silenciosa.

## Fase 3: produto conjunto e release

### T6: Criar UX de diagnóstico e instalação conjunta

**Descrição:** Expor uma visão única da integração sem transformar um pacote em instalador do outro.

**Critérios de aceitação:**

- `/poteto-mode status` mostra pbrain ausente/saudável/incompatível e o hash do contexto usado.
- Documentação contém instalação no mesmo scope, inicialização, upgrade, rollback e desativação.
- Diagnóstico não exibe conteúdo privado do vault.

**Verificação:**

- RPC real verifica mensagens em todos os estados.
- Rehearsal global e local em HOME temporário.

**Dependências:** T4 e T5.

**Escopo estimado:** S em cada repositório.

### T7: E2E de compatibilidade, CI e releases coordenados

**Descrição:** Provar os dois pacotes juntos em versões pinadas antes de qualquer release.

**Critérios de aceitação:**

- Matriz cobre pstack sozinho, pbrain sozinho, juntos compatíveis e juntos incompatíveis.
- Instalação por Git pinado, restart, RPC, update, downgrade e remoção preservam o vault.
- CI usa Node mínimo comum e Pi mínimo comum.
- Releases registram a matriz de compatibilidade sem exigir versionamento lockstep.

**Verificação:**

- `npm run verify` nos dois repositórios.
- Instalação limpa em HOME temporário por tags/SHAs exatos.
- E2E real do fluxo: plan -> execute -> verify -> review -> receipt -> learning proposal.

**Dependências:** T6.

**Escopo estimado:** M.

## Riscos e mitigação

| Risco                                               | Impacto | Mitigação                                                                 |
| --------------------------------------------------- | ------: | ------------------------------------------------------------------------- |
| Dois hooks `before_agent_start` sobrescrevem prompt |    Alto | Composição idempotente com marcadores próprios e testes nas duas ordens   |
| Princípios duplicados consomem contexto             |    Alto | Vault como fonte ativa; IDs/digests em vez de conteúdo repetido           |
| Acoplamento entre releases                          |    Alto | Protocolo versionado, capability discovery e matriz de compatibilidade    |
| Aprendizado grava conclusão errada                  |    Alto | Proposal-only, proveniência, redaction e promoção explícita               |
| pbrain vira requisito para pstack                   |   Médio | Teste standalone obrigatório e adapter fail-soft                          |
| Receipt contém dados sensíveis                      |    Alto | Allowlist de campos, sanitização e testes com payload hostil              |
| Integração vira um terceiro orquestrador            |   Médio | pstack continua dono da execução; pbrain não ganha delivery nem automação |

## Fora de escopo

- Fundir os repositórios ou copiar o vault para dentro do pi-pstack.
- Tornar pbrain dependência obrigatória.
- Escrita automática em `brain/**` durante startup, verificação, merge ou deploy.
- Sincronização remota do vault.
- Reimplementar no pbrain o runtime de delivery, browser, eval ou stacked PR do pi-pstack.

## Estratégia de entrega

Usar uma stack por repositório, com mudanças verticais pequenas:

1. pi-pstack: baseline e núcleo de capabilities.
2. pbrain: provider `pbrain/v1`.
3. pi-pstack: consumer read-only e composição de prompt.
4. pbrain + pi-pstack: propostas de aprendizado baseadas em receipts.
5. ambos: diagnóstico, E2E e documentação.

Cada camada deve passar seus testes focados e a matriz integrada no head combinado. Merge e release continuam decisões separadas.
