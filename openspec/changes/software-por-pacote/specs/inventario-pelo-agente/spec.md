## MODIFIED Requirements

### Requirement: Protocolo do agente do GLPI

A API SHALL falar o protocolo JSON do agente do GLPI no endereço dos agentes, sem a sessão. A organização vem pelo endereço de acesso, e o token pelo caminho. A API SHALL aceitar o corpo:
- comprimido com o zlib (`application/x-compress-zlib`);
- comprimido com o gzip (`application/x-compress-gzip`);
- em JSON puro;
- PROLOG XML puro, com `application/xml` ou `text/xml`;

até 20 MB, também após descompressão.

- O PROLOG em XML, que o agente do GLPI manda primeiro a um servidor novo, SHALL ser respondido em JSON com `status` "ok" e a `expiration` de 24 horas, para o agente passar ao protocolo JSON.
- O CONTACT SHALL ser respondido com `status` "ok", com as tarefas `inventory` e `deploy` e com a `expiration` de 24 horas, ou com a menor da distribuição de software, ao agente com um pedido que ainda não pode seguir (spec distribuicao-de-software, "Deploy pelo agente do GLPI"). As outras tarefas do agente SHALL vir em `disabled`.
- O INVENTORY SHALL ser gravado e respondido com `status` "ok" e a mesma `expiration` do CONTACT.
- O token desconhecido ou desligado SHALL ser recusado com 403 e `status` "error", sem gravar nada.
- O pedido fora do protocolo, inclusive o XML que não é um PROLOG, SHALL ser recusado com 400 e `status` "error".

#### Scenario: Agente com dois servidores
- **WHEN** o agente de uma máquina tem o GLPI e o endereço do Grafite no `server`, separados por vírgula
- **THEN** ele manda o CONTACT e o inventário ao Grafite, e o Grafite responde no formato que o agente espera

#### Scenario: Tarefas anunciadas
- **WHEN** o agente manda o CONTACT
- **THEN** a resposta traz o `inventory` e o `deploy`, e o `netdiscovery`, o `netinventory`, o `esx`, o `collect` e o `wakeonlan` vêm em `disabled`

#### Scenario: Primeiro contato do agente
- **WHEN** o agente do GLPI fala com o Grafite pela primeira vez e manda o PROLOG em XML, com o cabeçalho `GLPI-Agent-ID`
- **THEN** a resposta é o JSON com `status` "ok" e a `expiration` de 24 horas, e o agente segue com o CONTACT

### Requirement: Inventário no ativo

O inventário do agente ligado SHALL gravar no ativo os campos do inventário de hardware, quando o tipo dele tem a capacidade:
- o processador;
- a memória em GB;
- os discos, um por linha, com o tamanho;
- o sistema operacional e a versão do sistema;
- as licenças do Windows e do Office, pela chave;
- o antivírus, com "ativo" ou "desligado" e "atualizado" ou "desatualizado".

A origem desses valores SHALL ser "Agente do GLPI". O campo travado e o campo só manual SHALL NOT mudar. A série e o hostname do ativo SHALL ser preenchidos pelo agente só quando estão vazios.

A mudança SHALL ir para a auditoria, com o autor "Agente do GLPI". O inventário sem mudança SHALL NOT gravar nada no ativo. Os softwares instalados SHALL ser trocados pelos do inventário a cada inventário completo. Cada software SHALL ser marcado como do sistema quando o `system_category` é `system_component`, `update`, `security_update`, `hotfix` ou `system`, ou quando o `no_remove` é verdadeiro (`true`, 1 ou "1") e o editor tem "Microsoft".

#### Scenario: Campo travado
- **WHEN** o técnico travou o campo "Processador" de um computador, e o agente manda outro processador
- **THEN** o processador fica como estava, e os outros campos do inventário mudam

#### Scenario: Edge do Windows
- **WHEN** o inventário traz o "Microsoft Edge" da Microsoft Corporation com o `no_remove`
- **THEN** o Edge fica marcado como do sistema

### Requirement: Softwares na ficha do ativo

A ficha do ativo com softwares SHALL ter a aba "Software", para quem tem `ativos.ver` no local dele. Ela SHALL ter:
- a busca pelo nome ou pelo editor;
- a tabela "Instalados, segundo o inventário", na largura toda, com o nome, a versão e o editor;
- quantos softwares a máquina tem;
- a data do inventário que trouxe a lista.

