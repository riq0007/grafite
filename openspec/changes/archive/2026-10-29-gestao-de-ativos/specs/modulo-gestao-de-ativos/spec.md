## Purpose

Reunir na casca, num ícone próprio do dock, as telas que cuidam dos ativos sem ser a lista deles: o catálogo, as importações, o software e os backups do Control iD.

## ADDED Requirements

### Requirement: Gestão de ativos no dock

A casca SHALL ter o módulo Gestão de ativos, logo depois do Ativos. Ele SHALL ficar visível só para quem tem `catalogo.administrar`, `modelos.editar`, `ativos.editar`, `software.distribuir` ou `controlid.ver`, em qualquer escopo, e só com o módulo Ativos ligado na organização (spec modulos-da-organizacao).

O menu em árvore do módulo SHALL ter, nesta ordem:
- **Catálogo:** com Tipos, Campos e Modelos, para quem tem `catalogo.administrar` ou `modelos.editar`. Os três SHALL aparecer para quem vê o Catálogo, e as ações de cada tela SHALL seguir a permissão dela;
- **Importações:** a lista das importações da conta, para quem tem `ativos.editar` (spec importacao-de-ativos);
- **Software:** a base e as distribuições, para quem tem `software.distribuir` (spec distribuicao-de-software);
- **Control iD:** com "Backups" e "Comparar backups", para quem tem `controlid.ver` (specs backup-do-control-id e comparacao-e-restauracao-do-control-id).

O item do dock SHALL levar à primeira tela do menu que a conta pode usar, nesta ordem: a de tipos, a das importações, a do software e a dos backups. No celular, o módulo SHALL ficar em "Mais".

#### Scenario: Quem administra o catálogo
- **WHEN** uma conta com `catalogo.administrar` escolhe a Gestão de ativos no dock
- **THEN** a tela de tipos abre, e o menu mostra o Catálogo, com Tipos, Campos e Modelos

#### Scenario: Só os modelos
- **WHEN** uma conta só com `modelos.editar` abre o menu da Gestão de ativos
- **THEN** o menu mostra só o Catálogo, com Tipos, Campos e Modelos, e só a tela de modelos oferece o cadastro

#### Scenario: Quem edita ativos
- **WHEN** uma conta com `ativos.editar`, sem as permissões do catálogo, do software e do Control iD, escolhe a Gestão de ativos no dock
- **THEN** a lista das importações abre, e o menu mostra só Importações

#### Scenario: Técnico do Control iD
- **WHEN** uma conta só com `controlid.ver` abre o menu da Gestão de ativos
- **THEN** o menu mostra só o Control iD, com "Backups" e "Comparar backups"

#### Scenario: Conta só com a lista dos ativos
- **WHEN** uma conta só com `ativos.ver` entra
- **THEN** o dock mostra o Ativos e não mostra a Gestão de ativos

### Requirement: Endereços antigos da Gestão de ativos

Os endereços das telas que saíram do Ativos SHALL levar às mesmas telas na Gestão de ativos, com o resto do caminho e a busca do endereço:
- `/ativos/catalogo/…` a `/gestao/catalogo/…`;
- `/ativos/importacoes/…` a `/gestao/importacoes/…`;
- `/ativos/software/…` a `/gestao/software/…`;
- `/ativos/control-id/…` a `/gestao/control-id/…`.

A troca SHALL substituir o endereço antigo no histórico do navegador, para o voltar não cair nele de novo.

#### Scenario: Favorito da ficha de um modelo
- **WHEN** alguém abre um favorito de `/ativos/catalogo/modelos/<id>`, a ficha do "HP LaserJet M404"
- **THEN** a ficha do modelo abre em `/gestao/catalogo/modelos/<id>`

#### Scenario: Favorito das importações
- **WHEN** alguém abre `/ativos/importacoes`
- **THEN** a lista das importações abre em `/gestao/importacoes`

#### Scenario: Filtro guardado no endereço
- **WHEN** alguém abre `/ativos/catalogo/tipos?situacao=inativos`
- **THEN** a tela de tipos abre em `/gestao/catalogo/tipos?situacao=inativos`, com os inativos

### Requirement: Catálogo na busca

A busca (Ctrl+K) SHALL oferecer:
- as ações "Novo tipo de ativo" e "Novo campo", a quem tem `catalogo.administrar`, e "Novo modelo", a quem tem `modelos.editar`;
- os modelos pelo fabricante e pelo nome, a quem vê o Catálogo, cada um com o tipo e levando à ficha do modelo na Gestão de ativos.

#### Scenario: Modelo pela busca
- **WHEN** quem vê o Catálogo digita "M404" na busca
- **THEN** a busca mostra a "HP LaserJet M404", com o tipo "Impressora", e Enter abre a ficha do modelo na Gestão de ativos

### Requirement: Catálogo atualizado pelos eventos

As telas do catálogo abertas SHALL se atualizar sozinhas quando o evento `catalogo.mudou` chega, sem uma ação do usuário.

#### Scenario: Modelo cadastrado em outra sessão
- **WHEN** Ana cadastra um modelo enquanto Bruno está com a tela de modelos aberta
- **THEN** a tela de Bruno mostra o modelo novo
