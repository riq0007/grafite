// O casamento de cada linha da planilha com um ativo (spec importacao-de-ativos, "Casamento com os
// ativos"; design do P1e, decisão 4): pelo patrimônio, depois pela série, depois pelo hostname,
// normalizados. A prévia e a tarefa usam o mesmo casamento, com os ativos que cada uma lê, e o
// ativo novo de uma linha entra no casamento das seguintes.
import { normalizarTexto } from '../texto.ts';

/** Um ativo da organização como o casamento o conhece. */
export interface AtivoNoIndice {
  id: string;
  tipoId: string;
  /** O nome do tipo, para a recusa do ativo de outro tipo. */
  tipo: string;
  /** O nome que o ativo mostra, para a recusa do ativo sem patrimônio. */
  nome: string;
  situacao: 'ativo' | 'inativo';
  patrimonio: string | null;
  serie: string | null;
  hostname: string | null;
}

/** O que a linha traz para o casamento: o texto das colunas de identificação, ou `null`. */
export interface IdentificacaoDaLinha {
  patrimonio: string | null;
  serie: string | null;
  hostname: string | null;
}

/** As chaves dos campos de identificação, para a recusa ir ao campo que casou. */
export type CampoDoCasamento = 'ativo.patrimonio' | 'ativo.serie' | 'ativo.hostname';

export type ResultadoDoCasamento =
  | { tipo: 'novo' }
  | { tipo: 'casado'; ativo: AtivoNoIndice }
  | { tipo: 'recusado'; campo: CampoDoCasamento; mensagem: string };

export interface Casamento {
  /** Casa a linha, pelo número dela na planilha, e lembra o ativo casado. */
  casar(linha: number, identificacao: IdentificacaoDaLinha): ResultadoDoCasamento;
  /** O ativo novo da linha entra no casamento das linhas seguintes. */
  acrescentar(linha: number, ativo: AtivoNoIndice): void;
  /** O ativo pelo patrimônio, para os campos do tipo ativo. */
  ativoPeloPatrimonio(patrimonio: string): AtivoNoIndice | undefined;
}

const chaveDe = (texto: string | null) => {
  const chave = texto === null ? '' : normalizarTexto(texto);
  return chave === '' ? null : chave;
};

function acrescentarNa(
  mapa: Map<string, AtivoNoIndice[]>,
  texto: string | null,
  ativo: AtivoNoIndice,
) {
  const chave = chaveDe(texto);
  if (chave === null) return;
  const lista = mapa.get(chave) ?? [];
  if (!lista.some((outro) => outro.id === ativo.id)) lista.push(ativo);
  mapa.set(chave, lista);
}

/** O casamento das linhas de uma importação do tipo dado, com os ativos da organização. */
export function criarCasamento(ativos: Iterable<AtivoNoIndice>, tipoId: string): Casamento {
  const porPatrimonio = new Map<string, AtivoNoIndice[]>();
  const porSerie = new Map<string, AtivoNoIndice[]>();
  const porHostname = new Map<string, AtivoNoIndice[]>();
  /** O ativo casado, ou criado, e a linha que o casou. */
  const casados = new Map<string, number>();

  const indexar = (ativo: AtivoNoIndice) => {
    acrescentarNa(porPatrimonio, ativo.patrimonio, ativo);
    acrescentarNa(porSerie, ativo.serie, ativo);
    acrescentarNa(porHostname, ativo.hostname, ativo);
  };
  for (const ativo of ativos) indexar(ativo);

  const PELO_CAMPO: readonly [
    CampoDoCasamento,
    Map<string, AtivoNoIndice[]>,
    keyof IdentificacaoDaLinha,
    string,
  ][] = [
    ['ativo.patrimonio', porPatrimonio, 'patrimonio', 'o patrimônio'],
    ['ativo.serie', porSerie, 'serie', 'a série'],
    ['ativo.hostname', porHostname, 'hostname', 'o hostname'],
  ];

  return {
    casar(linha, identificacao) {
      for (const [campo, mapa, chave, nomeDoCampo] of PELO_CAMPO) {
        const texto = identificacao[chave]?.trim() ?? '';
        const normalizado = chaveDe(texto);
        if (normalizado === null) continue;
        const achados = mapa.get(normalizado) ?? [];
        if (achados.length === 0) continue;
        if (achados.length > 1) {
          return {
            tipo: 'recusado',
            campo,
            mensagem: `Há mais de um ativo com ${nomeDoCampo} ${texto}: use o patrimônio.`,
          };
        }
        const [ativo] = achados as [AtivoNoIndice];
        const nome = ativo.patrimonio ?? ativo.nome;
        const anterior = casados.get(ativo.id);
        if (anterior !== undefined) {
          return { tipo: 'recusado', campo, mensagem: `A linha ${anterior} já muda este ativo.` };
        }
        if (ativo.tipoId !== tipoId) {
          return { tipo: 'recusado', campo, mensagem: `O ativo ${nome} é do tipo ${ativo.tipo}.` };
        }
        if (ativo.situacao !== 'ativo') {
          return {
            tipo: 'recusado',
            campo,
            mensagem: `O ativo ${nome} está inativo: reative-o antes de importar.`,
          };
        }
        casados.set(ativo.id, linha);
        return { tipo: 'casado', ativo };
      }
      return { tipo: 'novo' };
    },

    acrescentar(linha, ativo) {
      indexar(ativo);
      casados.set(ativo.id, linha);
    },

    ativoPeloPatrimonio(patrimonio) {
      const chave = chaveDe(patrimonio);
      return chave === null ? undefined : porPatrimonio.get(chave)?.[0];
    },
  };
}
