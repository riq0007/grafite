## Why

Para acessar uma máquina, a TI hoje abre um cliente VNC à parte, digita o IP e procura a máquina pelo patrimônio em outro lugar. O usuário pediu, em 28/10:
- um botão em cada máquina que abre o acesso remoto no próprio Grafite, no navegador, como o noVNC, sem cliente VNC;
- as máquinas com o acesso VNC no mapa da planta.

A change é um subprojeto novo da spec mestre (S3). Ela usa a capacidade dos tipos (spec catalogo-de-ativos), o IP da disponibilidade na rede (spec disponibilidade-de-rede) e o mapa (spec mapa-da-planta).

## What Changes

- **A capacidade "Acesso remoto por VNC" nos tipos.**
  - Ela usa o IP da disponibilidade na rede do mesmo tipo e tem a porta, 5900 de fábrica.
  - Ela não traz campos.
- **"Acesso remoto" na ficha do ativo.** Para quem tem `ativos.acesso-remoto` no local do ativo, o botão abre a tela do acesso remoto, que mostra a tela da máquina no navegador, com:
  - a situação em texto: "Conectando…", "Conectado" ou "Desconectado", com o motivo;
  - a senha do VNC, quando a máquina pede, digitada na hora e nunca guardada;
  - "Ctrl+Alt+Del", "Ajustar à janela", "Tela cheia" e "Desconectar".
- **A ponte na API.** A API abre uma conexão WebSocket por acesso e a liga à porta VNC da máquina, só para a conta com a permissão no local, vinda do próprio Grafite. Cada acesso aberto vai para a auditoria, com o ativo, quem abriu e quando.
- **No mapa.** O marcador do ativo com o acesso remoto ganha a ação "Acesso remoto", para quem pode.
- **A permissão.** `ativos.acesso-remoto`, "Acessar as máquinas por VNC", por local, inclui ver os ativos. O perfil Administrador tem.

## Capabilities

### New Capabilities
- `acesso-remoto`: a capacidade VNC, a permissão, a ponte WebSocket, a tela do acesso remoto, a auditoria e a ação no mapa.

### Modified Capabilities
Nenhuma.

## Impact

- **`packages/domain`:** a capacidade e a configuração dela, a permissão e a ação da auditoria.
- **`apps/api`:** o `@fastify/websocket` 11.3.4, a rota da ponte, a configuração no esquema do catálogo e a ação no marcador do mapa.
- **`apps/web`:** o `@novnc/novnc` 1.7.0, a porta no formulário do tipo, o botão na ficha e a tela do acesso remoto.
