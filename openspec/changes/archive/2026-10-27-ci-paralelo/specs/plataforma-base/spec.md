## MODIFIED Requirements

### Requirement: Qualidade verificada antes do commit e em cada PR

Lint e formatação SHALL ser verificados antes de cada commit. O CI SHALL verificar em cada PR:
- lint e checagem de tipos;
- testes unitários;
- testes de integração com banco real;
- testes de ponta a ponta de fumaça;
- busca de segredos.

Num PR que só muda documentação e specs (os arquivos de `docs/` e de `openspec/`), o CI SHALL verificar o lint, os tipos, os testes unitários e a busca de segredos, e SHALL pular os testes de integração, de ponta a ponta e de regressão visual, dizendo no resumo do run que foram pulados porque só a documentação e as specs mudaram. No push na branch principal, o CI SHALL rodar todas as verificações.

Um resultado de checagem de tipos ou de teste unitário reaproveitado de um run anterior SHALL valer só quando nenhum arquivo que a checagem ou o teste lê mudou, inclusive os arquivos fora do pacote testado.

Todos os arquivos de texto do repositório SHALL usar fim de linha LF.

#### Scenario: PR com teste falhando
- **WHEN** um PR contém um teste de integração que falha
- **THEN** o CI marca o PR como reprovado e indica o teste

#### Scenario: PR só de documentação
- **WHEN** um PR muda só arquivos de `docs/` e de `openspec/`
- **THEN** o CI roda o lint, os tipos, os unitários e a busca de segredos, pula a integração, as pontas a ponta e a regressão visual, e diz no resumo do run que elas foram puladas porque só a documentação e as specs mudaram

#### Scenario: PR com código e documentação
- **WHEN** um PR muda um arquivo de `docs/` e um arquivo fora de `docs/` e de `openspec/`
- **THEN** o CI roda todas as verificações

#### Scenario: Documento lido por um teste muda
- **WHEN** um PR muda só um documento que um teste unitário lê, e o pacote desse teste não muda
- **THEN** o teste roda de novo, em vez de ter o resultado reaproveitado de um run anterior

#### Scenario: Fim de linha no Windows
- **WHEN** um arquivo é salvo no Windows e adicionado ao repositório
- **THEN** ele é gravado com fim de linha LF
