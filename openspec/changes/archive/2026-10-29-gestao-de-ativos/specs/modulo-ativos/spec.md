## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Catálogo na busca

**Reason**: O catálogo sai do Ativos e vai para a Gestão de ativos.

**Migration**: O mesmo requisito passa à spec modulo-gestao-de-ativos, com os modelos levando à ficha na Gestão de ativos.

### Requirement: Catálogo atualizado pelos eventos

**Reason**: As telas do catálogo passam para a Gestão de ativos.

**Migration**: O mesmo requisito passa à spec modulo-gestao-de-ativos, sem mudança de comportamento.
