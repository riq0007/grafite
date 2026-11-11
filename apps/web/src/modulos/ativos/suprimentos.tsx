// Os suprimentos das impressoras nas telas dos ativos (spec impressoras-por-snmp, "Painel
// Suprimentos", "Nível dos suprimentos", "Contadores de páginas" e "Condições do equipamento";
// changes p2b-impressoras-por-snmp, design, decisão 10, e suprimentos-rostos-e-backups, decisões 3 a
// 5). Cada estado é texto: a resposta do SNMP, com a idade e o "Desatualizado" depois de 3
// intervalos; cada suprimento como cartucho, na tinta tirada da descrição, com a estimativa de quando
// acaba e nunca um percentual que a impressora não mediu; as condições com a severidade em texto. Sem
// leitura, o painel diz "Não verificado", com o motivo.
import type { components } from '@grafite/api-client';
import {
  estimarFimDoSuprimento,
  type PontoDoSuprimento,
  ROTULOS_DOS_TIPOS_DE_SUPRIMENTO,
  TIPOS_DE_SUPRIMENTO,
  type TipoDeSuprimento,
  tintaDoSuprimento,
} from '@grafite/domain';
import {
  Cartucho,
  type ItemDaArvore,
  Medidor,
  NOMES_DAS_TINTAS,
  RotuloDeSituacao,
  type Situacao,
  useDataHora,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';
import { useLocaisAtivos } from '../administracao/seletores/SeletorDeLocal.tsx';
import { escolhasDa, numeroDa } from '../inicio/opcoes.ts';
import type { OpcaoDoBloco, OpcoesResolvidas } from '../tipos.ts';
import estilos from './Ativos.module.css';
import { CHAVE_DOS_ATIVOS } from './consultas.ts';
import { IdadeEDesatualizado, LeituraNaCelula } from './disponibilidade.tsx';

export type PainelDeSuprimentos = components['schemas']['SuprimentosDoAtivo'];
type NaLista = components['schemas']['SuprimentosNaLista'];

/** As colunas dos suprimentos na tabela dos ativos (domínio, capacidade `snmp.suprimentos`). */
export const COLUNA_DOS_SUPRIMENTOS = 'coleta.suprimentos';
export const COLUNA_DAS_PAGINAS = 'coleta.paginas';
type Resposta = NonNullable<PainelDeSuprimentos['resposta']>;

const RESPOSTAS: Record<Resposta['situacao'], { rotulo: string; situacao: Situacao }> = {
  respondeu: { rotulo: 'Respondeu', situacao: 'sucesso' },
  'nao-respondeu': { rotulo: 'Não respondeu', situacao: 'critico' },
  'sem-dado': { rotulo: 'Sem dado', situacao: 'atencao' },
};

const SEVERIDADES = {
  atencao: 'Atenção',
  critico: 'Crítico',
} as const;

const paginas = (valor: number) => valor.toLocaleString('pt-BR');

/** O menor nível em texto, como a tabela o copia: "8% · Black Toner Cartridge". */
export const textoDosSuprimentos = (suprimentos: NaLista | null | undefined) =>
  suprimentos?.menor ? `${suprimentos.menor.nivel}% · ${suprimentos.menor.descricao}` : null;

/** O total de páginas em texto, com os milhares. */
export const textoDasPaginas = (suprimentos: NaLista | null | undefined) =>
  suprimentos?.total ? paginas(suprimentos.total.paginas) : null;

/** O menor nível na célula: o medidor compacto na tinta, o número em mono, o suprimento e a idade. */
export function SuprimentosNaCelula({
  menor,
  agora,
}: {
  menor: NonNullable<NaLista['menor']>;
  agora: Date;
}) {
  return (
    <LeituraNaCelula
      fixo={
        <>
          <span className={estilos.medidorNaCelula}>
            <Medidor
              rotulo={`Menor nível: ${menor.descricao}`}
              valor={menor.nivel}
              tinta={tintaDoSuprimento(menor.descricao) ?? 'neutra'}
              tamanho="compacto"
              marcas={[]}
              semNumero
            />
          </span>
          <span className="mono">{`${menor.nivel}%`}</span>
        </>
      }
      momento={menor.momento}
      agora={agora}
      metrica="impressora.suprimento"
    >
      <span>{menor.descricao}</span>
    </LeituraNaCelula>
  );
}

/** O total de páginas na célula, em mono, com a idade da leitura. */
export function PaginasNaCelula({
  total,
  agora,
}: {
  total: NonNullable<NaLista['total']>;
  agora: Date;
}) {
  return (
    <LeituraNaCelula
      fixo={<span className="mono">{paginas(total.paginas)}</span>}
      momento={total.momento}
      agora={agora}
      metrica="impressora.contador"
    />
  );
}

type SerieDosSuprimentos = components['schemas']['SerieDosSuprimentos'];

/**
 * A série dos suprimentos do ativo, para a estimativa de quando acaba (change
 * suprimentos-rostos-e-backups, design, decisão 3). Ela muda uma vez por dia; sem ela, não há
 * estimativa, e o painel continua igual.
 */
function useSerieDosSuprimentos(ativoId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['suprimentos-serie', ativoId],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/suprimentos/serie', { params: { path: { id: ativoId } } }),
        'carregar a série dos suprimentos',
      ),
    staleTime: 10 * 60_000,
  });
}

