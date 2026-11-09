import { describe, expect, it } from 'vitest';
import {
  type DefinicaoDeCampo,
  type OpcaoDaLista,
  ROTULOS_DOS_TIPOS_DE_CAMPO,
  TIPOS_DE_CAMPO,
} from './tipos.ts';
import { lerValor, mostrarValor } from './valores.ts';

const campo = (tipo: DefinicaoDeCampo['tipo'], configuracao = {}): DefinicaoDeCampo => ({
  tipo,
  configuracao,
});

describe('os tipos de campo', () => {
  it('são os 18 da spec mestre, cada um com o rótulo, com o fornecedor do P4a', () => {
    expect(TIPOS_DE_CAMPO).toEqual([
      'texto',
      'texto-longo',
      'inteiro',
      'decimal',
      'moeda',
      'data',
      'lista',
      'lista-multipla',
      'pessoa',
      'local',
      'ativo',
      'fornecedor',
      'licenca',
      'url',
      'ip',
      'mac',
      'arquivo',
      'imagem',
    ]);
    expect(Object.keys(ROTULOS_DOS_TIPOS_DE_CAMPO)).toEqual([...TIPOS_DE_CAMPO]);
    expect(ROTULOS_DOS_TIPOS_DE_CAMPO.inteiro).toBe('Número inteiro');
    expect(ROTULOS_DOS_TIPOS_DE_CAMPO.arquivo).toBe('Arquivo');
    expect(ROTULOS_DOS_TIPOS_DE_CAMPO.imagem).toBe('Imagem');
    expect(ROTULOS_DOS_TIPOS_DE_CAMPO.fornecedor).toBe('Fornecedor');
  });
});

