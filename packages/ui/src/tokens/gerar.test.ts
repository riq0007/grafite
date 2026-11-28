import { describe, expect, it } from 'vitest';
import { comAlfa, contraste } from './contraste.ts';
import { destaqueDoTema } from './destaques.ts';
import { gerarCss, gerarDtcg, gerarVariaveis, type TokenDtcg } from './gerar.ts';
import { camadasDeEstado, temas } from './temas.ts';

/** Declarações do primeiro bloco cujo seletor é exatamente `seletor`. */
function bloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(`${seletor} {`);
  if (inicio < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  const corpo = css.slice(css.indexOf('{', inicio) + 1, css.indexOf('}', inicio));
  return Object.fromEntries(
    corpo
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]),
  );
}

describe('gerarCss', () => {
  const css = gerarCss();

  it(':root traz o padrão de fábrica: o tema e o destaque Grafite e a densidade normal', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--cor-fundo']).toBe(temas.grafite.cores.fundo);
    expect(raiz['--cor-destaque']).toBe(destaqueDoTema('grafite', 'grafite').destaque);
    expect(raiz['--cor-destaque']).toBe(temas.grafite.cores.texto);
    expect(raiz['--altura-linha']).toBe('44px');
    expect(raiz['--texto-corpo']).toBe('14px');
    expect(raiz['--raio-base']).toBe('10px');
    expect(raiz['color-scheme']).toBe('dark');
  });

  it('o tema Névoa troca as cores e o esquema de cor', () => {
    const nevoa = bloco(css, '[data-theme="nevoa"]');
    expect(nevoa['--cor-fundo']).toBe(temas.nevoa.cores.fundo);
    expect(nevoa['--cor-superficie']).toBe(temas.nevoa.cores.superficie);
    expect(nevoa['--cor-fundo']).not.toBe(temas.grafite.cores.fundo);
    expect(nevoa['color-scheme']).toBe('light');
  });

  it('cada tema traz o Grafite gerado para ele como destaque padrão (o texto do destaque muda com o tema)', () => {
    expect(bloco(css, '[data-theme="nevoa"]')['--cor-destaque-texto']).toBe(
      destaqueDoTema('nevoa', 'grafite').destaqueTexto,
    );
    expect(bloco(css, '[data-theme="oled"]')['--cor-destaque-texto']).toBe(
      destaqueDoTema('oled', 'grafite').destaqueTexto,
    );
    expect(bloco(css, '[data-theme="oled"]')['--cor-sobre-destaque']).toBe(
      destaqueDoTema('oled', 'grafite').sobreDestaque,
    );
    expect(destaqueDoTema('oled', 'grafite').destaqueTexto).not.toBe(
      destaqueDoTema('nevoa', 'grafite').destaqueTexto,
    );
  });

  it('o destaque escolhido é o gerado para o tema: o verde no Névoa', () => {
    const verdeNevoa = bloco(css, '[data-theme="nevoa"][data-accent="verde"]');
    expect(verdeNevoa['--cor-destaque']).toBe(destaqueDoTema('nevoa', 'verde').destaque);
  });

  it('a densidade confortável muda linha, miniatura e controle', () => {
    expect(bloco(css, '[data-density="confortavel"]')).toEqual({
      '--altura-linha': '52px',
      '--tamanho-miniatura': '36px',
      '--altura-controle': '40px',
    });
  });

  it('o raio do controle é limitado pela altura do controle', () => {
    expect(bloco(css, ':root')['--raio-controle']).toBe(
      'min(calc(var(--raio-base) * 0.58), calc(var(--altura-controle) / 2 - 1px))',
    );
  });

  it('movimento reduzido zera deslocamentos e molas', () => {
    const reduzido = bloco(css, '[data-motion="reduzido"]');
    expect(reduzido['--dur-deslocamento']).toBe('0ms');
    expect(reduzido['--dur-mola-aviso']).toBe('0ms');
  });

  it('o menu abre em 170 ms com leve escala, que some com movimento reduzido', () => {
    expect(bloco(css, ':root')['--dur-menu']).toBe('170ms');
    expect(bloco(css, ':root')['--dur-escala-menu']).toBe('var(--dur-menu)');
    const reduzido = bloco(css, '[data-motion="reduzido"]');
    expect(reduzido['--dur-escala-menu']).toBe('0ms');
    expect(reduzido['--dur-menu']).toBeUndefined();
  });

  it('a folha de baixo sobe em 300 ms, e sem deslocamento com movimento reduzido', () => {
    expect(bloco(css, ':root')['--dur-folha']).toBe('var(--dur-lenta)');
    expect(bloco(css, '[data-motion="reduzido"]')['--dur-folha']).toBe('0ms');
  });

  it('o dock se esconde em 280 ms, e sem deslocamento com movimento reduzido', () => {
    expect(bloco(css, ':root')['--dur-ocultar-dock']).toBe('280ms');
    expect(bloco(css, '[data-motion="reduzido"]')['--dur-ocultar-dock']).toBe('0ms');
  });

  it('a busca abre e fecha em 180 ms com leve escala, que some com movimento reduzido', () => {
    expect(bloco(css, ':root')['--dur-busca']).toBe('180ms');
    expect(bloco(css, ':root')['--dur-escala-busca']).toBe('var(--dur-busca)');
    const reduzido = bloco(css, '[data-motion="reduzido"]');
    expect(reduzido['--dur-escala-busca']).toBe('0ms');
    expect(reduzido['--dur-busca']).toBeUndefined();
  });

  it('a chegada traz os tempos das boas-vindas e da montagem, a exceção nomeada do ANTISLOP', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--dur-traco-ola']).toBe('2100ms');
    expect(raiz['--dur-preenchimento-ola']).toBe('700ms');
    expect(raiz['--atraso-preenchimento-ola']).toBe('1750ms');
    expect(raiz['--dur-subtitulo-boas-vindas']).toBe('500ms');
    expect(raiz['--atraso-subtitulo-boas-vindas']).toBe('2100ms');
    expect(raiz['--dur-saida-boas-vindas']).toBe('380ms');
    expect(raiz['--dur-permanencia-boas-vindas']).toBe('850ms');
    // A escrita do "olá" começa devagar, acelera e assenta no fim, como a mão.
    expect(raiz['--curva-escrita']).toBe('cubic-bezier(0.45, 0.05, 0.3, 1)');
    expect(raiz['--dur-montagem-barra']).toBe('420ms');
    expect(raiz['--dur-montagem-janela']).toBe('500ms');
    expect(raiz['--atraso-montagem-janela']).toBe('80ms');
    expect(raiz['--dur-montagem-dock']).toBe('620ms');
    expect(raiz['--atraso-montagem-dock']).toBe('160ms');
  });

  it('com movimento reduzido, o "olá" nasce escrito e a casca aparece sem deslocamento', () => {
    const reduzido = bloco(css, '[data-motion="reduzido"]');
    for (const nome of [
      '--dur-traco-ola',
      '--dur-preenchimento-ola',
      '--atraso-preenchimento-ola',
      '--atraso-subtitulo-boas-vindas',
      '--dur-montagem-barra',
      '--dur-montagem-dock',
      '--atraso-montagem-janela',
      '--atraso-montagem-dock',
    ]) {
      expect(reduzido[nome], nome).toBe('0ms');
    }
    expect(reduzido['--dur-montagem-janela']).toBeUndefined();
    // "Bem-vindo ao Grafite" fica o mesmo tempo à vista: não é movimento.
    expect(reduzido['--dur-permanencia-boas-vindas']).toBeUndefined();
  });

  it('o cursor traz o ponto de 6 px, o anel de 26 px e a folga de 4 px do abraço', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--tamanho-ponto-cursor']).toBe('6px');
    expect(raiz['--tamanho-anel-cursor']).toBe('26px');
    expect(raiz['--folga-abraco-cursor']).toBe('4px');
  });

  it('a prévia tem até 720 px de largura e a imagem até 256 px', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--largura-previa']).toBe('720px');
    expect(raiz['--tamanho-imagem-previa']).toBe('256px');
  });

  it('a casca traz a faixa que revela o dock escondido e o alvo mínimo de toque', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--faixa-revelar-dock']).toBe('18px');
    expect(raiz['--alvo-toque']).toBe('44px');
  });

  it('os ciclos de carregamento (esqueleto, progresso sem valor) param com movimento reduzido', () => {
    expect(bloco(css, ':root')['--dur-ciclo']).toBe('1400ms');
    expect(bloco(css, '[data-motion="reduzido"]')['--dur-ciclo']).toBe('0ms');
  });

  it('a aba do Windows abre em 220 ms, com a cascata até 340 ms, e fecha em 160 ms', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--dur-aba-abrir']).toBe('220ms');
    expect(raiz['--dur-aba-cascata']).toBe('40ms');
    expect(raiz['--dur-aba-fechar']).toBe('160ms');
    expect(raiz['--dur-aba-entalhe']).toBe('120ms');
    expect(raiz['--dur-aba-ponto']).toBe('1400ms');
  });

  it('com movimento reduzido, a aba do Windows troca em 1 ms, sem cascata, e o ponto para', () => {
    const reduzido = bloco(css, '[data-motion="reduzido"]');
    for (const nome of ['abrir', 'entrada', 'fechar', 'entalhe', 'pressionada', 'alargar']) {
      expect(reduzido[`--dur-aba-${nome}`], nome).toBe('1ms');
    }
    for (const nome of [
      'inicio-do-logo',
      'inicio-da-cascata',
      'cascata',
      'inicio-do-aviso',
      'ponto',
    ]) {
      expect(reduzido[`--dur-aba-${nome}`], nome).toBe('0ms');
    }
  });

  it('a aba do Windows nasce no escuro e segue o atributo do tema do Windows', () => {
    expect(bloco(css, ':root')['--cor-aba-flutuante-fundo']).toBe(temas.grafite.aba.fundo);
    const claro = bloco(css, '[data-windows-theme="claro"]');
    expect(Object.keys(claro).sort()).toEqual([
      '--cor-aba-flutuante-anel',
      '--cor-aba-flutuante-fio-escuro',
      '--cor-aba-flutuante-sombra',
    ]);
    const altoContraste = bloco(css, '[data-windows-theme="alto-contraste"]');
    expect(altoContraste['--cor-aba-flutuante-fundo']).toBe('Canvas');
    expect(altoContraste['--cor-aba-flutuante-texto']).toBe('CanvasText');
    expect(altoContraste['--cor-aba-flutuante-foco']).toBe('LinkText');
  });

  it('sem o atributo, a aba do Windows segue o prefers-color-scheme e o forced-colors', () => {
    const claro = css.indexOf('@media (prefers-color-scheme: light)');
    const forcado = css.indexOf('@media (forced-colors: active)');
    expect(claro).toBeGreaterThan(0);
    // O alto contraste vem depois, e ganha quando o Windows está claro e em alto contraste.
    expect(forcado).toBeGreaterThan(claro);
    expect(
      bloco(css.slice(forcado), ':root:not([data-windows-theme])')['--cor-aba-flutuante-fundo'],
    ).toBe('Canvas');
  });

  it('o giro do indicador de carregando tem duração própria e para com movimento reduzido', () => {
    expect(bloco(css, ':root')['--dur-giro']).toBe('900ms');
    expect(bloco(css, '[data-motion="reduzido"]')['--dur-giro']).toBe('0ms');
  });

  it('transparência reduzida troca o material pelo sólido e desliga o filtro', () => {
    const reduzida = bloco(css, '[data-transparency="reduzida"]');
    expect(reduzida['--cor-material']).toBe('var(--cor-material-solido)');
    expect(reduzida['--filtro-material']).toBe('none');
  });

  it('hover e pressionado do destaque se afastam do texto sobre ele, e o contraste só sobe', () => {
    for (const seletor of [':root', '[data-theme="grafite"][data-accent="verde"]']) {
      const b = bloco(css, seletor);
      const texto = b['--cor-sobre-destaque'] ?? '';
      const base = contraste(texto, b['--cor-destaque'] ?? '');
      const hover = contraste(texto, b['--cor-destaque-hover'] ?? '');
      const pressionado = contraste(texto, b['--cor-destaque-pressionado'] ?? '');
      expect(hover, seletor).toBeGreaterThan(base);
      expect(pressionado, seletor).toBeGreaterThan(hover);
    }
  });

  it('cada tema traz as camadas neutras de hover e pressionado, feitas da cor do texto', () => {
    const nevoa = bloco(css, '[data-theme="nevoa"]');
    expect(nevoa['--cor-hover']).toBe(camadasDeEstado(temas.nevoa.cores).hover);
    expect(nevoa['--cor-pressionado']).toBe(comAlfa(temas.nevoa.cores.texto, 0.1));
  });

  it('cada tema traz as cores do cursor, feitas do texto, com o anel mais opaco nos temas claros', () => {
    const grafite = bloco(css, '[data-theme="grafite"]');
    const texto = temas.grafite.cores.texto;
    expect(grafite['--cor-cursor-ponto']).toBe(texto);
    expect(grafite['--cor-cursor-anel']).toBe(comAlfa(texto, 0.45));
    expect(grafite['--cor-cursor-abraco']).toBe(comAlfa(texto, 0.1));
    expect(bloco(css, '[data-theme="nevoa"]')['--cor-cursor-anel']).toBe(
      comAlfa(temas.nevoa.cores.texto, 0.55),
    );
    expect(bloco(css, ':root')['--sombra-cursor']).toBe('0 1px 3px rgba(0, 0, 0, 0.35)');
  });

  it('a raiz traz só a tinta do rótulo neutro: a das situações fica no fundo de cada uma', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--tinta-rotulo']).toBeUndefined();
    expect(raiz['--tinta-rotulo-neutro']).toBe('10%');
    expect(Object.keys(gerarDtcg().tinta)).toEqual(['rotulo-neutro']);
    expect(gerarVariaveis()).not.toContain('--tinta-rotulo');
    expect(gerarVariaveis()).toContain('--tinta-rotulo-neutro');
  });

  it('o fundo sutil da atenção do Papel sai da cor da situação em 0,7, a 26%', () => {
    expect(bloco(css, '[data-theme="papel"]')['--cor-atencao-fundo']).toBe(
      'rgba(208, 144, 30, 0.26)',
    );
  });

  it('cada tema traz as cores da aba, e a raiz, as do Grafite', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--cor-aba-fundo']).toBe(temas.grafite.aba.fundo);
    expect(raiz['--cor-aba-fundo-2']).toBe(temas.grafite.aba.fundo2);
    expect(raiz['--cor-aba-sobre-atencao']).toBe(temas.grafite.aba.sobreAtencao);
    expect(bloco(css, '[data-theme="papel"]')['--cor-aba-contorno']).toBe(temas.papel.aba.fundo);
    expect(bloco(css, '[data-theme="oled"]')['--cor-aba-contorno']).toBe(temas.oled.aba.contorno);
    expect(gerarVariaveis()).toContain('--cor-aba-bloco');
    expect(gerarDtcg().cor['aba-contorno']?.$extensions?.['grafite.modos']?.tema?.nevoa).toBe(
      temas.nevoa.aba.contorno,
    );
  });

  it('o raio da cápsula deriva da base, sem o limite do controle', () => {
    expect(bloco(css, ':root')['--raio-capsula']).toBe('calc(var(--raio-base) * 100)');
    expect(gerarDtcg().raio.capsula?.$value).toBe('1000px');
  });

  it('cada tema traz o véu que escurece a tela atrás de diálogos e gavetas', () => {
    expect(bloco(css, '[data-theme="grafite"]')['--cor-veu']).toBe('rgba(0, 0, 0, 0.55)');
    expect(bloco(css, '[data-theme="nevoa"]')['--cor-veu']).toBe(temas.nevoa.cores.veu);
    expect(bloco(css, '[data-theme="alto-contraste"]')['--cor-veu']).toBe('rgba(0, 0, 0, 0.55)');
  });

  it('o código QR tem módulos pretos sobre fundo branco, iguais em todos os temas', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--cor-qr-fundo']).toBe('#ffffff');
    expect(raiz['--cor-qr-modulo']).toBe('#000000');
    for (const id of Object.keys(temas)) {
      const tema = bloco(css, `[data-theme="${id}"]`);
      expect(tema['--cor-qr-fundo']).toBeUndefined();
      expect(tema['--cor-qr-modulo']).toBeUndefined();
    }
  });

  it('a etiqueta impressa tem o texto preto sobre fundo branco, igual em todos os temas', () => {
    const raiz = bloco(css, ':root');
    expect(raiz['--cor-etiqueta-fundo']).toBe('#ffffff');
    expect(raiz['--cor-etiqueta-texto']).toBe('#000000');
    for (const id of Object.keys(temas)) {
      const tema = bloco(css, `[data-theme="${id}"]`);
      expect(tema['--cor-etiqueta-fundo']).toBeUndefined();
      expect(tema['--cor-etiqueta-texto']).toBeUndefined();
    }
  });

  it('o desabilitado tem opacidade própria', () => {
    expect(bloco(css, ':root')['--opacidade-desabilitado']).toBe('0.45');
  });

  it('não expõe primitivos como variáveis', () => {
    expect(css).not.toMatch(/--p-|--primitivo/);
  });
});

