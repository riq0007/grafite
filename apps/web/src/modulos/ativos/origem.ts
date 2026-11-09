// A origem da tabela dos ativos (spec cadastro-de-ativos, "Tabela a partir de uma origem"; change
// relacoes-vivas, decisão 3): `origem=<tipo>:<id>` no endereço, com o tipo `local`, `pessoa`,
// `modelo`, `tipo` ou `fornecedor` (change p4a-fornecedores), vira o filtro da coluna
// correspondente, fora da visão e das mudanças da conta.
// No local, `dentro` inclui os locais de dentro, trocando o operador `igual` pelo `em`. O rótulo
// vem do resumo do registro, que também diz se a conta o vê.
import type { FiltroDaVisao } from '@grafite/domain';
import { type ResumoDe, useResumo } from '../../relacoes/resumos.ts';

export const TIPOS_DA_ORIGEM = ['local', 'pessoa', 'modelo', 'tipo', 'fornecedor'] as const;

export type TipoDaOrigem = (typeof TIPOS_DA_ORIGEM)[number];

export interface OrigemDaTabela {
  tipo: TipoDaOrigem;
  id: string;
  /** No local, os locais de dentro também. */
  comOsDeDentro: boolean;
}

/** A origem como o endereço a guarda. */
export interface OrigemNoEndereco {
  origem?: string;
  dentro?: true;
}

const ORIGEM = /^(local|pessoa|modelo|tipo|fornecedor):([\w-]+)$/;

/** A origem do endereço, ou nenhuma quando falta ou está mal escrita. */
export function lerOrigem(busca: Record<string, unknown>): OrigemDaTabela | undefined {
  if (typeof busca.origem !== 'string') return undefined;
  const lida = ORIGEM.exec(busca.origem);
  if (!lida?.[1] || !lida[2]) return undefined;
  const tipo = lida[1] as TipoDaOrigem;
  return { tipo, id: lida[2], comOsDeDentro: tipo === 'local' && busca.dentro === true };
}

/** O valor de `origem` no endereço, como `local:<id>`. */
export const origemNoEndereco = ({ tipo, id }: Pick<OrigemDaTabela, 'tipo' | 'id'>) =>
  `${tipo}:${id}`;

/** A origem que o endereço guarda, só com o que é válido. */
export function origemDoEndereco(busca: Record<string, unknown>): OrigemNoEndereco {
  const origem = lerOrigem(busca);
  if (!origem) return {};
  return {
    origem: origemNoEndereco(origem),
    ...(origem.comOsDeDentro ? { dentro: true as const } : {}),
  };
}

/** O filtro da coluna da origem. */
export function filtroDaOrigem({ tipo, id, comOsDeDentro }: OrigemDaTabela): FiltroDaVisao {
  switch (tipo) {
    case 'local':
      return comOsDeDentro
        ? { chave: 'ativo.local', operador: 'em', local: id }
        : { chave: 'ativo.local', operador: 'igual', local: id };
    case 'pessoa':
      return { chave: 'ativo.responsavel', operador: 'qualquer', valores: [id] };
    case 'modelo':
      return { chave: 'ativo.modelo', operador: 'qualquer', valores: [id] };
    case 'tipo':
      return { chave: 'ativo.tipo', operador: 'qualquer', valores: [id] };
    case 'fornecedor':
      return { chave: 'ativo.fornecedor', operador: 'qualquer', valores: [id] };
  }
}

/** O que a origem diz e o que ela preenche no cadastro, pelo resumo do registro. */
export interface ResumoDaOrigem {
  /** A faixa da tabela, como "Ativos de Jundiaí › Expedição (vindo do local)". */
  descricao: string;
  /** O título do cadastro, como "Novo ativo em Expedição". */
  tituloDoCadastro: string;
  /** O tipo e o modelo escolhidos, e os valores e os nomes dos campos preenchidos. */
  preenchido: {
    tipoId?: string;
    modeloId?: string;
    valores: Record<string, string>;
    nomes: Record<string, string>;
  };
}

function resumir(origem: OrigemDaTabela, dados: unknown): ResumoDaOrigem {
  switch (origem.tipo) {
    case 'local': {
      const { caminho } = dados as ResumoDe<'local'>;
      return {
        descricao: `Ativos de ${caminho} (vindo do local)`,
        tituloDoCadastro: `Novo ativo em ${caminho.split(' › ').at(-1) ?? caminho}`,
        preenchido: { valores: { 'ativo.local': origem.id }, nomes: { [origem.id]: caminho } },
      };
    }
    case 'pessoa': {
      const { nome } = dados as ResumoDe<'pessoa'>;
      return {
        descricao: `Ativos sob responsabilidade de ${nome}`,
        tituloDoCadastro: `Novo ativo para ${nome}`,
        preenchido: { valores: { 'ativo.responsavel': origem.id }, nomes: { [origem.id]: nome } },
      };
    }
    case 'modelo': {
      const modelo = dados as ResumoDe<'modelo'>;
      const nome = `${modelo.fabricante} ${modelo.nome}`;
      return {
        descricao: `Ativos do modelo ${nome}`,
        tituloDoCadastro: `Novo ativo do modelo ${nome}`,
        preenchido: { tipoId: modelo.tipo.id, modeloId: origem.id, valores: {}, nomes: {} },
      };
    }
    case 'tipo': {
      const { nome } = dados as ResumoDe<'tipo'>;
      return {
        descricao: `Ativos do tipo ${nome}`,
        tituloDoCadastro: `Novo ativo do tipo ${nome}`,
        preenchido: { tipoId: origem.id, valores: {}, nomes: {} },
      };
    }
    case 'fornecedor': {
      const { nome } = dados as ResumoDe<'fornecedor'>;
      return {
        descricao: `Ativos do fornecedor ${nome}`,
        tituloDoCadastro: `Novo ativo do fornecedor ${nome}`,
        preenchido: { valores: { 'ativo.fornecedor': origem.id }, nomes: { [origem.id]: nome } },
      };
    }
  }
}

export type EstadoDaOrigem =
  | { estado: 'sem' }
  | { estado: 'carregando' }
  | { estado: 'indisponivel' }
  | { estado: 'pronta'; resumo: ResumoDaOrigem };

/** A origem pelo resumo do registro: a que a conta não vê, ou que não existe, fica indisponível. */
export function useOrigem(origem: OrigemDaTabela | undefined): EstadoDaOrigem {
  const consulta = useResumo(origem?.tipo ?? 'local', origem?.id ?? '', {
    buscar: origem !== undefined,
  });
  if (!origem) return { estado: 'sem' };
  if (consulta.isError) return { estado: 'indisponivel' };
  if (!consulta.data) return { estado: 'carregando' };
  return { estado: 'pronta', resumo: resumir(origem, consulta.data) };
}
