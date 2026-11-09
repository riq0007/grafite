## Purpose

Fazer do Grafite um aplicativo instalável, que abre rápido e abre mesmo sem rede, troca de versão quando o usuário escolhe e nunca serve dados velhos da API.

## ADDED Requirements

### Requirement: Instalação

Servida em HTTPS ou no `localhost`, a aplicação SHALL poder ser instalada como aplicativo no computador, no tablet e no celular, com o nome, os ícones e as cores do manifesto. Instalada, ela SHALL abrir em janela própria.

#### Scenario: Instalar no computador
- **WHEN** o usuário abre a aplicação no Chrome, pelo endereço dela
- **THEN** o navegador oferece instalar o Grafite, e o aplicativo instalado abre em janela própria

### Requirement: Abertura sem rede

Depois da primeira abertura, a aplicação SHALL abrir sem rede, em qualquer endereço dela, com a casca completa. O item de rede SHALL mostrar "Sem conexão com o servidor".

#### Scenario: Seção sem rede
- **WHEN** o usuário já abriu a aplicação antes e abre o endereço da seção Dock sem rede
- **THEN** a seção Dock aparece, e o item de rede mostra "Sem conexão com o servidor"

### Requirement: API nunca do cache

As respostas da API e do `/health` SHALL vir sempre do servidor. Sem rede, elas SHALL falhar como falham sem a aplicação instalada, sem nenhuma resposta guardada. Um endereço da API SHALL NOT ser respondido com a página da aplicação.

#### Scenario: Saúde sem rede
- **WHEN** a aplicação está aberta sem rede e confere o `/api/health`
- **THEN** a conferência falha, e o item de rede mostra "Sem conexão com o servidor"

### Requirement: Versão nova

A aplicação SHALL procurar versão nova ao abrir e a cada hora. Quando houver uma, SHALL aparecer um aviso persistente de Informação, "Nova versão do Grafite", com "Atualizar" e "Fechar":
- "Atualizar" SHALL passar à versão nova e recarregar a página;
- "Fechar" SHALL deixar a troca para a próxima abertura.

A aplicação SHALL NOT recarregar sozinha, e o aviso SHALL NOT entrar na central de notificações.

#### Scenario: Versão nova no meio do trabalho
- **WHEN** sai uma versão nova enquanto o usuário edita um ajuste
- **THEN** aparece o aviso "Nova versão do Grafite", e a página não recarrega

#### Scenario: Atualizar
- **WHEN** o usuário escolhe "Atualizar" no aviso
- **THEN** a página recarrega na versão nova

#### Scenario: Fechar
- **WHEN** o usuário escolhe "Fechar" no aviso
- **THEN** o aviso sai, a versão atual continua, e a próxima abertura já vem na versão nova

### Requirement: Arquivos da web com o cache certo

A API SHALL entregar com cache longo só os arquivos com a versão no nome. O `index.html`, o service worker, o manifesto, os ícones e os demais arquivos sem versão no nome SHALL ser entregues sem cache longo, para o navegador achar a versão nova.

#### Scenario: Service worker
- **WHEN** o navegador pede o service worker da aplicação
- **THEN** a resposta vem sem cache longo

#### Scenario: Arquivo com versão no nome
- **WHEN** o navegador pede um arquivo de script com a versão no nome
- **THEN** a resposta vem com cache longo e imutável
