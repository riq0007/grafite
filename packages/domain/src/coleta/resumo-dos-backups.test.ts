// O resumo dos backups de um controle (spec backup-do-control-id, "Resumo dos backups por controle";
// change suprimentos-rostos-e-backups, design, decisão 6).
import { describe, expect, it } from 'vitest';
import { contagensDoBackup, diasDosBackups } from './resumo-dos-backups.ts';

const agora = new Date('2026-10-29T15:00:00Z'); // 12:00 em São Paulo

describe('diasDosBackups', () => {
  it('os dias de São Paulo, do mais antigo até hoje', () => {
    const dias = diasDosBackups([], 30, agora);
    expect(dias).toHaveLength(30);
    expect(dias[0]?.data).toBe('2026-09-30');
    expect(dias.at(-1)?.data).toBe('2026-10-29');
    expect(dias.every((dia) => dia.situacao === 'nada')).toBe(true);
  });

  it('dia com falha e sucesso: vale o concluído', () => {
    const dias = diasDosBackups(
      [
        { situacao: 'falha', concluidoEm: new Date('2026-10-10T05:00:00Z') },
        { situacao: 'sucesso', concluidoEm: new Date('2026-10-10T12:00:00Z') },
        { situacao: 'parcial', concluidoEm: new Date('2026-10-11T12:00:00Z') },
        { situacao: 'falha', concluidoEm: new Date('2026-10-12T12:00:00Z') },
      ],
      30,
      agora,
    );
    const de = (data: string) => dias.find((dia) => dia.data === data)?.situacao;
    expect(de('2026-10-10')).toBe('ok');
    expect(de('2026-10-11')).toBe('parcial');
    expect(de('2026-10-12')).toBe('falha');
    expect(de('2026-10-13')).toBe('nada');
  });

  it('o dia é o de São Paulo, e o que não terminou não conta', () => {
    const dias = diasDosBackups(
      [
        { situacao: 'sucesso', concluidoEm: new Date('2026-10-29T02:30:00Z') },
        { situacao: 'em-andamento', concluidoEm: null },
        { situacao: 'na-fila', concluidoEm: null },
      ],
      7,
      agora,
    );
    expect(dias.find((dia) => dia.data === '2026-10-28')?.situacao).toBe('ok');
    expect(dias.find((dia) => dia.data === '2026-10-29')?.situacao).toBe('nada');
  });
});

describe('contagensDoBackup', () => {
  it('os usuários e os rostos pelas categorias', () => {
    expect(
      contagensDoBackup([
        { categoria: 'users', situacao: 'ok', quantidade: 98 },
        { categoria: 'cards', situacao: 'ok', quantidade: 120 },
        { categoria: 'face_images', situacao: 'ok', quantidade: 412 },
      ]),
    ).toEqual({ usuarios: 98, rostos: 412 });
  });

  it('fotos com erro: os rostos ficam sem dado, e nunca zero', () => {
    expect(
      contagensDoBackup([
        { categoria: 'users', situacao: 'ok', quantidade: 98 },
        { categoria: 'face_images', situacao: 'erro', quantidade: 0, erro: 'tempo esgotado' },
      ]),
    ).toEqual({ usuarios: 98, rostos: null });
    expect(contagensDoBackup([])).toEqual({ usuarios: null, rostos: null });
  });
});
