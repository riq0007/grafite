## 1. Pré-requisitos fixados

- [x] 1.1 Escrever primeiro o teste e depois o `apps/operacao/prerequisitos.json` (design, decisão 4), com as versões mais novas do Node 24 e do PostgreSQL 18, e a leitura dele no comando de operação. Cada pré-requisito tem a versão, o arquivo, a URL oficial e o SHA-256. Verificar: o teste confere a forma (as versões maiores 24 e 18, o hash com 64 caracteres hexadecimais e a URL `https://` do nodejs.org e da EDB) e passa.
- [x] 1.2 Escrever primeiro o teste e depois o script `apps/operacao/scripts/prerequisitos.ts --conferir`, que baixa os dois instaladores e confere os hashes, com o `Baixador` atrás de interface. Verificar: o teste, com o baixador simulado, passa com o hash que confere e com o que não confere; rodado de verdade, o script diz que os dois conferem.

## 2. A preparação do servidor

- [x] 2.1 Escrever primeiro os testes e depois o `Baixador` de verdade, que grava em disco calculando o SHA-256 e apaga o arquivo que não confere, e a escolha do instalador: o da pasta do zip, conferido, ou o baixado (decisão 3). Verificar: os testes passam com os cenários "Instalador alterado", "Servidor sem internet" e "Instalador que falta sem internet", com a rede simulada.
- [x] 2.2 Escrever primeiro os testes e depois a preparação do PostgreSQL (`src/windows/preparar.ts`, decisão 3):
  - a detecção do 18, de outra versão e da ausência;
  - a pasta dos dados perguntada, com `D:\PostgreSQL\18\data` como padrão quando há um disco D: fixo e a pasta padrão do instalador quando não há, e a recusa da pasta com arquivos;
  - a senha perguntada duas vezes sem eco;
  - o instalador da EDB em modo silencioso, com a pasta dos dados e a senha no arquivo de opções da pasta restrita, apagado no `finally` e na execução seguinte;
  - o `listen_addresses = 'localhost'`, o reinício e o início automático;
  - as peças `InstaladorDoPostgres`, `ServicosDoSistema` e `Discos` atrás de interfaces, em `src/windows`, passadas ao comando no campo `windows` do ambiente.

  Verificar: os testes passam com os cenários "Servidor limpo" (a parte do PostgreSQL), "Dados do PostgreSQL no disco D:", "Servidor sem disco D:", "Pasta dos dados com arquivos", "Pré-requisitos presentes" e o PostgreSQL de outra versão, e conferem que a senha não aparece nos argumentos de nenhum processo simulado.
- [x] 2.3 Escrever primeiro os testes e depois a preparação do IIS: as portas ocupadas com o `W3SVC` rodando, a pergunta, a parada, o início automático desligado pelo `sc.exe` e a nova conferência das portas, com a mensagem de hoje para outro programa. Verificar: os testes passam com o cenário "IIS nas portas do proxy", com a resposta "não", e com a porta presa por outro programa.
- [x] 2.4 Escrever primeiro os testes e depois a opção `--preparar` da instalação: a preparação antes das conferências de hoje e a senha do `postgres` passada à instalação na memória, sem perguntar de novo; a ajuda do comando; e, no servidor Linux, a recusa da opção, dizendo que ela é do servidor Windows (design, decisão 3). Verificar: os testes do `instalar` passam com e sem a opção, o cenário "Pré-requisito ausente" mostra a mensagem nova, e o teste do comando no Linux passa com a recusa.

## 3. O atalho de instalação

