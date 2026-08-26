# pi-pstack + pbrain

- [x] T1: fixar baseline funcional e métricas de contexto
  - [x] instalação isolada de pi-pstack e pi-pstack+pbrain reproduzível
  - [x] regressão standalone coberta
  - [x] bytes/tokens e tempo dos hooks medidos

- [x] T2: criar núcleo único de sessão e capability preflight
  - [x] extensão delega coordenação para módulo testável
  - [x] estado isolado por sessão/branch
  - [x] capability ausente ou inválida mantém o fluxo standalone

## Checkpoint A

- [x] `npm run verify:deterministic` passa
- [x] RPC real preserva comandos e skills atuais
- [x] prompt não duplica blocos ou princípios

- [ ] T3: definir e provar o protocolo opcional `pbrain/v1`
  - [ ] estados ausente, incompatível, não confiável e saudável distinguíveis
  - [ ] schemas e limites validados nos dois pacotes
  - [ ] ownership de arquivos não é cruzado

- [ ] T4: usar contexto e princípios no planejamento, revisão e poteto-mode
  - [ ] contexto delimitado, determinístico e orçado
  - [ ] plan/review trocam artefatos estruturados com pi-pstack
  - [ ] ordem de carregamento das extensões não muda o resultado

- [ ] T5: gerar propostas de aprendizado a partir de receipts
  - [ ] candidatos têm origem, SHA e idempotency key
  - [ ] redaction e deduplicação cobertas
  - [ ] promoção ao vault exige ação explícita

## Checkpoint B

- [ ] pi-pstack continua funcional sem pbrain
- [ ] pbrain integrado não excede o orçamento de contexto
- [ ] ciclo erro -> correção -> receipt -> proposta -> aprovação foi exercitado

- [ ] T6: criar diagnóstico e documentação de instalação conjunta
  - [ ] status expõe saúde e hash, sem conteúdo privado
  - [ ] instalação no mesmo scope, upgrade, rollback e desativação documentados
  - [ ] fluxos global e local ensaiados em HOME temporário

- [ ] T7: adicionar matriz E2E e preparar releases coordenados
  - [ ] pstack sozinho, pbrain sozinho, compatíveis e incompatíveis cobertos
  - [ ] Git pinado, restart, update, downgrade e remoção exercitados
  - [ ] vault preservado byte a byte
  - [ ] fluxo plan -> execute -> verify -> review -> receipt -> learning proposal passa

## Gate final

- [ ] `npm run verify` passa nos dois repositórios
- [ ] integração real passa com SHAs/tags exatos
- [ ] revisão independente valida os heads
- [ ] merge e release permanecem não autorizados até decisão explícita
