## Context

O mapa do PMG é uma página com Three.js sobre um modelo JSON gerado do DXF por um script Python (`convert_dxf.py`). O modelo traz:
- as linhas por camada, em pares de coordenadas em metros;
- as paredes aproximadas, os textos e as máquinas.

A planta real tem dezenas de milhares de segmentos, e o arquivo tem alguns megabytes. O Grafite não tem o Python no servidor, e a web segue o ANTISLOP, sem animação gratuita.

## Goals / Non-Goals

**Goals:**
- as plantas por DXF ou pelo modelo do PMG;
- o mapa navegável visto de cima;
- a posição de qualquer ativo, o estado no mapa e as camadas dos módulos.

**Non-Goals:**
- a vista 3D;
- as paredes e os volumes gerados do DXF, que no PMG eram desenhados à mão;
- levar as posições para uma revisão nova da planta.

## Decisions

1. **O modelo da planta é o formato do PMG, em português.**
   - `largura` e `profundidade` em metros;
   - `camadas` com o `nome` e os `segmentos` (x1, z1, x2, z2…);
   - `paredes`, com os pontos e a altura;
   - `rotulos`, com o texto, x e z;
   - `maquinas`, com o nome, x, z, a largura e a profundidade.

   O modelo é um JSON no armazenamento da API (`<org>/<planta>/modelo`), e a planta guarda só a chave e as contagens. A importação do PMG troca os nomes dos campos e guarda o resto como está.

2. **O conversor do DXF no domínio,** em TypeScript puro, sobre o texto do arquivo, linha a linha por pares de código e valor:
   - lê o `$INSUNITS` (milímetro, centímetro, metro, polegada, pé);
   - lê as entidades LINE, LWPOLYLINE (com a bolha tratada como reta), POLYLINE com VERTEX, ARC e CIRCLE, aproximados por segmentos com tolerância de 10 cm, TEXT e MTEXT;
   - lê o INSERT com os blocos da seção BLOCKS, com a posição, a escala e a rotação, até 8 níveis.

   A origem é o canto de cima à esquerda da caixa das linhas, com z para baixo, como na tela. Segmentos menores que 2,5 cm saem. A conversão roda na própria requisição do envio: um DXF grande leva segundos, e a resposta já traz a planta pronta.

3. **As tabelas** (migration 0043):
   - `plantas`: o nome, o local, a chave do modelo, a largura, a profundidade, as contagens, a situação (`convertendo`, `ativa`, `falhou`, `inativa`), o erro, a fonte, quem cadastrou e quando;
   - `posicoes_na_planta`: a planta, o alvo (`alvo_tipo`, `alvo_id`, sem chave estrangeira, porque o alvo pode ser de outro módulo), x, z, quem mudou e quando, única por planta e alvo.

   As duas têm RLS forçado.

4. **Os marcadores por fornecedores.**
   - A API tem um registro `FORNECEDORES_DO_MAPA`. Cada fornecedor recebe as posições de um `alvo_tipo` e devolve os marcadores com a camada, o rótulo, a situação `{ texto, tom }` e as ações.
   - O dos ativos lê o ativo, a disponibilidade e os alertas abertos, e esconde o que a conta não vê pelo `ativos.ver` do local.
   - A situação vem do domínio, `situacaoNoMapa`.

5. **O mapa em canvas 2D,** sem Three.js:
   - desenha as linhas por camada, as paredes, as máquinas, os textos no zoom em que cabem e os marcadores com o rótulo e a situação;
   - o arrastar move a vista, a roda e os botões dão o zoom em torno do ponteiro, e o redesenho é por quadro, sem animação da vista;
   - as cores vêm dos tokens, lidas do CSS na hora, e mudam com o tema.

   O canvas tem o nome acessível, e a lista dos marcadores ao lado repete o que o canvas mostra, para o teclado e o leitor de tela.

6. **O módulo Mapa** no dock, com `mapa.ver`:
   - a tela das plantas, com o "Nova planta" para quem tem `mapa.editar`;
   - o mapa de cada planta, com a barra das ferramentas (a busca, o zoom e as camadas) e o painel do marcador escolhido;
   - o "Posicionar no mapa", com a busca do ativo e o clique no ponto.

## Risks / Trade-offs

- [Um DXF de 200 MB na memória do servidor, na requisição] → O arquivo é lido uma vez e descartado; o servidor da empresa tem memória para isso, e o envio aceita até 300 MB.
- [O canvas com 85 mil segmentos] → As linhas são desenhadas num caminho só por camada, e a vista pula os segmentos fora da tela.

## Migration Plan

A migration 0043 só cria as tabelas. A planta da unidade entra pelo envio do modelo convertido do PMG.

## Open Questions

Nenhuma.