- [x] 3.1 Escrever o `apps/operacao/lancadores/preparar-servidor.ps1` (decisão 2): a leitura do `prerequisitos.json`, a procura do Node 24, o `.msi` da pasta do zip ou baixado, conferido e instalado em silêncio, a recusa de outra versão maior, e a chamada `grafite instalar <zip> --preparar` pelo caminho completo do `node.exe`. Verificar: num Windows com o Node 24, `preparar-servidor.ps1` de um pacote montado à mão chega à primeira pergunta da instalação; com o hash do `.msi` trocado no JSON, ele recusa e apaga o arquivo.
- [x] 3.2 Escrever o `apps/operacao/lancadores/Instalar-Grafite.cmd` (decisão 1): a elevação, o zip único da pasta, o hash pelo `.sha256`, a extração, a chamada do `preparar-servidor.ps1` com os argumentos e a janela segura só sem argumentos. Verificar: com um pacote montado à mão, dois cliques sem elevação pedem a elevação e chegam à instalação; com o zip alterado, o atalho para antes de extrair (cenário "Zip alterado").
  - Conferido num Windows já elevado, com o pacote do `empacotar.ts`: sem argumentos, o atalho confere o zip, extrai o pacote e chega à primeira pergunta da instalação; sem o zip, sem o `.sha256`, com o zip alterado ou com dois zips, ele para antes de extrair. O pedido de elevação pelos dois cliques fica para a 6.3.

## 4. O menu da operação

- [x] 4.1 Escrever primeiro os testes e depois as tarefas do menu (`src/windows/menu.ts`, decisão 5): a lista declarativa, as perguntas com os padrões do `operacao.json` e os argumentos montados de cada tarefa, com o zip mais novo das pastas de Downloads e de `C:\Temp` como padrão da atualização. Verificar: os testes passam com os argumentos de cada uma das onze tarefas, e com o cenário "Conta criada pelo menu" na montagem.
- [x] 4.2 Escrever primeiro os testes e depois o laço do menu e o comando `grafite menu`: a lista, a resposta fora dela, a execução pelo `executarComando` com o mesmo ambiente, o resultado e a volta à lista, o "0" que sai, o aviso do que fica só no comando e o servidor sem instalação; no servidor Linux, a ajuda sem o `menu` e a mensagem de que ele é do servidor Windows (decisão 5). Verificar: os testes passam com os cenários "Atualização pelo menu", "Restauração fora do menu" e "Tarefa que falha", com o console simulado, e o teste do comando no Linux passa com a mensagem.

## 5. O atalho do menu

- [x] 5.1 Escrever o `apps/operacao/lancadores/Grafite.cmd`, com a elevação e o `grafite.ps1 menu`, e copiar o `grafite.ico` da marca. Verificar: num Windows com o pacote montado à mão, dois cliques no `Grafite.cmd` pedem a elevação e abrem o menu.
  - Conferido num Windows já elevado: o `Grafite.cmd` com CRLF chama o `grafite.ps1 menu`, e a janela fica aberta no fim. O pedido de elevação pelos dois cliques fica para a 6.3, e o menu de uma instalação aberto por ele, para o job da 6.2. O `grafite.ico` é o `favicon.ico` da marca, que o empacotamento leva ao pacote (6.1) e a instalação copia para a raiz (5.2).
- [x] 5.2 Escrever primeiro os testes e depois a peça `Atalhos` (o `.lnk` público pelo `WScript.Shell`) e a criação do `Grafite.cmd`, do ícone e do atalho na instalação, depois dos serviços, sem um segundo atalho na retomada. Verificar: os testes do `instalar` passam com o cenário "Atalho do menu na instalação".
- [x] 5.3 Escrever primeiro os testes e depois a atualização da produção: o `Grafite.cmd` e o ícone trocados pelos da versão nova, e o `.lnk` criado só quando falta, pela peça da plataforma do Windows; a do Linux não tem atalho (decisão 6). Verificar: os testes da atualização passam com o cenário "Produção de antes do menu", e os da atualização no Linux continuam passando.

## 6. Pacote, release e verificação

