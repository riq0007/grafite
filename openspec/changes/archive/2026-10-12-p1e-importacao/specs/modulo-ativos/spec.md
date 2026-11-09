## MODIFIED Requirements

### Requirement: Ativos no dock

A casca SHALL ter o módulo Ativos, entre o Início e a Administração. Ele SHALL ficar visível só para quem tem `ativos.ver`, `catalogo.administrar` ou `modelos.editar`, em qualquer escopo, e só com o módulo ligado na organização (spec modulos-da-organizacao).

O menu em árvore do módulo SHALL ter, nesta ordem:
- **Ativos:** a lista dos ativos, para quem tem `ativos.ver`;
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
- **THEN** a lista dos ativos abre, e o menu mostra só o item Ativos

#### Scenario: Quem edita ativos
- **WHEN** uma conta com `ativos.editar`, que inclui `ativos.ver`, abre o menu do módulo Ativos
- **THEN** o menu mostra Ativos e Importações


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

