// O passo Máquinas do assistente da distribuição (change software-por-pacote, design, decisão 10;
// m03): quatro jeitos de escolher, por local, por visão, por busca e pela lista colada, que se somam
// no alvo; e as escolhidas uma a uma, para tirar alguma da lista. A conta fica no "Até agora".
import {
  itensDaListaColada,
  LIMITE_DA_LISTA_COLADA,
  MENSAGEM_DA_LISTA_COLADA,
  normalizarTexto,
} from '@grafite/domain';
import {
  AreaDeTexto,
  Botao,
  CabecalhoDaPagina,
  CampoDeTexto,
  Checkbox,
  ControleSegmentado,
  Icone,
  RotuloDeSituacao,
  Segmento,
  useDataHora,
} from '@grafite/ui';
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { type CSSProperties, type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import estilos from './Assistente.module.css';
import {
  type AlvoDoAssistente,
  type AlvosDaDistribuicao,
  type MaquinaDaPrevia,
  type PreviaDaDistribuicao,
  useAlvos,
  useMaquinasParaDistribuir,
} from './consultas.ts';
import { plural } from './formatos.ts';

type Modo = 'local' | 'visao' | 'busca' | 'lista';

const MODOS: readonly { modo: Modo; nome: string; filtro?: string }[] = [
  { modo: 'local', nome: 'Por local', filtro: 'Filtrar locais' },
  { modo: 'visao', nome: 'Por visão', filtro: 'Filtrar visões' },
  { modo: 'busca', nome: 'Por busca', filtro: 'Procurar máquinas' },
  { modo: 'lista', nome: 'Colar lista' },
];

/** Quanto a busca espera a digitação parar. */
const ESPERA_DA_BUSCA = 300;

/** Quantas máquinas não achadas da lista colada a tela nomeia. */
const NAO_ACHADAS_A_VISTA = 20;

const ordemAlfabetica = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

type Local = AlvosDaDistribuicao['locais'][number];
type Visao = AlvosDaDistribuicao['visoes'][number];

const nivel = (quantos: number) => ({ '--nivel': quantos }) as CSSProperties;

export function PassoDasMaquinas({
  alvo,
  definirAlvo,
  previa,
  versaoAlvo,
  tiradas,
  definirTiradas,
}: {
  alvo: AlvoDoAssistente;
  definirAlvo: Dispatch<SetStateAction<AlvoDoAssistente>>;
  previa: PreviaDaDistribuicao | undefined;
  versaoAlvo: string | null;
  tiradas: ReadonlyMap<string, MaquinaDaPrevia>;
  definirTiradas: Dispatch<SetStateAction<ReadonlyMap<string, MaquinaDaPrevia>>>;
}) {
  const { fuso } = useDataHora();
  const alvos = useAlvos(fuso);
  const [modo, definirModo] = useState<Modo>('local');
  const [filtros, definirFiltros] = useState<Record<Modo, string>>({
    local: '',
    visao: '',
    busca: '',
    lista: '',
  });
  const quantosNo: Record<Modo, number> = {
    local: alvo.locais.length,
    visao: alvo.visoes.length,
    busca: alvo.ativoIds.length,
    lista: itensDaListaColada(alvo.lista).length,
  };
  const doModo = MODOS.find((um) => um.modo === modo);
  const mudar = <Chave extends keyof AlvoDoAssistente>(
    chave: Chave,
    valor: AlvoDoAssistente[Chave],
  ) => definirAlvo((antes) => ({ ...antes, [chave]: valor }));
  const alternarNaLista = (maquina: MaquinaDaPrevia, fica: boolean) => {
    definirTiradas((antes) => {
      const depois = new Map(antes);
      if (fica) depois.delete(maquina.id);
      else depois.set(maquina.id, maquina);
      return depois;
    });
    definirAlvo((antes) => ({
      ...antes,
      fora: fica ? antes.fora.filter((id) => id !== maquina.id) : [...antes.fora, maquina.id],
    }));
  };
  const falhaDosAlvos = alvos.isError ? alvos.error.message : null;

  return (
    <>
      <CabecalhoDaPagina
        titulo="Em quais máquinas instalar?"
        detalhe="Marque locais ou visões inteiras. Só entram as máquinas que têm o agente do GLPI."
      />
      <div className={estilos.ferramentas}>
        <ControleSegmentado
          rotulo="Como escolher as máquinas"
          ocultarRotulo
          value={modo}
          onChange={(valor) => definirModo(valor as Modo)}
        >
          {MODOS.map(({ modo: chave, nome }) => (
            <Segmento key={chave} value={chave}>
              {nome}
              {quantosNo[chave] > 0 && (
                <span className={estilos.quantosNoModo}>{quantosNo[chave]}</span>
              )}
            </Segmento>
          ))}
        </ControleSegmentado>
        {doModo?.filtro && (
          <CampoDeTexto
            key={modo}
            rotulo={doModo.filtro}
            type="search"
            value={filtros[modo]}
            onChange={(texto) => definirFiltros((antes) => ({ ...antes, [modo]: texto }))}
            autoComplete="off"
            className={estilos.filtro}
          />
        )}
      </div>
      <div className={estilos.caixa}>
        {modo === 'local' ? (
          <ArvoreDosLocais
            locais={alvos.data?.locais ?? []}
            carregando={alvos.isPending}
            falha={falhaDosAlvos}
            marcados={alvo.locais}
            filtro={filtros.local}
            aoMudar={(locais) => mudar('locais', locais)}
          />
        ) : modo === 'visao' ? (
          <ListaDasVisoes
            visoes={alvos.data?.visoes ?? []}
            carregando={alvos.isPending}
            falha={falhaDosAlvos}
            marcadas={alvo.visoes}
            filtro={filtros.visao}
            aoMudar={(visoes) => mudar('visoes', visoes)}
          />
        ) : modo === 'busca' ? (
          <AchadasPelaBusca
            busca={filtros.busca}
            marcadas={alvo.ativoIds}
            aoMudar={(ativoIds) => mudar('ativoIds', ativoIds)}
          />
        ) : (
          <ListaColada
            lista={alvo.lista}
            naoAchados={previa?.naoAchados ?? []}
            aoUsar={(lista) => mudar('lista', lista)}
          />
        )}
        <UmaAUma
          previa={previa}
          versaoAlvo={versaoAlvo}
          fora={alvo.fora}
          tiradas={tiradas}
          aoAlternar={alternarNaLista}
        />
      </div>
    </>
  );
}

/**
 * Os locais em árvore, com a caixa de marcar e quantas máquinas com o agente cada ramo tem. Marcar um
 * local marca o ramo inteiro: os de dentro aparecem marcados, sem desmarcar, e saem da lista do alvo.
 */
function ArvoreDosLocais({
  locais,
  carregando,
  falha,
  marcados,
  filtro,
  aoMudar,
}: {
  locais: readonly Local[];
  carregando: boolean;
  falha: string | null;
  marcados: readonly string[];
  filtro: string;
  aoMudar: (locais: string[]) => void;
}) {
  const [fechados, definirFechados] = useState<ReadonlySet<string>>(new Set());
  if (carregando) {
    return (
      <p role="status" className={estilos.vazioDaCaixa}>
        Carregando os locais…
      </p>
    );
  }
  if (falha) {
    return (
      <p role="alert" className={estilos.vazioDaCaixa}>
        {falha}
      </p>
    );
  }
  if (locais.length === 0) {
    return <p className={estilos.vazioDaCaixa}>Nenhum local com máquinas com o agente do GLPI.</p>;
  }

  // A lista vem na ordem da árvore, com o pai antes dos filhos; o pai fora dela vira raiz.
  const porId = new Map(locais.map((local) => [local.id, local]));
  const acima = new Map<string, string[]>();
  for (const local of locais) {
    const pai = local.paiId !== null && porId.has(local.paiId) ? local.paiId : null;
    acima.set(local.id, pai ? [...(acima.get(pai) ?? []), pai] : []);
  }
  const acimaDe = (id: string) => acima.get(id) ?? [];
  const comFilhos = new Set(locais.flatMap((local) => acimaDe(local.id).slice(-1)));
  const marcadosAgora = new Set(marcados);
  const termo = normalizarTexto(filtro.trim());
  const comFiltro = termo !== '';
  // Com o filtro, os que casam e os de cima deles, todos abertos.
  const casam = comFiltro
    ? new Set(
        locais
          .filter((local) => normalizarTexto(local.nome).includes(termo))
          .flatMap((local) => [local.id, ...acimaDe(local.id)]),
      )
    : null;
  const vistos = locais.filter((local) =>
    casam ? casam.has(local.id) : !acimaDe(local.id).some((id) => fechados.has(id)),
  );
  if (vistos.length === 0) {
    return (
      <p role="status" className={estilos.vazioDaCaixa}>
        Nenhum local com esse nome.
      </p>
    );
  }

  const marcar = (id: string, marcado: boolean) =>
    aoMudar(
      marcado
        ? [...marcados.filter((outro) => !acimaDe(outro).includes(id)), id]
        : marcados.filter((outro) => outro !== id),
    );
  const alternarAberto = (id: string) =>
    definirFechados((antes) => {
      const depois = new Set(antes);
      if (depois.has(id)) depois.delete(id);
      else depois.add(id);
      return depois;
    });

  return (
    <ul className={estilos.linhas} aria-label="Locais">
      {vistos.map((local) => {
        const deCima = acimaDe(local.id);
        const coberto = deCima.some((id) => marcadosAgora.has(id));
        const marcado = coberto || marcadosAgora.has(local.id);
        const emParte = !marcado && marcados.some((outro) => acimaDe(outro).includes(local.id));
        const aberto = comFiltro || !fechados.has(local.id);
        return (
          <li
            key={local.id}
            className={estilos.no}
            style={nivel(deCima.length)}
            data-marcado={marcado || undefined}
          >
            {comFilhos.has(local.id) ? (
              <button
                type="button"
                className={estilos.abrir}
                aria-expanded={aberto}
                aria-label={`${aberto ? 'Recolher' : 'Abrir'} ${local.nome}`}
                disabled={comFiltro}
                onClick={() => alternarAberto(local.id)}
              >
                <Icone icone={aberto ? ChevronDown : ChevronRight} tamanho={14} />
              </button>
            ) : (
              <span />
            )}
            <Checkbox
              isSelected={marcado}
              isIndeterminate={emParte}
              isDisabled={coberto}
              onChange={(sim) => marcar(local.id, sim)}
            >
              {local.nome}
            </Checkbox>
            <span className={estilos.contagem}>
              {local.semContato > 0
                ? `${local.maquinas - local.semContato} com agente em dia · ${local.semContato} sem contato`
                : plural(local.maquinas, 'máquina', 'máquinas')}
            </span>
            <b className={estilos.quantas}>{local.maquinas}</b>
          </li>
        );
      })}
    </ul>
  );
}

/** As visões salvas da tabela do Ativos, as da organização e as da conta. */
function ListaDasVisoes({
  visoes,
  carregando,
  falha,
  marcadas,
  filtro,
  aoMudar,
}: {
  visoes: readonly Visao[];
  carregando: boolean;
  falha: string | null;
  marcadas: readonly string[];
  filtro: string;
  aoMudar: (visoes: string[]) => void;
}) {
  if (carregando) {
    return (
      <p role="status" className={estilos.vazioDaCaixa}>
        Carregando as visões…
      </p>
    );
  }
  if (falha) {
    return (
      <p role="alert" className={estilos.vazioDaCaixa}>
        {falha}
      </p>
    );
  }
  if (visoes.length === 0) {
    return (
      <p className={estilos.vazioDaCaixa}>
        Nenhuma visão salva. Salve uma visão na tabela do Ativos para escolher por ela.
      </p>
    );
  }
  const termo = normalizarTexto(filtro.trim());
  const vistas = visoes.filter((visao) => !termo || normalizarTexto(visao.nome).includes(termo));
  if (vistas.length === 0) {
    return (
      <p role="status" className={estilos.vazioDaCaixa}>
        Nenhuma visão com esse nome.
      </p>
    );
  }
  return (
    <ul className={estilos.linhas} aria-label="Visões">
      {vistas.map((visao) => {
        const marcada = marcadas.includes(visao.id);
        return (
          <li key={visao.id} className={estilos.no} data-marcado={marcada || undefined}>
            <span />
            <Checkbox
              isSelected={marcada}
              onChange={(sim) =>
                aoMudar(sim ? [...marcadas, visao.id] : marcadas.filter((id) => id !== visao.id))
              }
            >
              {visao.nome}
            </Checkbox>
            <span className={estilos.contagem}>
              {visao.compartilhada ? 'Da organização' : 'Só sua'}
            </span>
            <b className={estilos.quantas}>{visao.maquinas}</b>
          </li>
        );
      })}
    </ul>
  );
}

/** As máquinas com o agente pela busca: pelo nome, pelo patrimônio, pelo hostname ou pela pessoa. */
function AchadasPelaBusca({
  busca,
  marcadas,
  aoMudar,
}: {
  busca: string;
  marcadas: readonly string[];
  aoMudar: (ativoIds: string[]) => void;
}) {
  const [buscada, definirBuscada] = useState(busca.trim());
  useEffect(() => {
    const espera = setTimeout(() => definirBuscada(busca.trim()), ESPERA_DA_BUSCA);
    return () => clearTimeout(espera);
  }, [busca]);
  const maquinas = useMaquinasParaDistribuir(buscada);
  if (maquinas.isPending) {
    return (
      <p role="status" className={estilos.vazioDaCaixa}>
        Procurando as máquinas…
      </p>
    );
  }
  if (maquinas.isError) {
    return (
      <p role="alert" className={estilos.vazioDaCaixa}>
        {maquinas.error.message}
      </p>
    );
  }
  const achadas = maquinas.data.maquinas;
  if (achadas.length === 0) {
    return (
      <p role="status" className={estilos.vazioDaCaixa}>
        {buscada
          ? 'Nenhuma máquina com o agente achada com esse texto.'
          : 'Nenhuma máquina com o agente do GLPI nos seus locais.'}
      </p>
    );
  }
  return (
    <ul className={estilos.linhas} aria-label="Máquinas achadas">
      {achadas.map((maquina) => {
        const marcada = marcadas.includes(maquina.id);
        return (
          <li key={maquina.id} className={estilos.no} data-marcado={marcada || undefined}>
            <span />
            <Checkbox
              isSelected={marcada}
              onChange={(sim) =>
                aoMudar(
                  sim ? [...marcadas, maquina.id] : marcadas.filter((id) => id !== maquina.id),
                )
              }
            >
              <span className={estilos.mono}>{maquina.rotulo}</span>
            </Checkbox>
            <span className={estilos.contagem}>
              {maquina.patrimonio && (
                <>
                  <span className={estilos.mono}>{maquina.patrimonio}</span>
                  {' · '}
                </>
              )}
              {maquina.local ?? 'Sem local'}
            </span>
            {maquina.semContato ? (
              <RotuloDeSituacao situacao="atencao" semIcone>
                {maquina.semContato.texto}
              </RotuloDeSituacao>
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A lista colada, que só entra no alvo com "Usar a lista"; a prévia diz quais não achou. */
function ListaColada({
  lista,
  naoAchados,
  aoUsar,
}: {
  lista: string;
  naoAchados: readonly string[];
  aoUsar: (lista: string) => void;
}) {
  const [texto, definirTexto] = useState(lista);
  const itens = itensDaListaColada(texto);
  const demais = itens.length > LIMITE_DA_LISTA_COLADA;
  const aVista = naoAchados.slice(0, NAO_ACHADAS_A_VISTA).join(', ');
  const outras = naoAchados.length - NAO_ACHADAS_A_VISTA;
  return (
    <div className={estilos.colar}>
      <AreaDeTexto
        rotulo="Lista de máquinas"
        descricao="Nomes, patrimônios ou hostnames, um por linha ou separados por vírgula. Cole até 2.000 máquinas de uma vez."
        value={texto}
        onChange={definirTexto}
        erro={demais ? MENSAGEM_DA_LISTA_COLADA : undefined}
      />
      <div className={estilos.acoesDaLista}>
        <Botao
          isDisabled={itens.length === 0 || demais || texto === lista}
          onPress={() => aoUsar(texto)}
        >
          Usar a lista
        </Botao>
        {lista !== '' && (
          <Botao
            nivel="terciario"
            onPress={() => {
              definirTexto('');
              aoUsar('');
            }}
          >
            Limpar a lista
          </Botao>
        )}
        <span className={estilos.nota}>{plural(itens.length, 'item', 'itens')}</span>
      </div>
      {naoAchados.length > 0 && (
        <div className={estilos.aviso} data-tipo="atencao">
          <Icone icone={TriangleAlert} />
          <p>
            <b>{plural(naoAchados.length, 'não achada', 'não achadas')}:</b> {aVista}
            {outras > 0 ? `, e mais ${outras}` : ''}.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * As escolhidas uma a uma, no fim da caixa: desmarcar tira a máquina da lista (o `fora` do alvo), e
 * ela fica à vista, desmarcada, para voltar.
 */
function UmaAUma({
  previa,
  versaoAlvo,
  fora,
  tiradas,
  aoAlternar,
}: {
  previa: PreviaDaDistribuicao | undefined;
  versaoAlvo: string | null;
  fora: readonly string[];
  tiradas: ReadonlyMap<string, MaquinaDaPrevia>;
  aoAlternar: (maquina: MaquinaDaPrevia, fica: boolean) => void;
}) {
  const [aberta, definirAberta] = useState(false);
  const escolhidas = previa?.maquinas ?? [];
  const foraDaLista = [...tiradas.values()].filter(
    (maquina) => fora.includes(maquina.id) && !escolhidas.some((outra) => outra.id === maquina.id),
  );
  const todas = [...escolhidas, ...foraDaLista].sort((uma, outra) =>
    ordemAlfabetica.compare(uma.rotulo, outra.rotulo),
  );
  if (todas.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={estilos.umaAUma}
        aria-expanded={aberta}
        onClick={() => definirAberta((antes) => !antes)}
      >
        <Icone icone={aberta ? ChevronDown : ChevronRight} tamanho={14} />
        <span>
          {escolhidas.length === 1
            ? 'Ver a máquina escolhida'
            : `Ver as ${escolhidas.length} máquinas uma a uma`}
        </span>
        {foraDaLista.length > 0 && (
          <span className={estilos.contagem}>
            {plural(foraDaLista.length, 'tirada', 'tiradas')} da lista
          </span>
        )}
      </button>
      {aberta && (
        <ul className={estilos.linhas} aria-label="Máquinas escolhidas">
          {todas.map((maquina) => {
            const fica = !fora.includes(maquina.id);
            return (
              <li key={maquina.id} className={estilos.no} style={nivel(1)}>
                <span />
                <Checkbox isSelected={fica} onChange={(sim) => aoAlternar(maquina, sim)}>
                  <span className={estilos.mono}>{maquina.rotulo}</span>
                </Checkbox>
                <span className={estilos.contagem}>
                  {[maquina.local ?? 'Sem local', maquina.semContato?.texto]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {!fica ? (
                  <RotuloDeSituacao situacao="neutra" semIcone>
                    Fora da lista
                  </RotuloDeSituacao>
                ) : maquina.classe === 'vai-instalar' ? (
                  <RotuloDeSituacao situacao="sucesso" semIcone>
                    Vai instalar
                  </RotuloDeSituacao>
                ) : maquina.classe === 'pulada' ? (
                  <RotuloDeSituacao situacao="neutra" semIcone>
                    {versaoAlvo ? `Já tem a ${versaoAlvo}` : 'Pulada'}
                  </RotuloDeSituacao>
                ) : (
                  <RotuloDeSituacao situacao="atencao" semIcone>
                    Na fila
                  </RotuloDeSituacao>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
