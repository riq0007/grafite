## 1. O domínio e o banco

- [x] 1.1 Escrever primeiro os testes e depois o `prazoDaConfianca` e a validade do aparelho no domínio (design, decisão 4). Verificar: os testes passam com "Prazo de fábrica", "Uso não renova", "Prazo reduzido", "Perfil que pede sempre", "Prazo da conta" e "Perfil inativo".
- [ ] 1.2 Criar as tabelas `aparelhos_confiaveis` e `politica_de_entrada`, as colunas do prazo na conta e no perfil e a do aparelho na sessão, com a migration (decisões 1 e 4). Verificar: a migration aplica num banco com contas, o teste-guarda do RLS passa com as duas tabelas, e o prazo fora de 0 a 90 é recusado pelo banco.

## 2. A entrada

- [ ] 2.1 Escrever primeiro os testes de integração e depois a marcação do aparelho no passo do código, com o cookie (decisão 3). Verificar: os testes passam com "Confiar no aparelho", "Código de recuperação", o prazo zero sem a marcação e o décimo primeiro aparelho tirando o mais antigo; o cookie sai com `HttpOnly`, `Secure`, `SameSite=Strict` e o caminho da entrada; a tabela guarda só o hash.
- [ ] 2.2 Escrever primeiro os testes de integração e depois a entrada que dispensa o código (decisão 2). Verificar: os testes passam com "Entrada seguinte no mesmo navegador", "Outro navegador", "Cookie de outra conta", "Senha errada com o aparelho confiável" (a mesma resposta e a contagem do bloqueio), "Aparelho confiável com a senha temporária" e "Cofre no aparelho confiável".

## 3. Esquecer e os prazos

- [ ] 3.1 Escrever primeiro os testes de integração e depois as rotas dos aparelhos da própria conta e o esquecimento sozinho nas mudanças da conta (decisão 5). Verificar: os testes passam com "Esquecer um aparelho", "Senha trocada", "Dois passos removidos pela administração" e a inativação da conta.
- [ ] 3.2 Escrever primeiro os testes de integração e depois as rotas da administração: os aparelhos de uma conta, o "Esquecer todos" e os prazos da organização, do perfil e da conta, com a auditoria. Verificar: os testes passam com "Notebook roubado", "Prazo de uma conta", "Prazo da própria conta", "Prazo da organização", "Prazo fora do intervalo" e o 403 sem a permissão.
- [ ] 3.3 Escrever primeiro o teste e depois a limpeza dos aparelhos com mais de 90 dias na manutenção diária. Verificar: o teste passa apagando só os vencidos.
- [ ] 3.4 Gerar o contrato e o cliente. Verificar: o `pnpm contrato:verificar` passa.

## 4. As telas

- [ ] 4.1 Escrever primeiro a história e os testes e depois a caixa "Confiar neste aparelho" na tela de entrada (decisão 6). Verificar: passam "Caixa do aparelho confiável", "Prazo zero" e "Código de recuperação sem a caixa", sem violação de acessibilidade.
- [ ] 4.2 Escrever primeiro os testes e depois a parte "Aparelhos confiáveis" da seção Conta, com a entrada na busca. Verificar: os testes passam com "Aparelhos confiáveis nos Ajustes", "Esquecer o notebook" e "Aparelhos confiáveis pela busca".
- [ ] 4.3 Escrever primeiro os testes e depois o prazo da organização na tela dos perfis e o campo do prazo no perfil. Verificar: os testes passam com "Prazo da organização", "Perfil mais exigente" e "Quem só vê os acessos".
- [ ] 4.4 Escrever primeiro os testes e depois os aparelhos e o prazo na conta de outra pessoa. Verificar: os testes passam com "Notebook roubado", "Prazo de uma conta" e "De onde vem o prazo".

## 5. Fechamento

- [ ] 5.1 Escrever o teste ponta a ponta da pilha: entrar com o código marcando o aparelho, sair, entrar só com a senha, esquecer o aparelho e entrar com o código de novo. Verificar: o `pnpm test:e2e:pilha` passa.
- [ ] 5.2 Atualizar a spec mestre (seção 9, na entrada e nos dois passos), o runbook, na parte do acesso perdido, e o mapa. Verificar: os testes da documentação e do mapa passam.
- [ ] 5.3 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration`;
  - `pnpm test:stories`;
  - `pnpm test:e2e`;
  - `pnpm contrato:verificar`;
  - `openspec validate aparelho-confiavel --strict`.

  Verificar: os comandos passam.
