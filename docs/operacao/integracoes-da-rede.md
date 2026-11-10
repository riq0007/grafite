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

## Painel que recusa ser embutido

A verificação de cada painel, a cada minuto, lê também se o navegador consegue mostrá-lo dentro do Grafite. O Cadastro dos painéis mostra a leitura na coluna Exibição:

- **Recusa ser embutido:** a ferramenta manda o cabeçalho `X-Frame-Options` com `DENY` ou `SAMEORIGIN`, ou o `Content-Security-Policy` com a diretiva `frame-ancestors` sem o endereço do Grafite. O navegador deixaria o quadro em branco, e o bloco mostra o motivo no lugar dele. Só vale para o painel em `https://`: o painel em `http://` passa pela ponte, que manda os cabeçalhos dela, e os da ferramenta não chegam ao navegador.
- **Pede a entrada:** a ferramenta respondeu 401 ou 403, ou levou à página de entrada. O bloco mostra a página, com um aviso acima dela.
- **Aparece na grade:** nenhuma das duas. É uma leitura da resposta, e não uma prova: uma página em `http://` que precisa do armazenamento local, como o Mailpit, passa na leitura e fica em branco pela ponte.

Depois de liberar a ferramenta, use "Verificar agora" no Cadastro; a grade aberta se atualiza sozinha.

### Grafana

O Grafana manda `X-Frame-Options: deny` de fábrica. No `grafana.ini`, na seção `[security]`, ponha `allow_embedding = true` e reinicie o Grafana; no contêiner, a variável é `GF_SECURITY_ALLOW_EMBEDDING=true`. O Grafana Cloud não oferece esse ajuste: use "Abrir em outra aba".

Dentro do Grafite, o cookie da sessão do Grafana é de outro site, e o navegador pode recusá-lo: a tela de entrada volta depois de entrar. Para a TV, prefira o acesso de leitura sem entrada, na seção `[auth.anonymous]`: `enabled = true`, `org_name` com o nome da organização do Grafana que tem os painéis e `org_role = Viewer`. Esse acesso abre os painéis daquela organização a quem alcança o Grafana pela rede. Afrouxar o cookie, com `cookie_samesite = none` e `cookie_secure = true` no HTTPS, também funciona, mas enfraquece a proteção do Grafana contra CSRF.

### Zabbix

O Zabbix manda `X-Frame-Options: SAMEORIGIN` de fábrica. Em Administration → General → Other, a opção "Use X-Frame-Options HTTP header" aceita, no lugar de `SAMEORIGIN`, uma lista de endereços separados por espaço, com `'self'` entre aspas simples, como `'self' grafite.empresa.local`. Sem as aspas, `self` vira o nome de um endereço. Desmarcar a opção tira o cabeçalho, o que a documentação do Zabbix não recomenda.

Há um relato antigo de versões do Zabbix que só respeitavam `SAMEORIGIN` e `DENY`. Se o "Verificar agora" continuar dizendo "Recusa ser embutido" depois da lista, use "Abrir em outra aba".

### Outras ferramentas

Mande o cabeçalho `Content-Security-Policy: frame-ancestors 'self' https://grafite.empresa.local`, com o endereço pelo qual a equipe abre o Grafite: a verificação compara a lista com os endereços de acesso da organização. Com o `frame-ancestors`, o navegador ignora o `X-Frame-Options`, e a verificação também. Quando a ferramenta não deixa mudar os cabeçalhos, o proxy que fica na frente dela pode trocá-los. A ferramenta servida no mesmo endereço do Grafite, atrás do mesmo proxy, pode manter o `SAMEORIGIN`.

## Verificação local da 0.1.6

- Coletor: regressões SNMP, simulador e gravação, além de uma leitura real de uma impressora.
- Agente: protocolo com PostgreSQL temporário e testes da tela.
- Painéis: integração com servidor HTTP local, permissões, sessão, inativação, redirecionamentos, limites; grade e navegador com HTTPS, CSS, fetch e isolamento.
- Formatação, tipos, contrato, OpenSpec e compilação da web e do painel da operação.

O PostgreSQL dos testes foi portátil e temporário. Um ajuste local, não versionado, fechou os pipes herdados do pg_ctl no Windows; a change `ci-sem-docker` não foi alterada. A instalação completa pelo instalador e a atualização do servidor de produção não foram executadas.
