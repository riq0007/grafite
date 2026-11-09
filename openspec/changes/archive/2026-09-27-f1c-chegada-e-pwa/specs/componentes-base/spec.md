## MODIFIED Requirements

### Requirement: Aviso persistente ou temporário

O componente de aviso SHALL oferecer os modos temporário e persistente:
- **temporário:** some depois do tempo definido e pausa a contagem enquanto o ponteiro está sobre ele;
- **persistente:** é usado no nível Crítico e nos avisos que pedem uma decisão, de qualquer severidade, como uma versão nova da aplicação. Só sai por ação do usuário.

Além de "Abrir", "Reconhecer" e "Adiar", o aviso SHALL poder oferecer uma ação com nome próprio, como "Atualizar", e "Fechar" SHALL continuar sempre à vista.

#### Scenario: Aviso crítico
- **WHEN** um aviso de nível Crítico é exibido
- **THEN** ele permanece na tela até o usuário reconhecer, adiar ou fechar

#### Scenario: Pausa no hover
- **WHEN** o ponteiro fica sobre um aviso temporário
- **THEN** a contagem para sumir fica pausada até o ponteiro sair

#### Scenario: Aviso persistente de Informação
- **WHEN** um aviso de Informação é exibido como persistente
- **THEN** ele permanece na tela, qualquer que seja o tempo escolhido, até o usuário agir ou fechar

#### Scenario: Ação com nome próprio
- **WHEN** um aviso oferece a ação "Atualizar" e o usuário a escolhe
- **THEN** a ação acontece, e o aviso sai da tela

### Requirement: No máximo três avisos na tela

A região de avisos SHALL mostrar no máximo três avisos ao mesmo tempo, o mais novo em cima. Quando chega um aviso e já há três na tela, o temporário mais antigo SHALL sair da tela para dar lugar a ele.

Um aviso persistente, crítico ou de outra severidade, SHALL NOT sair da tela por causa de outro aviso. Se os três avisos na tela forem persistentes, o que chega SHALL esperar a sua vez e aparecer quando um deles sair. Só então SHALL começar a contar o seu tempo.

#### Scenario: Quarto aviso
- **WHEN** há três avisos temporários na tela e chega um quarto
- **THEN** o quarto aparece em cima, e o mais antigo sai da tela

#### Scenario: Crítico entre temporários
- **WHEN** há na tela um aviso crítico e dois temporários, e chegam mais dois avisos
- **THEN** o crítico continua na tela, e os dois temporários mais antigos saem

#### Scenario: Persistente de Informação entre temporários
- **WHEN** há na tela o aviso "Nova versão do Grafite" e dois temporários, e chegam mais dois avisos
- **THEN** o aviso da versão nova continua na tela, e os dois temporários mais antigos saem

#### Scenario: Três críticos na tela
- **WHEN** há três avisos críticos na tela e chega um aviso de Atenção
- **THEN** o aviso de Atenção espera, aparece quando um crítico sai e só então começa a contar o seu tempo
