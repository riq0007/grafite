## Context

O agente do GLPI (1.x) fala um protocolo JSON por HTTP POST, nesta ordem:
1. Ele manda o CONTACT, com o `deviceid`, o nome, a versão e as tarefas instaladas.
2. O servidor responde com as tarefas que o agente deve rodar e com o prazo da próxima conversa.
3. O agente roda o inventário e manda o INVENTORY, com o `content` no formato do inventário do GLPI: `hardware`, `bios`, `cpus`, `memories`, `storages`, `drives`, `operatingsystem`, `softwares`, `antivirus`, `licenseinfos` e `networks`.

O corpo vai comprimido com o zlib quando o agente tem a biblioteca, o que vale para os pacotes oficiais. O `server` da configuração aceita vários endereços, separados por vírgula. O agente faz o mesmo ciclo com cada um.

## Goals / Non-Goals

**Goals:**
- receber o inventário das máquinas que já têm o agente, sem instalar nada;
- preencher os campos do inventário de hardware e a lista dos softwares;
- ligar o agente ao ativo sozinho quando a série ou o hostname conferem.

**Non-Goals:**
- O protocolo XML antigo (OCS e FusionInventory). O agente do GLPI 1.x fala JSON.
- Cadastrar o ativo pelo agente. A máquina sem ativo espera a ligação à mão, e o cadastro continua pela tela.
- As tarefas de rede (`netdiscovery`, `netinventory`). O SNMP das impressoras continua com o coletor.
- A tarefa de distribuição de software, que é a change seguinte.

## Decisions

1. **O endereço tem o token no caminho:** `/api/agentes/glpi/<token>`.
   - O agente manda o mesmo usuário e a mesma senha a todos os servidores. A autenticação básica atrapalharia o GLPI, e o token no caminho não atrapalha.
   - A organização vem do endereço de acesso, como no coletor.
   - O token é guardado como SHA-256 em `tokens_dos_agentes`, com um ativo por organização. A conferência é em tempo constante.
2. **A rota fica fora do escopo da sessão,** num plugin com os parsers próprios:
   - o `application/x-compress-zlib` passa pelo `inflateSync`, o `application/x-compress-gzip` pelo `gunzipSync`, e o `application/json` é lido como texto;
   - o limite é de 20 MB, e o JSON é lido depois de descomprimido;
   - a resposta vai em JSON puro, que o agente aceita.
3. **A leitura do inventário fica no domínio** (`lerInventarioDoGlpi`). Ela tolera os campos ausentes e devolve:
   - o nome, a série e o fabricante;
   - os valores dos campos do inventário;
   - os IPs;
   - os softwares, sem repetir o mesmo nome com a mesma versão.
4. **O inventário grava pelo `gravarAtivo`, com a origem `agente`.**
   - O `QuemGrava` ganha o autor de sistema ("Agente do GLPI"). Com ele, o estado não tem a conta, a auditoria tem o ator de sistema, e a gravação não confere permissões, porque não muda o local.
   - A série e o hostname vão só quando estão vazios no ativo.
5. **Os softwares ficam em `softwares_dos_ativos`.**
   - O inventário completo apaga e grava de novo, na mesma transação.
   - O inventário parcial (`partial: true`) sem a seção `softwares` não mexe na lista.
6. **A ligação automática** acontece no inventário do agente sem ativo:
   - pela série (`bios.ssn`), comparada sem diferenciar maiúsculas e sem os espaços;
   - depois, pelo hostname (`hardware.name`), comparado do mesmo jeito;
   - só com um único ativo ativo conferindo.
7. **A tela fica em Administração › Agentes, com `coletores.administrar`.** Ela tem:
   - o endereço, com o "Gerar o endereço" e o "Gerar outro" com a confirmação;
   - a tabela dos agentes, com a ligação a um ativo pela busca dos ativos.

## Risks / Trade-offs

- **[O token no caminho aparece no log do proxy]** → O log da API não grava o caminho dessa rota. O token só vale para mandar inventário e é trocado pelo "Gerar outro".
- **[Dois ativos com a mesma série ou o mesmo hostname]** → A ligação automática não acontece, e o agente espera a ligação à mão.
- **[O inventário grande]** → Os 20 MB cobrem milhares de softwares. A lista é gravada numa transação só, por agente.