/** Os pontos de um suprimento na série, como o domínio estima. */
const pontosDoItem = (serie: SerieDosSuprimentos | undefined, item: string): PontoDoSuprimento[] =>
  (serie?.itens.find((doItem) => doItem.item === item)?.pontos ?? []).map((ponto) => ({
    momento: new Date(ponto.momento),
    percentual: ponto.percentual,
  }));

/** A estimativa escrita como estimativa: "Acaba em cerca de 13 dias". */
export function textoDaEstimativa(dias: number): string {
  if (dias < 1) return 'Pode acabar hoje';
  return `Acaba em cerca de ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** Um bloco do painel, com o título dele. */
function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className={estilos.blocoDoPainel}>
      <h3 className={estilos.tituloDaParte}>{titulo}</h3>
      {children}
    </div>
  );
}

/**
 * O painel Suprimentos na ficha: a resposta do SNMP, com a idade, desde quando e o coletor; os
 * suprimentos na ordem da impressora; os contadores, com o preto e branco; as condições e as
 * mensagens do fabricante. Sem leitura, o motivo.
 */
export function SuprimentosNaFicha({
  ativoId,
  painel,
  agora,
}: {
  ativoId: string;
  painel: PainelDeSuprimentos;
  agora: Date;
}) {
  const { formatarDataEHora, formatarData } = useDataHora();
  const serie = useSerieDosSuprimentos(ativoId);
  const { resposta } = painel;
  const daResposta = resposta ? RESPOSTAS[resposta.situacao] : null;
  return (
    // O título é o do cartão da capacidade (change ficha-em-cartoes): a parte só leva o nome.
    <section className={estilos.parte} aria-label="Suprimentos">
      <dl className={estilos.dadosDaColeta}>
        <div>
          <dt>Resposta do SNMP</dt>
          <dd className={estilos.disponibilidade}>
            {resposta && daResposta ? (
              <>
                <RotuloDeSituacao situacao={daResposta.situacao}>
                  {daResposta.rotulo}
                </RotuloDeSituacao>
                <IdadeEDesatualizado
                  momento={resposta.momento}
                  agora={agora}
                  metrica="snmp.resposta"
                />
              </>
            ) : (
              <RotuloDeSituacao situacao="neutra">Não verificado</RotuloDeSituacao>
            )}
          </dd>
        </div>
        {resposta && daResposta && (
          <div>
            <dt>Desde</dt>
            <dd>{`${daResposta.rotulo} desde ${formatarDataEHora(new Date(resposta.desde))}`}</dd>
          </div>
        )}
        {resposta?.coletor && (
          <div>
            <dt>Coletor</dt>
            <dd>{resposta.coletor}</dd>
          </div>
        )}
        {painel.motivo && (
          <div>
            <dt>Motivo</dt>
            <dd>{painel.motivo}</dd>
          </div>
        )}
      </dl>
      {resposta && (
        <>
          {painel.suprimentos.length === 0 ? (
            <p className={estilos.informacao}>Nenhum suprimento informado.</p>
          ) : (
            <ul aria-label="Níveis dos suprimentos" className={estilos.cartuchos}>
              {painel.suprimentos.map((suprimento) => {
                const tinta =
                  suprimento.tipo === 'toner' ? tintaDoSuprimento(suprimento.descricao) : null;
                const estimativa =
                  suprimento.nivel.tipo === 'medido'
                    ? estimarFimDoSuprimento(pontosDoItem(serie.data, suprimento.item))
                    : null;
                return (
                  <li
                    key={suprimento.item}
                    className={estilos.suprimento}
                    title={`${ROTULOS_DOS_TIPOS_DE_SUPRIMENTO[suprimento.tipo]} · ${suprimento.descricao}`}
                  >
                    <Cartucho
                      nome={
                        tinta
                          ? NOMES_DAS_TINTAS[tinta]
                          : ROTULOS_DOS_TIPOS_DE_SUPRIMENTO[suprimento.tipo]
                      }
                      tinta={tinta}
                      nivel={suprimento.nivel}
                      {...(estimativa && {
                        estimativa: `${textoDaEstimativa(estimativa.dias)}, pelas leituras desde ${formatarData(estimativa.desde)}`,
                      })}
                    />
                    <span className={estilos.descricaoDoSuprimento}>{suprimento.descricao}</span>
                    <span className={estilos.disponibilidade}>
                      <IdadeEDesatualizado
                        momento={suprimento.momento}
                        agora={agora}
                        metrica="impressora.suprimento"
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Bloco titulo="Contadores">
            {painel.contadores.length === 0 ? (
              <p className={estilos.informacao}>Nenhum contador informado.</p>
            ) : (
              <dl className={estilos.dadosDaColeta}>
                {painel.contadores.map((contador) => (
                  <div key={contador.item}>
                    <dt>{contador.rotulo}</dt>
                    <dd className={estilos.disponibilidade}>
                      {contador.paginas !== null && (
                        <span className="mono">{paginas(contador.paginas)}</span>
                      )}
                      {contador.inconsistente && (
                        <RotuloDeSituacao situacao="atencao">Inconsistente</RotuloDeSituacao>
                      )}
                    </dd>
                  </div>
                ))}
                {painel.paginasEmPretoEBranco !== null && (
                  <div>
                    <dt>Páginas em preto e branco</dt>
                    <dd className="mono">{paginas(painel.paginasEmPretoEBranco)}</dd>
                  </div>
                )}
              </dl>
            )}
          </Bloco>
          <Bloco titulo="Condições">
            {!painel.condicoes || painel.condicoes.itens.length === 0 ? (
              <p className={estilos.informacao}>Nenhuma condição informada.</p>
            ) : (
              <ul className={estilos.listaDoPainel}>
                {painel.condicoes.itens.map((condicao) => (
                  <li key={condicao.chave}>
                    <span>{condicao.rotulo}</span>
                    <RotuloDeSituacao situacao={condicao.severidade}>
                      {SEVERIDADES[condicao.severidade]}
                    </RotuloDeSituacao>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>
          <Bloco titulo="Mensagens do fabricante">
            {!painel.mensagens || painel.mensagens.itens.length === 0 ? (
              <p className={estilos.informacao}>Nenhuma mensagem do fabricante.</p>
            ) : (
              <ul className={estilos.listaDoPainel}>
                {painel.mensagens.itens.map((mensagem, indice) => (
                  // As mensagens podem se repetir; a posição as distingue.
                  // biome-ignore lint/suspicious/noArrayIndexKey: a lista é só leitura e não muda de ordem.
                  <li key={indice}>{mensagem}</li>
                ))}
              </ul>
            )}
          </Bloco>
        </>
      )}
    </section>
  );
}

type MenorSuprimento = components['schemas']['MenoresSuprimentos']['itens'][number];

/** Os tipos nas opções do bloco e no recorte, com "Outros" no plural. */
const NOMES_DOS_TIPOS: Record<TipoDeSuprimento, string> = {
  ...ROTULOS_DOS_TIPOS_DE_SUPRIMENTO,
  outro: 'Outros',
};

/**
 * As opções do bloco "Suprimentos que acabam primeiro" (spec tela-inicial; change
 * opcoes-dos-blocos-do-inicio, design, decisão 5): os tipos que entram, os locais, quantas
 * impressoras e até que nível. De fábrica, os quatro tipos, todos os locais, 6 impressoras e 100%,
 * que não corta nada.
 */
export const OPCOES_DOS_SUPRIMENTOS: readonly OpcaoDoBloco[] = [
  {
    chave: 'tipos',
    rotulo: 'Tipos de suprimento',
    forma: 'escolhas',
    opcoes: TIPOS_DE_SUPRIMENTO.map((id) => ({ id, rotulo: NOMES_DOS_TIPOS[id] })),
    padrao: TIPOS_DE_SUPRIMENTO,
    minimo: 1,
  },
  { chave: 'locais', rotulo: 'Locais', forma: 'locais' },
  { chave: 'limite', rotulo: 'Impressoras', forma: 'numero', minimo: 3, maximo: 12, padrao: 6 },
  {
    chave: 'nivel',
    rotulo: 'Nível até',
    forma: 'numero',
    minimo: 5,
    maximo: 100,
    passo: 5,
    unidade: '%',
    padrao: 100,
  },
];

/** "Toner", "Toner e Fusor" ou "Toner, Cilindro e Fusor". */
function emLista(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

/** O nome de cada local da árvore, pelo id. */
function nomesDosLocais(itens: readonly ItemDaArvore[], nomes = new Map<string, string>()) {
  for (const item of itens) {
    nomes.set(item.id, item.rotulo);
    nomesDosLocais(item.filhos ?? [], nomes);
  }
  return nomes;
}

/**
 * O recorte em texto (design, decisão 6): só o que difere da fábrica, na ordem dos tipos, do nível
 * e dos locais, com " · " entre eles, como "Toner · até 30% · Jundiaí". Com mais de dois locais,
 * diz os dois primeiros e "e mais N". Enquanto os nomes dos locais não chegam, diz quantos são.
 */
export function textoDoRecorte(
  { tipos, nivel, locais }: { tipos: readonly string[]; nivel: number; locais: readonly string[] },
  nomeDoLocal: (id: string) => string | undefined,
): string {
  const partes: string[] = [];
  if (tipos.length < TIPOS_DE_SUPRIMENTO.length) {
    partes.push(emLista(tipos.map((tipo) => NOMES_DOS_TIPOS[tipo as TipoDeSuprimento] ?? tipo)));
  }
  if (nivel < 100) partes.push(`até ${nivel}%`);
  if (locais.length > 0) {
    const nomes = locais.flatMap((id) => nomeDoLocal(id) ?? []);
    if (nomes.length < locais.length) {
      partes.push(locais.length === 1 ? '1 local' : `${locais.length} locais`);
    } else if (nomes.length > 2) {
      partes.push(`${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`);
    } else {
      partes.push(emLista(nomes));
    }
  }
  return partes.join(' · ');
}

/** Uma impressora na prateleira: o cartucho do suprimento, o nome e a estimativa, até a ficha. */
function SuprimentoQueAcaba({ ativo, suprimento }: MenorSuprimento) {
  const serie = useSerieDosSuprimentos(ativo.id);
  const tinta = suprimento.tipo === 'toner' ? tintaDoSuprimento(suprimento.descricao) : null;
  const estimativa = estimarFimDoSuprimento(pontosDoItem(serie.data, suprimento.item));
  return (
    <li className={estilos.naPrateleira}>
      <Link to="/ativos/$id" params={{ id: ativo.id }} className={estilos.linkDaPrateleira}>
        <Cartucho
          nome={tinta ? NOMES_DAS_TINTAS[tinta] : ROTULOS_DOS_TIPOS_DE_SUPRIMENTO[suprimento.tipo]}
          tinta={tinta}
          nivel={{ tipo: 'medido', percentual: suprimento.nivel }}
          {...(estimativa && { estimativa: textoDaEstimativa(estimativa.dias) })}
        />
        <span className={estilos.nomeNaPrateleira}>{ativo.rotulo}</span>
        <span className={estilos.descricaoDoSuprimento}>{suprimento.descricao}</span>
      </Link>
    </li>
  );
}

/**
 * O bloco "Suprimentos que acabam primeiro" do Início (spec tela-inicial; changes inicio-ajustavel,
 * design, decisão 5, e opcoes-dos-blocos-do-inicio, decisões 5 e 6): as impressoras de menor nível
 * no recorte das opções da conta, numa prateleira de cartuchos. O servidor escolhe o suprimento de
 * menor nível de cada impressora entre os tipos pedidos, com o escopo de quem vê. O recorte que
 * difere da fábrica aparece em texto, antes da prateleira.
 */
export function SuprimentosQueAcabam({ opcoes }: { opcoes: OpcoesResolvidas }) {
  const api = useApi();
  const tipos = escolhasDa(opcoes, 'tipos');
  const locais = escolhasDa(opcoes, 'locais');
  const limite = numeroDa(opcoes, 'limite');
  const nivel = numeroDa(opcoes, 'nivel');
  const lista = useQuery({
    queryKey: [...CHAVE_DOS_ATIVOS, 'suprimentos-que-acabam', { tipos, locais, limite, nivel }],
    queryFn: () =>
      consultar(
        () =>
          api.GET('/ativos/suprimentos/menores', {
            params: {
              query: {
                tipos: tipos.join(','),
                ...(locais.length > 0 && { locais: locais.join(',') }),
                limite,
                nivel,
              },
            },
          }),
        'carregar os suprimentos',
      ),
    refetchInterval: 60_000,
  });
  // Os nomes dos locais do recorte: só são pedidos com algum local escolhido.
  const dosLocais = useLocaisAtivos(locais.length > 0);
  const nomes = useMemo(() => nomesDosLocais(dosLocais?.itens ?? []), [dosLocais]);
  const recorte = textoDoRecorte({ tipos, nivel, locais }, (id) => nomes.get(id));
  return (
    <>
      {recorte && <p className={estilos.recorte}>{recorte}</p>}
      {lista.isPending ? (
        <p role="status" className={estilos.informacao}>
          Carregando os suprimentos…
        </p>
      ) : lista.isError ? (
        <p className={estilos.informacao}>Não foi possível carregar os suprimentos.</p>
      ) : lista.data.itens.length === 0 ? (
        <p className={estilos.informacao}>
          {recorte ? 'Nenhuma impressora neste recorte.' : 'Nenhuma impressora com o nível lido.'}
        </p>
      ) : (
        <ul aria-label="Suprimentos que acabam primeiro" className={estilos.prateleira}>
          {lista.data.itens.map((impressora) => (
            <SuprimentoQueAcaba key={impressora.ativo.id} {...impressora} />
          ))}
        </ul>
      )}
    </>
  );
}
