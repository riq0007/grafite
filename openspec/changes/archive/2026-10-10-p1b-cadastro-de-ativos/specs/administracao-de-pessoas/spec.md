## ADDED Requirements

### Requirement: Nomes das pessoas para a escolha

Toda sessão ativa da organização SHALL poder buscar as pessoas ativas pelo nome, para escolher o responsável de um ativo ou o valor de um campo de pessoa. A resposta SHALL trazer só o identificador e o nome de até 20 pessoas, em ordem alfabética, sem o e-mail, a matrícula, o telefone, o local, a foto nem a conta.

#### Scenario: Responsável escolhido por quem não vê a Administração
- **WHEN** Bruno, com `ativos.editar` e sem `pessoas.ver`, digita "joao" na escolha do responsável
- **THEN** a escolha mostra "João da Silva", sem os outros dados dele
