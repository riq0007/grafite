## Why

A distribuição de software (S6) já manda um pacote às máquinas pelo agente do GLPI, mas a TI ainda decide no escuro:
- não sabe quantas máquinas têm o programa, em que versão, e quais estão desatualizadas;
- não sabe o que o comando faz, nem por que uma instalação falhou;
- manda na hora, sem poder deixar um driver para a noite;
- não tem como repetir a máquina que falhou ou tirar da fila a que sumiu.

A ideia 11 da rodada 3 (os mockups `r3-11-software`, m01 a m12, todos aprovados em 14/11/2026) põe o pacote frente ao inventário: a base vira um painel do que está desatualizado, o pacote diz onde está, o assistente diz o que vai acontecer em cada máquina antes de enviar, e a ficha da máquina junta o que o Grafite mandou e o que o inventário achou.

A change continua o subprojeto S6 da spec mestre (Distribuição de software), que se apoia no S5 (o agente do GLPI) e no P1 (os ativos). Ela é a primeira das 24 changes da rodada 3, na ordem do que mais ajuda a TI.

## What Changes

- **A base de pacotes como painel** (m12):
  - as categorias que a TI cria, ordena e renomeia, começando pelas 7 do mockup, em abas;
  - cada pacote com a versão-alvo, o "Instalado em N de M" frente ao inventário, a situação ("17 DESATUALIZADAS", "TODAS EM DIA") e a última distribuição, em ordem de quantas estão desatualizadas;
  - "Só os desatualizados" e o pé "43 instalações abaixo da versão-alvo".
- **O pacote frente ao inventário** (m01):
  - o pacote ganha a categoria e o "Nome no inventário", que liga o pacote aos programas do inventário;
  - os quatro números (instalado, na versão, desatualizadas e sem o programa), as barras das versões e as distribuições do pacote;
  - "O que a instalação faz": o comando em mono, explicado em português.
- **A distribuição aberta** (m02): o progresso com a régua; "Precisa de você" com a que falhou ("Tentar de novo", com o código de saída explicado) e a sem contato ("Tirar da fila"); "Em andamento" com a etapa; as concluídas em chips; "Exportar".
- **O assistente em quatro passos** (m03, m04, m05 e m08):
  - Pacote, Máquinas (por local, por visão da tabela, por busca e colando uma lista), Quando e Conferir;
  - o "Até agora" com a conta: vão instalar, já têm a versão (puladas) e na fila (sem contato);
  - Quando: agora, a janela da noite (das 22h às 6h, toda noite até instalar) ou um dia e uma hora;
  - o agente só recebe a tarefa quando ela pode seguir; o CONTACT o faz voltar na hora certa, e o Grafite o chama pela porta 62354 para adiantar.
- **A matriz do software** (m06 e m07): programas × máquinas de um local e programas × locais, com a versão de cada célula; marcar células leva ao assistente já no passo Quando.
- **O software na ficha da máquina** (m09 a m11), na ficha de hoje: os mandados pelo Grafite; os instalados frente à base, com o que pede ação primeiro; "Instalar outro pacote nesta máquina"; e, sem contato, o aviso com a idade do inventário e a fila.
- **A máquina sem contato:** o agente que não fala com o servidor há mais dias do que a organização ajusta (2 de fábrica) aparece "Sem contato" e entra na fila.
- **A fila segura** (da revisão de 15/11/2026): o pacote inativado segura a fila até ser reativado; a máquina que já aguarda o mesmo pacote é pulada, com o caminho até a outra distribuição, e o "Tentar de novo" não a põe na fila duas vezes; a distribuição mostra só as máquinas do alcance da conta; e a pessoa da máquina aparece só para quem a vê.
- **BREAKING** (só na tela): o botão "Pedir agora" sai da distribuição; o Grafite acorda os agentes sozinho.

Fica fora:
- a moldura nova da ficha (a change `ficha-sem-vao`, ideia 02), com o cabeçalho, as Relações e o Histórico do m09 a m11;
- a regra de alerta "Agente sem contato" e a linha dela no histórico da ficha (m11), que vêm com a moldura;
- o "Pedir agora" manual, que o m02 tirou.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `distribuicao-de-software`: a base com as categorias e o nome no inventário; o pacote frente ao inventário; o comando explicado; o assistente com o alvo, o quando e a conferência; o Deploy só do que pode seguir; o acordar dos agentes no lugar do "Pedir agora"; a distribuição aberta, com o tentar de novo e o tirar da fila; a matriz; a instalação pela ficha.
- `inventario-pelo-agente`: o `expiration` do CONTACT para o agente com pedido de software; o agente sem contato, com o prazo da organização; os programas do sistema no inventário; a aba Software da ficha frente à base.
- `modulo-gestao-de-ativos`: o menu do Software ganha a matriz.

## Impact

- **Banco** (`packages/db`): a tabela `categorias_de_software`, com RLS; no pacote, a categoria, o nome no inventário (com o normalizado) e quem guardou o arquivo e quando; na distribuição, o quando, o momento, o fuso e o "para quem"; na máquina da distribuição, a situação "tirada", o código de saída e o último chamado; no software do ativo, o nome normalizado e o "do sistema"; no agente, até quando ele volta; o prazo do sem contato na organização.
- **Domínio** (`packages/domain`): a comparação de versões, o casamento do inventário com o pacote, a explicação do comando e do código de saída, a janela da noite e o "pode seguir", o sem contato, a conta do assistente e a ordem frente à base.
- **API e contrato:** as rotas da base, do pacote, das categorias, do assistente, da matriz, da distribuição e da ficha; o `getJobs` e o `expiration` do CONTACT; a tarefa periódica que chama os agentes.
- **Web:** Gestão de ativos › Software (a base, o pacote, a distribuição, o assistente e a matriz), a aba Software da ficha e o prazo do sem contato na Administração.
