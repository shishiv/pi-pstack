# Benny no Pi

Benny mantém duas rotinas separadas:

1. Triage encontra novos relatos, preserva as coordenadas do thread, classifica, deduplica no tracker e publica um único verdict.
2. Reproduce espera um marker confiável, encontra a feature no mapa, reproduz o sintoma duas vezes e verifica uma correção existente antes de considerar código novo.

Os schedules usam o `subagent` do Pi com `overlap: "skip"` e `catchUp: "latest"`. O intervalo vem da configuração e é convertido para a granularidade aceita pelo scheduler.

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
