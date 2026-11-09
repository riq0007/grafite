## Purpose

Reunir na casca o módulo Ativos, onde ficam o catálogo e, a partir do P1b, os ativos da organização.

## ADDED Requirements

### Requirement: Ativos no dock

A casca SHALL ter o módulo Ativos, entre o Início e a Administração. Ele SHALL ficar visível só para quem tem `catalogo.administrar` ou `modelos.editar`, em qualquer escopo.

O menu em árvore do módulo SHALL ter o item Catálogo, com Tipos, Campos e Modelos. Os três SHALL aparecer para quem vê o módulo, e as ações de cada tela SHALL seguir a permissão dela.

O item do dock SHALL levar à tela de tipos. No celular, o módulo SHALL ficar na barra de abas, logo depois do Início.

#### Scenario: Conta sem as permissões do catálogo
- **WHEN** uma conta sem `catalogo.administrar` e sem `modelos.editar` entra
- **THEN** o dock não mostra o módulo Ativos

#### Scenario: Só os modelos
- **WHEN** uma conta só com `modelos.editar` abre o menu do módulo Ativos
- **THEN** o menu mostra Catálogo, com Tipos, Campos e Modelos, e só a tela de modelos oferece o cadastro

### Requirement: Catálogo na busca

A busca (Ctrl+K) SHALL oferecer:
- as ações "Novo tipo de ativo" e "Novo campo", a quem tem `catalogo.administrar`, e "Novo modelo", a quem tem `modelos.editar`;
- os modelos pelo fabricante e pelo nome, a quem vê o módulo, cada um com o tipo e levando à ficha do modelo.

#### Scenario: Modelo pela busca
- **WHEN** quem vê o módulo Ativos digita "M404" na busca
- **THEN** a busca mostra a "HP LaserJet M404", com o tipo "Impressora", e Enter abre a ficha do modelo

### Requirement: Catálogo atualizado pelos eventos

As telas do catálogo abertas SHALL se atualizar sozinhas quando o evento `catalogo.mudou` chega, sem uma ação do usuário.

#### Scenario: Modelo cadastrado em outra sessão
- **WHEN** Ana cadastra um modelo enquanto Bruno está com a tela de modelos aberta
- **THEN** a tela de Bruno mostra o modelo novo
