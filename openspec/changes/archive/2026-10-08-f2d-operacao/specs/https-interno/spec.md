## Purpose

Servir o Grafite só por HTTPS, também na rede interna, com um proxy na frente dos apps, o certificado num de dois modos, a renovação vigiada e o endereço real do cliente para a API.

## ADDED Requirements

### Requirement: HTTPS na frente dos apps

Um proxy SHALL atender os endereços de acesso de cada ambiente por HTTPS, na porta 443, e SHALL levar cada requisição ao app do ambiente sem mudar o endereço pedido, porque a API acha a organização por ele. O HTTP SHALL só redirecionar para o HTTPS. A produção SHALL mandar o cabeçalho HSTS.

#### Scenario: Acesso por HTTP
- **WHEN** alguém abre `http://grafite.empresa.com.br`
- **THEN** o navegador é redirecionado para `https://grafite.empresa.com.br`, e a casca abre com o cadeado

#### Scenario: Organização pelo endereço atrás do proxy
- **WHEN** uma requisição chega ao proxy pelo endereço da organização A
- **THEN** a API atende a organização A, como sem o proxy

### Requirement: Certificado em dois modos

A instalação SHALL configurar o certificado num destes modos:
- **domínio público:** um certificado do Let's Encrypt, obtido pelo desafio de DNS com uma credencial limitada à zona e renovado sozinho antes de vencer. Todo dispositivo confia nele sem instalar nada;
- **AC interna:** um certificado da AC do próprio proxy, cujo certificado raiz o comando de operação exporta para distribuir, ou os arquivos de um certificado emitido pela AC da empresa.

Trocar de modo SHALL ser mudar a configuração e reconfigurar o proxy. O proxy SHALL NOT trocar de modo sozinho: com a renovação falhando, o certificado atual continua até vencer, e a falha aparece pela vigilância.

#### Scenario: Domínio público
- **WHEN** a instalação recebe o domínio e a credencial da zona
- **THEN** o proxy obtém o certificado do Let's Encrypt, e um celular sem nada instalado abre o Grafite sem aviso de segurança

#### Scenario: AC interna
- **WHEN** a instalação roda sem domínio público
- **THEN** o proxy usa a AC interna, e o comando de operação entrega o certificado raiz para ser distribuído às máquinas e aos celulares

### Requirement: Renovação vigiada

Uma tarefa diária da produção SHALL abrir uma conexão HTTPS com cada endereço configurado e ler a validade do certificado. Com menos de 14 dias de validade, a tarefa SHALL falhar com o endereço e os dias que faltam, e, esgotadas as tentativas, SHALL aparecer em Tarefas (spec fila-de-tarefas).

#### Scenario: Renovação parada
- **WHEN** o certificado de `grafite.empresa.com.br` vence em 9 dias, porque a renovação falha há semanas
- **THEN** Tarefas mostra a falha, com o endereço e os 9 dias

### Requirement: Endereço do cliente atrás do proxy

A API SHALL usar o endereço do cliente que o proxy informa, só quando a requisição vem de um proxy listado como confiável na configuração. Por padrão, só o próprio servidor é confiável. Esse endereço SHALL valer para o limite de requisições, as sessões e a auditoria.

#### Scenario: Cliente atrás do proxy
- **WHEN** uma pessoa entra pelo proxy, a partir do computador 10.0.0.15
- **THEN** a sessão e a auditoria registram 10.0.0.15, e não o endereço do proxy

#### Scenario: Cabeçalho forjado
- **WHEN** uma requisição de fora da lista de proxies confiáveis traz um endereço de cliente inventado no cabeçalho
- **THEN** a API ignora o cabeçalho e usa o endereço de quem conectou
