// A aba Software da ficha da máquina (spec inventario-pelo-agente, "Softwares na ficha do ativo";
// change software-por-pacote, design, decisão 13; m09 e m11): os mandados pelo Grafite, a fila do
// sem contato com o aviso da idade do inventário e os instalados frente à base, com a ação primeiro.
// Para quem só vê o ativo, só os instalados, pelo nome, com o editor.
import { normalizarTexto } from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaTabela,
  CampoDeTexto,
  Carimbo,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Icone,
  Linha,
  RotuloDeSituacao,
  type Situacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Rocket, RotateCw, Unplug } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import {
  CHAVE_DO_SOFTWARE,
  type InstaladoNaMaquina,
  type MandadoPeloGrafite,
  type SoftwareDaMaquina as Software,
  useSoftwareDaMaquina,
} from './consultas.ts';
import { nomeComVersao, plural } from './formatos.ts';
import { IconeDoPacote } from './Pecas.tsx';
import estilos from './SoftwareDaMaquina.module.css';

/** As linhas que a tabela mostra antes do "Mostrar os outros N". */
const LINHAS_A_VISTA = 10;
const UM_DIA = 86_400_000;
const NUMERO = new Intl.NumberFormat('pt-BR');

/** "38 programas", ou "3 de 38 programas" com a busca. */
function contagem(vistos: number, total: number): string {
  const nome = total === 1 ? 'programa' : 'programas';
  return vistos === total
    ? `${NUMERO.format(total)} ${nome}`
    : `${NUMERO.format(vistos)} de ${NUMERO.format(total)} ${nome}`;
}

/** O rótulo do mandado: "Falhou · 1603", "Concluída", "Instalando", "Na fila" ou "Tirada da fila". */
function rotuloDoMandado(mandado: MandadoPeloGrafite): { situacao: Situacao; texto: string } {
  switch (mandado.situacao.chave) {
    case 'falhou':
      return {
        situacao: 'critico',
        texto: mandado.codigo ? `Falhou · ${mandado.codigo.numero}` : 'Falhou',
      };
    case 'concluida':
      return { situacao: 'sucesso', texto: 'Concluída' };
    case 'em-andamento':
      return { situacao: 'info', texto: 'Instalando' };
    case 'aguardando':
      return { situacao: 'neutra', texto: 'Na fila' };
    default:
      return { situacao: 'neutra', texto: 'Tirada da fila' };
  }
}

type Comparacao = NonNullable<InstaladoNaMaquina['base']>['comparacao'];

const SITUACAO_FRENTE_A_BASE: Record<Comparacao, Situacao> = {
  'ha-na-base': 'atencao',
  'na-versao': 'sucesso',
  'sem-versao-alvo': 'neutra',
  'fora-da-base': 'neutra',
  'do-windows': 'neutra',
};

/** "hoje 09:13", "ontem 18:40" ou "19 out 19:03". */
function useMomento() {
  const { formatarDia, formatarHora, grupoDoDia } = useDataHora();
  return (valor: string, ligacao = '') => {
    const data = new Date(valor);
    const grupo = grupoDoDia(data, new Date());
    const dia =
      grupo === 'Hoje' || grupo === 'Ontem'
        ? grupo.toLowerCase()
        : formatarDia(data).split(' ').slice(1).join(' ');
    return `${dia}${ligacao ? ` ${ligacao}` : ''} ${formatarHora(data)}`;
  };
}

