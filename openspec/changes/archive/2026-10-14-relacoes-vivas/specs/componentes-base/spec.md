## ADDED Requirements

### Requirement: Referência com cartão

Uma referência a um registro SHALL ser um link para a ficha dele, com o nome em texto. Ao parar o ponteiro 500 ms sobre ela, ou com o foco nela e a seta para baixo, SHALL abrir um cartão na camada flutuante com o resumo do registro e até quatro ações, como "Abrir" e "Ver ativos". O cartão SHALL ficar aberto enquanto o ponteiro estiver sobre a referência ou sobre ele, e SHALL fechar com Esc, devolvendo o foco à referência.

Nada essencial SHALL existir só no cartão: o que ele mostra também está na ficha do registro. No toque, o toque SHALL abrir a ficha, sem cartão. Uma pessoa anonimizada e um registro fora do acesso de quem vê SHALL continuar só como texto, sem link nem cartão. O cartão SHALL abrir com a troca de opacidade, sem crescer, e sem movimento quando o movimento é reduzido.

#### Scenario: Cartão de uma pessoa
- **WHEN** o usuário para o ponteiro 500 ms sobre "Ana Souza" na coluna Responsável
- **THEN** abre o cartão com a foto, o local de trabalho, "3 ativos sob responsabilidade", "Abrir" e "Ver ativos"

#### Scenario: Pelo teclado
- **WHEN** o foco está na referência "Jundiaí › Expedição" e o usuário aperta a seta para baixo
- **THEN** abre o cartão do local, e Esc o fecha com o foco de volta na referência

#### Scenario: Fora do acesso
- **WHEN** a ficha mostra um ativo ligado fora do acesso de quem vê
- **THEN** ele aparece como "Ativo fora do seu acesso", em texto, sem link nem cartão
