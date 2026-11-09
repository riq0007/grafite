import { describe, expect, it } from 'vitest';
import {
  LIMITE_DE_LIGACOES,
  mensagemDosTiposAceitos,
  parDaLigacao,
  RECUSAS_DA_LIGACAO,
} from './ligacoes.ts';

describe('mensagemDosTiposAceitos', () => {
  it('diz o tipo aceito, ou a lista dos tipos aceitos', () => {
    expect(mensagemDosTiposAceitos(['Computador'])).toBe('Escolha um ativo do tipo Computador.');
    expect(mensagemDosTiposAceitos(['Computador', 'Notebook'])).toBe(
      'Escolha um ativo de um destes tipos: Computador, Notebook.',
    );
  });
});

describe('a ligação livre', () => {
  const nobreak = '0199a3f0-0000-7000-8000-000000000700';
  const comutador = '0199a3f0-0000-7000-8000-000000000610';

  it('guarda o par sempre na mesma ordem, de qualquer lado que se ligue', () => {
    expect(parDaLigacao(nobreak, comutador)).toEqual({ ok: true, par: [comutador, nobreak] });
    expect(parDaLigacao(comutador, nobreak)).toEqual({ ok: true, par: [comutador, nobreak] });
  });

  it('recusa ligar um ativo a ele mesmo', () => {
    expect(parDaLigacao(nobreak, nobreak)).toEqual({
      ok: false,
      erro: 'Um ativo não se liga a ele mesmo.',
    });
  });

  it('vale até 100 ligações por ativo, com as recusas da spec', () => {
    expect(LIMITE_DE_LIGACOES).toBe(100);
    expect(RECUSAS_DA_LIGACAO).toEqual({
      esteInativo: 'Este ativo está inativo.',
      outroInativo: 'O ativo escolhido está inativo.',
      ele: 'Um ativo não se liga a ele mesmo.',
      repetida: 'Os dois ativos já estão ligados.',
      limite: 'Este ativo já tem 100 ligações. Desfaça uma para ligar outra.',
      limiteDoOutro: 'O ativo escolhido já tem 100 ligações.',
    });
  });
});
