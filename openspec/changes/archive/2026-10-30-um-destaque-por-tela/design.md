## Context

O `EstadoVazio` das listas recebe a ação relevante, como pede a seção 25 do ANTISLOP. Treze listas passam a mesma ação do cabeçalho, no nível primário, e a tela vazia fica com dois destaques iguais:
- as Pessoas, os Grupos e os Coletores da Administração;
- as Regras de alerta;
- os Tipos, os Campos e os Modelos do Catálogo, e o Software;
- a tabela dos ativos;
- o Cofre;
- o Estoque, as Ordens de serviço e as Solicitações do Operação.

O "Cadastre a verificação em dois passos", do Cofre, não tem a ação no cabeçalho e fica de fora.

## Goals / Non-Goals

**Goals:**
- Uma ação primária à vista por tela.
- A spec da ação principal igual ao cabeçalho da página.

**Non-Goals:**
- Tirar a ação do estado vazio: ela continua lá, perto do aviso, no nível secundário.
- Os diálogos e as gavetas, que têm o destaque deles.

## Decisions

### 1. O estado vazio no nível secundário

O `Botao` da ação do estado vazio que repete o cabeçalho perde o `nivel="primario"` e fica no secundário, o nível de fábrica. O texto e o ícone ficam.

### 2. A Conta dos Ajustes

A Conta junta partes independentes, cada uma com a sua ação. "Trocar senha" envia o formulário da senha e continua primária. "Ativar", da verificação em dois passos, passa ao secundário, como o "Trocar foto".

### 3. A verificação

Um teste por desenho reprova o destaque duplo:
- o dos Modelos confere a lista vazia, com o "Novo modelo" do estado vazio no secundário e o do cabeçalho no primário;
- o da Conta confere o "Ativar" no secundário.

A auditoria anti-slop no `pnpm dev` confere as 76 telas.

### 4. O controle segmentado no computador

A inspeção das 76 telas, uma a uma, achou o controle segmentado da situação dos Consumíveis quebrando em duas linhas no computador: falta 1 px na célula do filtro, e o `flex-wrap` da `cabecalho-em-toda-tela` (decisão 7) quebrava a linha. A quebra passa a valer só na postura do celular (`[data-postura="celular"]`), onde ela evita a rolagem lateral. No computador, o trilho volta a ficar numa linha só.

### 5. A ação do estado vazio num botão

Três estados vazios ofereciam a ação como um link de texto sublinhado, enquanto os outros usam um botão, como pede a seção 25 do ANTISLOP:
- as Minhas reservas, com "Nova reserva";
- a Agenda sem salas e os Painéis sem nenhum, com "Abrir o cadastro".

As três passam a um `Botao` secundário que navega, como o "Abrir a tabela" das Etiquetas.

## Risks / Trade-offs

**A ação do estado vazio fica menos visível.** Ela continua no centro da área vazia, e a do cabeçalho, no destaque, faz o mesmo.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
