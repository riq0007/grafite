import { destaqueDeFabrica, destaquePersonalizado, temaPersonalizado, temas } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import { atributosDaInterface, lerPreferencias, PADRAO_DE_FABRICA } from './preferencias.ts';

describe('lerPreferencias', () => {
  it('sem nada salvo, usa os padrões de fábrica das seções 7.2 e 7.4', () => {
    expect(lerPreferencias(null)).toEqual({
      aparencia: {
        tema: 'grafite',
        destaque: 'grafite',
        densidade: 'normal',
        barraDeRolagem: 'ao-rolar',
        raio: 10,
        personalizado: { tom: 'escuro', matiz: 265, tingimento: 10, contraste: 45 },
        destaquePersonalizado: { matiz: 258, intensidade: 85 },
      },
      dock: { posicao: 'embaixo', tamanho: 48, ampliar: true, ocultar: false },
      cursor: { tipo: 'suavizado', suavizacao: 95, abracar: true },
      notificacoes: {
        atencao: true,
        informacao: true,
        tempo: 6,
        foco: false,
        emailCritico: true,
        resumo: 'diario',
        pushCritico: true,
        pushAtencao: false,
        pushInformacao: false,
      },
      tabelas: {
        linhasAlternadas: true,
        miniaturas: true,
        resumoDaLinha: true,
        visoes: {},
        fixadas: {},
        fixadasPelaOrganizacao: {},
      },
      regiao: { fuso: 'sistema' },
      inicio: { ordenacao: { coluna: 'severidade', direcao: 'decrescente' }, blocos: [] },
      acessibilidade: { movimento: 'sistema', transparencia: 'sistema' },
    });
  });

  it('aceita um fuso que o navegador reconhece; outro valor volta a seguir o sistema', () => {
    const fuso = (valor: unknown) =>
      lerPreferencias(JSON.stringify({ regiao: { fuso: valor } })).regiao.fuso;
    expect(fuso('America/Manaus')).toBe('America/Manaus');
    expect(fuso('sistema')).toBe('sistema');
    expect(fuso('Marte/Olympus')).toBe('sistema');
    expect(fuso('')).toBe('sistema');
    expect(fuso(3)).toBe('sistema');
  });

  it('aceita a ordem da tela inicial só com coluna e direção conhecidas', () => {
    const ordenacao = (valor: unknown) =>
      lerPreferencias(JSON.stringify({ inicio: { ordenacao: valor } })).inicio.ordenacao;
    const fabrica = { coluna: 'severidade', direcao: 'decrescente' };
    expect(ordenacao({ coluna: 'ativo', direcao: 'crescente' })).toEqual({
      coluna: 'ativo',
      direcao: 'crescente',
    });
    expect(ordenacao({ coluna: 'ha', direcao: 'decrescente' })).toEqual({
      coluna: 'ha',
      direcao: 'decrescente',
    });
    expect(ordenacao({ coluna: 'prioridade', direcao: 'crescente' })).toEqual(fabrica);
    expect(ordenacao({ coluna: 'ativo', direcao: 'lateral' })).toEqual(fabrica);
    expect(ordenacao('ativo')).toEqual(fabrica);
  });

  it('preferências gravadas antes do F1c seguem o sistema no fuso e a ordem de fábrica', () => {
    const lidas = lerPreferencias(
      JSON.stringify({ versao: 1, dock: { posicao: 'esquerda' }, cursor: { tipo: 'sistema' } }),
    );
    expect(lidas.regiao).toEqual({ fuso: 'sistema' });
    expect(lidas.inicio).toEqual(PADRAO_DE_FABRICA.inicio);
    expect(lidas.dock.posicao).toBe('esquerda');
    expect(lidas.cursor.tipo).toBe('sistema');
  });

  it('prende a suavização do cursor entre 0 e 100% e arredonda', () => {
    const suavizacao = (valor: number) =>
      lerPreferencias(JSON.stringify({ cursor: { suavizacao: valor } })).cursor.suavizacao;
    expect(suavizacao(130)).toBe(100);
    expect(suavizacao(-5)).toBe(0);
    expect(suavizacao(47.6)).toBe(48);
  });

  it('aceita só 6, 10 ou 20 s no tempo do aviso; outro valor volta a 6 s', () => {
    const tempo = (valor: unknown) =>
      lerPreferencias(JSON.stringify({ notificacoes: { tempo: valor } })).notificacoes.tempo;
    expect(tempo(10)).toBe(10);
    expect(tempo(20)).toBe(20);
    expect(tempo(15)).toBe(6);
    expect(tempo('10')).toBe(6);
  });

  it('valida o cursor, as notificações e as tabelas campo a campo', () => {
    const lidas = lerPreferencias(
      JSON.stringify({
        cursor: { tipo: 'laser', abracar: false },
        notificacoes: { atencao: 'nao', informacao: false },
        tabelas: { linhasAlternadas: false, miniaturas: 0 },
      }),
    );
    expect(lidas.cursor).toEqual({ tipo: 'suavizado', suavizacao: 95, abracar: false });
    expect(lidas.notificacoes).toEqual({
      atencao: true,
      informacao: false,
      tempo: 6,
      foco: false,
      emailCritico: true,
      resumo: 'diario',
      pushCritico: true,
      pushAtencao: false,
      pushInformacao: false,
    });
    expect(lidas.tabelas).toEqual({
      linhasAlternadas: false,
      miniaturas: true,
      resumoDaLinha: true,
      visoes: {},
      fixadas: {},
      fixadasPelaOrganizacao: {},
    });
  });

  it('preferências gravadas antes do F1b mantêm o que foi salvo e usam o padrão no resto', () => {
    const lidas = lerPreferencias(
      '{"versao":1,"aparencia":{"tema":"papel"},"dock":{"posicao":"direita"}}',
    );
    expect(lidas.aparencia.tema).toBe('papel');
    expect(lidas.dock.posicao).toBe('direita');
    expect(lidas.cursor).toEqual(PADRAO_DE_FABRICA.cursor);
    expect(lidas.notificacoes).toEqual(PADRAO_DE_FABRICA.notificacoes);
    expect(lidas.tabelas).toEqual(PADRAO_DE_FABRICA.tabelas);
  });

  it('troca só o campo inválido pelo padrão e mantém os válidos, em qualquer seção', () => {
    const lidas = lerPreferencias(
      '{"versao":1,"aparencia":{"tema":"roxo","densidade":"normal"},"dock":{"posicao":"esquerda","ampliar":"sim"}}',
    );
    expect(lidas.aparencia).toEqual({
      ...PADRAO_DE_FABRICA.aparencia,
      tema: 'grafite',
      destaque: 'grafite',
      densidade: 'normal',
      raio: 10,
    });
    expect(lidas.dock).toEqual({ posicao: 'esquerda', tamanho: 48, ampliar: true, ocultar: false });
  });

  it('prende o tamanho do dock entre 28 e 64 px e arredonda', () => {
    const tamanho = (valor: number) =>
      lerPreferencias(JSON.stringify({ dock: { tamanho: valor } })).dock.tamanho;
    expect(tamanho(90)).toBe(64);
    expect(tamanho(10)).toBe(28);
    expect(tamanho(36.4)).toBe(36);
  });

  it('prende o raio entre 0 e 24 px e arredonda', () => {
    const raio = (valor: number) =>
      lerPreferencias(JSON.stringify({ aparencia: { raio: valor } })).aparencia.raio;
    expect(raio(40)).toBe(24);
    expect(raio(-3)).toBe(0);
    expect(raio(7.6)).toBe(8);
  });

  it('texto que não é JSON, ou seção que não é objeto, vira o padrão', () => {
    expect(lerPreferencias('não é json')).toEqual(PADRAO_DE_FABRICA);
    expect(lerPreferencias('{"dock":"esquerda"}').dock).toEqual(PADRAO_DE_FABRICA.dock);
  });

  it('sem a chave nova, aproveita uma única vez a aparência salva pelo F0', () => {
    const lidas = lerPreferencias(null, '{"tema":"papel","raio":4,"movimento":"reduzido"}');
    expect(lidas.aparencia).toEqual({
      ...PADRAO_DE_FABRICA.aparencia,
      tema: 'papel',
      destaque: 'grafite',
      densidade: 'normal',
      raio: 4,
    });
    expect(lidas.acessibilidade).toEqual({ movimento: 'reduzido', transparencia: 'sistema' });
    expect(lidas.dock).toEqual(PADRAO_DE_FABRICA.dock);
  });

  it('com a chave nova presente, ignora a do F0', () => {
    expect(lerPreferencias('{"versao":1}', '{"tema":"papel"}').aparencia.tema).toBe('grafite');
  });
});

