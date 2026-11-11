import { describe, expect, it } from 'vitest';
import { MODULO_DOS_AJUSTES } from '../modulos/modulos.ts';
import {
  aplicarMudanca,
  BARRAS_DE_ROLAGEM,
  COLUNAS_DA_TELA_INICIAL,
  DENSIDADES,
  DESTAQUES,
  DESTAQUES_DA_ESCOLHA,
  fusoReconhecido,
  LIMITES_DAS_PREFERENCIAS,
  lerAjustes,
  PADRAO_DE_FABRICA,
  POSICOES_DO_DOCK,
  RESUMOS_POR_EMAIL,
  resolverPreferencias,
  TEMAS,
  TEMAS_DA_ESCOLHA,
  TEMPOS_DO_AVISO,
} from './preferencias.ts';

describe('opções das preferências', () => {
  it('trazem os padrões de fábrica entre as opções', () => {
    expect(TEMAS).toContain(PADRAO_DE_FABRICA.aparencia.tema);
    expect(DESTAQUES).toContain(PADRAO_DE_FABRICA.aparencia.destaque);
    expect(DENSIDADES).toContain(PADRAO_DE_FABRICA.aparencia.densidade);
    expect(BARRAS_DE_ROLAGEM).toContain(PADRAO_DE_FABRICA.aparencia.barraDeRolagem);
    expect(POSICOES_DO_DOCK).toContain(PADRAO_DE_FABRICA.dock.posicao);
    expect(TEMPOS_DO_AVISO).toContain(PADRAO_DE_FABRICA.notificacoes.tempo);
    expect(COLUNAS_DA_TELA_INICIAL).toContain(PADRAO_DE_FABRICA.inicio.ordenacao.coluna);
  });

  it('seguem a seção 7.2 da spec mestre', () => {
    expect(PADRAO_DE_FABRICA).toEqual({
      aparencia: {
        tema: 'grafite',
        destaque: 'grafite',
        densidade: 'normal',
        barraDeRolagem: 'ao-rolar',
        raio: 10,
        personalizado: { tom: 'escuro', matiz: 265, tingimento: 10, contraste: 45 },
        destaquePersonalizado: { matiz: 258, intensidade: 85 },
      },
      dock: { posicao: 'embaixo', tamanho: 48, ampliar: true, ocultar: false, modulos: [] },
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

  it('têm os limites numéricos da validação', () => {
    expect(LIMITES_DAS_PREFERENCIAS).toEqual({
      raio: { minimo: 0, maximo: 24 },
      tamanhoDoDock: { minimo: 28, maximo: 64 },
      suavizacao: { minimo: 0, maximo: 100 },
      matiz: { minimo: 0, maximo: 359 },
      percentual: { minimo: 0, maximo: 100 },
      fixadas: 20,
      blocosDoInicio: 20,
      modulosDoDock: 40,
      opcoesDoBloco: 12,
      chaveDaOpcaoDoBloco: 30,
      textoDaOpcaoDoBloco: 80,
      listaDaOpcaoDoBloco: 50,
    });
  });
});

describe('lerAjustes', () => {
  it('lê como vazio o que não é um objeto', () => {
    expect(lerAjustes(null)).toEqual({});
    expect(lerAjustes('tema')).toEqual({});
    expect(lerAjustes([{ aparencia: { tema: 'papel' } }])).toEqual({});
  });

  it('guarda só os campos válidos de cada seção', () => {
    expect(
      lerAjustes({
        aparencia: { tema: 'inexistente', destaque: 'verde' },
        dock: { posicao: 'esquerda', cor: 'azul' },
        janela: { largura: 800 },
      }),
    ).toEqual({ aparencia: { destaque: 'verde' }, dock: { posicao: 'esquerda' } });
  });

  it('tira a seção que fica vazia', () => {
    expect(lerAjustes({ dock: { cor: 'azul' }, cursor: 'suavizado' })).toEqual({});
  });

  it('traz os números para o limite mais próximo e arredonda', () => {
    expect(
      lerAjustes({
        aparencia: { raio: -5 },
        dock: { tamanho: 90 },
        cursor: { suavizacao: 130 },
      }),
    ).toEqual({ aparencia: { raio: 0 }, dock: { tamanho: 64 }, cursor: { suavizacao: 100 } });
    expect(lerAjustes({ dock: { tamanho: 10 } })).toEqual({ dock: { tamanho: 28 } });
    expect(lerAjustes({ dock: { tamanho: 36.4 } })).toEqual({ dock: { tamanho: 36 } });
  });

  it('descarta o número que não é número', () => {
    expect(lerAjustes({ dock: { tamanho: '36' }, cursor: { suavizacao: Number.NaN } })).toEqual({});
  });

  it('descarta o booleano que não é booleano', () => {
    expect(lerAjustes({ dock: { ampliar: 'sim', ocultar: true } })).toEqual({
      dock: { ocultar: true },
    });
  });

  it('aceita o modo Foco só ligado ou desligado', () => {
    expect(lerAjustes({ notificacoes: { foco: 'sim' } })).toEqual({});
    expect(lerAjustes({ notificacoes: { foco: true } })).toEqual({ notificacoes: { foco: true } });
  });

  it('aceita as escolhas do e-mail e do push só ligadas ou desligadas', () => {
    expect(
      lerAjustes({
        notificacoes: {
          emailCritico: 'sim',
          pushCritico: 1,
          pushAtencao: true,
          pushInformacao: false,
        },
      }),
    ).toEqual({ notificacoes: { pushAtencao: true, pushInformacao: false } });
    expect(lerAjustes({ notificacoes: { emailCritico: false } })).toEqual({
      notificacoes: { emailCritico: false },
    });
  });

  it('aceita só o resumo por e-mail desligado ou diário', () => {
    expect(RESUMOS_POR_EMAIL).toEqual(['desligado', 'diario']);
    expect(lerAjustes({ notificacoes: { resumo: 'semanal' } })).toEqual({});
    expect(lerAjustes({ notificacoes: { resumo: 'desligado' } })).toEqual({
      notificacoes: { resumo: 'desligado' },
    });
  });

  it('o resumo inválido dá lugar ao de baixo, e o resto continua', () => {
    const preferencias = resolverPreferencias(
      {},
      { notificacoes: { resumo: 'semanal', pushAtencao: true } },
    );
    expect(preferencias.notificacoes.resumo).toBe('diario');
    expect(preferencias.notificacoes.pushAtencao).toBe(true);
  });

  it('aceita só os tempos de aviso de 6, 10 e 20 s', () => {
    expect(lerAjustes({ notificacoes: { tempo: 15 } })).toEqual({});
    expect(lerAjustes({ notificacoes: { tempo: 10 } })).toEqual({ notificacoes: { tempo: 10 } });
  });

  it('aceita "sistema" ou um fuso reconhecido', () => {
    expect(lerAjustes({ regiao: { fuso: 'Marte/Olympus' } })).toEqual({});
    expect(lerAjustes({ regiao: { fuso: 'sistema' } })).toEqual({ regiao: { fuso: 'sistema' } });
    expect(lerAjustes({ regiao: { fuso: 'America/Manaus' } })).toEqual({
      regiao: { fuso: 'America/Manaus' },
    });
  });

  it('aceita a ordem da tela inicial só com a coluna e a direção conhecidas', () => {
    expect(lerAjustes({ inicio: { ordenacao: { coluna: 'cor', direcao: 'crescente' } } })).toEqual(
      {},
    );
    expect(lerAjustes({ inicio: { ordenacao: { coluna: 'ativo', direcao: 'de-lado' } } })).toEqual(
      {},
    );
    expect(
      lerAjustes({ inicio: { ordenacao: { coluna: 'ativo', direcao: 'crescente', extra: 1 } } }),
    ).toEqual({ inicio: { ordenacao: { coluna: 'ativo', direcao: 'crescente' } } });
  });

  it('aceita as opções de acessibilidade e de cursor', () => {
    expect(
      lerAjustes({
        acessibilidade: { movimento: 'reduzido', transparencia: 'forcada' },
        cursor: { tipo: 'sistema', abracar: false },
      }),
    ).toEqual({
      acessibilidade: { movimento: 'reduzido' },
      cursor: { tipo: 'sistema', abracar: false },
    });
  });
});

/** Um id de visão fixada, em uuid. */
const FIXADA = (numero: number) => `0199a6e0-0000-7000-8000-${String(numero).padStart(12, '0')}`;

// As visões fixadas no menu (change visoes-no-dock, design, decisão 1).
describe('as visões fixadas no menu', () => {
  it('lê as de cada tabela com visões: os ids, sem repetir e sem caixa alta, até 20', () => {
    const muitas = Array.from({ length: 25 }, (_, indice) => FIXADA(indice + 1));
    expect(
      lerAjustes({
        tabelas: {
          fixadas: { ativos: [FIXADA(1).toUpperCase(), FIXADA(1), 'fabrica', FIXADA(2)] },
          fixadasPelaOrganizacao: { ativos: muitas, outra: [FIXADA(3)] },
        },
      }),
    ).toEqual({
      tabelas: {
        fixadas: { ativos: [FIXADA(1), FIXADA(2)] },
        fixadasPelaOrganizacao: { ativos: muitas.slice(0, LIMITES_DAS_PREFERENCIAS.fixadas) },
      },
    });
    expect(LIMITES_DAS_PREFERENCIAS.fixadas).toBe(20);
  });

  it('a lista que não é de ids fica de fora', () => {
    expect(lerAjustes({ tabelas: { fixadas: { ativos: 'todas' } } })).toEqual({});
    expect(lerAjustes({ tabelas: { fixadas: [FIXADA(1)] } })).toEqual({});
  });

  it('as da conta e as da organização ficam lado a lado, sem uma esconder a outra', () => {
    const preferencias = resolverPreferencias(
      { tabelas: { fixadasPelaOrganizacao: { ativos: [FIXADA(1)] } } },
      { tabelas: { fixadas: { ativos: [FIXADA(2)] } } },
    );
    expect(preferencias.tabelas.fixadasPelaOrganizacao).toEqual({ ativos: [FIXADA(1)] });
    expect(preferencias.tabelas.fixadas).toEqual({ ativos: [FIXADA(2)] });
    expect(resolverPreferencias().tabelas.fixadas).toEqual({});
  });
});

describe('resolverPreferencias', () => {
  it('sem camadas, devolve os padrões de fábrica numa cópia', () => {
    const preferencias = resolverPreferencias();
    expect(preferencias).toEqual(PADRAO_DE_FABRICA);
    preferencias.dock.tamanho = 30;
    expect(PADRAO_DE_FABRICA.dock.tamanho).toBe(48);
  });

  it('a escolha da conta fica por cima do padrão da organização', () => {
    const organizacao = { aparencia: { tema: 'nevoa' } };
    expect(resolverPreferencias(organizacao).aparencia.tema).toBe('nevoa');
    expect(
      resolverPreferencias(organizacao, { aparencia: { tema: 'grafite' } }).aparencia.tema,
    ).toBe('grafite');
  });

  it('resolve campo a campo', () => {
    expect(
      resolverPreferencias({ dock: { posicao: 'esquerda' } }, { dock: { tamanho: 36 } }).dock,
    ).toEqual({ posicao: 'esquerda', tamanho: 36, ampliar: true, ocultar: false, modulos: [] });
  });

  it('o valor inválido da conta dá lugar ao padrão da organização', () => {
    const preferencias = resolverPreferencias(
      { aparencia: { tema: 'nevoa' }, regiao: { fuso: 'America/Manaus' } },
      { aparencia: { tema: 'inexistente' }, regiao: { fuso: 'Marte/Olympus' } },
    );
    expect(preferencias.aparencia.tema).toBe('nevoa');
    expect(preferencias.regiao.fuso).toBe('America/Manaus');
  });

  it('o valor inválido sem padrão da organização dá lugar ao de fábrica', () => {
    expect(resolverPreferencias({}, { notificacoes: { tempo: 15 } }).notificacoes.tempo).toBe(6);
  });

  it('a ordem da tela inicial vem inteira da camada de cima', () => {
    expect(
      resolverPreferencias(
        { inicio: { ordenacao: { coluna: 'ativo', direcao: 'crescente' } } },
        { inicio: { ordenacao: { coluna: 'ha', direcao: 'decrescente' } } },
      ).inicio.ordenacao,
    ).toEqual({ coluna: 'ha', direcao: 'decrescente' });
  });
});

describe('aplicarMudanca', () => {
  it('grava o campo mudado', () => {
    expect(aplicarMudanca({}, { dock: { posicao: 'direita' } })).toEqual({
      dock: { posicao: 'direita' },
    });
  });

  it('junta com os campos que a seção já tinha', () => {
    expect(aplicarMudanca({ dock: { posicao: 'direita' } }, { dock: { tamanho: 40 } })).toEqual({
      dock: { posicao: 'direita', tamanho: 40 },
    });
  });

  it('tira o campo mudado para nulo, e a seção que fica vazia', () => {
    expect(
      aplicarMudanca(
        { dock: { posicao: 'direita', tamanho: 40 }, aparencia: { tema: 'papel' } },
        { dock: { posicao: null }, aparencia: { tema: null } },
      ),
    ).toEqual({ dock: { tamanho: 40 } });
  });

  it('tira a seção inteira mudada para nula', () => {
    expect(
      aplicarMudanca(
        { dock: { posicao: 'direita', tamanho: 40 }, cursor: { abracar: false } },
        {
          dock: null,
        },
      ),
    ).toEqual({ cursor: { abracar: false } });
  });

  it('troca e tira a ordem da tela inicial inteira', () => {
    const camada = aplicarMudanca(
      {},
      { inicio: { ordenacao: { coluna: 'ativo', direcao: 'crescente' } } },
    );
    expect(camada).toEqual({ inicio: { ordenacao: { coluna: 'ativo', direcao: 'crescente' } } });
    expect(aplicarMudanca(camada, { inicio: { ordenacao: null } })).toEqual({});
  });

  it('descarta o que não é válido na mudança', () => {
    expect(
      aplicarMudanca({ dock: { posicao: 'direita' } }, {
        dock: { tamanho: 'grande' },
        janela: { largura: 800 },
      } as never),
    ).toEqual({ dock: { posicao: 'direita' } });
  });

  it('não altera a camada nem a mudança', () => {
    const camada = { dock: { posicao: 'direita' as const } };
    const mudanca = { dock: { tamanho: 40 } };
    aplicarMudanca(camada, mudanca);
    expect(camada).toEqual({ dock: { posicao: 'direita' } });
    expect(mudanca).toEqual({ dock: { tamanho: 40 } });
  });
});

describe('as preferências das tabelas', () => {
  const VISAO = '0199a6e0-0000-7000-8000-0000000000b1';

  it('guarda o resumo da linha só como booleano', () => {
    expect(lerAjustes({ tabelas: { resumoDaLinha: false } })).toEqual({
      tabelas: { resumoDaLinha: false },
    });
    expect(lerAjustes({ tabelas: { resumoDaLinha: 'não' } })).toEqual({});
  });

  it('guarda a visão de cada tabela conhecida: a de fábrica ou o id de uma visão', () => {
    expect(lerAjustes({ tabelas: { visoes: { ativos: VISAO.toUpperCase() } } })).toEqual({
      tabelas: { visoes: { ativos: VISAO } },
    });
    expect(lerAjustes({ tabelas: { visoes: { ativos: 'fabrica' } } })).toEqual({
      tabelas: { visoes: { ativos: 'fabrica' } },
    });
  });

  it('deixa de fora a tabela desconhecida e o valor que não é uma visão', () => {
    expect(lerAjustes({ tabelas: { visoes: { pessoas: VISAO, ativos: 'todos' } } })).toEqual({});
    expect(lerAjustes({ tabelas: { visoes: 'ativos' } })).toEqual({});
  });

  it('a visão da conta fica por cima da padrão da organização', () => {
    const outra = '0199a6e0-0000-7000-8000-0000000000b2';
    expect(
      resolverPreferencias(
        { tabelas: { visoes: { ativos: outra } } },
        { tabelas: { visoes: { ativos: VISAO } } },
      ).tabelas.visoes,
    ).toEqual({ ativos: VISAO });
  });

  it('as preferências salvas antes do P1c ficam com o resumo ligado e a visão de fábrica', () => {
    expect(resolverPreferencias({ tabelas: { linhasAlternadas: false } }).tabelas).toEqual({
      linhasAlternadas: false,
      miniaturas: true,
      resumoDaLinha: true,
      visoes: {},
      fixadas: {},
      fixadasPelaOrganizacao: {},
    });
  });
});

describe('fusoReconhecido', () => {
  it('reconhece os fusos IANA e recusa o resto', () => {
    expect(fusoReconhecido('America/Sao_Paulo')).toBe(true);
    expect(fusoReconhecido('UTC')).toBe(true);
    expect(fusoReconhecido('Marte/Olympus')).toBe(false);
    expect(fusoReconhecido('')).toBe(false);
  });
});

// O tema e o destaque personalizados (spec preferencias-da-interface, "Tema e destaque
// personalizados nas preferências"; change tema-personalizado, design, decisão 1).
describe('o tema e o destaque personalizados', () => {
  const claro = { tom: 'claro', matiz: 80, tingimento: 30, contraste: 60 } as const;

  it('o tema e o destaque aceitam o personalizado, que fica no fim das escolhas da tela', () => {
    expect(lerAjustes({ aparencia: { tema: 'personalizado', destaque: 'personalizado' } })).toEqual(
      {
        aparencia: { tema: 'personalizado', destaque: 'personalizado' },
      },
    );
    expect(TEMAS_DA_ESCOLHA).toEqual([...TEMAS, 'personalizado']);
    expect(DESTAQUES_DA_ESCOLHA).toEqual([...DESTAQUES, 'personalizado']);
  });

  it('matiz fora do intervalo: presa ao limite, e o tom continua', () => {
    const lido = lerAjustes({
      aparencia: { personalizado: { tom: 'claro', matiz: 400, tingimento: -5, contraste: 45.6 } },
    });
    expect(lido.aparencia?.personalizado).toEqual({
      tom: 'claro',
      matiz: 359,
      tingimento: 0,
      contraste: 46,
    });
  });

  it('tom desconhecido: o campo inteiro dá lugar ao da camada de baixo', () => {
    const organizacao = { aparencia: { tema: 'personalizado', personalizado: claro } };
    const conta = { aparencia: { personalizado: { ...claro, tom: 'sépia', matiz: 10 } } };
    expect(resolverPreferencias(organizacao, conta).aparencia).toMatchObject({
      tema: 'personalizado',
      personalizado: claro,
    });
  });

  it('o campo sem algum número fica de fora inteiro', () => {
    expect(lerAjustes({ aparencia: { personalizado: { tom: 'claro', matiz: 80 } } })).toEqual({});
    expect(lerAjustes({ aparencia: { destaquePersonalizado: { matiz: 80 } } })).toEqual({});
  });

  it('o destaque personalizado prende a matiz e a intensidade aos limites', () => {
    const lido = lerAjustes({
      aparencia: { destaquePersonalizado: { matiz: -20, intensidade: 130 } },
    });
    expect(lido.aparencia?.destaquePersonalizado).toEqual({ matiz: 0, intensidade: 100 });
  });

  it('a mudança troca o campo inteiro', () => {
    const camada = { aparencia: { personalizado: claro } };
    const nova = aplicarMudanca(camada, {
      aparencia: { personalizado: { ...claro, contraste: 90 } },
    });
    expect(nova.aparencia?.personalizado).toEqual({ ...claro, contraste: 90 });
    expect(aplicarMudanca(nova, { aparencia: { personalizado: null } })).toEqual({});
  });
});

// Os blocos do Início (spec preferencias-da-interface, "Blocos do Início nas preferências"; change
// inicio-ajustavel, design, decisão 2).
describe('os blocos do Início', () => {
  const bloco = (id: string, visivel = true) => ({ id, visivel });

  it('bloco repetido: vale só o primeiro, e os outros continuam', () => {
    const lido = lerAjustes({
      inicio: {
        blocos: [
          bloco('ativos.suprimentos'),
          bloco('inicio.resolver'),
          bloco('ativos.suprimentos', false),
        ],
      },
    });
    expect(lido.inicio?.blocos).toEqual([bloco('ativos.suprimentos'), bloco('inicio.resolver')]);
  });

  it('o bloco inválido sai, e os válidos continuam', () => {
    const lido = lerAjustes({
      inicio: {
        blocos: [
          bloco('Ativos Suprimentos'),
          { id: 'gestao.backups', visivel: 'sim' },
          bloco('x'.repeat(41)),
          'inicio.resolver',
          bloco('gestao.backups', false),
        ],
      },
    });
    expect(lido.inicio?.blocos).toEqual([bloco('gestao.backups', false)]);
  });

  it('corta a lista em 20 blocos', () => {
    const vinteEDois = Array.from({ length: 22 }, (_, indice) => bloco(`bloco-${indice}`));
    expect(lerAjustes({ inicio: { blocos: vinteEDois } }).inicio?.blocos).toHaveLength(20);
  });

  it('a lista vazia vale, e a que não é lista fica de fora', () => {
    expect(lerAjustes({ inicio: { blocos: [] } })).toEqual({ inicio: { blocos: [] } });
    expect(lerAjustes({ inicio: { blocos: 'inicio.resolver' } })).toEqual({});
  });

  it('a mudança troca a lista inteira', () => {
    const camada = { inicio: { blocos: [bloco('inicio.resolver')] } };
    const nova = aplicarMudanca(camada, { inicio: { blocos: [bloco('gestao.backups', false)] } });
    expect(nova.inicio?.blocos).toEqual([bloco('gestao.backups', false)]);
  });
});

// A barra de rolagem (spec preferencias-da-interface, "Barra de rolagem nas preferências"; change
// barra-de-rolagem-propria, design, decisão 5).
describe('a barra de rolagem nas preferências', () => {
  it('tem dois valores, e o de fábrica é "Ao rolar"', () => {
    expect(BARRAS_DE_ROLAGEM).toEqual(['ao-rolar', 'sempre']);
    expect(resolverPreferencias().aparencia.barraDeRolagem).toBe('ao-rolar');
  });

  it('Padrão da organização: a conta que nunca mudou o ajuste fica com o "Sempre visível" dela', () => {
    const organizacao = { aparencia: { barraDeRolagem: 'sempre' } };
    expect(resolverPreferencias(organizacao).aparencia.barraDeRolagem).toBe('sempre');
    expect(
      resolverPreferencias(organizacao, { aparencia: { barraDeRolagem: 'ao-rolar' } }).aparencia
        .barraDeRolagem,
    ).toBe('ao-rolar');
  });

  it('Valor desconhecido da barra: vale "Ao rolar", e o dock continua à esquerda', () => {
    const preferencias = resolverPreferencias(
      {},
      { aparencia: { barraDeRolagem: 'grossa' }, dock: { posicao: 'esquerda' } },
    );
    expect(preferencias.aparencia.barraDeRolagem).toBe('ao-rolar');
    expect(preferencias.dock.posicao).toBe('esquerda');
  });

  it('o valor desconhecido da conta dá lugar ao padrão da organização', () => {
    expect(
      resolverPreferencias(
        { aparencia: { barraDeRolagem: 'sempre' } },
        { aparencia: { barraDeRolagem: 'grossa' } },
      ).aparencia.barraDeRolagem,
    ).toBe('sempre');
  });

  it('lerAjustes guarda só os dois valores', () => {
    expect(lerAjustes({ aparencia: { barraDeRolagem: 'sempre' } })).toEqual({
      aparencia: { barraDeRolagem: 'sempre' },
    });
    expect(lerAjustes({ aparencia: { barraDeRolagem: 'grossa' } })).toEqual({});
  });

  it('a mudança para nulo tira a escolha, e volta a valer a camada de baixo', () => {
    const camada = aplicarMudanca(
      { aparencia: { barraDeRolagem: 'sempre', tema: 'nevoa' } },
      { aparencia: { barraDeRolagem: null } },
    );
    expect(camada).toEqual({ aparencia: { tema: 'nevoa' } });
  });
});

// Os módulos do dock (spec preferencias-da-interface, "Módulos do dock nas preferências"; change
// dock-personalizavel, design, decisão 1).
describe('os módulos do dock', () => {
  const modulo = (id: string, visivel = true) => ({ id, visivel });

  it('Módulo repetido na lista: vale só o primeiro, e os outros continuam na ordem salva', () => {
    const lido = lerAjustes({
      dock: {
        modulos: [
          modulo('operacao'),
          modulo('ativos'),
          modulo('operacao', false),
          modulo('salas', false),
        ],
      },
    });
    expect(lido.dock?.modulos).toEqual([
      modulo('operacao'),
      modulo('ativos'),
      modulo('salas', false),
    ]);
  });

  it('Ajustes na lista: o item dos Ajustes sai, e os outros continuam', () => {
    const camada = aplicarMudanca(
      {},
      { dock: { modulos: [modulo(MODULO_DOS_AJUSTES, false), modulo('operacao')] } },
    );
    expect(camada.dock?.modulos).toEqual([modulo('operacao')]);
  });

  it('Preferências de antes desta lista: a lista vazia, com a posição e o tamanho salvos', () => {
    expect(resolverPreferencias({ dock: { posicao: 'esquerda', tamanho: 36 } }).dock).toEqual({
      posicao: 'esquerda',
      tamanho: 36,
      ampliar: true,
      ocultar: false,
      modulos: [],
    });
  });

  it('o item inválido sai, e os válidos continuam', () => {
    const lido = lerAjustes({
      dock: {
        modulos: [
          modulo('Operação'),
          { id: 'salas', visivel: 'sim' },
          modulo('x'.repeat(41)),
          'ativos',
          modulo('salas', false),
        ],
      },
    });
    expect(lido.dock?.modulos).toEqual([modulo('salas', false)]);
  });

  it('corta a lista em 40 módulos', () => {
    const quarentaEDois = Array.from({ length: 42 }, (_, indice) => modulo(`modulo-${indice}`));
    expect(lerAjustes({ dock: { modulos: quarentaEDois } }).dock?.modulos).toHaveLength(40);
  });

  it('a lista vazia vale, e a que não é lista fica de fora', () => {
    expect(lerAjustes({ dock: { modulos: [] } })).toEqual({ dock: { modulos: [] } });
    expect(lerAjustes({ dock: { modulos: 'operacao' } })).toEqual({});
  });

  it('a lista da conta vale inteira, no lugar da lista da organização', () => {
    const organizacao = { dock: { modulos: [modulo('operacao'), modulo('salas', false)] } };
    expect(resolverPreferencias(organizacao).dock.modulos).toEqual(organizacao.dock.modulos);
    const conta = { dock: { modulos: [modulo('ativos')] } };
    expect(resolverPreferencias(organizacao, conta).dock.modulos).toEqual([modulo('ativos')]);
  });

  it('a mudança troca a lista inteira, e o null a tira', () => {
    const camada = { dock: { modulos: [modulo('operacao')] } };
    const nova = aplicarMudanca(camada, { dock: { modulos: [modulo('salas', false)] } });
    expect(nova.dock?.modulos).toEqual([modulo('salas', false)]);
    expect(aplicarMudanca(nova, { dock: { modulos: null } })).toEqual({});
  });
});

// A largura e as opções dos blocos (spec preferencias-da-interface, "Blocos do Início nas
// preferências"; change opcoes-dos-blocos-do-inicio, design, decisão 2).
describe('a largura e as opções dos blocos do Início', () => {
  const bloco = (extras: Record<string, unknown> = {}) => ({
    id: 'ativos.suprimentos',
    visivel: true,
    ...extras,
  });
  const lidos = (blocos: unknown[]) => lerAjustes({ inicio: { blocos } }).inicio?.blocos;

  it('Preferências de antes das opções: o bloco só com o id e a visibilidade continua igual', () => {
    expect(lidos([bloco()])).toEqual([bloco()]);
    const antes = { inicio: { blocos: [bloco(), { id: 'gestao.backups', visivel: false }] } };
    expect(resolverPreferencias(antes).inicio.blocos).toEqual(antes.inicio.blocos);
  });

  it('guarda a largura inteira ou metade, e ignora outro valor', () => {
    expect(lidos([bloco({ largura: 'metade' })])).toEqual([bloco({ largura: 'metade' })]);
    expect(lidos([bloco({ largura: 'inteira' })])).toEqual([bloco({ largura: 'inteira' })]);
    expect(lidos([bloco({ largura: 'um-terco' })])).toEqual([bloco()]);
    expect(lidos([bloco({ largura: 2 })])).toEqual([bloco()]);
  });

  it('guarda as opções nas quatro formas de valor', () => {
    const opcoes = { tipos: ['toner', 'fusor'], nivel: 30, compacto: true, ordem: 'nivel' };
    expect(lidos([bloco({ opcoes })])).toEqual([bloco({ opcoes })]);
  });

  it('Opção fora da forma: sai, uma a uma, e o bloco continua com as outras', () => {
    const opcoes = {
      tipos: ['toner'],
      extra: { dentro: 1 },
      'Chave Errada': true,
      ['c'.repeat(31)]: true,
      longa: 'x'.repeat(81),
      mista: ['a', 2],
      muitos: Array.from({ length: 51 }, () => 'a'),
      infinito: Number.POSITIVE_INFINITY,
      nulo: null,
    };
    expect(lidos([bloco({ opcoes })])).toEqual([bloco({ opcoes: { tipos: ['toner'] } })]);
  });

  it('o bloco só com opções fora da forma fica sem o campo', () => {
    expect(lidos([bloco({ opcoes: { extra: { dentro: 1 } } })])).toEqual([bloco()]);
    expect(lidos([bloco({ opcoes: 'toner' })])).toEqual([bloco()]);
    expect(lidos([bloco({ opcoes: {} })])).toEqual([bloco()]);
  });

  it('o texto de 80 caracteres e a lista de 50 textos cabem', () => {
    const opcoes = { longa: 'x'.repeat(80), muitos: Array.from({ length: 50 }, () => 'a') };
    expect(lidos([bloco({ opcoes })])).toEqual([bloco({ opcoes })]);
  });

  it('guarda até 12 opções por bloco', () => {
    const opcoes = Object.fromEntries(
      Array.from({ length: 14 }, (_, indice) => [`opcao-${indice}`, indice]),
    );
    const [lido] = lidos([bloco({ opcoes })]) ?? [];
    expect(Object.keys(lido?.opcoes ?? {})).toHaveLength(12);
  });

  it('a mudança troca a lista inteira, com a largura e as opções de cada bloco', () => {
    const camada = { inicio: { blocos: [bloco({ opcoes: { nivel: 30 } })] } };
    const nova = aplicarMudanca(camada, {
      inicio: { blocos: [bloco({ largura: 'metade', opcoes: { tipos: ['toner'] } })] },
    });
    expect(nova.inicio?.blocos).toEqual([
      bloco({ largura: 'metade', opcoes: { tipos: ['toner'] } }),
    ]);
  });

  it('os módulos do dock não guardam largura nem opções', () => {
    const modulos = [{ id: 'operacao', visivel: true, largura: 'metade', opcoes: { a: 1 } }];
    expect(lerAjustes({ dock: { modulos } }).dock?.modulos).toEqual([
      { id: 'operacao', visivel: true },
    ]);
  });
});
