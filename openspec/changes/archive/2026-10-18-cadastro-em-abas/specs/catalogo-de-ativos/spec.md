## ADDED Requirements

### Requirement: Tipo e modelo cadastrados numa aba

O Novo tipo e o Novo modelo SHALL abrir numa aba da janela quando um campo os pede (spec estrutura-da-casca), com o mesmo formulário, as mesmas validações e os mesmos retornos das telas do catálogo, "Tipo cadastrado." e "Modelo cadastrado.". Na aba, salvar SHALL devolver o registro criado ao campo que o pediu, em vez de abrir a ficha dele. O Novo tipo SHALL exigir `catalogo.administrar`, e o Novo modelo, `modelos.editar`.

No cadastro do modelo, o campo Tipo SHALL mostrar embaixo "Cadastrar novo tipo" (spec componentes-base) para quem tem `catalogo.administrar`. Pedido pelo campo Modelo de um ativo, o Novo modelo SHALL vir com o tipo do ativo, só para leitura e sem o link (spec cadastro-de-ativos).

As telas do catálogo SHALL continuar como antes: o Novo tipo e o Novo modelo abertos pelo menu ou pela lista SHALL abrir a ficha do registro criado.

#### Scenario: Tipo criado pelo modelo
- **WHEN** quem administra o catálogo cadastra um modelo e escolhe "Cadastrar novo tipo" embaixo do Tipo, e salva o tipo "Leitor de código de barras"
- **THEN** a aba "Novo tipo" fecha, e o cadastro do modelo volta com "Leitor de código de barras" no Tipo

#### Scenario: Recusa dentro da aba
- **WHEN** alguém tenta salvar, na aba "Novo tipo", um tipo com o nome de um que já existe
- **THEN** a aba continua aberta, com a recusa no campo do nome, como na tela do catálogo

#### Scenario: Tela do catálogo sem mudança
- **WHEN** quem administra o catálogo cadastra um tipo pelo menu do catálogo
- **THEN** depois de salvar, abre a ficha do tipo criado, como antes
