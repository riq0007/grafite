# Marca do Grafite: regras de aplicação

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../packages/ui/src/brand/marca-clara.svg" />
  <img src="../../packages/ui/src/brand/marca-escura.svg" alt="Grafite" height="48" />
</picture>

- **Conceito:** C · traço, escolhido em 25/09/2026 (ver `nome.md`). É o g num traço só, com a descida virando um risco reto, como um sublinhado a lápis.
- **Fonte única:** o símbolo é definido em `packages/ui/src/brand/simbolo.ts`, e a palavra sai da Instrument Sans (peso 500) convertida em curvas. Todos os arquivos abaixo são gerados dessa fonte por `pnpm marca:gerar`. Nenhum é editado à mão.
- **Verificação:** `pnpm marca:verificar` e o teste `derivados.test.ts` (em `pnpm test`) falham se algum arquivo não bater com a fonte. O teste `marca.test.ts` confere o contraste da marca nos seis temas.

## Partes

| Parte | O que é | Arquivo |
|---|---|---|
| **Símbolo** | O g num traço, na grade de 32 | `packages/ui/src/brand/simbolo.svg` |
| **Logotipo** | A palavra "grafite" em curvas, em minúsculas | `packages/ui/src/brand/logotipo.svg` |
| **Marca** | Símbolo e logotipo lado a lado, alinhados pelo fundo do bojo. É a versão principal | `packages/ui/src/brand/marca.svg` |

- Em texto corrido, o nome do produto é escrito "Grafite", com inicial maiúscula. A minúscula é só do logotipo.
- A distância entre o símbolo e a palavra e o alinhamento entre eles são fixos: use a marca pronta, sem montar as partes à mão.

## Versões por fundo

| Onde | Versão | Arquivo |
|---|---|---|
| Interface do Grafite, em qualquer um dos seis temas | Na cor do texto do tema (`--cor-texto`) | Componente `<Marca>`, ou `marca.svg` e `simbolo.svg`, que herdam a cor (`currentColor`) |
| Fundo claro fora da interface (documento, e-mail, etiqueta) | Monocromática escura | `marca-escura.svg` |
| Fundo escuro fora da interface | Monocromática clara | `marca-clara.svg` |
| Aba do navegador | Símbolo que acompanha o tema claro ou escuro do sistema, com o ICO de reserva | `apps/web/public/favicon.svg` e `favicon.ico` |
| Tela de início e instalação da PWA | Símbolo claro sobre a placa escura do tema Grafite; o maskable para quando o sistema recorta o ícone | `apps/web/public/icones/pwa-*.png` |
| Foto, cor de destaque ou fundo com padrão | Não aplique a marca solta: use o ícone com placa | `apps/web/public/icones/pwa-512.png` |

A marca precisa de contraste de pelo menos 3:1 com o fundo. Na interface, isso é garantido pela cor do texto do tema, verificada nos seis temas. Fora dela, use a escura sobre fundo claro e a clara sobre fundo escuro.

## Área de proteção

A medida de referência é **x = metade da altura da marca aplicada**.

- **Marca:** deixe x livre em volta do desenho. O SVG já é recortado junto ao desenho, então a medida vale a partir da borda do arquivo. Por exemplo, na barra superior a marca tem 14 px de altura e fica com 7 px livres acima e abaixo.
- **Símbolo sozinho:** a grade de 32 já traz uma folga embutida. Não sobreponha nada à caixa do símbolo e mantenha livre em volta dela um quarto do lado da caixa.
- Nenhum texto, ícone, borda ou limite de contêiner entra na área de proteção.

## Tamanho mínimo

| Versão | Na tela | Impressa |
|---|---|---|
| Marca | 14 px de altura | 4 mm de altura |
| Símbolo | 16 px de lado da caixa (o tamanho do favicon) | 4 mm de lado da caixa |

Abaixo disso, a palavra fica menor que o menor texto da interface (11 px) e o traço do símbolo fica fino demais para o bojo se manter aberto.

## Usos proibidos

- Distorcer, esticando ou achatando: a proporção é sempre a do arquivo.
- Rotacionar ou inclinar.
- Aplicar gradiente, sombra, brilho, contorno ou transparência.
- Recolorir fora dos tokens. Na interface, só a cor do texto do tema; fora dela, só as versões escura e clara.
- Mudar a composição: afastar, aproximar ou trocar de lugar o símbolo e a palavra.
- Recriar a palavra com texto digitado ou com outra fonte.
- Editar à mão qualquer arquivo gerado. Toda mudança passa pela fonte e por `pnpm marca:gerar`.

## Na interface

O componente `<Marca>` de `@grafite/ui` desenha a marca em linha, a partir da mesma montagem do `marca.svg`:

```tsx
import { Marca } from '@grafite/ui';

<Marca altura={14} />                     // barra superior
<Marca variante="simbolo" altura={16} />  // espaço pequeno
<Marca decorativa />                      // quando "Grafite" já está escrito ao lado
```

- **Leitor de tela:** por padrão, a marca é uma imagem com o nome "Grafite". A opção `decorativa` a esconde dos leitores de tela, para o nome não ser lido duas vezes.
- **Cor:** o componente usa a cor do texto do tema. Não passe outra cor para ele.
