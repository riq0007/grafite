## MODIFIED Requirements

### Requirement: Nomes das pessoas para a escolha

Toda sessão ativa da organização SHALL poder buscar as pessoas ativas pelo nome, para escolher o responsável de um ativo, o valor de um campo de pessoa ou quem pediu uma solicitação (spec solicitacoes). A resposta SHALL trazer só o identificador e o nome de até 20 pessoas, em ordem alfabética, sem o e-mail, a matrícula, o telefone, o local, a foto nem a conta, e o total das pessoas que casam.

Sem o texto da busca, a resposta SHALL trazer as primeiras pessoas em ordem alfabética. Com um local pedido, as pessoas que trabalham nele ou dentro dele SHALL vir primeiro, marcadas como do mesmo local, sem dizer qual é o local de cada uma.

#### Scenario: Responsável escolhido por quem não vê a Administração
- **WHEN** Bruno, com `ativos.editar` e sem `pessoas.ver`, digita "joao" na escolha do responsável
- **THEN** a escolha mostra "João da Silva", sem os outros dados dele

#### Scenario: Escolha sem digitar
- **WHEN** alguém abre a escolha do responsável de um ativo de "Jundiaí › Expedição" sem digitar
- **THEN** a escolha mostra primeiro as pessoas que trabalham em "Jundiaí › Expedição", marcadas como do mesmo local, e depois as outras, com o total

#### Scenario: Quem pediu escolhido por quem atende
- **WHEN** Carla, com `solicitacoes.atender` e sem `pessoas.ver`, digita "joana" em Pedida por
- **THEN** a escolha mostra "Joana Prado", sem os outros dados dela
