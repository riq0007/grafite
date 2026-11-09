## Why

As máquinas da empresa já têm o agente do GLPI instalado, e ele já coleta o hardware, o sistema, as licenças, o antivírus e os softwares instalados. O Grafite tem os campos do inventário de hardware no ativo, mas ninguém os preenche: hoje eles são digitados à mão.

O agente do GLPI aceita mais de um servidor, separados por vírgula no `server` da configuração dele. Então o mesmo agente pode mandar o inventário ao GLPI e ao Grafite, sem instalar nada novo nas máquinas.

A change é o subprojeto S5 da spec mestre. Ela se apoia no P1 (o cadastro e a capacidade do inventário de hardware) e no P2 (a coleta e o estado dos campos).

## What Changes

- **O endereço dos agentes:**
  - a organização gera um endereço com um token, em Administração › Agentes;
  - o endereço aparece uma vez só, com o que pôr no `server` do agente;
  - gerar outro desliga o anterior.
- **O protocolo JSON do agente do GLPI** (o CONTACT e o INVENTORY):
  - o corpo vem comprimido com o zlib ou o gzip, ou em JSON puro;
  - o agente pede a tarefa e manda o inventário a cada 24 h.
- **Os agentes da organização:**
  - cada agente aparece com a máquina, o sistema, a versão e o último inventário;
  - ele se liga sozinho ao ativo pela série ou pelo hostname, quando um só ativo ativo confere;
  - a tela liga e desliga o agente de um ativo à mão.
- **O inventário no ativo:**
  - os campos do inventário de hardware (o processador, a memória, os discos, o sistema, a versão, as licenças e o antivírus) são gravados com a origem nova "Agente do GLPI";
  - o campo travado e o campo só manual não mudam;
  - a série e o hostname só são preenchidos quando estão vazios.
- **A aba Softwares na ficha do ativo:** os softwares instalados vêm em ordem, com a busca, a versão, o editor e a data da instalação, e com a data do inventário.

## Capabilities

### New Capabilities

- `inventario-pelo-agente`:
  - o endereço com o token e o protocolo do agente do GLPI;
  - os agentes da organização e a ligação ao ativo;
  - os valores do inventário com a origem do agente;
  - os softwares instalados na ficha do ativo.

### Modified Capabilities

Nenhuma. A origem nova do valor ("Agente do GLPI") entra na lista das origens. As regras da trava e da escrita só manual valem para ela como para a coleta.

## Impact

- **Domínio:**
  - a leitura do inventário do agente;
  - os valores dos campos do inventário;
  - a origem `agente`;
  - a situação do agente pela idade do inventário.
- **Banco:** as tabelas `tokens_dos_agentes`, `agentes` e `softwares_dos_ativos`, com o RLS.
- **API:**
  - a rota do protocolo do agente, fora da sessão, com a organização pelo endereço e o token;
  - as rotas dos agentes e do endereço, com `coletores.administrar`;
  - os softwares do ativo, com `ativos.ver` no local dele;
  - a gravação do ativo pelo sistema, com a auditoria do agente.
- **Web:**
  - a seção Agentes na Administração;
  - a aba Softwares na ficha do ativo.
