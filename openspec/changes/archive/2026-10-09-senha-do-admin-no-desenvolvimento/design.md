## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. Pontos de partida:
- **`pnpm dev` (`scripts/dev.ts`):** gera o `.env`, sobe o banco, aplica as migrations e roda `pnpm grafite organizacao criar --se-nao-existir --sem-exigir-dois-passos` para a organização `Desenvolvimento`, com os endereços `localhost` e `127.0.0.1` e a conta `admin`. Na primeira vez, o comando mostra a senha temporária. Depois, não faz nada.
- **Comando no servidor (`apps/api/src/comando/`):** cria organizações e contas e redefine um acesso perdido, sempre com senha temporária. Ele vai na imagem de contêiner, e a imagem roda com `NODE_ENV=production`. A opção `--sem-exigir-dois-passos` já é só do desenvolvimento, mas sem nenhuma trava.
- **Troca da senha (`apps/api/src/rotas/conta.ts`):** grava o hash Argon2id, tira a marca de temporária, zera as recusas seguidas do usuário, encerra as outras sessões com o motivo `senha-trocada` e registra `senha.trocada` na auditoria, com o evento de saída da conta.

## Goals / Non-Goals

**Goals:**
- A senha fixa é gravada só pelo `pnpm dev`, e nenhum caminho do produto chega a ela.
- A gravação usa as mesmas peças da troca da senha: o hash, as sessões, a auditoria e o evento.

**Non-Goals:**
- Dispensar os dois passos que a pessoa ativou por conta própria: a conta `admin` continua com eles, se tiver.
- Mudar a regra da senha, a tela de troca ou o comando no servidor.

## Decisions

### 1. Uma função no comando, com um ponto de entrada só do `pnpm dev`
- **Escolha:**
  - **Função:** `garantirSenhaDeDesenvolvimento(banco, agora, ambiente)`, em `apps/api/src/comando/desenvolvimento.ts`. Ela usa as peças do comando e da troca da senha: o hash, a transação com o RLS, a auditoria e o encerramento das sessões.
  - **Ponto de entrada:** `apps/api/scripts/desenvolvimento.ts`, como o `grafite.ts`: abre a conexão de `GRAFITE_DATABASE_URL`, chama a função e escreve o resultado.
  - **`pnpm dev`:** roda o ponto de entrada com `--env-file=.env`, logo depois da criação da organização.
- **Alternativas:**
  - **uma opção do `organizacao criar`:** fica no comando de produção e só vale quando a organização nasce. O banco de desenvolvimento que já existe continuaria com a senha antiga;
  - **um script na raiz (`scripts/`) que importa o código da API:** as dependências do código da API não se resolvem a partir da raiz, e a checagem de tipos dos scripts passaria a carregar a API inteira.

### 2. Três travas contra a senha fixa fora do desenvolvimento
- **Escolha:**
  - **Produção:** com `NODE_ENV=production`, a função recusa antes de abrir o banco.
  - **Endereços:** ela acha a organização pelo endereço `localhost` e recusa se a organização tiver algum endereço que não seja `localhost`, `127.0.0.1` ou `::1`. Uma organização de verdade tem um endereço de verdade.
  - **Imagem:** o `.dockerignore` deixa o ponto de entrada fora da imagem.

  As recusas saem com o código 1 e o motivo em pt-BR, como os erros do comando no servidor.
- **Por quê:** a senha `admin123` numa organização de verdade seria uma porta aberta. Cada trava sozinha já basta, e as três juntas cobrem tanto o engano de configuração quanto a imagem.

### 3. Gravar só quando a senha não é `admin123`
- **Escolha:** a função confere o hash atual com `admin123`.
  - **Confere, e a senha não é temporária:** nada é gravado, e não há auditoria nem evento.
  - **Senão, como a troca da senha:**
    - grava o hash novo, tira a marca de temporária e marca o momento da troca;
    - zera as recusas seguidas do usuário;
    - registra `senha.trocada` com o ator `sistema` ("comando de desenvolvimento");
    - encerra todas as sessões da conta com o motivo `senha-trocada`.
- **Por quê:** reiniciar o `pnpm dev` com o navegador aberto é o caso comum, e ele não pode derrubar a sessão nem encher a auditoria. Quando a senha muda, a conta segue a regra de sempre: a senha trocada encerra as sessões.

### 4. O terminal mostra o usuário e a senha
- **Escolha:**
  - **Criação:** o `pnpm dev` roda a criação da organização sem a saída padrão, só com os erros. A senha temporária que o comando mostraria já é trocada logo em seguida.
  - **Passo novo:** a cada execução, escreve "Entre com o usuário admin e a senha admin123", e diz quando a senha foi gravada de novo.
- **Alternativa:** uma opção no comando para não mostrar a senha temporária. Seria mais uma opção de produção só para o desenvolvimento.

## Risks / Trade-offs

- **[A senha fixa numa organização de verdade]** → As três travas da decisão 2, e nenhuma opção nova no comando de produção.
- **[A troca da senha do `admin` some na próxima execução]** → É o comportamento pedido. O terminal avisa quando a senha volta, e as outras contas da organização de desenvolvimento não mudam.
- **[`admin123` não passa pela regra da senha]** → É a única exceção, escrita na spec. Qualquer senha que a pessoa escolhe, nessa conta também, passa pela regra.

## Migration Plan

Nada a migrar. Na próxima execução do `pnpm dev`, a conta `admin` do banco de desenvolvimento que já existe passa a entrar com `admin123`, e as sessões abertas dela são encerradas uma vez.
