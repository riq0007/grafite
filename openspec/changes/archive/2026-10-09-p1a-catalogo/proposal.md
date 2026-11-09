## Why

Com o F2 arquivado, começa a fase 2, a paridade com o PMG, pelo P1 · Ativos (spec mestre, seção 3.2). O P1 é grande demais para uma change só e é entregue em seis, nesta ordem:
1. **P1a · Catálogo:** esta change.
2. **P1b · Cadastro de ativos:** o ativo e a lista simples.
3. **P1c · Tabela e visões:** colunas, visões, filtros e Quick Look.
4. **P1d · Ficha e relacionamentos:** a ficha completa e os ativos ligados entre si.
5. **P1e · Importação:** a planilha com prévia.
6. **P1f · Etiqueta:** a etiqueta com QR code.

Antes de cadastrar um ativo, a organização precisa dizer que tipos de ativo tem, que campos cada tipo usa e que modelos de equipamento existem. O PMG fixava isso no código: o computador e a impressora tinham colunas próprias, e um tipo novo exigia programação.

O Grafite separa as duas coisas, pela decisão 2 da spec mestre: o tipo é um cadastro, e a capacidade, que exige lógica, é código.

## What Changes

- **Spec mestre:**
  - a divisão do P1 em seis changes;
  - as decisões do brainstorming:
    - a organização começa sem tipos;
    - os campos são da organização, e cada tipo escolhe os que usa;
    - os valores ficam num JSONB pelo id do campo, com o estado de cada um ao lado;
    - os tipos arquivo e imagem chegam com a ficha;
    - os monitores do computador viram ativos ligados a ele.
- **Tipos de ativo:**
  - o nome, único na organização, e um dos ícones genéricos do F0;
  - as capacidades ligadas;
  - os campos que o tipo usa, em ordem, com os obrigatórios;
  - inativação e reativação.
- **Campos da organização:**
  - o rótulo, único, e o tipo, que não muda depois de criado;
  - o grupo;
  - a configuração do tipo de campo, como as opções da lista, cada uma com um id estável, e os limites dos números;
  - a marca de restrito e a política de escrita, só manual ou também importação e coleta;
  - inativação, que esconde o campo sem apagar os valores.
- **Motor de campos no domínio:** para cada um dos 15 tipos de campo da seção 5.3, fora arquivo e imagem, a leitura em pt-BR, a conferência, a forma única em que o valor é guardado e a forma de mostrar, com a recusa em texto que diz o que fazer. A licença recusa a chave de produto.
- **Capacidades no código:**
  - o registro das capacidades, com os campos de cada uma numa chave fixa;
  - a primeira capacidade, a `hardware.inventario` (Inventário de hardware), com processador, memória, discos, sistema operacional, versão, licenças do Windows e do Office e antivírus.
- **Modelos de equipamento:**
  - o tipo, o fabricante (com sugestões dos já usados, e a primeira grafia vale) e o nome, únicos juntos;
  - a imagem, pelo tratamento de imagens do F2c, agora comum à foto da pessoa e à imagem do modelo;
  - inativação e reativação.
- **Permissões:** `catalogo.administrar`, para os tipos e os campos, e `modelos.editar`, para os modelos, as duas na organização inteira. Toda sessão lê o catálogo, como lê os locais.
- **Auditoria e eventos:** cada mudança no catálogo vai para a auditoria, com o antes → depois, e grava o evento `catalogo.mudou`, que toda sessão da organização recebe.
- **Módulo Ativos na casca:**
  - o menu Catálogo, com as telas de tipos, de campos e de modelos;
  - na busca, as ações de cadastro e os modelos;
  - as telas se atualizam pelos eventos.

## Capabilities

### New Capabilities

- `catalogo-de-ativos`: tipos de ativo, campos da organização, campos do tipo, capacidades, modelos de equipamento e a imagem deles, e as telas do catálogo.
- `campos-personalizados`: os tipos de campo, a leitura e a conferência de cada valor em pt-BR, a forma em que ele é guardado e mostrado, e a configuração de cada tipo de campo.
- `modulo-ativos`: o módulo Ativos na casca, com o menu, quem o vê e a busca.

### Modified Capabilities

- `permissoes`: o catálogo de permissões ganha `catalogo.administrar` e `modelos.editar`.
- `auditoria`: os eventos da administração registrados ganham os do catálogo de ativos.
- `eventos-em-tempo-real`: a tabela dos tipos de evento ganha `catalogo.mudou`.

## Impact

- **`packages/domain`:**
  - o motor de campos, os ícones dos tipos, o registro das capacidades e as regras do catálogo;
  - as permissões, as ações da auditoria e o evento novos.
- **`packages/db`:** a migration com as tabelas `tipos_de_ativo`, `campos`, `campos_do_tipo` e `modelos`, cada uma com o isolamento por organização.
- **`apps/api`:**
  - as rotas do catálogo e da imagem do modelo;
  - o fluxo da foto da pessoa vira o fluxo comum das imagens dos registros;
  - o contrato da API e o cliente gerado.
- **`apps/web`:**
  - o módulo Ativos, com as telas de tipos, de campos e de modelos;
  - a busca e a atualização pelos eventos.
- **`packages/ui`:** a escolha do ícone do tipo e o editor das opções de uma lista, com as histórias no catálogo.
- **Documentação:** a spec mestre e o contrato de módulo (o módulo Ativos como exemplo real dos menus em árvore).
- Nada muda nas pessoas, nos locais nem nos acessos, além das permissões novas no catálogo.
