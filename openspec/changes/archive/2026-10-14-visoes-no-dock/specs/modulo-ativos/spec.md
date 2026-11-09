## MODIFIED Requirements

### Requirement: Ativos no dock

A casca SHALL ter o módulo Ativos, entre o Início e a Administração. Ele SHALL ficar visível só para quem tem `ativos.ver`, `catalogo.administrar` ou `modelos.editar`, em qualquer escopo, e só com o módulo ligado na organização (spec modulos-da-organizacao).

O menu em árvore do módulo SHALL ter, nesta ordem:
- **Ativos:** a lista dos ativos, para quem tem `ativos.ver`, com:
  - "Todos os ativos";
  - as visões fixadas no menu (spec visoes-de-tabela): primeiro as da organização, na ordem em que foram fixadas, e depois as da conta;
  - "Por tipo", um submenu com os tipos ativos, cada um com o ícone dele, que abre a tabela com a origem do tipo (spec cadastro-de-ativos);
- **Importações:** a lista das importações da conta, para quem tem `ativos.editar` (spec importacao-de-ativos);
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
- **THEN** a lista dos ativos abre, e o menu mostra só o item Ativos, com "Todos os ativos", as visões fixadas e "Por tipo"

#### Scenario: Quem edita ativos
- **WHEN** uma conta com `ativos.editar`, que inclui `ativos.ver`, abre o menu do módulo Ativos
- **THEN** o menu mostra Ativos e Importações

#### Scenario: Impressoras pelo menu
- **WHEN** o usuário escolhe "Ativos › Por tipo › Impressora" no menu do dock
- **THEN** a tabela dos ativos abre com a origem "Ativos do tipo Impressora"
