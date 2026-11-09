## MODIFIED Requirements

### Requirement: Ativos no dock

A casca SHALL ter o módulo Ativos, entre o Início e a Administração. Ele SHALL ficar visível só para quem tem `ativos.ver`, `catalogo.administrar` ou `modelos.editar`, em qualquer escopo, e só com o módulo ligado na organização (spec modulos-da-organizacao).

O menu em árvore do módulo SHALL ter, nesta ordem:
- **Ativos:** a lista dos ativos, para quem tem `ativos.ver`;
- **Catálogo:** com Tipos, Campos e Modelos, para quem tem `catalogo.administrar` ou `modelos.editar`. Os três SHALL aparecer para quem vê o Catálogo, e as ações de cada tela SHALL seguir a permissão dela.

O item do dock SHALL levar à lista dos ativos e, para quem não vê ativos, à tela de tipos. No celular, o módulo SHALL ficar na barra de abas, logo depois do Início.

#### Scenario: Conta sem as permissões do catálogo
- **WHEN** uma conta sem `catalogo.administrar` e sem `modelos.editar`, e também sem `ativos.ver`, entra
- **THEN** o dock não mostra o módulo Ativos

#### Scenario: Só os modelos
- **WHEN** uma conta só com `modelos.editar` abre o menu do módulo Ativos
- **THEN** o menu mostra só o Catálogo, com Tipos, Campos e Modelos, e só a tela de modelos oferece o cadastro

#### Scenario: Só os ativos
- **WHEN** uma conta só com `ativos.ver` escolhe o Ativos no dock
- **THEN** a lista dos ativos abre, e o menu mostra só o item Ativos

## ADDED Requirements

### Requirement: Ativos na busca

A busca (Ctrl+K) SHALL oferecer:
- a ação "Novo ativo", a quem tem `ativos.editar`;
- os ativos que a conta pode ver, pelo nome, pelo patrimônio, pela série, pelo hostname e pelo modelo, cada um com o patrimônio, o tipo e o local, e levando à ficha.

#### Scenario: Ativo pelo patrimônio
- **WHEN** quem vê ativos digita "00412" na busca
- **THEN** a busca mostra a impressora PAT-00412, com o tipo e o local, e Enter abre a ficha dela

### Requirement: Ativos atualizados pelos eventos

A lista e a ficha dos ativos abertas SHALL se atualizar sozinhas, sem uma ação do usuário, quando chega:
- o evento `ativos.mudaram`;
- o evento de uma mudança que elas mostram: `catalogo.mudou`, pelo modelo e pelos campos, `locais.mudaram`, pelo caminho do local, e `pessoas.mudaram`, pelo nome do responsável.

Um formulário em edição SHALL manter o que foi digitado.

#### Scenario: Ativo cadastrado em outra sessão
- **WHEN** Ana cadastra um ativo enquanto Bruno está com a lista dos ativos aberta
- **THEN** a lista de Bruno mostra o ativo novo
