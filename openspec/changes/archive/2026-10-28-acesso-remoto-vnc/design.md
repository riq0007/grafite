## Context

O noVNC é um cliente VNC em JavaScript. Ele fala o protocolo RFB por um WebSocket, e alguém no meio liga o WebSocket ao TCP da porta VNC. Esse papel normalmente é do `websockify`. No Grafite, ele é da API, que já sabe quem está na sessão, o local do ativo e o IP dele.

## Goals / Non-Goals

**Goals:**
- a tela da máquina no navegador, a partir da ficha e do mapa;
- a ponte com a permissão por local, a mesma origem e a auditoria;
- a senha do VNC só na hora.

**Non-Goals:**
- Guardar a senha do VNC no Cofre e entrar sem pedir. Fica para depois, com a confirmação do Cofre.
- RDP e SSH. Eles pedem outros clientes e outras pontes.
- Gravar a sessão ou só olhar sem mexer.
- Passar pelo coletor. A ponte sai do servidor do Grafite, que fica na rede das máquinas, como a verificação dos painéis.

## Decisions

1. **A capacidade `acesso.vnc`.** Ela segue o padrão do backup do Control iD: depende de outra capacidade do tipo, a `rede.disponibilidade`, e usa o campo de IP dela. A configuração é só a porta, 5900 de fábrica.
2. **A ponte com o `@fastify/websocket` 11.3.4.**
   - A rota `GET /ativos/:id/acesso-remoto` é WebSocket (`websocket: true`) e fica fora do contrato (`hide`).
   - Os ganchos da sessão e da permissão rodam antes da troca do protocolo.
   - O manipulador confere:
     - a origem: o cabeçalho `Origin` com o mesmo host;
     - o ativo, o tipo e o IP;
     - a permissão no local, pelo `exigirEm`.
   - Depois ele grava a auditoria e abre o `net.connect` com 10 s de prazo.
   - Os dados passam como binário nos dois sentidos. O fim de um lado fecha o outro, com o motivo no código 4000 do fechamento.
3. **O noVNC 1.7.0 na web.**
   - A tela `/ativos/$id/remoto` cria o `RFB` do `@novnc/novnc` num elemento que ocupa a área da janela, com `scaleViewport` no "Ajustar à janela".
   - Ela ouve `connect`, `disconnect` e `credentialsrequired`. Este abre o diálogo da senha e responde com `sendCredentials`.
   - "Ctrl+Alt+Del" chama `sendCtrlAltDel`.
   - "Tela cheia" usa a API de tela cheia do navegador no elemento.
4. **A ação no mapa.** O fornecedor dos ativos acrescenta "Acesso remoto" ao marcador quando o tipo tem a capacidade e a conta pode no local. Não há camada nova: a máquina já está na camada dos ativos.

## Risks / Trade-offs

- **[A ponte abre conexões do servidor para a rede interna]** → Ela só abre para o IP do ativo, na porta do tipo, para quem tem a permissão no local, e cada acesso fica na auditoria.
- **[O VNC sem senha deixa qualquer um com a permissão entrar]** → A permissão é por local e auditada. A senha do VNC continua sendo da máquina.
- **[O WebSocket atrás do proxy da instalação]** → O Caddy repassa o WebSocket sem configuração a mais.
