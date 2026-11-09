## MODIFIED Requirements

### Requirement: Acesso de uma conta

A ficha da pessoa SHALL mostrar, para quem vê os acessos:
- os perfis da conta, diretos e por grupo, com o escopo de cada um;
- os grupos, numa tabela com todos os grupos ativos da organização: o nome, os perfis que cada um dá, com o escopo, e a situação da conta nele, "Participa desde 03/10/2026" ou "Não participa";
- o que a conta pode fazer: cada permissão efetiva, com o escopo e de onde ela vem.

Para quem administra os acessos, cada linha da tabela dos grupos SHALL oferecer "Incluir" ou "Retirar". Antes de confirmar, a tela SHALL dizer em texto o efeito: os perfis que a conta passa a ter ou deixa de ter, e os que ela já tem por outro caminho. Retirar SHALL pedir confirmação. Com mais de 10 grupos, a tabela SHALL ter um filtro pelo nome, que diz quantos de quantos ela mostra.

#### Scenario: Por que a conta pode
- **WHEN** quem vê os acessos abre o acesso de Bruno, que tem o "Técnico" pelo grupo "Suporte"
- **THEN** a tela mostra "Ver pessoas e contas — Jundiaí", vindo do "Técnico", pelo grupo "Suporte"

#### Scenario: Grupos à vista
- **WHEN** quem administra os acessos abre o acesso de Bruno, que participa do "Suporte"
- **THEN** a tabela mostra o "Suporte" com "Participa desde" e "Retirar", e os outros grupos ativos com "Não participa" e "Incluir", cada um com os perfis que dá

#### Scenario: Efeito antes de incluir
- **WHEN** quem administra os acessos escolhe "Incluir" no grupo "Almoxarifado", que dá o "Operador" em "Jundiaí › Almoxarifado"
- **THEN** a tela diz "Bruno passa a ter Operador em Jundiaí › Almoxarifado." antes de confirmar

### Requirement: Nomes das pessoas para a escolha

Toda sessão ativa da organização SHALL poder buscar as pessoas ativas pelo nome, para escolher o responsável de um ativo ou o valor de um campo de pessoa. A resposta SHALL trazer só o identificador e o nome de até 20 pessoas, em ordem alfabética, sem o e-mail, a matrícula, o telefone, o local, a foto nem a conta, e o total das pessoas que casam.

Sem o texto da busca, a resposta SHALL trazer as primeiras pessoas em ordem alfabética. Com um local pedido, as pessoas que trabalham nele ou dentro dele SHALL vir primeiro, marcadas como do mesmo local, sem dizer qual é o local de cada uma.

#### Scenario: Responsável escolhido por quem não vê a Administração
- **WHEN** Bruno, com `ativos.editar` e sem `pessoas.ver`, digita "joao" na escolha do responsável
- **THEN** a escolha mostra "João da Silva", sem os outros dados dele

#### Scenario: Escolha sem digitar
- **WHEN** alguém abre a escolha do responsável de um ativo de "Jundiaí › Expedição" sem digitar
- **THEN** a escolha mostra primeiro as pessoas que trabalham em "Jundiaí › Expedição", marcadas como do mesmo local, e depois as outras, com o total
