## ADDED Requirements

### Requirement: Repositório público protegido

O código SHALL ficar num repositório público do GitHub. O histórico dele SHALL começar num commit sem pai, feito da árvore sem os termos privados. O histórico anterior SHALL ficar num repositório privado, fora do alcance do público.

Os commits e as tags SHALL levar o e-mail noreply do GitHub de quem os faz, e SHALL NOT levar um e-mail pessoal.

O README SHALL dizer o que é o projeto e que não há licença: todos os direitos são reservados, e o código pode ser lido, mas não copiado, modificado nem redistribuído.

O repositório SHALL ter:
- os workflows de um PR de qualquer pessoa de fora parados até a aprovação de quem mantém o repositório;
- a branch principal e as tags de versão (`v*`) sem remoção e sem reescrita, para todos, inclusive quem mantém. Uma versão com defeito SHALL ser corrigida por uma versão nova, e não pela tag movida;
- a busca de segredos do GitHub, com o bloqueio no push;
- nos workflows, só as ações do próprio GitHub e as do dono do repositório;
- o token dos workflows só de leitura por padrão, com a escrita declarada no job que precisa dela.

#### Scenario: PR de alguém de fora
- **WHEN** uma pessoa de fora abre um PR a partir de um fork
- **THEN** nenhum workflow do PR roda até quem mantém o repositório aprovar

#### Scenario: Push que reescreve a branch principal
- **WHEN** um push tenta reescrever ou apagar a branch principal
- **THEN** o GitHub recusa o push, e a branch continua como estava

#### Scenario: Tag de versão movida
- **WHEN** alguém tenta mover ou apagar a tag de uma versão publicada
- **THEN** o GitHub recusa, e a release continua no mesmo commit

#### Scenario: Segredo num push
- **WHEN** um push traz um segredo num formato que o GitHub reconhece
- **THEN** o push é bloqueado antes de o segredo entrar no repositório

#### Scenario: Ação de fora num workflow
- **WHEN** um workflow passa a usar uma ação que não é do GitHub nem do dono do repositório
- **THEN** o `pnpm test` reprova, com o arquivo, o job e o passo, e no GitHub o run falha sem executar a ação

#### Scenario: Commit com o e-mail pessoal
- **WHEN** um push traz um commit com o e-mail pessoal de quem desenvolve
- **THEN** o GitHub recusa o push, e o clone de trabalho já faz os commits novos com o e-mail noreply

#### Scenario: Clone de quem não tem acesso
- **WHEN** alguém sem login clona o repositório
- **THEN** recebe só o histórico do repositório público, sem nenhum commit nem tag do repositório anterior
