## MODIFIED Requirements

### Requirement: Seção Aparência

A seção Aparência SHALL ajustar:
- o tema, com os escuros (Grafite, Meia-noite e OLED) separados dos claros (Névoa, Papel e Alto contraste), e o Personalizado;
- a cor de destaque (azul, verde, laranja e grafite), e a Personalizada;
- os cantos, com o raio base de 0 a 24 px;
- a densidade (compacta, normal e confortável);
- a barra de rolagem, com "Ao rolar" e "Sempre visível" (spec componentes-base, "Barra de rolagem própria").

Com o tema Personalizado, a seção SHALL mostrar:
- o tom, escuro ou claro;
- a matiz da base, com a trilha pintada das matizes;
- o tingimento dos cinzas;
- o contraste, com a dureza do lápis ao lado do número: 2H, H, HB, B, 2B e 4B, do mais leve ao mais forte.

Com o destaque Personalizado, a seção SHALL mostrar a matiz e a intensidade, e a intensidade 0 SHALL ser o monocromático.

A seção SHALL mostrar a razão de contraste do texto, do texto secundário e do destaque contra a superfície, no tema e no destaque que valem, como "Texto 15,2:1".

A escolha da barra de rolagem SHALL explicar cada opção em texto: "Ao rolar: aparece com o ponteiro sobre a área ou enquanto ela rola." e "Sempre visível: fica à vista em toda área que rola.". Onde vale a barra do sistema, a seção SHALL dizer "Neste aparelho vale a barra de rolagem do sistema.", e a escolha SHALL continuar valendo nos outros aparelhos.

#### Scenario: Trocar o destaque
- **WHEN** o usuário escolhe o destaque verde
- **THEN** a interface inteira passa ao verde na hora, inclusive a própria tela de Ajustes

#### Scenario: Montar o próprio tema
- **WHEN** o usuário escolhe o tema Personalizado, o tom claro e a matiz 80
- **THEN** a interface inteira passa ao tema claro com os cinzas puxados para a matiz 80, na hora, e a leitura do contraste mostra o texto com pelo menos 7:1

#### Scenario: Lápis do contraste
- **WHEN** o usuário leva o contraste do tema Personalizado a 45
- **THEN** o controle mostra "HB · 45", e o leitor de tela anuncia "HB, 45 de 100"

#### Scenario: Destaque monocromático pela intensidade
- **WHEN** o usuário escolhe o destaque Personalizado e leva a intensidade a 0
- **THEN** o destaque fica monocromático, como o Grafite, em qualquer matiz

#### Scenario: Escolher Sempre visível
- **WHEN** o usuário escolhe "Sempre visível" na barra de rolagem
- **THEN** o polegar da lista das seções e o da janela ficam à vista na hora, sem botão de salvar

#### Scenario: Barra de rolagem no celular
- **WHEN** o usuário abre a seção Aparência no celular
- **THEN** a seção diz "Neste aparelho vale a barra de rolagem do sistema.", e a escolha feita continua valendo no computador

#### Scenario: Barra de rolagem pela busca
- **WHEN** o usuário digita "rolagem" na busca e escolhe "Barra de rolagem"
- **THEN** a seção Aparência abre, com o foco na escolha da barra
