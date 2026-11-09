# acesso-remoto Specification

## Purpose

Abrir a tela de uma máquina no próprio Grafite, pelo VNC, sem cliente à parte, com a permissão por local e o registro de cada acesso.

## Requirements

### Requirement: Capacidade do acesso remoto

A capacidade `acesso.vnc` (Acesso remoto por VNC) SHALL ter a descrição "Abre a tela da máquina no navegador, pelo VNC.". Ela SHALL NOT trazer campos. Ela SHALL usar o campo de IP da disponibilidade na rede do mesmo tipo, e a configuração dela SHALL ser a porta do VNC, de 1 a 65535, com 5900 já escolhida.

A gravação do tipo SHALL recusar:
- a capacidade sem a disponibilidade na rede, com "Ligue a disponibilidade na rede no tipo: o acesso remoto usa o mesmo IP.";
- a porta fora dos limites, com "Informe a porta de 1 a 65535.".

#### Scenario: Tipo com o acesso remoto
- **WHEN** quem administra o catálogo liga o acesso remoto no tipo "Computador", que já tem a disponibilidade na rede
- **THEN** o tipo fica com a porta 5900, e a ficha dos computadores passa a ter "Acesso remoto" para quem pode

### Requirement: Permissão e auditoria do acesso remoto

O catálogo SHALL ter `ativos.acesso-remoto`, "Acessar as máquinas por VNC", na área "Ativos", por local, incluindo `ativos.ver`. O perfil Administrador SHALL ter a permissão.

Cada acesso aberto SHALL ir para a auditoria, com a ação "Acesso remoto aberto", o ativo, quem abriu e o momento. O acesso SHALL NOT gravar evento.

#### Scenario: Acesso registrado
- **WHEN** a técnica abre o acesso remoto do computador PAT-00321
- **THEN** a auditoria registra "Acesso remoto aberto", com o PAT-00321 e a técnica

### Requirement: Ponte do acesso remoto

A API SHALL ligar uma conexão WebSocket do Grafite à porta VNC da máquina, só quando:
- o pedido vem do próprio Grafite, com a mesma origem;
- a conta tem `ativos.acesso-remoto` no local do ativo;
- o ativo está ativo, o tipo tem o acesso remoto ligado, e o campo de IP tem um IP.

Fora disso, a API SHALL recusar o acesso antes de ligar a porta, com o motivo da recusa. A ponte SHALL passar os dados nos dois sentidos, sem guardar nada. Ela SHALL fechar a conexão com a máquina quando o navegador fecha e fechar o navegador quando a máquina fecha, com o motivo "A máquina encerrou a conexão.". Sem resposta da máquina em 10 s, a ponte SHALL fechar, com o motivo "A máquina não respondeu no VNC.", e, com a conexão recusada, com "A máquina recusou a conexão na porta 5900." (a porta do tipo).

#### Scenario: Conta de outro local
- **WHEN** uma conta com `ativos.acesso-remoto` só em Campinas pede o acesso de um computador de Jundiaí
- **THEN** a API recusa, e nenhuma conexão sai para a máquina

#### Scenario: Máquina sem IP
- **WHEN** o computador não tem o IP preenchido
- **THEN** a API recusa com "O ativo não tem IP para o acesso remoto."

### Requirement: Tela do acesso remoto

A ficha do ativo com o acesso remoto SHALL ter "Acesso remoto" para quem tem `ativos.acesso-remoto` no local dele. O botão SHALL abrir a tela do acesso remoto do ativo, com:
- o nome e o patrimônio;
- a situação em texto: "Conectando…", "Conectado" ou "Desconectado", com o motivo;
- a tela da máquina, que recebe o teclado e o mouse;
- "Ctrl+Alt+Del", "Ajustar à janela", "Tela cheia" e "Desconectar", e "Conectar de novo" depois de desconectado.

Quando a máquina pede a senha, a tela SHALL pedi-la num diálogo. A senha SHALL ir só para a máquina e SHALL NOT ser guardada.

#### Scenario: Máquina com senha
- **WHEN** a técnica abre o acesso remoto de um computador que pede a senha do VNC
- **THEN** a tela pede a senha num diálogo e, com ela, mostra "Conectado" e a tela da máquina

### Requirement: Acesso remoto no mapa

O marcador do ativo com o acesso remoto SHALL ter a ação "Acesso remoto", que abre a tela dele, para quem tem `ativos.acesso-remoto` no local do ativo.

#### Scenario: Pelo mapa
- **WHEN** a técnica escolhe "Acesso remoto" no marcador de um computador no mapa
- **THEN** a tela do acesso remoto daquele computador abre
