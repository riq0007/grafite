## MODIFIED Requirements

### Requirement: Rótulo de situação legível sem cor

O rótulo de situação SHALL comunicar o estado por texto, e a cor e o ícone serão sempre complementos. SHALL ficar em uma única linha, sem quebra. SHALL oferecer as severidades Informação, Atenção e Crítico, e as situações neutra e de sucesso. O rótulo SHALL ser um selo:
- o texto em maiúsculas, no tamanho da legenda;
- o fundo sutil da situação;
- a borda da situação.

O neutro SHALL usar a linha forte como borda.

#### Scenario: Leitura sem percepção de cor
- **WHEN** a tela é vista por alguém que não distingue as cores
- **THEN** cada rótulo continua identificável pelo texto

#### Scenario: Coluna estreita
- **WHEN** um rótulo como "EM MANUTENÇÃO" não cabe na largura da coluna
- **THEN** o rótulo continua em uma única linha e a área rola horizontalmente, sem cortar o texto

#### Scenario: Selo de atenção
- **WHEN** o rótulo "Em manutenção" aparece com a situação atenção
- **THEN** ele tem o fundo sutil e a borda da atenção, com o texto em maiúsculas

## ADDED Requirements

### Requirement: Acabamento de prancheta dos componentes base

Os componentes base SHALL seguir o acabamento da linguagem visual v3:
- **o campo de entrada:** é um poço, com o fundo na superfície afundada e a borda de controle;
- **o botão secundário:** usa a linha forte como borda;
- **o botão destrutivo:** usa a borda da situação crítica;
- **o cabeçalho da tabela:** vem em legenda, em maiúsculas e no texto secundário;
- **a linha selecionada da tabela:** tem a marca lateral de 2 px no destaque, além do fundo.

#### Scenario: Linha selecionada com o destaque Grafite
- **WHEN** uma linha da tabela é selecionada com o destaque Grafite
- **THEN** ela mostra a marca lateral no destaque, além do fundo, e o texto continua com o contraste do tema

### Requirement: Carimbo de seção

O catálogo SHALL ter o carimbo de seção:
- um título de seção, com o nível de título pedido (2 por padrão);
- o texto em legenda e em maiúsculas;
- a linha fina que segue até a borda.

Os títulos dos blocos dos painéis da ficha do ativo SHALL ter o mesmo desenho.

#### Scenario: Título lido pelo leitor de tela
- **WHEN** a tela mostra o carimbo "Suprimentos"
- **THEN** o leitor de tela o anuncia como título de nível 2, com o texto "Suprimentos"
