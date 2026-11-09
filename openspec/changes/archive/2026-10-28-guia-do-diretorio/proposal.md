## Why

Em 28/10, ao aceitar o diretório (item 7 do objetivo do fim de outubro), o usuário pediu um guia de primeira configuração dentro do sistema. Ele vai ligar o AD da empresa e precisa saber o que preencher em cada campo e onde achar cada valor no AD.

A conferência do diretório também mostrou uma lacuna que barraria essa primeira configuração. Com "Conferir o certificado do servidor" ligado, o cliente LDAPS confia só nas autoridades certificadoras públicas do Node. O certificado do LDAPS de um controlador de domínio costuma vir da AC da própria empresa (AD CS), e o teste diria "O certificado do servidor não é confiável.". Hoje, o único jeito de seguir é desligar a conferência.

## What Changes

- **O guia da primeira configuração, na aba Configuração do diretório.**
  - Sete passos: a conta de serviço no AD, com as permissões para cada uso; a conta no Cofre; o servidor; a base DN; o certificado da AC; o atributo e o filtro; o teste, os mapeamentos e a entrada pelo AD.
  - Cada passo diz o que preencher e onde achar o valor no AD, com os comandos do Windows prontos para copiar.
  - O guia aparece aberto enquanto o diretório não foi gravado. Depois disso, ele fica fechado, atrás de "Mostrar o guia".
- **O certificado da AC do servidor, opcional, na configuração do diretório.**
  - Ele é colado em PEM.
  - O Grafite passa a confiar nessa AC, além das públicas, no teste da conexão, na entrada e na gerência.
  - A gravação recusa o texto que não é um certificado.
- O runbook ganha o mesmo roteiro na seção "Diretório (AD)".

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `diretorio-ad`:
  - a configuração guarda o certificado da AC do servidor;
  - o teste da conexão e as outras operações confiam nela;
  - a tela do diretório ganha o guia da primeira configuração.

## Impact

- `packages/db`: a coluna `ac_do_servidor` em `diretorios`, numa migration nova.
- `apps/api/src/diretorio` e `apps/api/src/rotas/diretorio.ts`:
  - a validação do certificado;
  - as opções do TLS do cliente LDAP;
  - a gravação, a leitura e o teste.
- O contrato da API: `acDoServidor` na configuração do diretório.
- `apps/web/src/modulos/administracao/diretorio`: o guia e o campo do certificado.
- `docs/operacao/runbook.md`: o roteiro da primeira configuração.
- Ligada ao S4 · Diretório (AD) da spec mestre, seção 3.2.
