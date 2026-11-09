## Context

A motivação está em `proposal.md` (Why), e os requisitos, na spec desta change.

Como está hoje:
- **O pacote:** o `apps/operacao/lancadores/instalar.sh` vai dentro do tar, que sai do `empacotar-linux.ts`. Ele é a terceira entrada, depois do `pacote.json` e do `imagens.tar.gz`, com o lançador `grafite` e o runbook.
- **O roteiro:**
  - confere o root, o Docker, o plugin compose e o pacote, pelo `.sha256` da pasta do tar, antes de usar qualquer coisa dele;
  - do tar, lê só o `pacote.json`, o `imagens.tar.gz` e o `grafite`;
  - nas mensagens, manda rodar `sudo ./instalar.sh <pacote>`.
- **A release:** o job da release publica tudo o que está na pasta `pacote/` de cada pacote.
- **A instalação de teste no Linux** copia para o `/pacotes` do contêiner do Docker as pastas `pacote/` e `pacote-maior/`, tira o `instalar.sh` do tar e o roda com o pacote nos argumentos.
- **Os testes:**
  - o `apps/operacao/src/linux/lancadores.test.ts` roda o `instalar.sh` pelo bash, com o `docker` e o `id` simulados;
  - o `empacotar-linux.test.ts` confere o tar.

## Goals / Non-Goals

**Goals:**
- **Um arquivo só:** a cópia de fora é o mesmo `instalar.sh` de dentro do pacote, byte a byte.
- **Nada muda com o pacote nos argumentos:** o roteiro automático e o CI continuam como hoje.

**Non-Goals:**
- Um hash do roteiro de fora. Ele sairia da mesma release que o próprio roteiro e não acrescentaria confiança. Foi a mesma decisão tomada com o atalho do Windows.
- Procurar o pacote na pasta atual, quando ela não é a do roteiro.

## Decisions

1. **A cópia sai do mesmo arquivo.**
   - O `empacotar-linux.ts` copia o `apps/operacao/lancadores/instalar.sh` para a pasta de saída, ao lado do tar e do `.sha256`, com o modo 755.
   - A alternativa era um script menor fora do pacote, que tirasse o roteiro do tar e o chamasse, como o atalho do Windows faz com o zip. Ela foi descartada. O `instalar.sh` já é curto e confere o pacote antes de usar qualquer coisa dele, então uma segunda camada não acrescenta nada. O atalho do Windows existe porque o zip precisa ser extraído antes de rodar o que tem dentro. O tar não: ele é lido no lugar.
2. **O pacote é achado na pasta do roteiro.**
   - Quando o roteiro roda sem argumentos, ou com o primeiro argumento começando por `--`, como o `--respostas`, ele procura os `grafite-*-linux-x64.tar` da pasta dele: a pasta do `BASH_SOURCE`, e não a pasta atual.
   - Com um, ele segue com esse pacote. Com nenhum ou com mais de um, ele para com a mensagem da spec.
   - Assim, `sudo bash /caminho/instalar.sh`, rodado de outra pasta, acha o pacote, como o atalho do Windows acha o zip da pasta dele.
3. **As mensagens dizem `sudo bash instalar.sh`.** O arquivo baixado pelo navegador ou pelo `gh` perde a permissão de execução. O `bash instalar.sh` roda com ou sem ela.
4. **O CI roda a cópia de fora.**
   - O job da instalação no Linux deixa de tirar o `instalar.sh` do tar. Ele usa a cópia que veio na pasta `pacote/`, depois de conferir com o `cmp` que ela é igual à de dentro do tar.
   - O job continua passando o pacote nos argumentos, porque o `/pacotes` também tem o tar da versão maior, usado na atualização. O modo sem argumentos fica coberto pelos testes do bash.
   - Os dois pacotes saem do mesmo commit, então o `instalar.sh` da pasta `pacote-maior/`, copiado depois, é igual. O `cmp` confere isso também.
5. **As releases de hoje recebem o roteiro do próprio pacote.**
   - A v0.1.0 e a `ensaio-v0.1.1-92` recebem o `instalar.sh` de dentro do tar de cada uma. Ele é lido do tar baixado da própria release e conferido com o arquivo do commit dela (`git show <tag>:apps/operacao/lancadores/instalar.sh`).
   - Esse roteiro antigo pede o pacote nos argumentos: `sudo bash instalar.sh grafite-0.1.0-linux-x64.tar`.
   - A alternativa era subir o roteiro novo nas releases antigas. Ela foi descartada: ele não foi testado com aqueles pacotes, e cada release fica com os arquivos da própria versão.

## Risks / Trade-offs

- **[Risco] O roteiro de fora não é conferido pelo hash, e um `instalar.sh` trocado no caminho rodaria como root.** → É o mesmo caso do atalho do Windows:
  - ele vem da mesma release que o pacote e o hash, pelo HTTPS do GitHub;
  - ele é curto, para ser lido antes de rodar;
  - o runbook continua dando o caminho de tirá-lo de dentro do pacote, depois de conferir o hash com o `sha256sum --check`.
- **[Risco] A pasta tem o pacote de duas versões, como quando a atualização foi baixada junto.** → O roteiro para e pede para deixar só um pacote ou para passá-lo nos argumentos.
- **[Trade-off] O CI não roda o modo sem argumentos,** porque a pasta dele tem dois pacotes. → Os testes do bash, com o Docker simulado, cobrem os três cenários da spec.

## Migration Plan

- Sai na v0.1.1, que a tag publica com a cópia ao lado do tar.
- A v0.1.0 e a `ensaio-v0.1.1-92` recebem o arquivo à mão, pelo `gh release upload`, sem mudar o pacote nem o `.sha256`.
- Para desfazer, basta tirar o arquivo de uma release com o `gh release delete-asset`.
