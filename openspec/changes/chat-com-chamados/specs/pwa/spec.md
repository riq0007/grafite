## ADDED Requirements

### Requirement: App do chat instalado

O app do chat (spec modulo-chat, "App do chat") SHALL poder ser instalado à parte, no computador e no celular, com o manifesto próprio:
- o nome "Grafite · Chat" e o nome curto "Chat";
- o começo e o alcance em `/chat`;
- os ícones e as cores do Grafite.

Instalado, ele SHALL abrir em janela própria, com o título "Grafite · Chat". O Grafite e o app do chat SHALL poder ficar instalados juntos, cada um com a janela dele, com a mesma sessão e o mesmo service worker.

Tocar no push de uma notificação com o endereço em `/chat` SHALL abrir esse endereço no app do chat instalado, ou numa janela dele já aberta quando houver; sem ele, no navegador.

#### Scenario: Instalar o chat no celular
- **WHEN** Fernanda Rocha abre `/chat` no celular e escolhe instalar
- **THEN** o celular ganha o app "Chat", que abre o chat em janela própria

#### Scenario: Push que abre o chat
- **WHEN** Fernanda Rocha toca no push "Ana Souza respondeu o #1041", com o app do chat instalado
- **THEN** o app do chat abre na conversa do #1041
