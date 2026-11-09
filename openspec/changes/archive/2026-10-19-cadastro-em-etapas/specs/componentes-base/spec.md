## ADDED Requirements

### Requirement: Etapas de um formulário

A biblioteca SHALL oferecer a lista das etapas de um formulário longo, empilhadas na vertical, cada uma com o número, o nome e a situação dela em texto, como "Falta: IP" ou "Preenchida".

A lista SHALL seguir estas regras:
- a etapa atual SHALL ser marcada pela forma e anunciada pelo leitor de tela como a etapa atual, e não só pela cor;
- a lista SHALL funcionar pelo mouse, pelo teclado e pelo toque: o Tab chega a ela, as setas andam entre as etapas, e o Enter ou o espaço abre a escolhida;
- uma etapa sem a escolha, como a que depende de outra que falta, SHALL aparecer apagada, com o motivo em texto, e SHALL NOT abrir;
- no toque, cada etapa SHALL ter alvo de pelo menos 44 px;
- na largura do celular, a lista SHALL virar uma faixa horizontal que rola, com a etapa atual à vista.

#### Scenario: Etapa atual anunciada
- **WHEN** o foco chega à etapa "3 · Identificação", que é a atual
- **THEN** o leitor de tela anuncia o nome, a situação dela e que ela é a etapa atual

#### Scenario: Etapa pelo teclado
- **WHEN** o foco está na etapa 2, e o usuário pressiona a seta para baixo e o Enter
- **THEN** a etapa 3 abre e passa a ser a atual

#### Scenario: Etapa sem a escolha
- **WHEN** uma etapa depende de outra que ainda falta
- **THEN** ela aparece apagada, com o motivo em texto, e o clique e o Enter não a abrem