describe('gerarVariaveis', () => {
  it('lista os nomes das variáveis semânticas, sem primitivos', () => {
    const nomes = gerarVariaveis();
    expect(nomes).toContain('--cor-fundo');
    expect(nomes).toContain('--raio-controle');
    expect(nomes).toContain('--altura-linha');
    expect(nomes.every((n) => n.startsWith('--'))).toBe(true);
  });
});

describe('gerarDtcg', () => {
  const dtcg = gerarDtcg();
  const tema = (token: TokenDtcg | undefined) => token?.$extensions?.['grafite.modos']?.tema;

  it('nomeia os modos de tema, destaque, densidade e tema do Windows como aparecem para o usuário', () => {
    expect(dtcg.$extensions['grafite.modos']).toEqual({
      tema: {
        grafite: 'Grafite',
        'meia-noite': 'Meia-noite',
        oled: 'OLED',
        nevoa: 'Névoa',
        papel: 'Papel',
        'alto-contraste': 'Alto contraste',
      },
      destaque: { azul: 'Azul', verde: 'Verde', laranja: 'Laranja', grafite: 'Grafite' },
      densidade: { compacta: 'Compacta', normal: 'Normal', confortavel: 'Confortável' },
      'tema-do-windows': { escuro: 'Escuro', claro: 'Claro', 'alto-contraste': 'Alto contraste' },
    });
  });

  it('a aba do Windows traz o valor de cada tema do Windows', () => {
    expect(dtcg.cor['aba-flutuante-fundo']?.$extensions).toEqual({
      'grafite.modos': {
        'tema-do-windows': {
          escuro: temas.grafite.aba.fundo,
          claro: temas.grafite.aba.fundo,
          'alto-contraste': 'Canvas',
        },
      },
      'grafite.css': '--cor-aba-flutuante-fundo',
    });
  });

  it('as cores de destaque do tema apontam para o destaque gerado para o tema', () => {
    expect(tema(dtcg.cor.destaque)).toEqual({
      grafite: '{destaque.destaque-grafite}',
      'meia-noite': '{destaque.destaque-meia-noite}',
      oled: '{destaque.destaque-oled}',
      nevoa: '{destaque.destaque-nevoa}',
      papel: '{destaque.destaque-papel}',
      'alto-contraste': '{destaque.destaque-alto-contraste}',
    });
    expect(tema(dtcg.cor['sobre-destaque'])?.papel).toBe('{destaque.sobre-destaque-papel}');
    expect(dtcg.destaque['destaque-nevoa']?.$extensions?.['grafite.modos']?.destaque?.verde).toBe(
      destaqueDoTema('nevoa', 'verde').destaque,
    );
    expect(dtcg.cor.foco?.$value).toBe('{cor.destaque}');
  });

  it('traz as situações de cada tema e o neutro como apelido do texto secundário', () => {
    expect(tema(dtcg.cor.critico)).toMatchObject({
      grafite: temas.grafite.situacoes.critico.cor,
      nevoa: temas.nevoa.situacoes.critico.cor,
      'alto-contraste': temas['alto-contraste'].situacoes.critico.cor,
    });
    expect(tema(dtcg.cor.info)?.oled).toBe(temas.oled.situacoes.info.cor);
    expect(dtcg.cor.neutro?.$value).toBe('{cor.texto-2}');
  });

  it('traz as cores do cursor de cada tema', () => {
    expect(tema(dtcg.cor['cursor-anel'])).toMatchObject({
      grafite: comAlfa(temas.grafite.cores.texto, 0.45),
      papel: comAlfa(temas.papel.cores.texto, 0.55),
    });
    expect(dtcg.cor['cursor-ponto']?.$extensions?.['grafite.css']).toBe('--cor-cursor-ponto');
  });

  it('traz as cores fixas de referência e as escalas fixas', () => {
    expect(dtcg.primitivos.branco?.$value).toBe('#ffffff');
    expect(dtcg.primitivos.preto?.$value).toBe('#000000');
    expect(dtcg.esp['4']?.$value).toBe('16px');
    expect(dtcg.texto.corpo?.$value).toBe('14px');
    expect(dtcg.peso.forte?.$value).toBe(600);
    expect(dtcg.fonte.interface?.$value).toBe('Instrument Sans');
    expect(dtcg.opacidade.desabilitado?.$value).toBe(0.45);
    expect(dtcg.casca['faixa-revelar-dock']?.$value).toBe('18px');
    expect(dtcg.casca['alvo-toque']?.$extensions?.['grafite.css']).toBe('--alvo-toque');
    expect(dtcg.cursor.anel?.$value).toBe('26px');
    expect(dtcg.previa.largura?.$extensions?.['grafite.css']).toBe('--largura-previa');
  });

  it('cada token que existe no tokens.css leva o nome da variável, e o nome existe', () => {
    expect(dtcg.cor.fundo?.$extensions?.['grafite.css']).toBe('--cor-fundo');
    expect(dtcg.densidade.linha?.$extensions?.['grafite.css']).toBe('--altura-linha');
    expect(dtcg.primitivos.branco?.$extensions?.['grafite.css']).toBeUndefined();
    const variaveis = new Set(gerarVariaveis());
    const nomes: string[] = [];
    const percorrer = (grupo: object) => {
      for (const [chave, filho] of Object.entries(grupo)) {
        if (chave.startsWith('$') || typeof filho !== 'object' || filho === null) continue;
        const css = (filho as { $extensions?: { 'grafite.css'?: string } }).$extensions?.[
          'grafite.css'
        ];
        if (css) nomes.push(css);
        if (!('$value' in filho)) percorrer(filho);
      }
    };
    percorrer(dtcg);
    expect(nomes.length).toBeGreaterThan(50);
    expect(nomes.filter((nome) => !variaveis.has(nome))).toEqual([]);
  });

  it('guarda o valor padrão e os seis modos de tema de cada cor', () => {
    const fundo = dtcg.cor.fundo;
    expect(fundo?.$type).toBe('color');
    expect(fundo?.$value).toBe(temas.grafite.cores.fundo);
    expect(fundo?.$extensions?.['grafite.modos']?.tema).toEqual(
      Object.fromEntries(Object.entries(temas).map(([id, t]) => [id, t.cores.fundo])),
    );
    expect(temas.oled.cores.fundo).toBe('#000000');
  });
});
