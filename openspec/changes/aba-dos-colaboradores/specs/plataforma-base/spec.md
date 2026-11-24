## MODIFIED Requirements

### Requirement: Estrutura do repositório

O repositório SHALL ter seis aplicações e cinco pacotes compartilhados:
- **aplicações:** web, API, coletor, comando de operação, painel da operação e aba dos colaboradores;
- **pacotes:** domínio, design system, banco, cliente da API e operação.

Cada aplicação e pacote SHALL poder ser verificado (lint, tipos e testes) de forma independente e também todos de uma vez. A parte em Rust da aba SHALL ter os próprios testes e o próprio lint, que o CI roda no Windows.

#### Scenario: Verificação completa
- **WHEN** o desenvolvedor executa a verificação do repositório inteiro
- **THEN** lint, checagem de tipos e testes rodam em todas as aplicações e pacotes, e o resultado indica qual deles falhou

#### Scenario: Sem o Rust instalado
- **WHEN** o desenvolvedor sem o Rust executa a verificação do repositório inteiro
- **THEN** a tela da aba é verificada como as outras, e só a parte em Rust fica para o CI

### Requirement: Ambiente de desenvolvimento com um comando

Um único comando SHALL subir o ambiente de desenvolvimento: banco de dados, API, web e o coletor, com recarga automática ao editar o código. Na primeira execução com o banco vazio, o comando SHALL criar a organização de desenvolvimento, ligada aos endereços locais. Ela vem com a conta de administração `admin`, que não exige os dois passos e entra com a senha `admin123`, sem troca obrigatória.

A cada execução, o comando SHALL garantir essa senha: se ela tiver mudado ou estiver temporária, ela volta a `admin123`, e as sessões abertas da conta são encerradas. Se a senha já for `admin123`, nada SHALL ser gravado na conta. O terminal SHALL mostrar o usuário e a senha da conta de administração.

A senha fixa SHALL existir só no ambiente de desenvolvimento. O comando SHALL recusar gravá-la:
- numa organização com algum endereço que não seja local (`localhost`, `127.0.0.1` ou `::1`);
- num ambiente de produção.

O comando SHALL gerar uma vez a chave mestra do cofre no `.env` local, que nunca é versionado, e SHALL NOT trocá-la depois: os segredos já cifrados com ela deixariam de abrir.

O comando SHALL também garantir o coletor de desenvolvimento na organização de desenvolvimento, com a faixa `127.0.0.0/8` na criação e o token gerado uma vez e guardado só no `.env` local, que nunca é versionado. As faixas mudadas depois pela tela SHALL ficar como estão.

O comando SHALL subir também um servidor de e-mail local, que guarda os e-mails sem entregá-los e os mostra num endereço local, e SHALL ligar a API a ele. Ele SHALL gerar uma vez as chaves do push no `.env` local e SHALL NOT trocá-las depois: os aparelhos inscritos com elas deixariam de receber.

O comando SHALL ligar na organização de desenvolvimento o diretório de desenvolvimento: um AD simulado em memória, com o usuário do Windows de quem roda o comando, com o SID dele, num grupo mapeado a um grupo do Grafite com o chat e o pedido de chamados, e sem os dois passos. A aba no computador de quem desenvolve entra por ele. O diretório de desenvolvimento SHALL ligar só no ambiente de desenvolvimento, e SHALL NOT ligar numa organização com endereço que não seja local. Ele SHALL atender só o servidor marcado do desenvolvimento; os outros servidores seguem para o AD de verdade. Um diretório ligado de outro servidor SHALL ficar como está; um desligado dá lugar ao simulado, e o terminal o diz. Fora do Windows, o comando SHALL gravar só a chave da aba.

#### Scenario: Primeira execução
- **WHEN** o desenvolvedor executa o comando de desenvolvimento com o Docker ativo
- **THEN** o banco sobe, as migrations são aplicadas, e a API, a web e o coletor ficam no ar

#### Scenario: Organização de desenvolvimento
- **WHEN** o comando roda pela primeira vez com o banco vazio
- **THEN** a organização de desenvolvimento é criada, o terminal mostra o usuário `admin` e a senha `admin123`, e a entrada com eles abre a casca sem pedir uma senha nova

#### Scenario: Execuções seguintes
- **WHEN** o comando roda de novo com o mesmo banco, e a senha da conta `admin` continua `admin123`
- **THEN** a organização não é criada de novo, e nada é gravado na conta

#### Scenario: Senha mudada no desenvolvimento
- **WHEN** a senha da conta `admin` foi trocada, e o comando roda de novo
- **THEN** a senha volta a `admin123`, sem troca obrigatória, e as sessões abertas da conta são encerradas

#### Scenario: Organização com endereço de verdade
- **WHEN** a organização do endereço `localhost` tem também o endereço `grafite.empresa.local`
- **THEN** o comando recusa gravar a senha fixa, diz o motivo, e a conta não muda

#### Scenario: Ambiente de produção
- **WHEN** o passo que grava a senha fixa roda num ambiente de produção
- **THEN** ele recusa, diz o motivo, e nenhuma conta muda

#### Scenario: Docker inativo
- **WHEN** o comando de desenvolvimento é executado com o Docker fechado
- **THEN** o comando para e informa que o Docker precisa estar em execução

#### Scenario: Coletor de desenvolvimento
- **WHEN** o comando roda, e um ativo de um tipo com a disponibilidade na rede tem o IP `127.0.0.1`
- **THEN** o coletor de desenvolvimento pinga o ativo, e a tabela dos ativos o mostra "Online"

#### Scenario: E-mail no desenvolvimento
- **WHEN** a pessoa da conta `admin` tem um e-mail, e abre um alerta crítico no desenvolvimento
- **THEN** o e-mail aparece no servidor de e-mail local, e nenhum e-mail sai do computador

#### Scenario: Aba no desenvolvimento
- **WHEN** o desenvolvedor roda o comando e abre a aba no mesmo computador, com a chave do `.env`
- **THEN** a aba entra com o usuário do Windows dele, pelo diretório de desenvolvimento

## ADDED Requirements

### Requirement: Pacote da aba no CI

O CI SHALL montar o MSI da aba num executor `windows-2022` do GitHub, em cada PR e na branch principal, depois dos testes e do lint da parte em Rust. O MSI SHALL ficar como artefato do run. Ele SHALL NOT entrar na release enquanto a aba não abre nem lista os chamados.

O MSI SHALL NOT levar endereço, chave nem token: eles vêm das propriedades da instalação.

#### Scenario: PR que muda a aba
- **WHEN** um PR muda a aba
- **THEN** o CI roda os testes da parte em Rust, monta o MSI e o guarda como artefato do run

#### Scenario: Nenhum segredo no MSI
- **WHEN** o CI monta o MSI
- **THEN** o pacote não tem endereço de servidor, chave nem token
