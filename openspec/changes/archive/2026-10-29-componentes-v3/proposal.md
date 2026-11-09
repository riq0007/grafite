## Why

A fundamentos-v3 trocou as cores, o destaque de fábrica e o raio. Os componentes base, porém, ainda desenham como antes:
- o rótulo de situação é uma pílula tingida, sem borda;
- o botão secundário tem a mesma borda forte dos campos;
- os campos ficam na cor da janela;
- o cabeçalho da tabela parece uma linha de dados;
- os títulos dos painéis da ficha são texto solto;
- o dock tem só os ícones, sem a placa de cada módulo.

O ANTISLOP v3 (seções 0, 13 e 16) pede a precisão de prancheta: o selo de situação, os poços na superfície afundada, o carimbo de seção e a hierarquia por linhas finas.

Esta change é a quarta etapa do subprojeto D1 · Linguagem visual v3 da spec mestre. Ela redesenha os componentes base e o dock pelos tokens novos. Ficam fora dela:
- as telas dos módulos, que só mudam pelos componentes;
- o controle do usuário, que vem na change seguinte.

## What Changes

- **O selo de situação:** o rótulo ganha o fundo sutil e a borda da situação, em maiúsculas de 11 px, como um carimbo. O neutro usa a linha forte como borda.
- **Os botões:**
  - o secundário fica com a linha forte sobre a superfície 2, mais calmo que o campo;
  - o destrutivo ganha a borda da situação crítica.
- **Os campos como poços:** o fundo passa à superfície afundada, com a borda de controle, e o foco e o erro continuam como estão.
- **A tabela:**
  - o cabeçalho vira legenda, em 11 px, maiúsculas e o texto secundário;
  - a linha selecionada ganha a marca lateral de 2 px no destaque.
- **O carimbo de seção:** um componente novo, `Carimbo`, é o título de seção com a linha fina que segue. Os títulos dos painéis da ficha do ativo passam a usá-lo.
- **O dock:** cada item ganha uma placa leve, com o ícone no texto do tema. O módulo atual ganha a borda da placa, além do ponto.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: o rótulo de situação como selo, os campos como poços, o cabeçalho e a seleção da tabela e o carimbo de seção.
- `dock`: a placa de cada item e a do módulo atual.

## Impact

- **`packages/ui`:**
  - o CSS do rótulo, do botão, do campo e da tabela;
  - o `Carimbo`, com o teste e a história;
  - o CSS do dock.
- **`apps/web`:** os títulos dos painéis da ficha do ativo.
- **A regressão visual:** as capturas com esses componentes são regravadas.
- A API, o banco e o contrato não mudam.
