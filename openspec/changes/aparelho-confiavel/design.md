## Context

A entrada (`apps/api/src/acesso/entrada.ts`) confere a senha e cria a sessão pendente, que resolve os passos na ordem da spec: o código, a troca da senha temporária e o cadastro dos dois passos. A sessão é um token aleatório, guardado só em hash, no cookie `__Host-grafite-sessao` (`httpOnly`, `secure`, `sameSite: lax`, `path: /`).

A exigência dos dois passos mora em dois lugares: a coluna `exige_dois_passos` da conta e a do perfil. A organização não tem hoje nenhuma configuração de entrada própria.

As mudanças da conta que encerram sessões passam por `encerrarSessoesDaConta` (`apps/api/src/acesso/encerramento.ts`), e o `apagarDoisPassos` (`dois-passos.ts`) já fecha o cofre da conta junto.

A spec mestre (seção 5.2, decisão 8) trata as credenciais como coisas que se substituem e se apagam, com o histórico na auditoria.

## Goals / Non-Goals

**Goals:**
- Dispensar o código só onde a pessoa já o digitou, pelo prazo que a organização aceita.
- O aparelho roubado ou esquecido sai com um clique, do usuário ou da administração.
- Nada do que hoje pede o código por ser sensível deixa de pedir.

**Non-Goals:**
- Reconhecer o aparelho por impressão digital do navegador, por IP ou por rede.
- Trocar o token do aparelho a cada uso.
- Um segundo fator novo, como o e-mail, a chave de acesso ou a aprovação pelo celular.
- A confiança de várias contas no mesmo navegador ao mesmo tempo.

## Decisions

### 1. O aparelho é um segundo token, só da entrada

Tabela nova `aparelhos_confiaveis`, com `orgScoped()` e RLS: a conta, o hash do token, o dispositivo, o IP, `criado_em` e `usado_em`. O token tem o mesmo tamanho e a mesma origem aleatória do da sessão, e o banco guarda só o hash, com índice único.

O cookie é `__Secure-grafite-aparelho`, com `httpOnly`, `secure`, `sameSite: strict` e o `path` das rotas da entrada (`/api/sessao`), e dura o prazo que vale na hora em que é marcado. Ele não usa o prefixo `__Host-` porque esse prefixo obriga o `path: /`, e o cookie iria em toda requisição. Sem `Domain`, ele continua preso ao endereço da organização.

Como o cookie não vai às rotas da conta, a sessão guarda o aparelho pelo qual entrou ou que marcou, na coluna `sessoes.aparelho_id`. É por ela que a lista dos aparelhos diz qual é o do navegador atual. A coluna não tem chave estrangeira: o aparelho esquecido só deixa de casar com ela.

**Alternativa descartada:** marcar a própria sessão como longa. A sessão que vale 30 dias seria um cookie de acesso total por 30 dias; o aparelho confiável só dispensa um passo, e ainda pede a senha.

### 2. A entrada

Depois da senha certa, e só então, a entrada lê o cookie do aparelho:
1. sem cookie, segue como hoje;
2. com cookie, procura o hash entre os aparelhos daquela conta, na organização do endereço;
3. achado e dentro do prazo (decisão 4), marca o código como resolvido, grava `usado_em` e segue para o passo seguinte, ou conclui a entrada;
4. não achado, ou fora do prazo, apaga o cookie na resposta e pede o código.

Antes da senha certa, a resposta é a mesma com e sem o cookie: o aparelho não vira um jeito de descobrir se um usuário existe nem de pular o bloqueio progressivo.

### 3. Marcar o aparelho

O passo do código aceita `confiar`. Com o código do app certo, `confiar` verdadeiro e o prazo da conta maior que zero, a entrada cria o aparelho e manda o cookie, na mesma transação que conclui o passo. O código de recuperação ignora o `confiar`.

