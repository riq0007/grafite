## ADDED Requirements

### Requirement: Atribuição de perfil pela tela

"Atribuir perfil", na ficha da pessoa e na do grupo, SHALL abrir uma gaveta, com a ficha ainda à vista, contendo:
- os perfis ativos que quem atribui pode dar, em rádios, cada um com a descrição e quantas permissões tem;
- o escopo, "Organização inteira" ou "Num local", num controle segmentado, com "Organização inteira" já escolhido;
- com "Num local", a escolha do local em árvore, com o local de trabalho da pessoa sugerido no topo, quando ela tem um;
- o bloco "Resultado", recalculado a cada mudança, antes de confirmar.

O "Resultado" SHALL dizer em texto:
- o perfil e o escopo que a conta ou o grupo passa a ter;
- as permissões do perfil que não valem num local, quando o escopo é um local;
- a atribuição igual que já está em vigor, direta ou por grupo, e então "Atribuir perfil" fica desabilitado com o motivo.

Trocar o perfil SHALL manter o escopo e o local escolhidos.

#### Scenario: Resultado num local
- **WHEN** quem administra os acessos escolhe o "Técnico" para Bruno, com o escopo "Num local" e o local "Jundiaí"
- **THEN** o "Resultado" diz "Bruno passa a ter Técnico em Jundiaí e no que está dentro." e lista as permissões do "Técnico" que não valem num local

#### Scenario: Atribuição que já existe
- **WHEN** Bruno já tem o "Técnico" em "Jundiaí", e alguém escolhe de novo o "Técnico" em "Jundiaí"
- **THEN** o "Resultado" diz "Bruno já tem Técnico em Jundiaí.", e "Atribuir perfil" fica desabilitado

#### Scenario: Trocar o perfil sem perder o local
- **WHEN** alguém escolhe "Num local", o local "Jundiaí" e depois troca o perfil
- **THEN** o escopo e o local continuam escolhidos, e o "Resultado" passa ao perfil novo
