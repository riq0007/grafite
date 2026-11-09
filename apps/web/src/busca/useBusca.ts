// A busca global no app (design do F1b, decisões 2, 3 e 12): junta as entradas locais do registro
// e da casca, casa com o texto e roda os provedores dos módulos, cada um no seu executor.
import type { GrupoDaBusca, ResultadoDaBusca } from '@grafite/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClienteDaApi } from '../api/cliente.ts';
import type {
  ModuloRegistrado,
  PaginaDoProvedor,
  ProvedorDeBusca,
  ResultadoDoProvedor,
} from '../modulos/tipos.ts';
import type { AcaoDaTela } from './acoesDaTela.tsx';
import { buscarNasEntradas, semDestinoRepetido } from './casamento.ts';
import { entradasDoRegistro } from './fontes.ts';
import { criarExecutor, type EstadoDoProvedor, type ExecutorDoProvedor } from './provedores.ts';
import type { ContextoDaAcao, EntradaDeBusca } from './tipos.ts';

export interface OpcoesDaBusca {
  registro: readonly ModuloRegistrado[];
  /** O cliente da sessão, que os provedores usam para buscar no servidor. */
  api: ClienteDaApi;
  /** Entradas da própria casca, como abrir as notificações. */
  entradasDaCasca?: readonly EntradaDeBusca[];
  /** As ações da tela aberta, no grupo "Nesta tela". */
  acoesDaTela?: readonly AcaoDaTela[];
  aberta: boolean;
  termo: string;
  contexto: ContextoDaAcao;
}

interface ProvedorDoModulo {
  /** O módulo e a posição do provedor nele: um módulo pode ter vários. */
  chave: string;
  provedor: ProvedorDeBusca;
}

const SEM_ENTRADAS: readonly EntradaDeBusca[] = [];
const SEM_ACOES: readonly AcaoDaTela[] = [];

/** A ação da tela como entrada da busca, no grupo "Nesta tela". */
const daTela = (acao: AcaoDaTela): EntradaDeBusca => ({
  id: `tela:${acao.id}`,
  rotulo: acao.rotulo,
  grupo: 'nesta-tela',
  origem: 'declarada',
  palavrasChave: acao.palavrasChave,
  icone: acao.icone,
  executar: () => acao.executar(),
});

/** Os resultados de um provedor sempre como página: o total, quando ele não diz, é o que veio. */
const comoPagina = (resposta: ResultadoDoProvedor[] | PaginaDoProvedor): PaginaDoProvedor =>
  Array.isArray(resposta) ? { itens: resposta, total: resposta.length } : resposta;

const paraResultado = ({ id, rotulo, caminho, icone }: EntradaDeBusca): ResultadoDaBusca => ({
  id,
  rotulo,
  caminho,
  icone,
});

/** Id de um resultado de provedor na busca: único entre módulos e entradas locais. */
const idDoResultado = (chave: string, resultado: ResultadoDoProvedor) =>
  `${chave}:resultado:${resultado.id}`;

/** Id do "Ver todos os N" de um provedor. */
const idDoVerTodos = (chave: string) => `${chave}:ver-todos`;

/** O provedor mostra o "Ver todos" quando sabe a lista e acha mais que os mostrados. */
const comVerTodos = (provedor: ProvedorDeBusca, pagina: PaginaDoProvedor) =>
  provedor.verTodos !== undefined && pagina.total > pagina.itens.length;

function grupoDoProvedor(
  { chave, provedor }: ProvedorDoModulo,
  estado: EstadoDoProvedor<PaginaDoProvedor> | undefined,
): GrupoDaBusca[] {
  if (!estado || estado.tipo === 'ocioso') return [];
  const grupo = { id: `provedor:${chave}`, nome: provedor.grupo };
  if (estado.tipo !== 'pronto') return [{ ...grupo, estado: estado.tipo, resultados: [] }];
  const pagina = estado.resultados;
  return [
    {
      ...grupo,
      estado: 'pronto',
      resultados: [
        ...pagina.itens.map((resultado) => ({
          id: idDoResultado(chave, resultado),
          rotulo: resultado.rotulo,
          caminho: resultado.caminho,
        })),
        ...(comVerTodos(provedor, pagina)
          ? [
              {
                id: idDoVerTodos(chave),
                rotulo: `Ver todos os ${pagina.total.toLocaleString('pt-BR')} em ${provedor.grupo}`,
              },
            ]
          : []),
      ],
    },
  ];
}

