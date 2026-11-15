## MODIFIED Requirements

### Requirement: Gestão de ativos no dock

A casca SHALL ter o módulo Gestão de ativos, logo depois do Ativos. Ele SHALL ficar visível só para quem tem `catalogo.administrar`, `modelos.editar`, `ativos.editar`, `software.distribuir` ou `controlid.ver`, em qualquer escopo, e só com o módulo Ativos ligado na organização (spec modulos-da-organizacao).

O menu em árvore do módulo SHALL ter, nesta ordem:
- **Catálogo:** com Tipos, Campos e Modelos, para quem tem `catalogo.administrar` ou `modelos.editar`. Os três SHALL aparecer para quem vê o Catálogo, e as ações de cada tela SHALL seguir a permissão dela;
- **Importações:** a lista das importações da conta, para quem tem `ativos.editar` (spec importacao-de-ativos);
- **Software:** com a Base de pacotes, as Distribuições e a Matriz, para quem tem `software.distribuir` (spec distribuicao-de-software);
- **Control iD:** com "Backups" e "Comparar backups", para quem tem `controlid.ver` (specs backup-do-control-id e comparacao-e-restauracao-do-control-id).

O item do dock SHALL levar à primeira tela do menu que a conta pode usar, nesta ordem: a de tipos, a das importações, a da base de pacotes e a dos backups. No celular, o módulo SHALL ficar em "Mais".

#### Scenario: Quem administra o catálogo
- **WHEN** uma conta com `catalogo.administrar` escolhe a Gestão de ativos no dock
- **THEN** a tela de tipos abre, e o menu mostra o Catálogo, com Tipos, Campos e Modelos

#### Scenario: Só os modelos
- **WHEN** uma conta só com `modelos.editar` abre o menu da Gestão de ativos
- **THEN** o menu mostra só o Catálogo, com Tipos, Campos e Modelos, e só a tela de modelos oferece o cadastro

#### Scenario: Quem edita ativos
- **WHEN** uma conta com `ativos.editar`, sem as permissões do catálogo, do software e do Control iD, escolhe a Gestão de ativos no dock
- **THEN** a lista das importações abre, e o menu mostra só Importações

#### Scenario: Técnico do software
- **WHEN** uma conta só com `software.distribuir` escolhe a Gestão de ativos no dock
- **THEN** a base de pacotes abre, e o menu mostra o Software, com a Base de pacotes, as Distribuições e a Matriz

#### Scenario: Técnico do Control iD
- **WHEN** uma conta só com `controlid.ver` abre o menu da Gestão de ativos
- **THEN** o menu mostra só o Control iD, com "Backups" e "Comparar backups"

#### Scenario: Conta só com a lista dos ativos
- **WHEN** uma conta só com `ativos.ver` entra
- **THEN** o dock mostra o Ativos e não mostra a Gestão de ativos
