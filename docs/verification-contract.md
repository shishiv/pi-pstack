# Contrato de verificação

## Feature map

O feature map registra o objetivo do usuário, a rota, os pontos de entrada no código, seletores acessíveis, o estado esperado, o estado quebrado e a evidência necessária. A skill gerada vive em `.pi/skills/verify-<app>/`.

Um mapa válido não prova comportamento. Ele apenas define o caminho que a prova deve dirigir.

## Prova de navegador

A prova usa Playwright com seletores por role, label ou `data-testid`. Ela captura:

- screenshot do estado observado;
- snapshot de acessibilidade;
- DOM renderizado;
- trace do Playwright;
- resultado do cleanup.

Projetos reais devem iniciar o servidor com portless e registrar a URL nomeada no verification skill. O fixture deste pacote intercepta uma URL `.localhost` dentro do Playwright para manter o teste determinístico e sem processo privilegiado.

## Eval de skill

Cada caso declara assertions obrigatórias, comportamentos proibidos, dependências e evidência esperada. Assertions determinísticas têm precedência sobre o judge. O judge recebe apenas rótulos como Candidate A e Candidate B.

Não existe taxa mínima inventada. O primeiro conjunto aceito forma o baseline. Em uma comparação de mudança, Candidate A é a versão atual e Candidate B é o baseline aprovado identificado no artifact. A versão atual deve manter os hard gates e o judge cego não pode preferir o baseline.

## Receipt de entrega

O receipt é versionado e vinculado ao repositório e ao SHA exato. Ele registra revisão independente, checks determinísticos, artifacts vivos, eval e backend de stack. Uma alteração no `HEAD` invalida o receipt anterior.

## Autonomia

Projetos começam em `verify`. A promoção para `prepare`, `pr`, `merge-ready` e `auto-merge` depende de evidência. Benny permanece draft-only independentemente do nível do projeto.