/**
 * Os grupos da busca para o termo e a escolha de um resultado. Os locais vêm na hora; os dos
 * provedores, abaixo deles, quando os executores respondem.
 */
export function useBusca({
  registro,
  api,
  entradasDaCasca = SEM_ENTRADAS,
  acoesDaTela = SEM_ACOES,
  aberta,
  termo,
  contexto,
}: OpcoesDaBusca): { grupos: GrupoDaBusca[]; escolher: (id: string) => void } {
  const entradas = useMemo(() => {
    const nestaTela = acoesDaTela.map(daTela);
    // A ação da tela vale no lugar da entrada de mesmo nome, como "Novo ativo".
    const nomes = new Set(nestaTela.map((entrada) => entrada.rotulo));
    return [
      ...nestaTela,
      ...semDestinoRepetido([...entradasDoRegistro(registro), ...entradasDaCasca]).filter(
        (entrada) => !nomes.has(entrada.rotulo),
      ),
    ];
  }, [registro, entradasDaCasca, acoesDaTela]);
  const provedores = useMemo(
    () =>
      registro.flatMap((modulo): ProvedorDoModulo[] =>
        (modulo.busca?.provedores ?? []).map((provedor, posicao) => ({
          chave: `${modulo.id}:${posicao}`,
          provedor,
        })),
      ),
    [registro],
  );
  const [estados, definirEstados] = useState<Record<string, EstadoDoProvedor<PaginaDoProvedor>>>(
    {},
  );
  const executores = useRef(new Map<string, ExecutorDoProvedor>());

  useEffect(() => {
    const mapa = new Map<string, ExecutorDoProvedor>();
    for (const { chave, provedor } of provedores) {
      const aoMudar = (estado: EstadoDoProvedor<PaginaDoProvedor>) =>
        definirEstados((atuais) => ({ ...atuais, [chave]: estado }));
      const buscar = async (termo: string, sinal: AbortSignal) =>
        comoPagina(await provedor.buscar(termo, sinal, api));
      mapa.set(chave, criarExecutor(buscar, { aoMudar }));
    }
    executores.current = mapa;
    return () => {
      for (const executor of mapa.values()) executor.parar();
    };
  }, [provedores, api]);

  useEffect(() => {
    for (const executor of executores.current.values()) {
      if (aberta) executor.pedir(termo);
      else executor.parar();
    }
  }, [aberta, termo]);

  const grupos: GrupoDaBusca[] = [
    ...buscarNasEntradas(termo, entradas).map((grupo) => ({
      id: grupo.id,
      nome: grupo.nome,
      resultados: grupo.resultados.map(paraResultado),
    })),
    ...(aberta ? provedores.flatMap((item) => grupoDoProvedor(item, estados[item.chave])) : []),
  ];

  const escolher = (id: string) => {
    const entrada = entradas.find((candidata) => candidata.id === id);
    if (entrada?.destino) contexto.navegar(entrada.destino, entrada.foco);
    else if (entrada) entrada.executar?.(contexto);
    else {
      for (const { chave, provedor } of provedores) {
        const estado = estados[chave];
        if (estado?.tipo !== 'pronto') continue;
        if (id === idDoVerTodos(chave) && provedor.verTodos) {
          contexto.navegar(provedor.verTodos(estado.termo));
          continue;
        }
        const resultado = estado.resultados.itens.find((r) => idDoResultado(chave, r) === id);
        if (resultado) contexto.navegar(resultado.destino);
      }
    }
  };

  return { grupos, escolher };
}
