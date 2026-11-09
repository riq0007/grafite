import { describe, expect, it } from 'vitest';
import {
  CLASSIFICACOES_DE_SEGREDO,
  conferirSegredo,
  ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO,
  ROTULOS_DOS_TIPOS_DE_SEGREDO,
  situacaoDaValidade,
  TIPOS_DE_SEGREDO,
} from './segredos.ts';

const valido = {
  nome: ' Switch do CPD ',
  tipo: 'conta-administrativa',
  classificacao: 'equipamento',
  identificador: ' admin ',
  endereco: 'https://10.0.5.2',
  notas: 'Trocar a cada 90 dias.',
  validade: '31/12/2026',
  proximaRotacao: '2027-01-15',
  valor: 'senha-forte',
};

describe('os tipos e as classificações', () => {
  it('são os do PMG, com os rótulos em pt-BR e o código do PMG para a migração', () => {
    expect(TIPOS_DE_SEGREDO.map(({ id, pmg }) => [id, pmg])).toEqual([
      ['usuario-e-senha', 'USER_PASSWORD'],
      ['conta-administrativa', 'ADMIN_ACCOUNT'],
      ['banco-de-dados', 'DATABASE'],
      ['conta-de-servico', 'SERVICE_ACCOUNT'],
      ['chave-de-api', 'API_KEY'],
      ['token', 'TOKEN'],
      ['chave-ssh', 'SSH_KEY'],
      ['certificado', 'CERTIFICATE'],
      ['pin', 'PIN'],
      ['wi-fi', 'WIFI'],
      ['chave-de-licenca', null],
      ['comunidade-snmp', null],
      ['outro', 'OTHER'],
    ]);
    // A comunidade que o coletor usa para ler as impressoras (change p2b-impressoras-por-snmp).
    expect(ROTULOS_DOS_TIPOS_DE_SEGREDO['comunidade-snmp']).toBe('Comunidade SNMP');
    expect(ROTULOS_DOS_TIPOS_DE_SEGREDO['conta-administrativa']).toBe('Conta administrativa');
    expect(ROTULOS_DOS_TIPOS_DE_SEGREDO['chave-de-licenca']).toBe('Chave de licença');
    expect(CLASSIFICACOES_DE_SEGREDO.map(({ id, pmg }) => [id, pmg])).toEqual([
      ['pessoal', 'PERSONAL'],
      ['compartilhado', 'SHARED'],
      ['administrativo', 'ADMINISTRATIVE'],
      ['privilegiado', 'PRIVILEGED'],
      ['aplicacao', 'APPLICATION'],
      ['equipamento', 'EQUIPMENT'],
    ]);
    expect(ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO.aplicacao).toBe('Aplicação');
  });
});

describe('conferirSegredo', () => {
  it('aceita o segredo, sem os espaços das pontas e com as datas em aaaa-mm-dd', () => {
    expect(conferirSegredo(valido, { valorObrigatorio: true })).toEqual({
      ok: true,
      dados: {
        nome: 'Switch do CPD',
        tipo: 'conta-administrativa',
        classificacao: 'equipamento',
        identificador: 'admin',
        endereco: 'https://10.0.5.2',
        notas: 'Trocar a cada 90 dias.',
        validade: '2026-12-31',
        proximaRotacao: '2027-01-15',
        valor: 'senha-forte',
      },
    });
  });

  it('os campos opcionais vazios viram nulos', () => {
    const resultado = conferirSegredo(
      {
        ...valido,
        identificador: '  ',
        endereco: '',
        notas: null,
        validade: '',
        proximaRotacao: null,
      },
      { valorObrigatorio: true },
    );
    expect(resultado).toMatchObject({
      ok: true,
      dados: {
        identificador: null,
        endereco: null,
        notas: null,
        validade: null,
        proximaRotacao: null,
      },
    });
  });

  it('recusa cada campo com a mensagem dele', () => {
    expect(
      conferirSegredo(
        {
          nome: ' ',
          tipo: 'senha',
          classificacao: 'secreto',
          identificador: 'x'.repeat(201),
          endereco: 'x'.repeat(501),
          notas: 'x'.repeat(2001),
          validade: '31/02/2026',
          proximaRotacao: 'amanhã',
          valor: '',
        },
        { valorObrigatorio: true },
      ),
    ).toEqual({
      ok: false,
      erros: {
        nome: 'Informe o nome do segredo.',
        tipo: 'Escolha o tipo do segredo.',
        classificacao: 'Escolha a classificação do segredo.',
        identificador: 'Use até 200 caracteres.',
        endereco: 'Use até 500 caracteres.',
        notas: 'Use até 2.000 caracteres.',
        validade: 'Data inválida: use dd/mm/aaaa.',
        proximaRotacao: 'Data inválida: use dd/mm/aaaa.',
        valor: 'Informe o valor do segredo.',
      },
    });
    expect(
      conferirSegredo(
        { ...valido, nome: 'x'.repeat(121), valor: 'x'.repeat(10_001) },
        {
          valorObrigatorio: true,
        },
      ),
    ).toEqual({
      ok: false,
      erros: { nome: 'Use até 120 caracteres.', valor: 'Use até 10.000 caracteres.' },
    });
  });

  it('na edição, o valor é opcional: sem ele, o valor guardado continua', () => {
    const { valor: _, ...semValor } = valido;
    expect(conferirSegredo(semValor, { valorObrigatorio: false })).toMatchObject({
      ok: true,
      dados: { valor: null },
    });
    expect(conferirSegredo({ ...semValor, valor: '' }, { valorObrigatorio: false })).toEqual({
      ok: false,
      erros: { valor: 'Informe o valor do segredo.' },
    });
  });

  it('o valor guarda os espaços, porque eles fazem parte de uma senha', () => {
    expect(
      conferirSegredo({ ...valido, valor: '  com espaços  ' }, { valorObrigatorio: true }),
    ).toMatchObject({ ok: true, dados: { valor: '  com espaços  ' } });
  });
});

describe('situacaoDaValidade', () => {
  it('vencido quando a validade passou, e rotação atrasada quando a data dela passou', () => {
    const hoje = '2026-10-12';
    expect(situacaoDaValidade({ validade: '2026-09-30', proximaRotacao: null }, hoje)).toEqual({
      vencido: true,
      rotacaoAtrasada: false,
    });
    expect(
      situacaoDaValidade({ validade: '2026-10-12', proximaRotacao: '2026-10-11' }, hoje),
    ).toEqual({ vencido: false, rotacaoAtrasada: true });
    expect(situacaoDaValidade({ validade: null, proximaRotacao: null }, hoje)).toEqual({
      vencido: false,
      rotacaoAtrasada: false,
    });
  });
});
