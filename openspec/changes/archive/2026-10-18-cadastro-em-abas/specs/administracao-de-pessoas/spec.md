## ADDED Requirements

### Requirement: Nova pessoa numa aba

A Nova pessoa SHALL abrir numa aba da janela quando um campo a pede (spec estrutura-da-casca), com o mesmo formulário, as mesmas validações e o mesmo retorno da tela das pessoas, "Pessoa cadastrada.". Na aba, salvar SHALL devolver a pessoa criada ao campo que a pediu, em vez de abrir a ficha dela. A Nova pessoa SHALL exigir `pessoas.editar`.

A tela das pessoas SHALL continuar como antes: a Nova pessoa aberta pela lista SHALL abrir a ficha da pessoa criada.

No formulário da pessoa, quando o campo pode ser editado, o Local de trabalho SHALL mostrar embaixo "Cadastrar novo local" (spec componentes-base) para quem tem `locais.editar`, e o local criado SHALL vir escolhido nele.

#### Scenario: Pessoa criada pelo campo
- **WHEN** quem edita pessoas abre a Nova pessoa pelo campo Responsável e salva "Ana Souza"
- **THEN** a aba fecha, e o campo Responsável vem com "Ana Souza"

#### Scenario: Local de trabalho criado pela pessoa
- **WHEN** quem edita pessoas e locais cadastra uma pessoa, escolhe "Cadastrar novo local" embaixo do Local de trabalho e salva "Portaria"
- **THEN** a aba "Novo local" fecha, e a pessoa volta com "Portaria" no Local de trabalho

#### Scenario: Matrícula repetida na aba
- **WHEN** alguém tenta salvar, na aba "Nova pessoa", uma pessoa com a matrícula de outra
- **THEN** a aba continua aberta, com a recusa no campo da matrícula