describe('atributosDaInterface', () => {
  it('no padrão, posiciona o dock e não força movimento, transparência nem ocultar', () => {
    expect(atributosDaInterface(PADRAO_DE_FABRICA)).toEqual({
      'data-theme': 'grafite',
      'data-accent': 'grafite',
      'data-density': 'normal',
      '--raio-base': '10px',
      'data-dock': 'embaixo',
      '--tamanho-item-dock': '48px',
    });
  });

  it('marca o ocultar automático, o movimento e a transparência reduzidos', () => {
    expect(
      atributosDaInterface({
        ...PADRAO_DE_FABRICA,
        dock: { posicao: 'direita', tamanho: 36, ampliar: false, ocultar: true },
        acessibilidade: { movimento: 'reduzido', transparencia: 'reduzida' },
      }),
    ).toMatchObject({
      'data-dock': 'direita',
      'data-dock-ocultar': 'sim',
      '--tamanho-item-dock': '36px',
      'data-motion': 'reduzido',
      'data-transparency': 'reduzida',
    });
  });
});

// O tema e o destaque personalizados no <html> (change tema-personalizado, design, decisão 3).
describe('atributosDaInterface com o personalizado', () => {
  const personalizado = { tom: 'claro', matiz: 80, tingimento: 40, contraste: 45 } as const;
  const comAparencia = (aparencia: Partial<typeof PADRAO_DE_FABRICA.aparencia>) =>
    atributosDaInterface({
      ...PADRAO_DE_FABRICA,
      aparencia: { ...PADRAO_DE_FABRICA.aparencia, ...aparencia },
    });
  const deCor = (atributos: Record<string, string>) =>
    Object.keys(atributos).filter((nome) => /^--(cor|sombra)-/.test(nome));

  it('o tema personalizado fica sobre o tema de fábrica do mesmo tom, com o destaque escolhido', () => {
    const atributos = comAparencia({ tema: 'personalizado', personalizado, destaque: 'verde' });
    const tema = temaPersonalizado(personalizado);
    expect(atributos['data-theme']).toBe('nevoa');
    expect(atributos['data-accent']).toBe('verde');
    expect(atributos['--cor-fundo']).toBe(tema.cores.fundo);
    expect(atributos['--cor-ok-fundo']).toBe(tema.situacoes.ok.fundo);
    expect(atributos['--cor-destaque']).toBe(destaqueDeFabrica(tema, 'verde').destaque);
    expect(
      comAparencia({ tema: 'personalizado', personalizado: { ...personalizado, tom: 'escuro' } })[
        'data-theme'
      ],
    ).toBe('grafite');
  });

  it('o destaque personalizado sobre um tema de fábrica traz só as variáveis do destaque', () => {
    const destaque = { matiz: 155, intensidade: 70 };
    const atributos = comAparencia({
      tema: 'papel',
      destaque: 'personalizado',
      destaquePersonalizado: destaque,
    });
    expect(atributos['data-theme']).toBe('papel');
    expect(atributos['data-accent']).toBe('grafite');
    expect(atributos['--cor-destaque']).toBe(destaquePersonalizado(temas.papel, destaque).destaque);
    expect(atributos).not.toHaveProperty('--cor-fundo');
  });

  it('com o tema e o destaque de fábrica, nenhuma variável de cor', () => {
    expect(deCor(comAparencia({ tema: 'papel', destaque: 'azul' }))).toEqual([]);
  });
});
