## Context

As telas foram montadas módulo a módulo, cada uma com o CSS dela:
- sete arquivos de CSS (Administração, Alertas, Ativos, Backups, Cofre, Mapa e Operação) repetem o `.cabecalho`, que usa `justify-content: space-between`, e as telas os usam. Na Importação, a classe é a linha da situação, e não o cabeçalho;
- a ação principal acaba no canto direito, longe do título;
- a tabela redimensionável dá 160 px a toda coluna sem largura (`LARGURA_PADRAO`). Com poucas colunas, ela fica à esquerda, e o resto da janela fica vazio;
- o texto parte de 13 px no corpo, com controles de 28 px na densidade de fábrica (a compacta).

Em 1440 × 900, a tela parece pequena e solta.

## Goals / Non-Goals

**Goals:**
- uma escala maior, nos tokens;
- a tabela na largura toda;
- o cabeçalho igual em todas as telas;
- as ações principais do Operação num Início;
- a ficha do ativo numa grade.

**Non-Goals:**
- Trocar os componentes do catálogo ou criar um componente novo de cabeçalho. Os componentes ficam; muda o arranjo.
- A lista dos softwares instalados. Ela chega com o inventário pelo agente do GLPI. Aqui, o cartão do Software só fica legível.
- Regravar as referências da regressão visual. Elas mudam em quase todas as capturas e são regravadas com o CI de volta, depois do prazo de 31/10.

## Decisions

1. **A escala nos tokens.**
   - O texto fica em 12, 13, 14, 16, 20 e 26 px.
   - As densidades ficam em 36/24/32, 44/30/36 e 52/36/40 (linha, miniatura e controle).
   - A densidade de fábrica passa a ser a Normal. A preferência guardada de quem já escolheu continua valendo.
   - Tudo sai do `escalas.ts` pelo `pnpm tokens:gerar`. Nenhuma tela ganha tamanho literal.
2. **As colunas dividem a sobra.**
   - Na tabela redimensionável, a coluna sem `largura` recebe `1fr`, e a principal (`principal`) recebe `2fr`, com o mínimo de 64 px já usado.
   - O React Aria resolve as frações na largura do contêiner. A largura arrastada continua chegando em px pelo `aoRedimensionar` e é guardada na visão, como hoje.
   - A tabela dos ativos deixa de passar a largura padrão do catálogo de colunas: só a largura da visão vale, e a coluna sem ela divide a sobra.
   - A linha com ação (`data-hovered`, que o React Aria só põe na linha interativa) ganha o fundo de hover do token.
3. **Um cabeçalho só, sem componente novo.**
   - O `.cabecalho` dos sete CSS passa a ser a mesma regra: flex que começa à esquerda, com o espaço entre o título e as ações, e uma linha embaixo, com folga.
   - O botão primário dentro dele (o `data-nivel="primario"`, que o `Botao` já põe) fica mais alto e mais largo.
   - Trocar as telas por um componente custaria mais e mudaria o mesmo pixel.
4. **O Início do Operação no lugar do redirecionamento.**
   - O `/operacao` deixa de levar à primeira lista e mostra os blocos das ações.
   - Cada bloco é um link para a lista com o parâmetro que já abre a gaveta: `?nova=toner|conserto|equipamento` nas solicitações, `?nova=1` nas ordens e `?lancar=entrada` no estoque.
   - Os atalhos para as listas seguem as mesmas permissões do menu.
   - O menu ganha "Início", e o dock leva a ele.
5. **A ficha do ativo.**
   - Os campos do cartão deixam de parar em 960 px e ocupam a largura, em colunas de pelo menos 240 px.
   - A Visão geral põe os blocos dos outros módulos em cartões lado a lado.
   - "Salvar alterações" fica numa barra presa ao fim do painel, com a contagem das alterações.

## Risks / Trade-offs

- **[A regressão visual e alguns e2e reprovam até a regravação]** → O usuário pediu para ignorar o CI até o fim do mês. As referências são regravadas depois, numa tarefa só.
- **[Telas com muitas colunas ficam mais largas que a janela]** → O mínimo de 64 px e a rolagem de lado continuam. As frações só dividem a sobra.
- **[Quem já escolheu a compacta vê a compacta nova, maior]** → É o pedido: tudo maior. A compacta segue a mais densa das três.
