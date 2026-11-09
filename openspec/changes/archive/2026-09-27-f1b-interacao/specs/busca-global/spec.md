## Purpose

Encontrar qualquer coisa do Grafite a partir de um só campo, aberto de qualquer lugar da casca: módulos, telas, ajustes, ações e, pelos provedores dos módulos, os registros de negócio.

## ADDED Requirements

### Requirement: Abrir e fechar a busca

A busca SHALL abrir com Ctrl+K (⌘K no Mac) de qualquer lugar da casca, inclusive com o foco num campo de texto. SHALL abrir também pelo botão de busca da barra superior, que mostra o atalho. Ao abrir, o foco SHALL ir para o campo de busca, vazio.

A busca SHALL fechar com Esc, com o mesmo atalho e com um clique fora dela. Fechar sem escolher um resultado SHALL devolver o foco ao elemento que o tinha antes. Abrir e fechar SHALL levar cerca de 180 ms, só com troca de opacidade quando o movimento é reduzido.

#### Scenario: Atalho com o foco num campo
- **WHEN** o foco está num campo de texto e o usuário pressiona Ctrl+K
- **THEN** a busca abre com o foco no campo de busca, vazio

#### Scenario: Fechar sem escolher
- **WHEN** o usuário abre a busca pelo botão da barra e pressiona Esc
- **THEN** a busca fecha, e o foco volta ao botão

#### Scenario: Botão da barra
- **WHEN** o usuário olha a barra superior no computador
- **THEN** o botão de busca mostra o atalho "Ctrl K", ou "⌘K" no Mac

### Requirement: O que a busca encontra

A busca SHALL encontrar, em grupos com nome:
- **Ir para:** os módulos e os itens dos menus de cada módulo registrado;
- **Ações:** comandos da casca e dos módulos, como abrir as notificações e trocar o tema;
- **Ajustes:** cada seção dos Ajustes e cada ajuste delas, como "Tamanho do dock".

Cada resultado SHALL mostrar o nome e, em texto secundário, onde fica, como "Ajustes › Dock". Com o campo vazio, a busca SHALL mostrar os módulos, no grupo Ir para.

#### Scenario: Um ajuste
- **WHEN** o usuário digita "tamanho do dock"
- **THEN** aparece "Tamanho do dock", no grupo Ajustes, com "Ajustes › Dock" em texto secundário

#### Scenario: Campo vazio
- **WHEN** a busca abre
- **THEN** ela mostra os módulos no grupo Ir para, antes de qualquer digitação

### Requirement: Busca sem acento e com as palavras em qualquer ordem

A comparação SHALL ignorar acentos, maiúsculas e espaços repetidos. Cada palavra digitada SHALL aparecer no nome, no caminho ou nas palavras-chave do resultado, em qualquer ordem.

Dentro de um grupo, os resultados cujo nome começa pelo texto digitado SHALL vir antes dos demais. Sem nenhum resultado, a busca SHALL dizer "Nada encontrado para “<texto>”.".

#### Scenario: Sem acento
- **WHEN** o usuário digita "aparencia"
- **THEN** a seção "Aparência" aparece

#### Scenario: Palavras em outra ordem
- **WHEN** o usuário digita "dock tamanho"
- **THEN** "Tamanho do dock" aparece

#### Scenario: Nada encontrado
- **WHEN** nenhum resultado corresponde a "xyz"
- **THEN** a busca mostra "Nada encontrado para “xyz”."

### Requirement: Teclado e escolha

As setas para cima e para baixo SHALL mover o resultado escolhido, passando de um grupo ao outro, com o foco sempre no campo. Enter e o clique SHALL acionar o resultado. Acionar SHALL fechar a busca e:
- **Ir para:** navegar até o endereço, sem recarregar a página;
- **Ajustes:** abrir a seção, com o foco no controle do ajuste;
- **Ações:** executar a ação.

O leitor de tela SHALL anunciar o resultado escolhido e o grupo dele.

#### Scenario: Escolha pelo teclado
- **WHEN** o usuário digita "dock", desce com a seta até "Tamanho do dock" e pressiona Enter
- **THEN** a seção Dock dos Ajustes abre, com o foco no controle do tamanho

#### Scenario: Uma ação
- **WHEN** o usuário escolhe a ação "Usar o tema Névoa"
- **THEN** a busca fecha, e a interface passa ao tema Névoa na hora

### Requirement: Provedores de busca dos módulos

Um módulo SHALL poder registrar um provedor de busca assíncrono, com o nome do grupo dos resultados dele. A busca SHALL:
- chamar o provedor só com pelo menos 2 caracteres e depois de 150 ms sem digitação;
- cancelar a chamada em curso quando o texto muda ou a busca fecha, e descartar uma resposta que chega depois de o texto mudar;
- mostrar "Buscando…" no grupo enquanto espera, e desistir depois de 5 s, com uma mensagem de erro no grupo;
- mostrar os resultados locais na hora e os do provedor abaixo deles, sem trocar o resultado escolhido quando os do provedor chegam;
- manter os demais grupos funcionando quando um provedor falha.

#### Scenario: Provedor lento
- **WHEN** um provedor leva 1 s para responder
- **THEN** o grupo dele mostra "Buscando…", os resultados locais já podem ser escolhidos e, quando os do provedor chegam, o resultado escolhido continua o mesmo

#### Scenario: Provedor com falha
- **WHEN** o provedor do grupo Ativos responde com erro
- **THEN** o grupo mostra "Não foi possível buscar em Ativos agora.", e os outros grupos continuam utilizáveis

#### Scenario: Resposta atrasada
- **WHEN** o usuário digita "hp" e depois "hp4", e a resposta de "hp" chega depois da de "hp4"
- **THEN** a busca mostra só os resultados de "hp4"

### Requirement: Busca nas posturas e nas camadas

A busca SHALL usar o material translúcido das camadas sobrepostas, trocado pelo sólido com a transparência reduzida. No tablet e no celular, o botão de busca SHALL ficar à vista na barra superior, com alvo de toque de pelo menos 44 × 44 px. No celular, a busca SHALL ocupar a largura da tela, no topo.

#### Scenario: Busca no celular
- **WHEN** o usuário toca no botão de busca num celular com 390 px de largura
- **THEN** a busca abre na largura da tela, sem rolagem horizontal

#### Scenario: Transparência reduzida
- **WHEN** a transparência reduzida está ativa e a busca abre
- **THEN** a busca aparece com fundo sólido, sem desfoque
