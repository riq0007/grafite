## MODIFIED Requirements

### Requirement: Seção Notificações

A seção Notificações SHALL ajustar:
- quais severidades viram aviso na tela: Atenção e Informação, cada uma ligada ou desligada, com o Crítico sempre ligado e indicado como tal;
- o tempo do aviso de Atenção e de Informação: 6 s, 10 s ou 20 s;
- o modo Foco, ligado ou desligado, com a explicação "Com o Foco ligado, só o Crítico vira aviso. O resto vai para a central.".

A seção SHALL informar que o que não vira aviso continua na central. O botão "Mostrar aviso de exemplo" SHALL mostrar um aviso marcado como exemplo, com o tempo escolhido, que SHALL NOT entrar na central.

O grupo "Por e-mail" SHALL mostrar para qual e-mail as notificações vão, que é o da pessoa da conta, e SHALL ajustar (spec notificacoes):
- o e-mail do crítico na hora, ligado ou desligado;
- o resumo das outras: "Desligado" ou "Diário, às 8h";
- "Mandar um e-mail de teste".

O grupo "No celular" SHALL ajustar (spec notificacoes):
- "Receber neste aparelho", que pede a permissão do navegador e inscreve o aparelho;
- as severidades que vão para o push: Crítico, Atenção e Informação, com a explicação de que, com o Foco ligado, só o Crítico vai;
- a lista dos aparelhos da conta, com "Este aparelho" e "Tirar";
- "Mandar um aviso de teste".

Quando um canal não pode funcionar, o grupo dele SHALL dizer o motivo em texto, com os ajustes desligados:
- o servidor sem o canal configurado, ou o ambiente de teste;
- a pessoa sem e-mail, com "Peça à administração para cadastrar o seu e-mail.";
- o aparelho sem como receber o push, ou com os avisos bloqueados no navegador.

#### Scenario: Aviso de exemplo
- **WHEN** o usuário escolhe 10 s e depois "Mostrar aviso de exemplo"
- **THEN** aparece um aviso marcado como exemplo, que some em 10 s e não entra na central

#### Scenario: Crítico sempre ligado
- **WHEN** o usuário abre a seção Notificações
- **THEN** o Crítico aparece ligado e sem como desligar, com a explicação de que ele sempre vira aviso

#### Scenario: Foco pelos Ajustes
- **WHEN** o usuário liga o Foco na seção Notificações
- **THEN** o sino passa a mostrar "Foco", e a central mostra o Foco ligado

#### Scenario: E-mail da pessoa
- **WHEN** a pessoa da conta tem o e-mail ana.souza@empresa.com.br, e o usuário abre a seção Notificações
- **THEN** o grupo "Por e-mail" diz que as notificações vão para ana.souza@empresa.com.br, com o crítico na hora ligado e o resumo diário

#### Scenario: Pessoa sem e-mail
- **WHEN** a pessoa da conta não tem e-mail, e o usuário abre a seção Notificações
- **THEN** o grupo "Por e-mail" diz que a pessoa não tem e-mail, com "Peça à administração para cadastrar o seu e-mail.", e os ajustes do e-mail ficam desligados

#### Scenario: Receber neste aparelho
- **WHEN** o usuário escolhe "Receber neste aparelho", e o navegador permite os avisos
- **THEN** o aparelho aparece na lista como "Este aparelho", e "Mandar um aviso de teste" fica disponível
