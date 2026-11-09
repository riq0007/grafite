## MODIFIED Requirements

### Requirement: Seção Notificações

A seção Notificações SHALL ajustar:
- quais severidades viram aviso na tela: Atenção e Informação, cada uma ligada ou desligada, com o Crítico sempre ligado e indicado como tal;
- o tempo do aviso de Atenção e de Informação: 6 s, 10 s ou 20 s;
- o modo Foco, ligado ou desligado, com a explicação "Com o Foco ligado, só o Crítico vira aviso. O resto vai para a central.".

A seção SHALL informar que o que não vira aviso continua na central. O botão "Mostrar aviso de exemplo" SHALL mostrar um aviso marcado como exemplo, com o tempo escolhido, que SHALL NOT entrar na central.

#### Scenario: Aviso de exemplo
- **WHEN** o usuário escolhe 10 s e depois "Mostrar aviso de exemplo"
- **THEN** aparece um aviso marcado como exemplo, que some em 10 s e não entra na central

#### Scenario: Crítico sempre ligado
- **WHEN** o usuário abre a seção Notificações
- **THEN** o Crítico aparece ligado e sem como desligar, com a explicação de que ele sempre vira aviso

#### Scenario: Foco pelos Ajustes
- **WHEN** o usuário liga o Foco na seção Notificações
- **THEN** o sino passa a mostrar "Foco", e a central mostra o Foco ligado