describe('lerValor e mostrarValor', () => {
  it.each([
    [campo('texto'), '  Rack 2 ', 'Rack 2', 'Rack 2'],
    [campo('texto-longo'), 'Linha 1\nLinha 2', 'Linha 1\nLinha 2', 'Linha 1\nLinha 2'],
    [campo('inteiro'), '1.024', 1024, '1.024'],
    [campo('decimal', { casas: 3 }), '1,234', 1.234, '1,234'],
    [campo('moeda'), 'R$ 1.234,56', 1234.56, 'R$ 1.234,56'],
    [campo('data'), '09/10/2026', '2026-10-09', '09/10/2026'],
  ])('%j lê %j, guarda %j e mostra %j', (definicao, entrada, guardado, mostrado) => {
    const lido = lerValor(definicao, entrada);
    expect(lido).toEqual({ ok: true, valor: guardado });
    expect(mostrarValor(definicao, guardado)).toBe(mostrado);
  });

  it('o valor ausente é mostrado vazio', () => {
    expect(mostrarValor(campo('inteiro'), null)).toBe('');
  });

  it('a recusa de cada tipo diz o que fazer', () => {
    expect(lerValor(campo('data'), '31/02/2026')).toEqual({
      ok: false,
      erro: 'Data inválida: use dd/mm/aaaa.',
    });
    expect(lerValor(campo('inteiro', { minimo: 1, maximo: 64 }), '128')).toEqual({
      ok: false,
      erro: 'Use um número de 1 a 64.',
    });
  });

  describe('os tipos de escolha, de rede e de referência', () => {
    const opcoes: OpcaoDaLista[] = [
      { id: 'op-proprio', rotulo: 'Próprio', situacao: 'ativa' },
      { id: 'op-alugado', rotulo: 'Alugado', situacao: 'ativa' },
    ];

    it.each([
      [campo('lista', { opcoes }), 'alugado', 'op-alugado', 'Alugado'],
      [
        campo('lista-multipla', { opcoes }),
        'Alugado; Próprio',
        ['op-proprio', 'op-alugado'],
        'Próprio, Alugado',
      ],
      [campo('licenca'), ' Windows 11 Pro OEM ', 'Windows 11 Pro OEM', 'Windows 11 Pro OEM'],
      [
        campo('url'),
        'https://exemplo.com.br/x',
        'https://exemplo.com.br/x',
        'https://exemplo.com.br/x',
      ],
      [campo('ip'), '192.168.000.010', '192.168.0.10', '192.168.0.10'],
      [campo('mac'), 'aa-bb-cc-dd-ee-ff', 'AA:BB:CC:DD:EE:FF', 'AA:BB:CC:DD:EE:FF'],
    ])('%j lê %j, guarda %j e mostra %j', (definicao, entrada, guardado, mostrado) => {
      expect(lerValor(definicao, entrada)).toEqual({ ok: true, valor: guardado });
      expect(mostrarValor(definicao, guardado)).toBe(mostrado);
    });

    it('a licença recusa a chave de produto em qualquer lugar do texto', () => {
      const chave = 'A chave de produto não fica no cadastro: guarde-a no cofre.';
      expect(
        lerValor(campo('licenca'), 'Windows 11 Pro OEM ABCDE-12345-FGHIJ-67890-KLMNO'),
      ).toEqual({ ok: false, erro: chave });
      expect(lerValor(campo('licenca'), 'abcde-12345-fghij-67890-klmno')).toEqual({
        ok: false,
        erro: chave,
      });
      expect(lerValor(campo('licenca'), 'a'.repeat(201))).toEqual({
        ok: false,
        erro: 'Use até 200 caracteres.',
      });
    });

    it('pessoa, local e ativo leem o identificador e mostram o nome do registro', () => {
      const id = '0199a3f0-0000-7000-8000-000000000001';
      expect(lerValor(campo('pessoa'), id.toUpperCase())).toEqual({ ok: true, valor: id });
      expect(lerValor(campo('pessoa'), 'Ana')).toEqual({
        ok: false,
        erro: 'Escolha uma pessoa da lista.',
      });
      expect(lerValor(campo('local'), 'Sala 3')).toEqual({
        ok: false,
        erro: 'Escolha um local da lista.',
      });
      expect(lerValor(campo('ativo'), 5)).toEqual({
        ok: false,
        erro: 'Escolha um ativo da lista.',
      });
      const nome = (registro: string) => (registro === id ? 'Ana Souza' : undefined);
      expect(mostrarValor(campo('pessoa'), id, nome)).toBe('Ana Souza');
      expect(mostrarValor(campo('pessoa'), id)).toBe(id);
    });

    it('fornecedor lê o identificador e mostra o nome do fornecedor', () => {
      const id = '0199a3f0-0000-7000-8000-0000000000f1';
      expect(lerValor(campo('fornecedor'), id)).toEqual({ ok: true, valor: id });
      expect(lerValor(campo('fornecedor'), 'HP Brasil')).toEqual({
        ok: false,
        erro: 'Escolha um fornecedor da lista.',
      });
      const nome = (registro: string) => (registro === id ? 'HP Brasil (inativo)' : undefined);
      expect(mostrarValor(campo('fornecedor'), id, nome)).toBe('HP Brasil (inativo)');
    });

    it('arquivo e imagem leem o identificador do arquivo enviado e mostram o nome dele', () => {
      const id = '0199a3f0-0000-7000-8000-0000000000a1';
      expect(lerValor(campo('arquivo'), id.toUpperCase())).toEqual({ ok: true, valor: id });
      expect(lerValor(campo('imagem'), '')).toEqual({ ok: true, valor: null });
      expect(lerValor(campo('arquivo'), 'nota-fiscal.pdf')).toEqual({
        ok: false,
        erro: 'Envie o arquivo pela ficha do ativo.',
      });
      const nome = (arquivo: string) => (arquivo === id ? 'nota-fiscal-1234.pdf' : undefined);
      expect(mostrarValor(campo('arquivo'), id, nome)).toBe('nota-fiscal-1234.pdf');
      expect(mostrarValor(campo('imagem'), id, nome)).toBe('nota-fiscal-1234.pdf');
    });
  });

  describe('ler de novo o valor guardado dá o mesmo valor', () => {
    const opcoes: OpcaoDaLista[] = [
      { id: 'op-proprio', rotulo: 'Próprio', situacao: 'ativa' },
      { id: 'op-alugado', rotulo: 'Alugado', situacao: 'ativa' },
    ];
    const casos: [DefinicaoDeCampo, unknown[]][] = [
      [campo('texto'), ['Rack 2', '  a  b ', 12345]],
      [campo('texto-longo'), ['Linha 1\nLinha 2']],
      [campo('inteiro'), ['1.024', '-5', 0, '123456789012345']],
      [campo('decimal', { casas: 6 }), ['1.024', '1,024', '3,5', '1234.56', '-0,000001', 0.25]],
      [campo('moeda'), ['R$ 1.234,56', '0', '9.999.999.999,99', 10.5]],
      [campo('data'), ['09/10/2026', 45658, '2026-10-09T13:45:00Z']],
      [campo('lista', { opcoes }), ['Próprio', 'op-alugado']],
      [campo('lista-multipla', { opcoes }), ['alugado;proprio', ['op-alugado']]],
      [campo('pessoa'), ['0199A3F0-0000-7000-8000-000000000001']],
      [campo('licenca'), ['Office 2021 Standard, volume']],
      [campo('url'), ['HTTP://Exemplo.com.br']],
      [campo('ip'), ['2001:0DB8::0001', '010.0.0.1', '::ffff:c0a8:1']],
      [campo('mac'), ['aabb.ccdd.eeff']],
      [campo('arquivo'), ['0199A3F0-0000-7000-8000-0000000000A1']],
    ];
    for (const [definicao, entradas] of casos) {
      it.each(entradas)(`no tipo ${definicao.tipo}, a entrada %j`, (entrada) => {
        const primeira = lerValor(definicao, entrada);
        if (!primeira.ok) throw new Error(primeira.erro);
        expect(lerValor(definicao, primeira.valor)).toEqual(primeira);
      });
    }
  });
});
