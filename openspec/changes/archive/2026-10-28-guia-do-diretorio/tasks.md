## 1. O certificado da AC

- [x] 1.1 Escrever primeiro os testes e depois a coluna `ac_do_servidor` em `diretorios`, com a migration e o teste-guarda do RLS verde. Verificar: a integração do banco passa com a coluna nula para os diretórios gravados.
- [x] 1.2 Escrever primeiro os testes e depois `opcoesDoTls`, que soma a AC às públicas, e o cliente LDAP com ela. Verificar: os testes do `ldap.test.ts` passam com "Certificado emitido pela AC da empresa" nas opções do TLS.
- [x] 1.3 Escrever primeiro os testes e depois a gravação, a leitura e o teste da conexão com a AC na API, com a recusa do texto que não é certificado e a auditoria sem o certificado. Depois, gerar o contrato de novo. Verificar: o `diretorio.int.test.ts` passa com "Certificado que não é da AC", e o `pnpm contrato:verificar` passa.

## 2. A tela

- [x] 2.1 Escrever primeiro os testes e depois o guia da primeira configuração, com os sete passos, os comandos para copiar e o abrir e fechar, e o campo do certificado da AC. Verificar: os testes do `Diretorio.test.tsx` passam com "Primeira configuração guiada" e "Guia depois da configuração", e, no `pnpm dev`, o guia e o teste da conexão com a AC funcionam contra o AD de teste.

## 3. Fechamento

- [x] 3.1 Escrever o roteiro da primeira configuração na seção "Diretório (AD)" do runbook. Verificar: `pnpm test` passa, com os testes do runbook e do mapa.
- [x] 3.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, os testes de integração do diretório e `openspec validate guia-do-diretorio --strict`. Verificar: os comandos passam.
