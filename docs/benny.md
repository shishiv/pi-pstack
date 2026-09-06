# Benny no Pi

Benny mantém duas rotinas separadas:

1. Triage encontra novos relatos, preserva as coordenadas do thread, classifica, deduplica no tracker e publica um único verdict.
2. Reproduce espera um marker confiável, encontra a feature no mapa, reproduz o sintoma duas vezes e verifica uma correção existente antes de considerar código novo.

Agendamento é opcional. Quando o host oferece um scheduler, ele deve preservar `overlap: "skip"` e `catchUp: "latest"`. Sem scheduler, as duas operações continuam disponíveis sob demanda pelo Pi.

## Limites

- Somente o coordenador possui adapters de escrita.
- Child prompts recebem o relato como dado não confiável.
- Falta de configuração, feature, source thread ou adapter resulta em zero writes.
- Uma falha após criar um ticket executa a compensação configurada.
- Um ticket existente atualizado não é removido como compensação.
- Uma correção nova termina em draft PR.
- Merge e deploy não pertencem a Benny.

## Configuração

Copie o pack para `.pi/pstack/benny/`. Mantenha configuração, routing map e feature map em `.pi/pstack/benny-config/`. Segredos permanecem no secret manager ou ambiente, nunca no YAML ou nos prompts.

## Adapter provider

Uma extensão de integração registra o acesso real a Slack, tracker, UI e repositório. O agente `benny-coordinator` recebe somente `read`, `grep`, `find`, `ls` e `pstack_benny`. Ele não recebe ferramentas diretas de Slack ou delivery.

```ts
import { registerBennyAdapterProvider } from "@shishiv/pi-pstack/benny";

const dispose = registerBennyAdapterProvider({
  name: "company-integrations",
  async nextTrigger({ action, config, cwd }) {
    // Return one normalized source event, or null when none is pending.
  },
  async load({ config, cwd }) {
    return { slack, tracker, control, repository, featureMap };
  },
});
```

O provider mantém credenciais fora dos prompts. `pstack_benny` resolve o provider, usa o ledger persistente e chama o core tipado. Sem provider registrado, o ciclo termina bloqueado e sem writes.
