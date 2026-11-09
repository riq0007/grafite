# Integrações da rede

As correções saíram primeiro na pré-release **Versão 0.1.6 NÃO VERIFICADA**, só com o pacote para Windows e sem o CI. Elas entram conferidas pelo CI na versão 0.1.10, com os pacotes para Windows e para Linux com o Docker.

## Agente do GLPI

Quando o agente reconhece o endereço, mas o log mostra `certificate verify failed` antes do PROLOG, a estação não confia na cadeia do certificado que recebe, como a da inspeção HTTPS de um antivírus. É uma falha de confiança TLS na estação, e não um erro do token. A atualização da API não instala CAs nas máquinas. Siga [o guia do agente](agente-glpi.md) para confiar na cadeia aprovada pela TI e reiniciar o serviço.

A API passa também a aceitar PROLOG XML sem compressão e limita a 20 MB o resultado da descompressão. PROLOG negocia o protocolo, CONTACT registra o agente e INVENTORY preenche o inventário. Um ativo único com a mesma série ou hostname é ligado automaticamente; sem correspondência, a ligação é manual.

## Impressora que recusa o GETBULK

Algumas impressoras, como a HP Laser 408dn, respondem GeneralError em todas as subárvores pelo GETBULK, embora o GET e o GETNEXT funcionem. O coletor antigo convertia esse erro em tabela vazia e apresentava “Respondeu” sem suprimentos. O coletor agora tenta GETNEXT e preserva a versão e a comunidade cadastradas.

Com o coletor corrigido, a impressora passa a mostrar os suprimentos, como o toner, a unidade de imagem, o fusor e os roletes, e o contador de páginas.

Atualize também o serviço Grafite Coletor. Confira a capacidade “Suprimentos e contadores” no tipo, o campo do IP e a faixa do coletor. A leitura ocorre na partida e depois a cada 10 minutos. Se o serviço ainda executar a versão antiga, a correção da API sozinha não muda o SNMP.

## Painéis HTTP

Páginas internas HTTP passam pela conexão HTTPS do Grafite. O servidor do Grafite precisa resolver e alcançar o endereço cadastrado; no Linux, quem busca a página é o contêiner do app. HTML, CSS, imagens, links e consultas GET por fetch/XMLHttpRequest ao mesmo servidor são reescritos para a ponte. Páginas HTTPS continuam abrindo diretamente.

O conteúdo HTTP fica isolado por sandbox, sem acesso à página, aos cookies ou ao armazenamento do Grafite. O acesso temporário depende da sessão, da organização, da permissão e de o painel e módulo continuarem ativos. Depois de reiniciar a API, reabra a grade.

A ponte tem limite de 10 MB por recurso, 10 segundos e três redirecionamentos na mesma origem. Não repassa credenciais do Grafite nem oferece proxy para outro servidor. Páginas que exigem cookies próprios, POST, WebSocket, armazenamento local ou recursos HTTP de outras origens precisam de ajuste no serviço de origem; “Abrir em outra aba” mantém o endereço original.

## Verificação local da 0.1.6

- Coletor: regressões SNMP, simulador e gravação, além de uma leitura real de uma impressora.
- Agente: protocolo com PostgreSQL temporário e testes da tela.
- Painéis: integração com servidor HTTP local, permissões, sessão, inativação, redirecionamentos, limites; grade e navegador com HTTPS, CSS, fetch e isolamento.
- Formatação, tipos, contrato, OpenSpec e compilação da web e do painel da operação.

O PostgreSQL dos testes foi portátil e temporário. Um ajuste local, não versionado, fechou os pipes herdados do pg_ctl no Windows; a change `ci-sem-docker` não foi alterada. A instalação completa pelo instalador e a atualização do servidor de produção não foram executadas.