- [x] 6.1 Escrever primeiro o teste e depois o pacote: o `empacotar.ts` leva o `Instalar-Grafite.cmd`, o `preparar-servidor.ps1`, o `Grafite.cmd`, o `grafite.ico` e o `prerequisitos.json`, e põe uma cópia do atalho de instalação ao lado do zip. Verificar: o teste do pacote passa, e `node apps/operacao/scripts/empacotar.ts --versao 0.1.1 --saida <pasta> --sem-ferramentas` deixa o atalho dentro e fora do zip, iguais.
  - Conferido com a `--versao 0.1.0`, a da API até a 7.2: o zip leva os cinco arquivos, os `.cmd` só com CRLF, e o atalho de fora é igual ao de dentro.
- [x] 6.2 Mudar o `versao.yml` (decisão 7): a release publica o atalho ao lado do zip e do `.sha256`, com o pacote para Linux; a verificação no executor `instalacao` entra pelo `Instalar-Grafite.cmd --respostas`, confere o `Grafite.cmd` e o `.lnk`, roda o estado dos serviços pelo menu com as respostas pela entrada padrão e, no fim, apaga o `.lnk`. Os pacotes saem da pasta do executor só quando o job passa, e cada instalação confere antes de tudo que eles estão lá (decisão 7). Verificar: o job do `versao.yml` no PR passa (cenário "Release da versão", sem a release).
- [x] 6.3 Verificar à mão o caminho do zero numa máquina virtual limpa do Windows Server 2019, sem o Node, sem o PostgreSQL, com o IIS ligado e com um disco D:, como a VM de testes pedida à infraestrutura, com o pacote da pré-release `ensaio-v0.1.1-92`: o atalho instala os dois, com os dados do PostgreSQL em `D:\PostgreSQL\18\data`, desliga o IIS com a resposta "sim", instala o Grafite em `D:\Grafite`, e o atalho "Grafite" da área de trabalho abre o menu. Ela é também a prova do 2019 (decisão 7). Verificar: anotar o resultado e as telas no PR que arquiva a change, com os cenários "Servidor limpo", "Dados do PostgreSQL no disco D:", "IIS nas portas do proxy" e "Atalho do menu na área de trabalho".
  - Passou em 28/10, na VM do usuário com o Windows Server 2019, pelo relato dele ("Passou na minha vm"). O arquivamento não tem PR, porque o objetivo do prazo de outubro manda o push direto no `dev`, e as telas ficaram com ele.
- [x] 6.4 Com a 6.3 passando no 2019, pôr o Windows Server 2019 nos pré-requisitos do runbook, ao lado do 2022 e do 2025, com o aviso de que a EDB só testa o PostgreSQL 18 nesses dois e de que o Grafite foi conferido no 2019 (decisão 7). Se o PostgreSQL ou o Node falharem no 2019, o runbook fica como está, e a falha fica anotada no design. Verificar: `pnpm test` passa, com o teste do runbook.

## 7. Fechamento

- [x] 7.1 Atualizar a documentação:
  - o runbook: a instalação pelo atalho (os arquivos da release e os instaladores copiados, a pasta, o desbloqueio do arquivo baixado e as perguntas, com a pasta dos dados do PostgreSQL e a raiz da instalação no disco D:), a pasta dos dados escolhida fora da verificação em tempo real do antivírus, o menu do dia a dia com o que cada tarefa pergunta, o que fica só no comando, a instalação à mão e a volta para a v0.1.0, sem mudar a seção do servidor Linux, onde a operação continua pelos comandos;
  - a spec mestre: seções 3.1, 4.3 e 12.2;
  - o `CLAUDE.md`: o `menu`, o atalho e o empacotamento;
  - o `docs/mapa.md`: a change.

  Verificar: `pnpm test` passa, com o teste-guarda do mapa, e o cenário "Instalação pelo runbook" é atendido pela seção nova.
- [x] 7.2 Passar o `apps/api/package.json` para 0.1.1. Verificar: a saúde da API no `pnpm dev` informa a 0.1.1.
- [x] 7.3 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:integration` verdes, e `openspec validate instalador-e-menu-da-operacao --strict` sem erros. Verificar: os comandos passam, e o CI do PR, com o job do `versao.yml`, fica verde.
