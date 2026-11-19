// Os tipos de chamado de fábrica no banco (spec tipos-de-chamado, "Tipos de fábrica"; change
// chamados-da-ti, design, decisão 6): as linhas saem da lista do domínio, e a migration que os grava
// nas organizações que já existiam é o texto do gerador, conferido aqui contra a lista. Depois de
// solta numa versão, a 0062 não muda. Quando a lista mudar, o teste da igualdade e o
// `sqlDosTiposDeFabrica` saem, e a change que mudar a lista decide se as organizações que já existem
// recebem algo, numa migration nova.
import { readFileSync } from 'node:fs';
import { TIPOS_DE_CHAMADO_DE_FABRICA, type TipoDeChamadoDeFabrica } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { linhasDosTiposDeFabrica, sqlDosTiposDeFabrica } from './fabrica.ts';

const MIGRACAO = new URL(
  '../../../../packages/db/migrations/0062_tipos_de_chamado_de_fabrica.sql',
  import.meta.url,
);

function tipo(nome: string): TipoDeChamadoDeFabrica {
  const achado = TIPOS_DE_CHAMADO_DE_FABRICA.find((de) => de.nome === nome);
  if (!achado) throw new Error(`Sem o tipo de fábrica ${nome}.`);
  return achado;
}

const COLUNAS =
  '"nome", "nome_normalizado", "icone", "frase", "situacao", "ordem", "resposta_valor", ' +
  '"resposta_unidade", "resolucao_valor", "resolucao_unidade", "modo", "sem_ninguem", ' +
  '"pode_virar_os", "gera_solicitacao", "pede_o_ativo", "aparece_para_o_colaborador", ' +
  '"so_a_ti_abre", "formulario"';

describe('as linhas dos tipos de fábrica', () => {
  it('os 9 tipos Em uso, na ordem da lista, de 1 a 9, com o nome normalizado', () => {
    expect(
      linhasDosTiposDeFabrica().map(({ ordem, nome, nomeNormalizado, situacao }) => [
        ordem,
        nome,
        nomeNormalizado,
        situacao,
      ]),
    ).toEqual([
      [1, 'Toner', 'toner', 'em-uso'],
      [2, 'Computador', 'computador', 'em-uso'],
      [3, 'Impressora', 'impressora', 'em-uso'],
      [4, 'Acesso e senha', 'acesso e senha', 'em-uso'],
      [5, 'Software', 'software', 'em-uso'],
      [6, 'Rede e internet', 'rede e internet', 'em-uso'],
      [7, 'Telefone', 'telefone', 'em-uso'],
      [8, 'Outro', 'outro', 'em-uso'],
      [9, 'Troca de equipamento', 'troca de equipamento', 'em-uso'],
    ]);
  });

  it('cada linha leva o tipo da lista, com o prazo nas colunas e o formulário dele', () => {
    const toner = tipo('Toner');
    const [primeira] = linhasDosTiposDeFabrica();
    expect(primeira).toEqual({
      nome: 'Toner',
      nomeNormalizado: 'toner',
      icone: 'gota',
      frase: 'A impressora está sem toner ou a cópia saiu fraca',
      situacao: 'em-uso',
      ordem: 1,
      respostaValor: 30,
      respostaUnidade: 'min',
      resolucaoValor: 8,
      resolucaoUnidade: 'h',
      modo: 'corridas',
      semNinguem: 'triagem',
      podeVirarOs: false,
      geraSolicitacao: 'toner',
      pedeOAtivo: true,
      apareceParaOColaborador: true,
      soATiAbre: false,
      formulario: toner.formulario,
    });
    expect(linhasDosTiposDeFabrica().map(({ formulario }) => formulario)).toEqual(
      TIPOS_DE_CHAMADO_DE_FABRICA.map(({ formulario }) => formulario),
    );
  });

  it('a migration não conhece as contas nem os tipos de ativo de cada organização: o tipo de fábrica com eles é um erro', () => {
    const toner = tipo('Toner');
    const erro =
      'O tipo de fábrica Toner não pode ter quem atende por padrão nem o tipo de ativo do equipamento.';
    expect(() =>
      linhasDosTiposDeFabrica([
        { ...toner, atendePorPadrao: '019a0000-0000-7000-8000-000000000001' },
      ]),
    ).toThrow(erro);
    expect(() =>
      linhasDosTiposDeFabrica([
        { ...toner, tipoDeAtivoDoEquipamento: '019a0000-0000-7000-8000-000000000002' },
      ]),
    ).toThrow(erro);
  });
});

describe('o texto da migration', () => {
  it('grava os tipos em cada organização que existe, com o RLS solto só durante a gravação, os textos com o apóstrofo dobrado e o formulário em JSON', () => {
    const toner = { ...tipo('Toner'), frase: "A cópia d'água saiu fraca" };
    const json = JSON.stringify(toner.formulario);
    expect(sqlDosTiposDeFabrica([toner])).toBe(
      [
        '-- Os tipos de chamado de fábrica nas organizações que já existem (spec tipos-de-chamado, "Tipos de',
        '-- fábrica"; change chamados-da-ti, design, decisão 6), gerados da lista do domínio pelo',
        '-- apps/api/src/chamados/fabrica.ts. Não edite à mão: o teste dele confere este texto.',
        'ALTER TABLE "organizacoes" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint',
        'ALTER TABLE "tipos_de_chamado" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint',
        `INSERT INTO "tipos_de_chamado" ("org_id", ${COLUNAS})`,
        '  SELECT "organizacoes"."id", "de_fabrica".*',
        '  FROM "organizacoes"',
        '  CROSS JOIN (VALUES',
        "    ('Toner', 'toner', 'gota', 'A cópia d''água saiu fraca', 'em-uso', 1, 30, 'min', 8, 'h', 'corridas', 'triagem', false, 'toner', true, true, false,",
        `      '${json}'::jsonb)`,
        `  ) AS "de_fabrica"(${COLUNAS});--> statement-breakpoint`,
        'ALTER TABLE "organizacoes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint',
        'ALTER TABLE "tipos_de_chamado" FORCE ROW LEVEL SECURITY;',
        '',
      ].join('\n'),
    );
  });

  it('separa as linhas por vírgula, uma por tipo, na ordem', () => {
    const texto = sqlDosTiposDeFabrica([tipo('Toner'), tipo('Outro')]);
    expect(texto).toContain("'triagem', false, 'toner', true, true, false,\n");
    expect(texto).toMatch(/::jsonb\),\n {4}\('Outro', 'outro', 'reticencias', .*, 'em-uso', 2, /);
    expect(texto).toMatch(/::jsonb\)\n {2}\) AS "de_fabrica"/);
  });

  it('a migration 0062 é o texto do gerador para a lista do domínio', () => {
    expect(readFileSync(MIGRACAO, 'utf8')).toBe(sqlDosTiposDeFabrica());
  });
});
