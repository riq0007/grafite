## MODIFIED Requirements

### Requirement: Administração no dock

A casca SHALL ter o módulo Administração, entre os módulos e Ajustes, visível só para quem tem ao menos uma destas permissões: `pessoas.ver`, `acessos.ver`, `locais.editar`, `organizacao.editar`, `auditoria.ver`, `tarefas.administrar` ou, na organização que opera o servidor, `backup.administrar`. O menu em árvore do dock SHALL ter, nesta ordem, Pessoas, Perfis, Grupos, Locais, Padrões, Módulos, Auditoria, Tarefas e Backup, cada um só para quem tem a permissão da tela:
- **Pessoas:** `pessoas.ver`;
- **Perfis e Grupos:** `acessos.ver`;
- **Locais:** `locais.editar`;
- **Padrões e Módulos:** `organizacao.editar`;
- **Auditoria:** `auditoria.ver`;
- **Tarefas:** `tarefas.administrar`;
- **Backup:** `backup.administrar`, e só na organização que opera o servidor.

No celular, a Administração SHALL ficar em "Mais".

#### Scenario: Conta sem permissão de administração
- **WHEN** uma conta sem nenhuma dessas permissões abre a casca
- **THEN** o dock não mostra Administração, e a busca não oferece as telas dela

#### Scenario: Conta só com a auditoria
- **WHEN** uma conta só com `auditoria.ver` abre o menu de Administração
- **THEN** o menu mostra só Auditoria

#### Scenario: Conta só com os padrões
- **WHEN** uma conta só com `organizacao.editar` abre o menu de Administração
- **THEN** o menu mostra só Padrões e Módulos

#### Scenario: Organização que não opera o servidor
- **WHEN** a administradora de uma organização cliente, com o perfil Administrador, abre o menu de Administração
- **THEN** o menu não mostra Backup, mesmo com `backup.administrar` no perfil

## ADDED Requirements

### Requirement: Tela de módulos

A tela de módulos SHALL listar os módulos opcionais (spec modulos-da-organizacao), cada um com o nome, a descrição e um interruptor que diz, em texto, se ele está ligado ou desligado.

Desligar SHALL pedir confirmação: "Desligar o módulo Ativos?", dizendo que ele some do dock e da busca de todos e que os dados ficam guardados. A recusa da API SHALL aparecer junto do módulo, e o interruptor SHALL voltar ao que estava.

#### Scenario: Confirmação ao desligar
- **WHEN** quem edita a organização desliga o Ativos e escolhe "Cancelar" na confirmação
- **THEN** o Ativos continua ligado, e nada é gravado