export function SoftwareDaMaquina({ ativoId }: { ativoId: string }) {
  const software = useSoftwareDaMaquina(ativoId);
  if (software.isPending) {
    return (
      <p role="status" className={estilos.nota}>
        Carregando o software…
      </p>
    );
  }
  if (software.isError) {
    return (
      <EstadoVazio
        titulo={software.error.message}
        acao={<Botao onPress={() => void software.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  const { instalados, inventariadoEm, agente, distribuir } = software.data;
  const semContato = agente?.semContato ?? null;
  const mandados = distribuir?.mandados ?? [];
  // Sem contato, os pedidos que aguardam a máquina vão para a fila de cima, com o "Tirar da fila".
  const naFila = semContato
    ? mandados.filter((mandado) => mandado.situacao.chave === 'aguardando')
    : [];
  const outros = mandados.filter((mandado) => !naFila.includes(mandado));
  return (
    <div className={estilos.aba}>
      {semContato && <AvisoDoInventario software={software.data} />}
      {naFila.length > 0 && <Fila mandados={naFila} />}
      {outros.length > 0 && <Mandados mandados={outros} />}
      <Instalados
        instalados={instalados}
        inventariadoEm={inventariadoEm}
        frenteABase={distribuir !== null}
      />
    </div>
  );
}

/** O aviso do sem contato (m11): a idade do inventário que a tabela mostra. */
function AvisoDoInventario({ software }: { software: Software }) {
  const { fuso, formatarHora } = useDataHora();
  const { inventariadoEm, agente } = software;
  let texto: ReactNode;
  if (inventariadoEm) {
    const data = new Date(inventariadoEm);
    const dias = Math.floor((Date.now() - data.getTime()) / UM_DIA);
    const dia = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: fuso,
    }).format(data);
    texto = (
      <>
        Inventário lido {dias > 0 ? `há ${plural(dias, 'dia', 'dias')}, em ` : 'em '}
        <span className={estilos.mono}>{dia}</span> às{' '}
        <span className={estilos.mono}>{formatarHora(data)}</span>: pode estar desatualizado.
      </>
    );
  } else {
    texto = `${agente?.semContato?.texto ?? 'Sem contato'}: o agente ainda não mandou o inventário.`;
  }
  return (
    <p className={estilos.aviso}>
      <Icone icone={Unplug} tamanho={16} />
      <span>{texto}</span>
    </p>
  );
}

/** "Tentar de novo" ou "Tirar da fila", com o aviso e a releitura do software. */
function AcaoDoMandado({
  mandado,
  acao,
}: {
  mandado: MandadoPeloGrafite;
  acao: 'tentar-de-novo' | 'tirar-da-fila';
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [ocupada, definirOcupada] = useState(false);
  const nome = nomeComVersao(mandado.pacote);
  async function agir() {
    definirOcupada(true);
    const caminho = {
      params: { path: { id: mandado.distribuicaoId, maquinaId: mandado.maquinaId } },
    };
    const resultado = await pedir(
      () =>
        acao === 'tentar-de-novo'
          ? api.POST('/software/distribuicoes/{id}/maquinas/{maquinaId}/tentar-de-novo', caminho)
          : api.POST('/software/distribuicoes/{id}/maquinas/{maquinaId}/tirar-da-fila', caminho),
      acao === 'tentar-de-novo' ? 'tentar de novo' : 'tirar da fila',
    );
    definirOcupada(false);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo:
        acao === 'tentar-de-novo'
          ? `${nome}: o pedido voltou a aguardar o agente.`
          : `${nome} saiu da fila.`,
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
  }
  return acao === 'tentar-de-novo' ? (
    <Botao
      nivel="terciario"
      icone={RotateCw}
      carregando={ocupada}
      rotuloCarregando="Pedindo de novo…"
      aria-label={`Tentar de novo o ${nome}`}
      onPress={() => void agir()}
    >
      Tentar de novo
    </Botao>
  ) : (
    <Botao
      carregando={ocupada}
      rotuloCarregando="Tirando da fila…"
      aria-label={`Tirar o ${nome} da fila`}
      onPress={() => void agir()}
    >
      Tirar da fila
    </Botao>
  );
}

/** "Esperando a máquina voltar" (m11): os pedidos que aguardam o agente sem contato. */
function Fila({ mandados }: { mandados: readonly MandadoPeloGrafite[] }) {
  const titulo = useId();
  const momento = useMomento();
  return (
    <section className={estilos.secao} aria-labelledby={titulo}>
      <div className={estilos.cabecaDaSecao}>
        <Carimbo id={titulo}>Esperando a máquina voltar</Carimbo>
      </div>
      <ul className={estilos.fila}>
        {mandados.map((mandado) => (
          <li key={`${mandado.distribuicaoId}-${mandado.maquinaId}`}>
            <IconeDoPacote nome={mandado.pacote.nome} tamanho="p" />
            <span className={estilos.textoDaFila}>
              <b>{nomeComVersao(mandado.pacote)}</b>
              <span>
                Desde <span className={estilos.mono}>{momento(mandado.criadaEm, 'às')}</span> · por{' '}
                {mandado.criadaPor}
              </span>
            </span>
            <RotuloDeSituacao situacao="neutra">Na fila</RotuloDeSituacao>
            <AcaoDoMandado mandado={mandado} acao="tirar-da-fila" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Mandados pelo Grafite" (m09): um cartão por distribuição que chegou à máquina. */
function Mandados({ mandados }: { mandados: readonly MandadoPeloGrafite[] }) {
  const titulo = useId();
  const momento = useMomento();
  return (
    <section className={estilos.secao} aria-labelledby={titulo}>
      <div className={estilos.cabecaDaSecao}>
        <Carimbo id={titulo}>Mandados pelo Grafite · {mandados.length}</Carimbo>
      </div>
      <ul className={estilos.mandados}>
        {mandados.map((mandado) => {
          const rotulo = rotuloDoMandado(mandado);
          const falhou = mandado.situacao.chave === 'falhou';
          return (
            <li
              key={`${mandado.distribuicaoId}-${mandado.maquinaId}`}
              data-falhou={falhou || undefined}
            >
              <b>{nomeComVersao(mandado.pacote)}</b>
              <span className={estilos.linhaDoMandado}>
                <RotuloDeSituacao situacao={rotulo.situacao}>{rotulo.texto}</RotuloDeSituacao>
                <span className={estilos.mono}>
                  {momento(mandado.terminadaEm ?? mandado.enviadaEm ?? mandado.criadaEm)}
                </span>
              </span>
              {falhou && mandado.codigo?.explicacao && (
                <span className={estilos.explicacao}>{mandado.codigo.explicacao}</span>
              )}
              <span className={estilos.porQuem}>
                por {mandado.criadaPor}
                {falhou && <AcaoDoMandado mandado={mandado} acao="tentar-de-novo" />}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Como o programa chegou à máquina: pelo Grafite, com quem mandou, com o Windows ou por fora. */
function ComoChegou({ instalado }: { instalado: InstaladoNaMaquina }) {
  const origem = instalado.base?.origem;
  if (origem) {
    return (
      <RotuloDeSituacao situacao="info" semIcone>
        <Icone icone={Rocket} tamanho={12} />
        Grafite · {origem.por}
      </RotuloDeSituacao>
    );
  }
  return <span>{instalado.doSistema ? 'Veio com o Windows' : 'Fora do Grafite'}</span>;
}

/** "Instalados, segundo o inventário": a busca, a contagem, a data e a tabela, com as 10 primeiras. */
function Instalados({
  instalados,
  inventariadoEm,
  frenteABase,
}: {
  instalados: readonly InstaladoNaMaquina[];
  inventariadoEm: string | null;
  frenteABase: boolean;
}) {
  const titulo = useId();
  const { formatarDataEHora } = useDataHora();
  const [busca, definirBusca] = useState('');
  const [todos, definirTodos] = useState(false);
  if (instalados.length === 0) {
    return (
      <EstadoVazio
        titulo="O agente do GLPI ainda não mandou a lista dos softwares desta máquina."
        descricao="A lista chega com o inventário do agente ligado a este ativo, em Administração › Agentes."
      />
    );
  }
  const termo = normalizarTexto(busca.trim());
  const achados = termo
    ? instalados.filter((instalado) =>
        normalizarTexto(`${instalado.nome} ${instalado.editor ?? ''}`).includes(termo),
      )
    : instalados;
  // O inventário pode trazer o mesmo programa duas vezes: a posição entra no id da linha.
  const vistos = (todos ? achados : achados.slice(0, LINHAS_A_VISTA)).map((instalado, posicao) => ({
    ...instalado,
    id: `${posicao}-${instalado.nome}`,
  }));
  const escondidos = achados.length - vistos.length;
  const vazio = <EstadoVazio titulo="Nenhum programa com essa busca." />;
  return (
    <section className={estilos.secao} aria-labelledby={titulo}>
      <div className={estilos.cabecaDaSecao}>
        <Carimbo id={titulo}>Instalados, segundo o inventário</Carimbo>
        <CampoDeTexto
          rotulo="Procurar"
          type="search"
          autoComplete="off"
          value={busca}
          onChange={definirBusca}
          className={estilos.busca}
        />
      </div>
      <p role="status" className={estilos.nota}>
        {contagem(achados.length, instalados.length)}
        {inventariadoEm && (
          <>
            , do inventário de{' '}
            <span className={estilos.mono}>{formatarDataEHora(new Date(inventariadoEm))}</span>
          </>
        )}
      </p>
      {frenteABase ? (
        <Tabela rotulo="Instalados, segundo o inventário">
          <CabecalhoDaTabela>
            <Coluna id="nome" principal>
              Programa
            </Coluna>
            <Coluna id="versao" especie="codigo">
              Versão
            </Coluna>
            <Coluna id="origem">Como chegou</Coluna>
            <Coluna id="base">Frente à base · ação primeiro</Coluna>
          </CabecalhoDaTabela>
          <CorpoDaTabela itens={vistos} vazio={vazio}>
            {(instalado) => (
              <Linha id={instalado.id}>
                <Celula>
                  <b className={estilos.forte}>{instalado.nome}</b>
                </Celula>
                <Celula>{instalado.versao ?? '—'}</Celula>
                <Celula>
                  <ComoChegou instalado={instalado} />
                </Celula>
                <Celula>
                  {instalado.base ? (
                    <RotuloDeSituacao
                      situacao={SITUACAO_FRENTE_A_BASE[instalado.base.comparacao]}
                      semIcone={instalado.base.comparacao !== 'ha-na-base'}
                    >
                      {instalado.base.texto}
                    </RotuloDeSituacao>
                  ) : (
                    '—'
                  )}
                </Celula>
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      ) : (
        <Tabela rotulo="Instalados, segundo o inventário">
          <CabecalhoDaTabela>
            <Coluna id="nome" principal>
              Programa
            </Coluna>
            <Coluna id="versao" especie="codigo">
              Versão
            </Coluna>
            <Coluna id="editor">Editor</Coluna>
          </CabecalhoDaTabela>
          <CorpoDaTabela itens={vistos} vazio={vazio}>
            {(instalado) => (
              <Linha id={instalado.id}>
                <Celula>
                  <b className={estilos.forte}>{instalado.nome}</b>
                </Celula>
                <Celula>{instalado.versao ?? '—'}</Celula>
                <Celula>{instalado.editor ?? '—'}</Celula>
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      )}
      {escondidos > 0 && (
        <Botao
          nivel="terciario"
          icone={ChevronDown}
          className={estilos.mostrar}
          onPress={() => definirTodos(true)}
        >
          {escondidos === 1 ? 'Mostrar o outro' : `Mostrar os outros ${NUMERO.format(escondidos)}`}
        </Botao>
      )}
    </section>
  );
}
