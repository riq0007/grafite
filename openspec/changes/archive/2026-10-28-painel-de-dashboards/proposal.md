## Why

Os dashboards da empresa ficam em VMs, cada um num endereço IP:porta. Hoje cada pessoa abre um por um, sem saber se ele está no ar. O usuário pediu, em 28/10:
- cadastrar os dashboards e checar se cada um está rodando, com a situação online ou offline;
- exibi-los lado a lado, aproveitando a tela ao máximo, numa grade que se adapta: dois em dois blocos grandes, três em três, e assim por diante;
- abrir e expandir cada um;
- mostrar no mapa da planta os dashboards rodando, com a opção de abrir.

A change é um subprojeto novo da spec mestre (S2), no molde do S1 · Salas de reunião, com a camada do mapa (spec mapa-da-planta).

## What Changes

- **O módulo Painéis, opcional, no dock.**
  - A tela Painéis mostra os dashboards ativos numa grade que ocupa a janela. Um ocupa tudo. Dois e três ficam lado a lado. De quatro em diante, a grade fica quase quadrada, como 2 × 2 e 3 × 2.
  - Cada bloco tem o nome, a situação em texto ("No ar" ou "Fora do ar", com a hora da verificação), "Expandir" e "Abrir em outra aba".
  - "Expandir" mostra o painel na janela inteira, e Esc volta à grade.
- **O cadastro.** Quem administra os painéis cadastra o nome, o endereço (`http://` ou `https://`, com o IP e a porta), o local, opcional, e a ordem na grade, e inativa e reativa.
- **A verificação.**
  - A cada minuto, o servidor pede cada endereço ativo, com 5 segundos de prazo. A resposta abaixo de 500 é "No ar", e a falta dela ou um 5xx é "Fora do ar".
  - A mudança de situação atualiza as telas abertas.
  - "Verificar agora" pede na hora.
- **O painel em http dentro do Grafite em https.** O navegador não mostra o conteúdo nesse caso. O bloco diz isso e oferece "Abrir em outra aba".
- **A camada no mapa.** Os painéis posicionados aparecem com a situação e a ação "Ver o painel", que abre a tela com ele expandido.
- **As permissões.** `paineis.ver` vê a grade, e `paineis.administrar` cadastra. O perfil Administrador tem as duas.

## Capabilities

### New Capabilities
- `painel-de-dashboards`: os painéis, a verificação, as permissões, a auditoria, o evento e a camada do mapa.
- `modulo-paineis`: o módulo Painéis na casca, com a grade adaptativa, o expandir e o cadastro.

### Modified Capabilities
- `modulos-da-organizacao`: o Painéis entre os módulos opcionais.

## Impact

- **`packages/domain`:**
  - as permissões, as ações e o evento `paineis.mudaram`;
  - o módulo opcional;
  - a conferência do painel, a leitura da resposta da verificação e a forma da grade.
- **`packages/db`:** a tabela dos painéis, com o RLS.
- **`apps/api`:** as rotas, a tarefa da verificação a cada minuto e o fornecedor da camada no mapa.
- **`apps/web`:** o módulo Painéis.