Um navegador que já tinha o cookie de outra conta passa a ter o da conta que marcou por último, e o aparelho antigo daquele cookie é apagado se era da mesma conta. Com mais de 10 aparelhos, sai o de `usado_em` mais antigo.

### 4. O prazo

- **A organização:** tabela nova `politica_de_entrada`, com `orgScoped()`, uma linha por organização e `dias_de_confianca`; sem a linha, valem 30.
- **O perfil e a conta:** coluna `dias_de_confianca`, nula quando seguem o nível de cima.

`prazoDaConfianca`, no domínio, recebe o valor da conta, os dos perfis ativos em vigor e o da organização, e devolve os dias e de onde eles vêm, para a tela dizer "30 dias, pela organização". O aparelho vale enquanto `criado_em + prazo` é depois de agora, com o prazo lido na hora da entrada: reduzir o prazo corta os aparelhos antigos sem tocar neles.

**Alternativa descartada:** gravar a data do fim em cada aparelho. A redução do prazo teria de reescrever os aparelhos de todas as contas afetadas.

### 5. Esquecer

- **Pelo usuário:** `GET /conta/aparelhos`, `DELETE /conta/aparelhos/{id}` e `DELETE /conta/aparelhos`. A lista diz qual é o do navegador atual, pelo aparelho da sessão (decisão 1), e o prazo que vale para a conta.
- **Pela administração:** `GET /contas/{id}/aparelhos` e `DELETE /contas/{id}/aparelhos`, com `contas.administrar`, e a mudança do prazo da conta, recusada na própria conta.
- **Sozinho:** uma função `esquecerAparelhosDaConta`, chamada na troca e na redefinição da senha, em `apagarDoisPassos`, na ativação dos dois passos e na inativação da conta ou da pessoa, nas mesmas transações.
- **Pela manutenção diária:** apaga os aparelhos com mais de 90 dias, o teto do prazo.

Esquecer apaga a linha. A auditoria guarda a marcação, o esquecimento feito por alguém e as mudanças de prazo, sem o token.

### 6. As telas

- **A entrada:** a caixa e a explicação no passo do código, na `TelaDeEntrada` do `@grafite/ui`, com o prazo que a sessão pendente informa: no passo do código, o estado da sessão traz `diasDeConfianca`, o prazo que vale para a conta.
- **Ajustes › Conta:** a parte "Aparelhos confiáveis", com a entrada na busca.
- **Administração:** o prazo da organização acima da lista dos perfis, o campo do prazo no formulário do perfil e, na conta de outra pessoa, os aparelhos, o "Esquecer todos os aparelhos" e o prazo.

O campo do prazo é o mesmo nos três lugares: uma escolha entre seguir o nível de cima, pedir sempre ou um número de dias.

## Risks / Trade-offs

- **[O cookie do aparelho copiado de um computador]** → ele sozinho não entra: ainda pede a senha, só vai às rotas da entrada, não é lido por scripts e some na troca da senha. O Cofre continua pedindo o código, e o prazo 0 desliga a confiança para quem precisa.
- **[Computador compartilhado]** → a caixa vem desmarcada e diz o que faz; quem marcou por engano esquece o aparelho nos Ajustes.
- **[O padrão de 30 dias enfraquece a entrada de quem administra]** → o perfil Administrador pode ganhar o prazo 0 num clique, e a tela dos perfis mostra o prazo que vale.
- **[Reduzir o prazo surpreende quem estava dentro dele]** → a mudança diz o efeito antes de confirmar, e a pessoa só digita o código de novo.

## Migration Plan

A migration cria as duas tabelas e as três colunas (o prazo na conta e no perfil e o aparelho na sessão), todas sem dados. Sem a linha da política, a organização usa 30 dias; a organização que quiser o comportamento de antes grava o prazo 0. A versão anterior da API ignora o cookie e as tabelas, e a volta da versão não precisa desfazer nada.

## Open Questions

Nenhuma.
