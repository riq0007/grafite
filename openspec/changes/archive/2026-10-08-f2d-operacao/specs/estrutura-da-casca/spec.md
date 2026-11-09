## MODIFIED Requirements

### Requirement: Itens de status da barra

A barra SHALL mostrar, à direita e nesta ordem:
- **Ambiente:** só no ambiente de teste, o texto "Ambiente de teste", com um ícone. Nos outros ambientes, o item SHALL NOT aparecer (spec operacao-servicos).
- **Busca:** um botão com a lupa e o atalho ("Ctrl K", ou "⌘K" no Mac), que abre a busca.
- **Rede:**
  - mostra se a aplicação alcança o servidor, por ícone e nome acessível, e com o texto "Sem conexão com o servidor" quando não alcança;
  - o estado nunca é comunicado só por cor;
  - a perda de rede do navegador SHALL aparecer na hora, e a falta de resposta do servidor em até 1 minuto.
- **Notificações:** o sino, com o número de não lidas, que abre a central de notificações.
- **Relógio:** dia da semana, dia, mês abreviado e horário, em pt-BR, como "qui 24 set 14:32", atualizado na virada do minuto.
- **Usuário:**
  - o avatar com a foto da pessoa da conta, ou com as iniciais quando não há foto, e o nome da pessoa, num menu com "Conta", "Ajustes do Sistema" e "Sair";
  - "Conta" abre a seção Conta dos Ajustes, e "Sair" encerra a sessão;
  - com a sessão desconhecida, porque o servidor não respondeu, o item SHALL mostrar um avatar neutro, sem nome nem foto inventados, e o menu só com "Ajustes do Sistema".

No celular, a barra SHALL manter à vista o ambiente de teste, a busca, as notificações e o usuário, e a rede só quando não há conexão.

#### Scenario: Servidor fora do ar
- **WHEN** a API deixa de responder
- **THEN** em até 1 minuto o item de rede mostra o ícone de sem conexão e o texto "Sem conexão com o servidor"

#### Scenario: Navegador sem rede
- **WHEN** o navegador perde a rede
- **THEN** o item de rede mostra "Sem conexão com o servidor" na hora, e volta ao normal quando a rede e o servidor voltam

#### Scenario: Virada do minuto
- **WHEN** o horário passa de 14:32 para 14:33
- **THEN** o relógio da barra mostra 14:33, sem depender de outra ação

#### Scenario: Menu do usuário
- **WHEN** a conta de "Ana Souza", sem foto, está com a sessão valendo e o usuário abre o item de usuário
- **THEN** o item mostra "AS" e o nome acessível "Ana Souza", e o menu oferece "Conta", "Ajustes do Sistema" e "Sair"

#### Scenario: Usuário com foto
- **WHEN** a pessoa da conta de "Ana Souza" tem foto
- **THEN** o item de usuário mostra a foto de Ana, com o nome acessível "Ana Souza"

#### Scenario: Usuário com a sessão desconhecida
- **WHEN** a casca abriu sem resposta do servidor
- **THEN** o item de usuário mostra o avatar neutro, e o menu oferece só "Ajustes do Sistema"

#### Scenario: Barra no celular
- **WHEN** a casca está no celular, com o servidor alcançado
- **THEN** a barra mostra o nome do módulo, a busca, o sino e o usuário, e não mostra a rede nem o relógio

#### Scenario: Ambiente de teste
- **WHEN** a casca abre no ambiente de teste
- **THEN** a barra mostra "Ambiente de teste", com o ícone, antes da busca, também no celular

#### Scenario: Produção sem aviso
- **WHEN** a casca abre na produção
- **THEN** a barra não mostra o item de ambiente
