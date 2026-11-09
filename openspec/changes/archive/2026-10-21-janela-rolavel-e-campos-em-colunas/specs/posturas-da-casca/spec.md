## MODIFIED Requirements

### Requirement: Layout fluido

A margem lateral do conteúdo SHALL crescer com a largura da janela: 16 px mais 1% da largura, sem passar de 40 px, como a seção 7.8 da spec mestre define (`clamp(16px, 16px + 1vw, 40px)`). Formulários SHALL ter no máximo 960 px de largura, e tabelas SHALL ocupar a largura toda. Os componentes adaptáveis SHALL se arranjar pelo espaço do lugar onde estão, e não pela largura da janela.

No formulário com a lista das etapas e a imagem ao lado dos campos, como o cadastro do ativo em etapas e a ficha em cartões, o limite de 960 px SHALL valer para a área dos campos. A lista e a imagem SHALL ficar fora desse limite.

#### Scenario: Formulário numa tela larga
- **WHEN** um formulário é aberto numa janela de 2560 px
- **THEN** ele não passa de 960 px de largura, e uma tabela na mesma janela ocupa a largura toda

#### Scenario: Cadastro em etapas numa tela larga
- **WHEN** o cadastro do ativo é aberto numa janela de 1920 px
- **THEN** a área dos campos não passa de 960 px, e a lista das etapas e a imagem ficam ao lado dela, fora do limite

#### Scenario: Margem no celular
- **WHEN** a janela tem 390 px de largura
- **THEN** a margem lateral do conteúdo é de 19,9 px (16 px mais 1% de 390 px)

#### Scenario: Margem numa tela larga
- **WHEN** a janela tem 2560 px de largura
- **THEN** a margem lateral do conteúdo para em 40 px

#### Scenario: Componente numa coluna estreita
- **WHEN** um componente adaptável, como a linha de campos, fica numa coluna de 320 px, numa janela de 1920 px
- **THEN** ele usa o arranjo estreito, como faria numa janela de 320 px