Para quem tem `software.distribuir` no local do ativo, a aba SHALL ter também:
- **Mandados pelo Grafite:** um cartão por distribuição que chegou à máquina, com o pacote e a versão, a situação em rótulo ("FALHOU · 1603", com a borda de perigo; "CONCLUÍDA"; "INSTALANDO"; "NA FILA"; "TIRADA DA FILA"), o momento, quem mandou e, na que falhou, "Tentar de novo";
- na tabela, no lugar do editor (m09), a origem de cada programa ("GRAFITE · <nome>", quando o pacote dele chegou por uma distribuição concluída, "Veio com o Windows", nos do sistema, ou "Fora do Grafite") e a comparação com a base: "HÁ A <versão> NA BASE", "NA VERSÃO DA BASE", "NÃO ESTÁ NA BASE" ou "DO WINDOWS, NÃO SE DISTRIBUI", para os programas do sistema;
- a ordem "Frente à base · ação primeiro", nessa sequência e pelo nome dentro de cada uma;
- "Instalar outro pacote nesta máquina".

A tabela SHALL mostrar as 10 primeiras linhas e "Mostrar os outros N".

"Instalar outro pacote nesta máquina" SHALL abrir uma camada sobreposta com a busca dos pacotes ativos e, em cada um, a relação com a máquina: "ATUALIZA A <versão>", "NÃO INSTALADO" ou "JÁ NA VERSÃO", que não pode ser escolhido. A camada SHALL ter "Vai direto para esta máquina", o quando (Agora ou Na janela da noite), "Cancelar", que o Esc também faz, e "Instalar o <pacote> <versão> nesta máquina", que cria a distribuição de uma máquina (spec distribuicao-de-software). Ao fechar, o foco SHALL voltar ao botão que a abriu.

Com o agente sem contato (Requirement "Agente sem contato"), a aba SHALL ter o aviso com a idade do inventário ("lido há 3 dias, em 08/11 às 09:12") e "Esperando a máquina voltar", com os pedidos que aguardam, cada um com o rótulo "NA FILA" e "Tirar da fila". O cabeçalho da ficha SHALL mostrar "SEM CONTATO · HÁ N DIAS" ao lado do uso.

Sem nenhum software, a aba SHALL dizer que o agente ainda não mandou a lista.

#### Scenario: Softwares do computador
- **WHEN** a técnica abre a aba Software de um computador inventariado pelo agente e busca "office"
- **THEN** a tabela mostra só os softwares com "office" no nome ou no editor, com a versão de cada um

#### Scenario: Ação primeiro
- **WHEN** a técnica abre a aba Software da PC-FIN-17, com o Google Chrome 129, o 7-Zip 23.01 e o VLC 3.0.20 abaixo da base, o SumatraPDF na versão da base e o Microsoft Edge do sistema
- **THEN** a tabela começa pelo Chrome, pelo 7-Zip e pelo VLC, com "HÁ A 131 NA BASE", "HÁ A 24.08 NA BASE" e "HÁ A 3.0.21 NA BASE", e o Edge vem por último, com "DO WINDOWS, NÃO SE DISTRIBUI"

#### Scenario: Instalar pela ficha
- **WHEN** a técnica busca "chr" em "Instalar outro pacote nesta máquina", escolhe o Google Chrome 131 ("ATUALIZA A 129") e "Agora"
- **THEN** o Grafite cria a distribuição só para essa máquina, e o cartão do Chrome aparece em "Mandados pelo Grafite"

## ADDED Requirements

### Requirement: Agente sem contato

O agente SHALL ficar "Sem contato" quando o último contato dele passou do prazo da organização, de 1 a 30 dias, com 2 de fábrica. O texto SHALL dizer há quanto tempo, em dias, como "Sem contato · há 3 dias".

Quem tem `coletores.administrar` SHALL ajustar o prazo na Administração, junto ao cadastro automático. A mudança SHALL ir para a auditoria. A situação do agente pela idade do inventário ("Em dia", "Parado há N dias") SHALL NOT mudar com o prazo.

#### Scenario: Prazo de fábrica
- **WHEN** o último contato do agente da PC-FIN-18 foi há 3 dias, e a organização não mudou o prazo
- **THEN** o agente aparece "Sem contato · há 3 dias", e a máquina entra na fila das distribuições

#### Scenario: Prazo maior
- **WHEN** a TI ajusta o prazo para 4 dias
- **THEN** a PC-FIN-18, com o último contato há 3 dias, deixa de aparecer sem contato
