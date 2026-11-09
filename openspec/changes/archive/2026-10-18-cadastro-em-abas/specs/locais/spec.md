## ADDED Requirements

### Requirement: Novo local numa aba

O Novo local SHALL abrir numa aba da janela quando um campo o pede (spec estrutura-da-casca), com o mesmo formulário e as mesmas regras da tela dos locais: o nome único entre os irmãos, o local de dentro escolhido entre os que a conta pode alterar e o retorno "Local cadastrado.". Na aba, salvar SHALL devolver o local criado ao campo que o pediu. O Novo local SHALL exigir `locais.editar` em algum local; a escolha de onde ele fica SHALL mostrar só os locais em que a conta tem `locais.editar`.

A tela dos locais SHALL continuar como antes, com o Novo local na gaveta dela.

#### Scenario: Local dentro de outro
- **WHEN** quem altera os locais de "Jundiaí" abre o Novo local pelo campo Local e cadastra "Sala 12" dentro de "Jundiaí"
- **THEN** o campo que pediu vem com "Sala 12", e a árvore dos locais mostra "Sala 12" dentro de "Jundiaí"

#### Scenario: Nome repetido na aba
- **WHEN** alguém tenta cadastrar, na aba "Novo local", um local com o nome de um irmão
- **THEN** a aba continua aberta, com a recusa no campo do nome
