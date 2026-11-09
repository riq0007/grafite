# modulo-ativos Specification

## Purpose
Reunir na casca o módulo Ativos, com a lista dos ativos da organização e os tipos direto no menu. O catálogo, as importações, o software e o Control iD ficam na Gestão de ativos (spec modulo-gestao-de-ativos).

## Requirements

### Requirement: Ativos no dock

A casca SHALL ter o módulo Ativos, entre o Início e a Gestão de ativos. Ele SHALL ficar visível só para quem tem `ativos.ver`, em qualquer escopo, e só com o módulo ligado na organização (spec modulos-da-organizacao).

O menu em árvore do módulo SHALL ter só os ativos, nesta ordem:
- "Todos os ativos";
- os tipos ativos, pelo nome, cada um com o ícone dele, direto no menu, que abrem a tabela com a origem do tipo (spec cadastro-de-ativos);
- as visões fixadas no menu (spec visoes-de-tabela), separadas dos tipos por uma linha: primeiro as da organização, na ordem em que foram fixadas, e depois as da conta.

As telas do catálogo, das importações, do software e do Control iD SHALL ficar na Gestão de ativos (spec modulo-gestao-de-ativos).

O item do dock SHALL levar à lista dos ativos. O endereço do módulo, aberto por quem não vê ativos, SHALL levar à Gestão de ativos. No celular, o módulo SHALL ficar na barra de abas, logo depois do Início.

#### Scenario: Conta sem as permissões do catálogo
- **WHEN** uma conta sem `catalogo.administrar` e sem `modelos.editar`, e também sem `ativos.ver`, entra
- **THEN** o dock não mostra o módulo Ativos

#### Scenario: Só os modelos
- **WHEN** uma conta só com `modelos.editar` entra
- **THEN** o dock não mostra o módulo Ativos e mostra a Gestão de ativos, com o Catálogo

#### Scenario: Quem edita ativos
- **WHEN** uma conta com `ativos.editar`, que inclui `ativos.ver`, abre o menu do módulo Ativos
- **THEN** o menu mostra "Todos os ativos", os tipos e as visões fixadas, e as Importações ficam na Gestão de ativos

#### Scenario: Só os ativos
- **WHEN** uma conta só com `ativos.ver` escolhe o Ativos no dock
- **THEN** a lista dos ativos abre, e o menu mostra "Todos os ativos", os tipos ativos e as visões fixadas, sem Importações, Software, Control iD nem Catálogo

#### Scenario: Impressoras pelo menu
- **WHEN** o usuário escolhe "Ativos › Impressora" no menu do dock
- **THEN** a tabela dos ativos abre com a origem "Ativos do tipo Impressora"

#### Scenario: Tipo inativado
- **WHEN** quem administra o catálogo inativa o tipo "Switch" enquanto Bruno está com o Ativos aberto
- **THEN** o "Switch" sai do menu do Ativos de Bruno, sem recarregar

### Requirement: Ativos na busca

A busca (Ctrl+K) SHALL oferecer:
- as ações "Novo ativo" e "Importar planilha", a quem tem `ativos.editar`;
- os ativos que a conta pode ver, pelo nome, pelo patrimônio, pela série, pelo hostname e pelo modelo, cada um com o patrimônio, o tipo e o local, e levando à ficha;
- as visões dos ativos que a conta pode usar, as da organização e as dela, pelo nome, cada uma com "Ativos › Visões" e levando à tabela dos ativos aberta nela, a quem tem `ativos.ver`.

#### Scenario: Ativo pelo patrimônio
- **WHEN** quem vê ativos digita "00412" na busca
- **THEN** a busca mostra a impressora PAT-00412, com o tipo e o local, e Enter abre a ficha dela

#### Scenario: Importar pela busca
- **WHEN** quem edita ativos digita "importar" na busca e escolhe "Importar planilha"
- **THEN** a importação nova abre, pedindo o tipo e a planilha

#### Scenario: Visão pela busca
- **WHEN** quem vê ativos digita "jundiai" na busca, e a organização tem a visão "Impressoras de Jundiaí"
- **THEN** a busca mostra a visão, com "Ativos › Visões", e Enter abre a tabela dos ativos nela

### Requirement: Ativos atualizados pelos eventos

A lista e a ficha dos ativos abertas SHALL se atualizar sozinhas, sem uma ação do usuário, quando chega:
- o evento `ativos.mudaram`;
- o evento de uma mudança que elas mostram: `catalogo.mudou`, pelo modelo e pelos campos, `locais.mudaram`, pelo caminho do local, `pessoas.mudaram`, pelo nome do responsável, e `disponibilidade.mudou`, pela situação da disponibilidade.

Um formulário em edição SHALL manter o que foi digitado.

#### Scenario: Ativo cadastrado em outra sessão
- **WHEN** Ana cadastra um ativo enquanto Bruno está com a lista dos ativos aberta
- **THEN** a lista de Bruno mostra o ativo novo

#### Scenario: Impressora que caiu com a lista aberta
- **WHEN** a impressora PAT-00412 fica offline enquanto Bruno está com a lista dos ativos aberta, com a coluna Disponibilidade
- **THEN** a lista de Bruno mostra a PAT-00412 "Offline" em até 5 s depois da gravação da leitura
