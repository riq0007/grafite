import { describe, expect, it } from 'vitest';
import {
  AVISO_DA_SOLICITACAO_NO_DUPLICAR,
  NOVO_TIPO_DE_CHAMADO,
  nomeDaCopia,
  nomeDoNovoTipo,
  solicitacaoDoDuplicado,
} from './rascunho.ts';

describe('o Novo tipo', () => {
  it('tem os padrões da spec: o Rascunho sem frase, em 1 h e 1 dia útil, na triagem', () => {
    expect(NOVO_TIPO_DE_CHAMADO).toEqual({
      nome: 'Novo tipo',
      icone: 'reticencias',
      frase: null,
      prazo: {
        modo: 'horario',
        resposta: { valor: 1, unidade: 'h' },
        resolucao: { valor: 1, unidade: 'd' },
      },
      atendePorPadrao: null,
      semNinguem: 'triagem',
      podeVirarOs: false,
      geraSolicitacao: 'nao',
      tipoDeAtivoDoEquipamento: null,
      pedeOAtivo: false,
      apareceParaOColaborador: true,
      soATiAbre: false,
      formulario: { titulo: { comecaPeloTipo: true, campoId: null }, campos: [] },
    });
  });

  it('ganha o número seguinte quando o nome já existe', () => {
    expect(nomeDoNovoTipo(1)).toBe('Novo tipo');
    expect(nomeDoNovoTipo(2)).toBe('Novo tipo 2');
    expect(nomeDoNovoTipo(13)).toBe('Novo tipo 13');
  });
});

describe('o nome da cópia', () => {
  it('é o nome da origem com "(cópia)", e o número seguinte quando já existe', () => {
    expect(nomeDaCopia('Toner', 1)).toBe('Toner (cópia)');
    expect(nomeDaCopia('Toner', 2)).toBe('Toner (cópia 2)');
  });

  it('corta o nome da origem para caber nos 40 caracteres, contados em caracteres', () => {
    const quarenta = 'Impressora multifuncional da recepção A';
    expect([...`${quarenta}x`]).toHaveLength(40);
    const copia = nomeDaCopia(`${quarenta}x`, 1);
    expect(copia).toBe('Impressora multifuncional da rec (cópia)');
    expect([...copia]).toHaveLength(40);
    const decima = nomeDaCopia(`${quarenta}x`, 12);
    expect(decima).toBe('Impressora multifuncional da (cópia 12)');
    expect([...decima].length).toBeLessThanOrEqual(40);
  });

  it('corta no meio da palavra, sem deixar o espaço do corte antes do "(cópia)"', () => {
    expect(nomeDaCopia('Acesso e senha da rede corporativa e VPN', 1)).toBe(
      'Acesso e senha da rede corporati (cópia)',
    );
    expect(nomeDaCopia('Troca de equipamento do setor a bcdefgh', 1)).toBe(
      'Troca de equipamento do setor a (cópia)',
    );
  });

  it('não corta um caractere de fora do plano básico ao meio', () => {
    const fax = '\u{1F4E0}';
    expect(nomeDaCopia(`${'a'.repeat(31)}${fax}bc`, 1)).toBe(`${'a'.repeat(31)}${fax} (cópia)`);
  });
});

describe('a solicitação do duplicado', () => {
  const toner = { geraSolicitacao: 'toner', tipoDeAtivoDoEquipamento: null } as const;
  const notebook = {
    geraSolicitacao: 'equipamento',
    tipoDeAtivoDoEquipamento: 'notebook',
  } as const;
  const nao = { geraSolicitacao: 'nao', tipoDeAtivoDoEquipamento: null } as const;

  it('fica como na origem para quem atende as solicitações na organização inteira', () => {
    expect(solicitacaoDoDuplicado(toner, 'organizacao')).toEqual({ ...toner, desligada: false });
    expect(solicitacaoDoDuplicado(notebook, 'organizacao')).toEqual({
      ...notebook,
      desligada: false,
    });
  });

  it('vem desligada, sem o tipo de ativo, para quem não as atende em todos os locais', () => {
    const desligada = { ...nao, desligada: true };
    expect(solicitacaoDoDuplicado(toner, new Set(['campinas']))).toEqual(desligada);
    expect(solicitacaoDoDuplicado(notebook, null)).toEqual(desligada);
  });

  it('não avisa quando a origem não gera nada', () => {
    expect(solicitacaoDoDuplicado(nao, null)).toEqual({ ...nao, desligada: false });
  });

  it('avisa com a frase da spec', () => {
    expect(AVISO_DA_SOLICITACAO_NO_DUPLICAR).toBe(
      "O 'Gera uma Solicitação' veio desligado: só quem atende as solicitações em todos os locais o liga.",
    );
  });
});
