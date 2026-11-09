import { describe, expect, it } from 'vitest';
import {
  aplicarPassoDoAgente,
  CODIGOS_DE_SUCESSO_PADRAO,
  conferirPacote,
  LINHAS_DO_LOG,
  MENSAGENS_DO_SOFTWARE,
  progressoDaDistribuicao,
  SITUACOES_DA_MAQUINA,
  type SituacaoDaMaquina,
} from './software.ts';

describe('o pacote de software', () => {
  it('confere o nome, o comando e os códigos de sucesso, com 0 e 3010 de fábrica', () => {
    expect(
      conferirPacote({
        nome: '  7-Zip 23.01 ',
        versao: ' 23.01 ',
        descricao: '',
        comando: ' msiexec /i "7z2301-x64.msi" /qn /norestart ',
        codigosDeSucesso: '',
      }),
    ).toEqual({
      ok: true,
      dados: {
        nome: '7-Zip 23.01',
        versao: '23.01',
        descricao: null,
        comando: 'msiexec /i "7z2301-x64.msi" /qn /norestart',
        codigosDeSucesso: CODIGOS_DE_SUCESSO_PADRAO,
      },
    });
    expect(
      conferirPacote({
        nome: 'Chrome',
        comando: 'setup.exe',
        codigosDeSucesso: '0, 1641 ,3010, 0',
      }),
    ).toMatchObject({ ok: true, dados: { codigosDeSucesso: [0, 1641, 3010] } });
  });

  it('recusa o nome e o comando vazios e os códigos fora do formato', () => {
    expect(conferirPacote({ nome: ' ', comando: '', codigosDeSucesso: '0, abc' })).toEqual({
      ok: false,
      erros: {
        nome: MENSAGENS_DO_SOFTWARE.nome,
        comando: MENSAGENS_DO_SOFTWARE.comando,
        codigosDeSucesso: MENSAGENS_DO_SOFTWARE.codigos,
      },
    });
    expect(
      conferirPacote({ nome: 'a'.repeat(121), comando: 'x', codigosDeSucesso: '99999999999' }),
    ).toMatchObject({
      ok: false,
      erros: {
        nome: MENSAGENS_DO_SOFTWARE.nomeLongo,
        codigosDeSucesso: MENSAGENS_DO_SOFTWARE.codigos,
      },
    });
  });
});

describe('os passos do agente na máquina', () => {
  const aguardando = { situacao: 'aguardando' as const, etapa: null, log: [] };

  it('Instalação concluída: os passos vão para o log, e a mensagem final conclui', () => {
    let maquina = aplicarPassoDoAgente(aguardando, { currentStep: 'checking', msg: 'starting' });
    expect(maquina).toMatchObject({
      situacao: 'em-andamento',
      etapa: 'Conferindo',
      log: ['Conferindo: starting'],
      terminou: false,
    });
    maquina = aplicarPassoDoAgente(maquina, {
      currentStep: 'processing',
      status: 'ok',
      msg: 'cmd, processing success',
    });
    maquina = aplicarPassoDoAgente(maquina, { status: 'ok', msg: 'job successfully completed' });
    expect(maquina).toMatchObject({ situacao: 'concluida', etapa: 'Executando', terminou: true });
    expect(maquina.log).toEqual([
      'Conferindo: starting',
      'Executando: ok, cmd, processing success',
      'Fim: ok, job successfully completed',
    ]);
  });

  it('Instalação que falhou: o ko leva a "falhou", e o passo depois do fim não muda a situação', () => {
    const falhou = aplicarPassoDoAgente(
      { situacao: 'em-andamento', etapa: 'Executando', log: [] },
      { currentStep: 'processing', status: 'ko', msg: 'cmd, processing failure' },
    );
    expect(falhou).toMatchObject({ situacao: 'falhou', terminou: true });
    expect(
      aplicarPassoDoAgente(falhou, { status: 'ok', msg: 'job successfully completed' }),
    ).toMatchObject({ situacao: 'falhou', terminou: false });
  });

  it('o log guarda as últimas linhas', () => {
    let maquina: { situacao: SituacaoDaMaquina; etapa: string | null; log: string[] } = {
      situacao: 'em-andamento',
      etapa: 'Baixando',
      log: [],
    };
    for (let indice = 0; indice < LINHAS_DO_LOG + 5; indice++) {
      maquina = aplicarPassoDoAgente(maquina, { msg: `linha ${indice}` });
    }
    expect(maquina.log).toHaveLength(LINHAS_DO_LOG);
    expect(maquina.log.at(-1)).toBe(`Baixando: linha ${LINHAS_DO_LOG + 4}`);
  });

  it('cada situação tem o texto da tela', () => {
    expect(SITUACOES_DA_MAQUINA.aguardando.texto).toBe('Aguardando o agente');
    expect(SITUACOES_DA_MAQUINA.falhou).toEqual({ texto: 'Falhou', tipo: 'critico' });
  });
});

describe('o progresso da distribuição', () => {
  it('diz quantas concluíram e quantas falharam', () => {
    expect(progressoDaDistribuicao(['aguardando', 'aguardando', 'em-andamento'])).toBe(
      '0 de 3 concluídas',
    );
    expect(progressoDaDistribuicao(['concluida', 'concluida', 'falhou'])).toBe(
      '2 de 3 concluídas, 1 falhou',
    );
    expect(progressoDaDistribuicao(['falhou', 'falhou'])).toBe('0 de 2 concluídas, 2 falharam');
    expect(progressoDaDistribuicao(['concluida'])).toBe('1 de 1 concluída');
  });
});
