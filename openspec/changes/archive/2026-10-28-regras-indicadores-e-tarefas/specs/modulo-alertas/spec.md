## MODIFIED Requirements

### Requirement: Regras na tela

A tela das regras SHALL explicar, acima da lista: "Uma regra diz quando abrir um alerta: a condição, o limite e para quais ativos. O alerta é cada vez que a regra dispara num ativo, e ele fecha sozinho quando o ativo volta ao normal. Para tratar um tipo, um modelo ou um local de outro jeito, use as exceções da regra."

Quem tem `alertas.administrar` SHALL ver a lista das regras, com:
- o nome;
- a condição com os parâmetros, como "Nível do toner em 10% ou menos, volta acima de 15%";
- a duração e a severidade;
- o escopo, como "Organização inteira" ou "Tipo: Impressora";
- as exceções, como "2 exceções" ou "Sem exceções";
- a situação, "Ativa" ou "Inativa".

A lista SHALL ter "Nova regra".

O formulário da regra SHALL mostrar os campos da condição escolhida, com as mensagens da spec alertas no campo, e SHALL NOT deixar trocar a condição de uma regra que existe. Na regra de uma condição dos ativos, o formulário SHALL ter as "Exceções", cada uma com o lugar, o efeito e "Tirar", e "Incluir exceção". Salvar SHALL dar o retorno "Regra salva.". A ficha da regra SHALL ter "Inativar" e "Reativar", com o retorno "Regra inativada." ou "Regra reativada.".

#### Scenario: Nova regra do toner
- **WHEN** quem administra os alertas escolhe "Nova regra" e a condição Nível do toner
- **THEN** o formulário mostra o limite e a folga, além do nome, da duração, da severidade, do escopo e das exceções

#### Scenario: Regra do coletor
- **WHEN** a condição escolhida é Coletor sem contato
- **THEN** o formulário mostra os minutos e a severidade, sem a duração, sem o escopo e sem as exceções

#### Scenario: Exceção do modelo
- **WHEN** quem administra os alertas abre a regra do toner, escolhe "Incluir exceção", o modelo HP M404 e "Outro limite" de 20%, com a folga de 5 pontos, e salva
- **THEN** a regra é salva com a exceção, e a lista mostra "1 exceção" nela
