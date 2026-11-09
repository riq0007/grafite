import { describe, expect, it } from 'vitest';
import { buscarNasEntradas, semDestinoRepetido } from './casamento.ts';
import type { EntradaDeBusca } from './tipos.ts';

const entrada = (rotulo: string, resto: Partial<EntradaDeBusca> = {}): EntradaDeBusca => ({
  id: rotulo,
  rotulo,
  grupo: 'ajustes',
  origem: 'declarada',
  ...resto,
});

/** Os rótulos de cada grupo, na ordem em que a busca os mostra. */
const rotulos = (termo: string, entradas: EntradaDeBusca[]) =>
  buscarNasEntradas(termo, entradas).map((grupo) => [
    grupo.nome,
    grupo.resultados.map((resultado) => resultado.rotulo),
  ]);

describe('buscarNasEntradas', () => {
  it('ignora acentos, maiúsculas e espaços repetidos', () => {
    const entradas = [entrada('Aparência'), entrada('Dock')];
    expect(rotulos('APARENCIA', entradas)).toEqual([['Ajustes', ['Aparência']]]);
    expect(rotulos('  aparência  ', entradas)).toEqual([['Ajustes', ['Aparência']]]);
  });

  it('exige cada palavra digitada, em qualquer ordem', () => {
    const entradas = [entrada('Tamanho do dock'), entrada('Posição do dock')];
    expect(rotulos('dock   tamanho', entradas)).toEqual([['Ajustes', ['Tamanho do dock']]]);
    expect(rotulos('dock cor', entradas)).toEqual([]);
  });

  it('casa também pelo caminho e pelas palavras-chave', () => {
    const entradas = [
      entrada('Tamanho do dock', { caminho: 'Ajustes › Dock', palavrasChave: ['largura'] }),
      entrada('Tema', { caminho: 'Ajustes › Aparência' }),
    ];
    expect(rotulos('largura', entradas)).toEqual([['Ajustes', ['Tamanho do dock']]]);
    expect(rotulos('aparencia tema', entradas)).toEqual([['Ajustes', ['Tema']]]);
  });

  it('põe primeiro o nome que começa pelo texto, depois o que o contém, depois o resto', () => {
    const entradas = [
      entrada('Ocultar automaticamente', { palavrasChave: ['dock'] }),
      entrada('Tamanho do dock'),
      entrada('Dock'),
    ];
    expect(rotulos('dock', entradas)).toEqual([
      ['Ajustes', ['Dock', 'Tamanho do dock', 'Ocultar automaticamente']],
    ]);
  });

  it('no empate, mantém a ordem em que as entradas foram declaradas', () => {
    const entradas = [entrada('Posição do dock'), entrada('Tamanho do dock')];
    expect(rotulos('do dock', entradas)).toEqual([
      ['Ajustes', ['Posição do dock', 'Tamanho do dock']],
    ]);
  });

  it('mostra até 8 resultados por grupo', () => {
    const entradas = Array.from({ length: 10 }, (_, i) => entrada(`Ajuste ${i + 1}`));
    const [ajustes] = buscarNasEntradas('ajuste', entradas);
    expect(ajustes?.resultados.map((r) => r.rotulo)).toEqual([
      'Ajuste 1',
      'Ajuste 2',
      'Ajuste 3',
      'Ajuste 4',
      'Ajuste 5',
      'Ajuste 6',
      'Ajuste 7',
      'Ajuste 8',
    ]);
  });

  it('mostra os grupos na ordem Ir para, Ações e Ajustes, sem grupos vazios', () => {
    const entradas = [
      entrada('Dock', { grupo: 'ajustes' }),
      entrada('Dock do Início', { grupo: 'ir-para', origem: 'menu' }),
      entrada('Esconder o dock', { grupo: 'acoes' }),
      entrada('Notificações', { grupo: 'acoes' }),
    ];
    expect(rotulos('dock', entradas)).toEqual([
      ['Ir para', ['Dock do Início']],
      ['Ações', ['Esconder o dock']],
      ['Ajustes', ['Dock']],
    ]);
  });

  it('com o campo vazio, mostra só os módulos, no grupo Ir para', () => {
    const entradas = [
      entrada('Início', { grupo: 'ir-para', origem: 'modulo' }),
      entrada('Aparência', { grupo: 'ir-para', origem: 'menu' }),
      entrada('Tema', { grupo: 'ajustes' }),
      entrada('Ajustes', { grupo: 'ir-para', origem: 'modulo' }),
    ];
    expect(rotulos('   ', entradas)).toEqual([['Ir para', ['Início', 'Ajustes']]]);
  });
});

describe('semDestinoRepetido', () => {
  it('entradas para o mesmo endereço com focos diferentes não se repetem uma à outra', () => {
    const entradas = [
      entrada('Posição do dock', { destino: '/ajustes/dock', foco: 'posicao-do-dock' }),
      entrada('Tamanho do dock', { destino: '/ajustes/dock', foco: 'tamanho-do-dock' }),
      entrada('Dock (menu)', { grupo: 'ir-para', origem: 'menu', destino: '/ajustes/dock' }),
      entrada('Dock', { destino: '/ajustes/dock' }),
    ];
    expect(semDestinoRepetido(entradas).map((e) => e.rotulo)).toEqual([
      'Posição do dock',
      'Tamanho do dock',
      'Dock',
    ]);
  });

  it('um destino aparece uma vez só: a entrada declarada vence a do módulo, que vence a do menu', () => {
    const entradas = [
      entrada('Ajustes', { grupo: 'ir-para', origem: 'modulo', destino: '/ajustes' }),
      entrada('Aparência (menu)', {
        grupo: 'ir-para',
        origem: 'menu',
        destino: '/ajustes/aparencia',
      }),
      entrada('Geral (menu)', { grupo: 'ir-para', origem: 'menu', destino: '/ajustes' }),
      entrada('Aparência', { destino: '/ajustes/aparencia' }),
      entrada('Usar o tema Névoa', { grupo: 'acoes' }),
    ];
    expect(semDestinoRepetido(entradas).map((e) => e.rotulo)).toEqual([
      'Ajustes',
      'Aparência',
      'Usar o tema Névoa',
    ]);
  });
});
