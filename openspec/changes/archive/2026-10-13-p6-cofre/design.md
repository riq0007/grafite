## Context

O motivo está em `proposal.md`. O ponto de partida:

- **A verificação em dois passos** (F2a) guarda a chave de cada app cifrada com AES-256-GCM. A chave do servidor vem do ambiente (`GRAFITE_CHAVE_DOIS_PASSOS`), e o id da conta entra como dado associado (`apps/api/src/acesso/cifra.ts`). O código do app vale no intervalo atual e nos dois vizinhos e nunca duas vezes, pelo `ultimo_passo` (`conferirCodigoDaConta`).
- **A sessão** fica numa linha de `sessoes`, lida a cada requisição, com o acesso efetivo da conta: as atribuições em vigor, diretas e pelos grupos, resolvidas pelo domínio.
- **A organização** de cada requisição vem do endereço. Só duas consultas atravessam organizações: a descoberta pelo endereço e a lista das organizações para as tarefas (`app.organizacoes_para_tarefas()`), que a manutenção diária usa.
- **Os módulos opcionais** são uma lista do domínio (`MODULOS_OPCIONAIS`), e cada módulo declara as permissões e os eventos no registro da casca.
- **A configuração dos ambientes** do servidor Windows é gerada pela operação, com os segredos e o acesso só dos administradores. O teste usa a mesma chave dos dois passos da produção, porque os dados dele são uma cópia da produção.

## Goals / Non-Goals

**Goals:**
- Um valor secreto nunca aparece fora da resposta da revelação ou da cópia: nem no banco legível, nem no log, nem na auditoria, nem nos eventos.
- A troca da chave mestra recifra só as chaves dos segredos e não para o sistema.
- O formato guardado aceita os tipos com mais de um campo secreto, como a credencial SNMP do P2b, sem migrar os segredos.
- Nenhuma consulta nova entre organizações.

**Non-Goals:**
- A migração do cofre do PMG (P8). Os tipos e as classificações seguem os do PMG, para ela trazê-los como estão.
- Um cofre por pessoa, com uma chave derivada da senha: quem administra precisa trocar os valores e o acesso sem a senha de ninguém.
- Limpar a área de transferência: o navegador não deixa limpá-la com segurança.

## Decisions

### 1. Duas camadas: a chave do segredo e a chave mestra

Cada segredo ganha, ao ser cadastrado, uma chave própria de 32 bytes aleatórios.
- O conteúdo é cifrado com ela, em AES-256-GCM.
- Ela é cifrada pela chave mestra, também em AES-256-GCM.
- As duas cifras usam o mesmo formato da chave dos apps (versão, IV, etiqueta e dados), com dados associados: `segredo:<org>:<id>` no conteúdo e `chave:<org>:<id>` na chave do segredo. Um valor copiado para a linha de outro segredo, ou de outra organização, não decifra.
- O id do segredo é gerado na API antes de cifrar, porque ele entra nos dados associados.

O conteúdo cifrado é um JSON `{ "valor": "..." }`. Os tipos do P2b com mais de um campo secreto, como o usuário e as duas senhas do SNMP v3, guardam outras chaves no mesmo JSON, sem migrar os segredos que já existem.

Trocar o valor gera uma chave nova para o segredo. Uma chave fica presa a um valor só.

- **Alternativas:**
  - uma camada só, como no PMG, em que a troca da chave mestra exige decifrar e cifrar de novo todos os valores, e cada valor passa em claro pela memória do comando;
  - o `pgcrypto`, que levaria a chave mestra ao banco, nas consultas e no log dele.

### 2. A chave mestra no ambiente, com a anterior durante a troca

- `GRAFITE_CHAVE_DO_COFRE` é obrigatória, com 32 bytes em base64.
- `GRAFITE_CHAVE_DO_COFRE_ANTERIOR` só existe durante uma troca e é diferente da atual.

Cada segredo guarda a impressão da chave mestra que cifrou a chave dele: os 16 primeiros caracteres hexadecimais do SHA-256 da chave mestra. A API decifra com a chave cuja impressão bate e grava sempre com a atual. A impressão não deixa recuperar a chave e diz, sem decifrar nada, quantos segredos ainda estão na anterior.

A partida confere só a presença e o formato. Conferir se a chave abre os segredos pediria uma consulta a todas as organizações, uma terceira consulta entre elas. O segredo cuja impressão não bate com nenhuma das duas chaves é recusado na revelação, com a frase da spec e o caso no log.

### 3. O acesso por segredo

`acessos_aos_segredos` tem uma linha por titular, com `conta_id`, `grupo_id` ou `perfil_id`. Uma checagem exige exatamente um dos três, cada um com a chave estrangeira composta com o `org_id`. Ela é única por segredo e titular.

Os titulares de uma conta, numa requisição, são:
- a própria conta;
- os grupos ativos de que ela participa, com a participação em vigor;
- os perfis ativos das atribuições em vigor dela, diretas e pelos grupos, em qualquer escopo.

