## Context

O diretório (change integracao-ad-ldap, S4) liga o Grafite ao AD pela Administração › Diretório, com a conta de serviço do Cofre. O cliente LDAP é o ldapts, que abre o TLS pelo `tls.connect` do Node, com o `rejectUnauthorized` vindo de "Conferir o certificado do servidor". Sem a opção `ca`, o Node só confia nas autoridades certificadoras públicas embutidas nele. O `NODE_EXTRA_CA_CERTS` dos apps só leva a raiz da AC do Caddy, no modo interno com ela. O certificado do LDAPS de um controlador de domínio vem, quase sempre, da AC da empresa (AD CS).

A tela já explica cada campo numa frase, mas não diz onde achar o valor no AD.

## Goals / Non-Goals

**Goals:**
- Quem configura o AD pela primeira vez sabe, sem sair do Grafite:
  - o que criar no AD;
  - o que preencher em cada campo;
  - onde achar cada valor, com os comandos prontos.
- O LDAPS com o certificado da AC da empresa funciona com a conferência do certificado ligada.

**Non-Goals:**
- Achar os controladores de domínio pelo DNS, a partir do Grafite. O guia ensina o `nltest`, e a descoberta automática fica para depois, se fizer falta.
- Confiar no repositório de certificados do sistema operacional.
- Criar a conta de serviço no AD pelo Grafite.

## Decisions

1. **O guia é um componente da aba Configuração, com os passos como dados.**
   - `GuiaDoDiretorio.tsx` recebe se o diretório já foi gravado e mostra os sete passos de uma lista declarada no próprio módulo.
   - Cada passo tem:
     - o título;
     - o que preencher;
     - onde achar;
     - os comandos, cada um num bloco de código com "Copiar", pelo `copiarParaAreaDeTransferencia` do `@grafite/ui`.
   - Aberto enquanto o diretório não foi gravado; fechado depois, com "Mostrar o guia" e "Esconder o guia". Sem animação de abertura: a mudança é só de estado.
   - Alternativa descartada: um assistente em etapas no lugar do formulário. Ele esconderia o formulário de quem já sabe o que preencher, e o guia lado a lado serve aos dois.
2. **O certificado da AC vai na tabela do diretório, em texto, e o cliente o soma às ACs públicas.**
   - A coluna `ac_do_servidor text`, nula, com até 20.000 caracteres, cabe uma cadeia em PEM.
   - A API valida o texto com o `X509Certificate` do `node:crypto`: cada bloco `-----BEGIN CERTIFICATE-----` tem de abrir.
   - O cliente LDAP passa `ca: [...tls.rootCertificates, ac]` quando há a AC. Assim, um certificado público continua valendo, e o da AC da empresa passa a valer.
   - As opções do TLS saem de uma função pura, `opcoesDoTls`, com teste próprio.
   - Alternativa descartada: o `NODE_EXTRA_CA_CERTS` da instalação. Ele exige o comando de operação, reiniciar o app e acesso ao servidor, e a TI configura o diretório pela tela.
3. **O certificado não é segredo, mas a auditoria não o copia.** A auditoria registra "AC do servidor: informada" ou "sem a AC", e a resposta da API devolve o texto para a tela mostrá-lo.
4. **Os textos do guia saem do que o Windows Server e o AD oferecem hoje:**
   - `nltest /dclist:<domínio>` e `%LOGONSERVER%`, para os controladores;
   - `Test-NetConnection <dc> -Port 636`, para o LDAPS;
   - `(Get-ADDomain).DistinguishedName`, para a base DN;
   - o `certlm.msc`, com Exportar no formato Base 64, e `certutil -ca.cert`, para a raiz da AC;
   - o "Delegar controle" do `dsa.msc`, com as tarefas de redefinir as senhas, ler e gravar o `userAccountControl` e mudar a associação aos grupos.

## Risks / Trade-offs

- **[Risco] Um texto do guia fica velho com uma versão nova do Windows.** Mitigação: os comandos são os de sempre do AD, e o runbook repete o roteiro.
- **[Risco] A AC colada é a errada, como a intermediária sem a raiz.** Mitigação: o teste da conexão diz "O certificado do servidor não é confiável.", e o passo 5 manda exportar a raiz.
- **[Trade-off] Somar a AC às públicas deixa o diretório confiar também em certificados públicos.** É o comportamento de hoje, sem a AC, e serve ao AD com certificado público.

## Migration Plan

- A migration acrescenta a coluna nula. Os diretórios gravados continuam iguais, sem a AC.
- A volta à versão anterior ignora a coluna.
