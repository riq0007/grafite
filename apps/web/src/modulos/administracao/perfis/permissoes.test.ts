import { PERMISSOES } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { AREAS, escolhidasDepois, incluidaPor, permissoesQueValem } from './permissoes.ts';

describe('as permissões na ficha do perfil', () => {
  it('as áreas seguem a ordem do catálogo, cada uma com as permissões dela', () => {
    expect(AREAS.map(({ area }) => area)).toEqual([
      'Pessoas',
      'Acessos',
      'Locais',
      'Fornecedores',
      'Organização',
      'Auditoria',
      'Tarefas',
      'Backup',
      'Ativos',
      'Coleta',
      'Cofre',
      'Alertas',
      'Consumíveis',
      'Estoque',
      'Solicitações',
      'Ordens de serviço',
      'Operação',
      'Control iD',
      'Mapa',
      'Software',
      'Salas',
      'Painéis',
    ]);
    expect(AREAS[0]?.permissoes.map(({ chave }) => chave)).toEqual([
      'pessoas.ver',
      'pessoas.editar',
      'pessoas.anonimizar',
      'contas.administrar',
    ]);
  });

  it('valem as escolhidas e as que elas incluem; no perfil com todas, todas', () => {
    expect([
      ...permissoesQueValem({ permissoes: ['acessos.administrar'], todasAsPermissoes: false }),
    ]).toEqual(expect.arrayContaining(['acessos.administrar', 'acessos.ver', 'pessoas.ver']));
    expect(permissoesQueValem({ permissoes: [], todasAsPermissoes: true }).size).toBe(
      PERMISSOES.length,
    );
  });

  it('diz qual escolhida inclui a permissão, sem contar a própria', () => {
    expect(incluidaPor('pessoas.ver', ['pessoas.editar', 'auditoria.ver'])).toBe('pessoas.editar');
    expect(incluidaPor('acessos.ver', ['acessos.administrar'])).toBe('acessos.administrar');
    expect(incluidaPor('pessoas.ver', ['acessos.administrar'])).toBe('acessos.administrar');
    expect(incluidaPor('pessoas.editar', ['pessoas.editar'])).toBeNull();
    expect(incluidaPor('locais.editar', ['pessoas.editar'])).toBeNull();
  });

  it('a mudança no grupo muda só a permissão marcada ou desmarcada, na ordem do catálogo', () => {
    const escolhidas = ['pessoas.editar'] as const;
    const antes = permissoesQueValem({ permissoes: [...escolhidas], todasAsPermissoes: false });
    expect(escolhidasDepois([...escolhidas], antes, [...antes, 'auditoria.ver'])).toEqual([
      'pessoas.editar',
      'auditoria.ver',
    ]);
    expect(
      escolhidasDepois(['auditoria.ver', 'pessoas.editar'], new Set([...antes, 'auditoria.ver']), [
        ...antes,
      ]),
    ).toEqual(['pessoas.editar']);
    // A incluída que também foi escolhida continua escolhida quando a que a inclui sai.
    const ambas = ['pessoas.ver', 'pessoas.editar'] as const;
    const valiam = permissoesQueValem({ permissoes: [...ambas], todasAsPermissoes: false });
    expect(escolhidasDepois([...ambas], valiam, ['pessoas.ver'])).toEqual(['pessoas.ver']);
  });
});