O domínio tem a regra pura (`alcancaOSegredo`), que os testes usam. A API faz a mesma conta numa subconsulta, para a lista não carregar todos os acessos.

| Quem | Vê na lista | Revela e copia |
|---|---|---|
| `cofre.usar` | os segredos ativos que alcança | os que alcança, com o cofre liberado |
| `cofre.administrar` (inclui `cofre.usar`) | todos, ativos e inativos | os que alcança, com o cofre liberado |

Quem cadastra ganha o acesso ao segredo na mesma transação, e isso entra na auditoria como parte do cadastro.

- **Alternativa:** dar a revelação a quem administra. Isso juntaria administrar e ver o valor numa permissão só e tiraria da auditoria o momento em que alguém se dá o acesso.

### 4. A liberação na sessão, por 5 minutos

`sessoes` ganha `cofre_liberado_ate`. A rota `POST /cofre/liberacao`:
- confere o código pela mesma função da entrada, depois de recusar o que parece código de recuperação;
- grava `cofre_liberado_ate` como o momento mais 5 minutos e devolve o horário;
- tem o limite de requisições estrito, como o segundo passo da entrada (20 por minuto).

A revelação e a cópia conferem `cofre_liberado_ate > agora` na sessão da requisição.

As rotas que desativam, removem ou cadastram de novo os dois passos zeram `cofre_liberado_ate` em todas as sessões da conta, na mesma transação.

- **Por que na sessão, e não num token à parte:** a liberação morre com a sessão, sem nada novo para guardar no navegador.

### 5. Revelar e copiar são POST, auditados mesmo na recusa

Revelar e copiar são duas rotas `POST`, que devolvem `{ valor }` com `Cache-Control: no-store` e `Pragma: no-cache`. São `POST` porque mudam a auditoria e porque nada pode buscá-las de antemão. Elas também ficam fora do cache do service worker, como toda a `/api`.

As duas rotas seguem a mesma ordem:
1. A transação confere a sessão liberada, a conta com os dois passos, o segredo ativo e o alcance.
2. Na recusa, ela grava a recusa na auditoria e termina com sucesso. A rota responde o problema depois do commit, para a recusa ficar gravada.
3. No sucesso, ela grava a revelação ou a cópia e decifra só no fim.

O valor nunca vai para uma variável que chegue ao log: as mensagens de erro da cifra trocam o detalhe pela frase da spec.

### 6. Tabelas

Todas são criadas com `orgScoped()` e o isolamento, e o `org_id` vai nas chaves estrangeiras.

| Tabela | O que guarda |
|---|---|
| `segredos` | id, nome e nome normalizado, tipo, classificação, identificador, endereço, notas, validade, próxima rotação, `pessoa_id`, situação, `conteudo_cifrado bytea`, `chave_cifrada bytea`, `impressao_da_chave_mestra text`, quem cadastrou, `valor_trocado_em`, criado e atualizado |
| `acessos_aos_segredos` | segredo, `conta_id`, `grupo_id` ou `perfil_id`, quem deu e quando |
| `segredos_dos_ativos` | segredo e ativo, únicos juntos |

`sessoes` ganha `cofre_liberado_ate`. Os tipos e as classificações são listas do domínio, com checagens no banco, como as situações das outras tabelas.

### 7. Rotas da API

| Rota | Quem | Faz |
|---|---|---|
| `GET /cofre/segredos` | `cofre.usar` | a lista, com a busca e os filtros |
| `GET /cofre/segredos/:id` | `cofre.usar` | a ficha, sem o valor; o acesso só para quem administra |
| `POST /cofre/segredos` | `cofre.administrar` | o cadastro, com o valor |
| `PATCH /cofre/segredos/:id` | `cofre.administrar` | os dados; o valor, se vier |
| `PUT /cofre/segredos/:id/acesso` | `cofre.administrar` | a lista inteira de titulares |
| `POST /cofre/segredos/:id/inativacao` e `/reativacao` | `cofre.administrar` | a situação |
| `GET /cofre/titulares` | `cofre.administrar` | as contas, os grupos e os perfis ativos pelo nome, para o acesso, sem pedir `acessos.ver` |
| `GET /cofre/pessoas` | `cofre.administrar` | as pessoas ativas pelo nome, para o vínculo |
| `GET /cofre/liberacao` e `POST /cofre/liberacao` | `cofre.usar` | até quando o cofre está liberado; liberar com o código |
| `POST /cofre/segredos/:id/revelacao` e `/copia` | `cofre.usar` | o valor, auditado |

Todas as rotas, menos as de quem não tem os dois passos ativos, respondem 403 com a frase da spec quando a conta não tem a verificação. A guarda do módulo opcional responde antes delas, com o Cofre desligado.

