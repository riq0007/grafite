## Why

Hoje o TI instala os programas máquina por máquina, ou pelo Altiris, que a empresa quer deixar.

O agente do GLPI já está nas máquinas e já fala com o Grafite pelo inventário (S5). Ele também tem a tarefa Deploy: ela pede as tarefas ao servidor, baixa os arquivos, roda o comando como o sistema e diz cada passo ao servidor.

Com isso o Grafite pode ter:
- a base dos utilitários de software, consultável;
- o envio da instalação a uma ou a várias máquinas como uma distribuição, com a situação, o log e o histórico de cada máquina;
- tudo sem instalar nada novo nas máquinas.

A change é o subprojeto S6 da spec mestre e se apoia no S5 (o agente) e no P1 (os ativos).

## What Changes

- **A base de software no módulo Ativos** (Ativos › Software):
  - cada pacote tem o nome, a versão, a descrição, o arquivo (até 512 MB), o comando e os códigos de saída de sucesso, com 0 e 3010 de fábrica;
  - a lista é consultável pela busca, e o pacote é inativado sem apagar o histórico.
- **O arquivo do pacote vai em partes,** comprimidas pelo gzip e conferidas pelo SHA-512, no formato que o agente monta.
- **A distribuição:**
  - escolhe o pacote e as máquinas, que são os ativos com o agente ligado;
  - cada máquina recebe a tarefa no próximo contato do agente, ou na hora pelo "Pedir agora", que acorda o agente pela porta 62354.
- **O Deploy do agente,** no endereço dos agentes:
  - o `getConfig`, o `getJobs`, as partes do arquivo e o `setStatus`;
  - a situação de cada máquina em texto ("Aguardando o agente", "Em andamento", "Concluída" e "Falhou"), com a etapa;
  - o log das mensagens do agente, até 200 linhas.
- **O histórico:**
  - a lista das distribuições, com o progresso em texto;
  - a ficha de cada distribuição, com as máquinas;
  - a ficha do ativo mostra as distribuições dele.
- **As permissões:**
  - `software.distribuir`, por local, para ver a base e distribuir às máquinas dos locais da conta;
  - `software.administrar`, na organização, para cadastrar e inativar os pacotes.

## Capabilities

### New Capabilities

- `distribuicao-de-software`:
  - a base de software, com os pacotes e as partes do arquivo;
  - a distribuição às máquinas;
  - o Deploy do agente do GLPI, com a situação, a etapa e o log de cada máquina;
  - o acordar dos agentes;
  - o histórico na tela e na ficha do ativo;
  - as permissões.

### Modified Capabilities

- `inventario-pelo-agente`: o CONTACT passa a anunciar a tarefa Deploy e a desligar as tarefas que o Grafite não atende.

## Impact

- **Domínio:**
  - a conferência do pacote e dos códigos de sucesso;
  - a situação da máquina pelos passos do agente;
  - o progresso da distribuição;
  - as permissões, a auditoria e o evento.
- **Banco:** as tabelas `pacotes_de_software`, `partes_dos_pacotes`, `distribuicoes` e `maquinas_das_distribuicoes`, com o RLS.
- **API:**
  - as rotas dos pacotes, com o envio do arquivo;
  - as rotas das distribuições;
  - o Deploy no endereço dos agentes;
  - as partes guardadas no armazenamento.
- **Web:**
  - Ativos › Software, com a base, a distribuição e o histórico;
  - as distribuições na ficha do ativo.