Os ativos do vínculo vêm da busca dos ativos que já existe, com `ativos.ver`. Quem administra o cofre sem ver ativos não liga ativos.

A ficha do ativo (`GET /ativos/:id`) ganha `segredos`: os ligados que a conta vê no cofre, com o nome, o tipo e o identificador. Eles vêm só com o Cofre ligado e a conta com `cofre.usar` e os dois passos ativos.

### 8. O evento `cofre.mudou`

O evento é gravado no cadastro, na edição, na troca do valor, na mudança do acesso, na inativação e na reativação, com o alvo `{ tipo: 'segredo', id }`. O público é `{ permissao: 'cofre.usar' }`.

A liberação, a revelação e a cópia não gravam evento. O evento não leva o nome nem o valor, então quem usa o cofre e não alcança o segredo recebe só uma releitura que não muda a lista dele.

### 9. O comando `cofre trocar-chave`

O `pnpm grafite cofre trocar-chave` lê as duas chaves do ambiente e percorre as organizações pela `app.organizacoes_para_tarefas()`, a mesma da manutenção. Em cada uma, no contexto dela:
1. lê os segredos com a impressão da anterior;
2. decifra a chave de cada um com a anterior e a cifra com a nova;
3. grava a impressão nova;
4. registra na auditoria, com o ator "sistema", quantos segredos recifrou.

O conteúdo nunca é decifrado. O segredo que não abre com nenhuma das duas fica como está e é listado na saída pelo id e pelo nome. Rodar de novo não muda nada.

### 10. A operação no servidor Windows

- **Instalação:** os segredos da instalação ganham `chaveDoCofre`, gerada e gravada no `config.env` dos dois ambientes.
- **Atualização do teste:** sem a chave, ela usa a da produção, se houver, ou gera uma, e grava nos dois `config.env` antes de iniciar o teste. A atualização da produção encontra a chave pronta.
- **`.\grafite.ps1 cofre trocar-chave`:**
  1. gera a chave nova;
  2. grava a atual como `GRAFITE_CHAVE_DO_COFRE_ANTERIOR` e a nova como `GRAFITE_CHAVE_DO_COFRE` nos dois `config.env`;
  3. reinicia os dois apps e confere a saúde;
  4. roda o comando da API na produção e no teste;
  5. tira a anterior, reinicia de novo e mostra onde guardar a anterior.

  Uma falha no meio deixa as duas chaves, que a API aceita, e aponta a seção do runbook.
- **Runbook:** a "Guarda das chaves" ganha a chave do cofre e a anterior com os backups de antes da troca, e entra a seção "Troca da chave do cofre".

### 11. Desenvolvimento e ponta a ponta

- **`pnpm dev`:** gera `GRAFITE_CHAVE_DO_COFRE` uma vez no `.env`, como a chave dos dois passos.
- **Pilha:** o `subir.ts` passa uma chave gerada.
- **Simulada:** a API simulada ganha o cofre em memória, com o código do app aceito pela simulação.

### 12. A tela

O módulo `cofre` segue o contrato de módulo:
- a lista e a ficha relidas pelo `cofre.mudou`;
- a busca com um provedor;
- o registro com `cofre.usar`.

Na ficha, revelar e copiar usam um pedido único do código, que libera e já continua a ação pedida. O "Cofre liberado até 14:32" usa o horário que a API devolveu e o `useAgora`, para sumir quando a liberação acaba.

O valor revelado vive só no estado do componente. Ele some depois de 30 segundos ou ao sair da ficha e nunca vai para o cache das consultas: a revelação é uma mutação, não uma consulta.

## Risks / Trade-offs

- **[A chave mestra se perde]** → Os valores ficam ilegíveis, e o resto continua. O runbook manda guardar a chave fora do servidor, como a dos dois passos, e a anterior com os backups de antes de cada troca.
- **[Quem administra vê os dados de todos os segredos]** → Os dados não são o valor. Ver o valor exige se dar o acesso, e isso fica na auditoria.
- **[O valor fica na área de transferência do sistema]** → A tela não mostra o valor ao copiar. O navegador não deixa limpar a área com segurança, e a auditoria registra a cópia.
- **[Uma conta alcança muitos segredos por um perfil amplo]** → O acesso é por segredo, e a ficha mostra os titulares pelo nome. Tirar um titular vale na requisição seguinte, mesmo com o cofre liberado.
- **[A impressão da chave na linha]** → Ela não deixa recuperar a chave, e a troca usa a impressão para achar o que falta recifrar.

## Migration Plan

1. **A migration** cria as três tabelas e a coluna da sessão. Ela não toca em dado nenhum.
2. **A atualização do teste** gera a chave do cofre nos dois `config.env` antes de iniciar a versão nova. A da produção encontra a chave pronta.
3. **Na volta a uma versão anterior,** as tabelas ficam sem uso, e a versão anterior ignora a variável nova.
4. **O PMG** continua com o cofre dele até a migração do P8.
