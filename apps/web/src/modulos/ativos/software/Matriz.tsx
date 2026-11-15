// A matriz do software (spec distribuicao-de-software, "Matriz do software"; change
// software-por-pacote, design, decisões 12 e 14; m06 e m07): os pacotes ativos frente às máquinas de
// um local, com a marcação que leva ao assistente, ou frente aos locais, com o painel da célula à
// direita; e o "Exportar", que grava no navegador o que a tela mostra.
import { normalizarTexto } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CampoDeTexto,
  Carimbo,
  ControleSegmentado,
  Dica,
  EstadoVazio,
  RotuloDeSituacao,
  Segmento,
  Selecao,
  type Situacao,
  useDataHora,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Download, Rocket } from 'lucide-react';
import { type CSSProperties, useId, useState } from 'react';
import {
  type MatrizPorLocal,
  type MatrizPorMaquina,
  type PacoteDeSoftware,
  useMatrizPorLocal,
  useMatrizPorMaquina,
} from './consultas.ts';
import { type CelulaDoCsv, gravarCsv } from './csv.ts';
import { nomeComVersao, plural, tipoETamanho } from './formatos.ts';
import estilos from './Matriz.module.css';
import { IconeDoPacote } from './Pecas.tsx';

/** O endereço da matriz: por local, ou por máquina de um local. */
export interface PedidoDaMatriz {
  por?: 'local';
  local?: string;
}

export function lerPedidoDaMatriz(busca: Record<string, unknown>): PedidoDaMatriz {
  const pedido: PedidoDaMatriz = {};
  if (busca.por === 'local') pedido.por = 'local';
  if (typeof busca.local === 'string' && busca.local !== '') pedido.local = busca.local;
  return pedido;
}

type CelulaDaMaquina = MatrizPorMaquina['celulas'][number];
type MaquinaDaMatriz = MatrizPorMaquina['maquinas'][number];
type LocalDaMatriz = MatrizPorLocal['locais'][number];

/** As células marcadas: todas de um pacote, num local. */
interface Marcacao {
  local: string;
  pacoteId: string;
  ativoIds: readonly string[];
}

const chave = (pacoteId: string, outro: string) => `${pacoteId}:${outro}`;
const soma = (numeros: readonly number[]) => numeros.reduce((total, numero) => total + numero, 0);

/** "a, b e c". */
function emLista(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

/** Na versão-alvo; no pacote sem versão-alvo, com o programa. */
const naVersao = (celula: CelulaDaMaquina | undefined) =>
  celula?.situacao === 'na-versao' || celula?.situacao === 'instalado-sem-alvo';

/** O que a conta do "Por local" diz: no pacote sem versão-alvo, com e sem o programa. */
const daConta = (pacote: { versao: string | null }) =>
  pacote.versao
    ? { dentro: 'na versão-alvo', fora: 'fora da versão-alvo' }
    : { dentro: 'com o programa', fora: 'sem o programa' };

/** O que a célula mostra: a versão, "↓ <versão>" ou "Falta". */
function textoDaCelula(celula: CelulaDaMaquina | undefined): string {
  if (!celula || celula.situacao === 'sem-o-programa') return 'Falta';
  if (celula.situacao === 'desatualizada') return `↓ ${celula.versao ?? ''}`.trim();
  return celula.versao ?? 'Instalado';
}

/** A situação da célula em palavras, para o leitor de tela e o CSV. */
function situacaoDaCelula(celula: CelulaDaMaquina | undefined): string {
  if (!celula || celula.situacao === 'sem-o-programa') return 'falta';
  if (celula.situacao === 'desatualizada')
    return `${celula.versao ?? 'sem versão'}, abaixo da versão-alvo`;
  if (celula.situacao === 'na-versao')
    return `${celula.versao ?? ''}, na versão-alvo`.replace(/^, /, '');
  return celula.versao ?? 'instalado';
}

/** A célula no CSV: a versão, a versão com "(abaixo da versão-alvo)" ou "Falta". */
function csvDaCelula(celula: CelulaDaMaquina | undefined): string {
  if (!celula || celula.situacao === 'sem-o-programa') return 'Falta';
  if (celula.situacao === 'desatualizada') {
    return `${celula.versao ?? 'Sem versão'} (abaixo da versão-alvo)`;
  }
  return celula.versao ?? 'Instalado';
}

/** A dica da célula: a máquina, a pessoa, a versão e a distribuição em andamento ou a que falhou. */
function dicaDaCelula(
  maquina: MaquinaDaMatriz,
  pacote: PacoteDeSoftware,
  celula: CelulaDaMaquina | undefined,
): string {
  const partes = [
    `${maquina.rotulo}${maquina.pessoa ? ` · ${maquina.pessoa}` : ''}.`,
    celula?.versao ? `${pacote.nome} ${celula.versao}.` : `Sem o ${pacote.nome}.`,
  ];
  const { distribuicao } = celula ?? {};
  if (distribuicao?.situacao === 'falhou') {
    partes.push(
      `A instalação${pacote.versao ? ` da ${pacote.versao}` : ''} falhou${distribuicao.codigo !== null ? ` com o código ${distribuicao.codigo}` : ''}.`,
    );
  } else if (distribuicao) {
    partes.push(`${distribuicao.texto}.`);
  }
  if (maquina.semContato) partes.push(`${maquina.semContato.texto}.`);
  return partes.join(' ');
}

export function Matriz() {
  const pedido = useSearch({ from: '/gestao/software/matriz' });
  const navegar = useNavigate();
  const [filtro, definirFiltro] = useState('');
  const [marcacao, definirMarcacao] = useState<Marcacao | null>(null);
  const [escolhida, definirEscolhida] = useState<{ pacoteId: string; localId: string } | null>(
    null,
  );
  const porLocal = useMatrizPorLocal();
  const por = pedido.por ?? 'maquina';
  const locais = porLocal.data?.locais ?? [];
  const localId = pedido.local ?? locais[0]?.id ?? null;
  const porMaquina = useMatrizPorMaquina(por === 'maquina' ? localId : null);
  const ir = (novo: PedidoDaMatriz) =>
    void navegar({ to: '/gestao/software/matriz', search: novo, replace: true });
  const distribuir = (pacoteId: string, maquinas: readonly string[], local: string) =>
    void navegar({
      to: '/gestao/software/distribuicoes/nova',
      search: { pacote: pacoteId, maquinas: [...maquinas], local },
    });

  const busca = normalizarTexto(filtro.trim());
  const filtrar = (pacotes: readonly PacoteDeSoftware[]) =>
    busca ? pacotes.filter((pacote) => normalizarTexto(pacote.nome).includes(busca)) : pacotes;
  const matriz = por === 'local' ? porLocal : porMaquina;
  const doLocal = por === 'maquina' ? porMaquina.data : undefined;
  const marcadas = marcacao && marcacao.local === localId ? marcacao : null;

  const selo =
    por === 'local'
      ? porLocal.data &&
        `${plural(locais.length, 'local', 'locais')} · ${plural(soma(locais.map((local) => local.maquinas)), 'máquina', 'máquinas')}`
      : doLocal &&
        `${doLocal.local.nome} · ${plural(doLocal.maquinas.length, 'máquina', 'máquinas')}`;

  function exportar() {
    if (por === 'local' && porLocal.data) {
      const { pacotes, celulas } = porLocal.data;
      const porCelula = new Map(
        celulas.map((celula) => [chave(celula.pacoteId, celula.localId), celula]),
      );
      gravarCsv('Matriz do software por local.csv', [
        ['Pacote', 'Versão-alvo', ...locais.map((local) => local.caminho)],
        ...filtrar(pacotes).map((pacote): CelulaDoCsv[] => [
          pacote.nome,
          pacote.versao,
          ...locais.map((local) => {
            const celula = porCelula.get(chave(pacote.id, local.id));
            return `${celula?.naVersao ?? 0} de ${celula?.total ?? local.maquinas}`;
          }),
        ]),
      ]);
      return;
    }
    if (!doLocal) return;
    const daMaquina = new Map(
      doLocal.celulas.map((celula) => [chave(celula.pacoteId, celula.ativoId), celula]),
    );
    gravarCsv(`Matriz do software - ${doLocal.local.nome}.csv`.replace(/[\\/:*?"<>|]/g, '-'), [
      ['Pacote', 'Versão-alvo', ...doLocal.maquinas.map((maquina) => maquina.rotulo)],
      ...filtrar(doLocal.pacotes).map((pacote): CelulaDoCsv[] => [
        pacote.nome,
        pacote.versao,
        ...doLocal.maquinas.map((maquina) =>
          csvDaCelula(daMaquina.get(chave(pacote.id, maquina.id))),
        ),
      ]),
    ]);
  }

  const painel =
    por === 'local' && porLocal.data && escolhida ? (
      <PainelDaCelula
        matriz={porLocal.data}
        escolhida={escolhida}
        aoDistribuir={distribuir}
        aoAbrirLocal={(local) => ir({ local })}
      />
    ) : null;

  return (
    <div className={estilos.matriz} data-com-painel={painel ? '' : undefined}>
      <div className={estilos.principal}>
        <CabecalhoDaPagina
          titulo={por === 'local' ? 'Software × locais' : 'Software × máquinas'}
          selos={
            selo && (
              <RotuloDeSituacao situacao="neutra" semIcone>
                {selo}
              </RotuloDeSituacao>
            )
          }
          acoes={
            <Botao icone={Download} isDisabled={!matriz.data} onPress={exportar}>
              Exportar
            </Botao>
          }
        />
        <div className={estilos.filtros}>
          <ControleSegmentado
            rotulo="Ver a matriz"
            ocultarRotulo
            value={por}
            onChange={(valor) =>
              ir(valor === 'local' ? { por: 'local' } : localId ? { local: localId } : {})
            }
          >
            <Segmento value="maquina">Por máquina</Segmento>
            <Segmento value="local">Por local</Segmento>
          </ControleSegmentado>
          {por === 'maquina' && locais.length > 0 && (
            <Selecao
              rotulo="Local"
              opcoes={locais.map((local) => ({ id: local.id, rotulo: local.caminho }))}
              selectedKey={localId}
              onSelectionChange={(id) => {
                if (id !== null) ir({ local: String(id) });
              }}
              className={estilos.escolhaDoLocal}
            />
          )}
          <CampoDeTexto
            rotulo="Filtrar programas"
            type="search"
            value={filtro}
            onChange={definirFiltro}
            autoComplete="off"
            className={estilos.filtro}
          />
          <Legenda por={por} />
        </div>
        {porLocal.isError ? (
          <EstadoVazio
            titulo="Não foi possível carregar a matriz."
            descricao={porLocal.error.message}
          />
        ) : porLocal.data && locais.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma máquina com o agente do GLPI nos seus locais."
            descricao="A matriz mostra as máquinas que mandam o inventário pelo agente."
          />
        ) : por === 'local' && porLocal.data ? (
          <GradePorLocal
            matriz={porLocal.data}
            pacotes={filtrar(porLocal.data.pacotes)}
            escolhida={escolhida}
            aoEscolher={definirEscolhida}
          />
        ) : porMaquina.isError ? (
          <EstadoVazio
            titulo="Não foi possível carregar a matriz do local."
            descricao={porMaquina.error.message}
          />
        ) : doLocal ? (
          <GradePorMaquina
            matriz={doLocal}
            pacotes={filtrar(doLocal.pacotes)}
            marcadas={marcadas}
            aoMarcar={(pacoteId, ativoId) =>
              definirMarcacao((antes) => {
                const valida = antes && antes.local === doLocal.local.id ? antes : null;
                // Marcar uma célula de outro pacote recomeça a marcação.
                if (!valida || valida.pacoteId !== pacoteId) {
                  return { local: doLocal.local.id, pacoteId, ativoIds: [ativoId] };
                }
                const ativoIds = valida.ativoIds.includes(ativoId)
                  ? valida.ativoIds.filter((id) => id !== ativoId)
                  : [...valida.ativoIds, ativoId];
                return ativoIds.length > 0 ? { ...valida, ativoIds } : null;
              })
            }
          />
        ) : (
          <p role="status" className={estilos.nota}>
            Carregando a matriz…
          </p>
        )}
        {doLocal && marcadas && (
          <BarraDaMarcacao
            matriz={doLocal}
            marcadas={marcadas}
            aoLimpar={() => definirMarcacao(null)}
            aoDistribuir={distribuir}
          />
        )}
      </div>
      {painel}
    </div>
  );
}

function Legenda({ por }: { por: 'maquina' | 'local' }) {
  const itens =
    por === 'local'
      ? [
          { estado: 'todas', texto: 'Todas na versão-alvo' },
          { estado: 'parte', texto: 'Parte fora da versão-alvo' },
          { estado: 'nenhuma', texto: 'Nenhuma na versão-alvo' },
        ]
      : [
          { estado: 'ok', texto: 'Na versão-alvo' },
          { estado: 'velha', texto: '↓ Abaixo da versão-alvo' },
          { estado: 'falta', texto: 'Falta' },
        ];
  return (
    <ul className={estilos.legenda} aria-label="Legenda">
      {itens.map(({ estado, texto }) => (
        <li key={estado}>
          <i data-estado={estado} aria-hidden="true" />
          {texto}
        </li>
      ))}
    </ul>
  );
}

function NomeDoPacote({
  pacote,
  conta,
}: {
  pacote: PacoteDeSoftware;
  conta: { quantas: number; de: number };
}) {
  return (
    <span className={estilos.nomeDoPacote}>
      <IconeDoPacote nome={pacote.nome} />
      <span className={estilos.textoDoPacote}>
        <b className={estilos.tituloDoPacote}>{pacote.nome}</b>
        <span className={estilos.contaDoPacote}>
          {pacote.versao ? `alvo ${pacote.versao}` : 'sem versão-alvo'} ·{' '}
          <b className={estilos.forte}>{conta.quantas}</b> de {conta.de}
        </span>
      </span>
    </span>
  );
}

const estadoDaCelula = (celula: CelulaDaMaquina | undefined) =>
  !celula || celula.situacao === 'sem-o-programa'
    ? 'falta'
    : celula.situacao === 'desatualizada'
      ? 'velha'
      : 'ok';

/** Por máquina (m06): os pacotes nas linhas, as máquinas do local nas colunas, com o nome girado. */
function GradePorMaquina({
  matriz,
  pacotes,
  marcadas,
  aoMarcar,
}: {
  matriz: MatrizPorMaquina;
  pacotes: readonly PacoteDeSoftware[];
  marcadas: Marcacao | null;
  aoMarcar: (pacoteId: string, ativoId: string) => void;
}) {
  const celulas = new Map(
    matriz.celulas.map((celula) => [chave(celula.pacoteId, celula.ativoId), celula]),
  );
  if (pacotes.length === 0) {
    return <EstadoVazio titulo="Nenhum pacote ativo com esse nome." />;
  }
  return (
    <div className={estilos.rolagem}>
      <table
        className={estilos.grade}
        style={{ '--colunas': matriz.maquinas.length } as CSSProperties}
      >
        <caption className={estilos.oculto}>
          Os pacotes ativos frente às máquinas do local {matriz.local.nome}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={estilos.canto}>
              <span className={estilos.oculto}>Pacote</span>
            </th>
            {matriz.maquinas.map((maquina) => (
              <th
                key={maquina.id}
                scope="col"
                className={estilos.maquina}
                data-marcada={marcadas?.ativoIds.includes(maquina.id) || undefined}
              >
                <span>{maquina.rotulo}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pacotes.map((pacote) => {
            const quantas = matriz.maquinas.filter((maquina) =>
              naVersao(celulas.get(chave(pacote.id, maquina.id))),
            ).length;
            return (
              <tr key={pacote.id}>
                <th scope="row" className={estilos.pacote}>
                  <NomeDoPacote pacote={pacote} conta={{ quantas, de: matriz.maquinas.length }} />
                </th>
                {matriz.maquinas.map((maquina) => {
                  const celula = celulas.get(chave(pacote.id, maquina.id));
                  const marcada =
                    marcadas?.pacoteId === pacote.id && marcadas.ativoIds.includes(maquina.id);
                  return (
                    <td key={maquina.id}>
                      <Dica texto={dicaDaCelula(maquina, pacote, celula)}>
                        <Botao
                          nivel="terciario"
                          className={estilos.celula}
                          data-estado={estadoDaCelula(celula)}
                          data-marcada={marcada || undefined}
                          aria-label={`${maquina.rotulo} · ${pacote.nome}: ${situacaoDaCelula(celula)}${marcada ? ', marcada' : ''}`}
                          onPress={() => aoMarcar(pacote.id, maquina.id)}
                        >
                          {textoDaCelula(celula)}
                        </Botao>
                      </Dica>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "PC-FIN-15, PC-FIN-16 e PC-FIN-17", e o resto em "e mais N". */
function nomesDasMaquinas(maquinas: readonly { rotulo: string }[], ate = 4): string {
  if (maquinas.length <= ate) return emLista(maquinas.map((maquina) => maquina.rotulo));
  return `${maquinas
    .slice(0, ate - 1)
    .map((maquina) => maquina.rotulo)
    .join(', ')} e mais ${maquinas.length - (ate - 1)}`;
}

/** A barra das marcadas (m06): o que acontece com cada uma, "Limpar" e "Distribuir". */
function BarraDaMarcacao({
  matriz,
  marcadas,
  aoLimpar,
  aoDistribuir,
}: {
  matriz: MatrizPorMaquina;
  marcadas: Marcacao;
  aoLimpar: () => void;
  aoDistribuir: (pacoteId: string, maquinas: readonly string[], local: string) => void;
}) {
  const titulo = useId();
  const pacote = matriz.pacotes.find((um) => um.id === marcadas.pacoteId);
  if (!pacote) return null;
  const celulas = new Map(
    matriz.celulas
      .filter((celula) => celula.pacoteId === pacote.id)
      .map((celula) => [celula.ativoId, celula]),
  );
  // Na ordem das colunas, como a pessoa as vê.
  const maquinas = matriz.maquinas.filter((maquina) => marcadas.ativoIds.includes(maquina.id));
  const total = maquinas.length;
  const contar = (teste: (maquina: MaquinaDaMatriz, celula?: CelulaDaMaquina) => boolean) =>
    maquinas.filter((maquina) => teste(maquina, celulas.get(maquina.id))).length;
  const semContato = contar((maquina) => maquina.semContato !== null);
  const jaNaVersao = contar((maquina, celula) => !maquina.semContato && naVersao(celula));
  const falharam = contar(
    (maquina, celula) =>
      !maquina.semContato && !naVersao(celula) && celula?.distribuicao?.situacao === 'falhou',
  );
  const naFila = contar(
    (maquina, celula) =>
      !maquina.semContato &&
      !naVersao(celula) &&
      (celula?.distribuicao?.situacao === 'aguardando' ||
        celula?.distribuicao?.situacao === 'em-andamento'),
  );
  const instalam = total - semContato - jaNaVersao - falharam - naFila;
  const partes = [
    instalam > 0 && (instalam === 1 ? '1 instala' : `${instalam} instalam`),
    falharam > 0 &&
      (falharam === 1 ? '1 falhou da última vez' : `${falharam} falharam da última vez`),
    naFila > 0 &&
      (naFila === 1 ? '1 já tem o pedido na fila' : `${naFila} já têm o pedido na fila`),
    jaNaVersao > 0 &&
      `${jaNaVersao} ${jaNaVersao === 1 ? 'já está' : 'já estão'} ${daConta(pacote).dentro}`,
    semContato > 0 && (semContato === 1 ? '1 está sem contato' : `${semContato} estão sem contato`),
  ].filter((parte): parte is string => typeof parte === 'string');
  return (
    <section className={estilos.barra} aria-labelledby={titulo}>
      <span className={estilos.quantasMarcadas} aria-hidden="true">
        {total}
      </span>
      <div className={estilos.textoDaBarra}>
        <b id={titulo}>
          <span className={estilos.oculto}>{total} </span>
          {total === 1 ? 'marcada' : 'marcadas'} no {pacote.nome}
        </b>
        <span>
          {nomesDasMaquinas(maquinas)}: {emLista(partes)}.
        </span>
      </div>
      <div className={estilos.acoesDaBarra}>
        <Botao onPress={aoLimpar}>Limpar</Botao>
        <Botao
          nivel="primario"
          icone={Rocket}
          onPress={() => aoDistribuir(pacote.id, marcadas.ativoIds, marcadas.local)}
        >
          Distribuir {nomeComVersao(pacote)} {total === 1 ? 'a esta' : `a estas ${total}`}
        </Botao>
      </div>
    </section>
  );
}

/** Por local (m07): os pacotes nas linhas e os locais com máquinas com o agente nas colunas. */
function GradePorLocal({
  matriz,
  pacotes,
  escolhida,
  aoEscolher,
}: {
  matriz: MatrizPorLocal;
  pacotes: readonly PacoteDeSoftware[];
  escolhida: { pacoteId: string; localId: string } | null;
  aoEscolher: (escolhida: { pacoteId: string; localId: string }) => void;
}) {
  const celulas = new Map(
    matriz.celulas.map((celula) => [chave(celula.pacoteId, celula.localId), celula]),
  );
  const daCelula = (pacote: PacoteDeSoftware, local: LocalDaMatriz) => {
    const celula = celulas.get(chave(pacote.id, local.id));
    return { quantas: celula?.naVersao ?? 0, de: celula?.total ?? local.maquinas };
  };
  if (pacotes.length === 0) {
    return <EstadoVazio titulo="Nenhum pacote ativo com esse nome." />;
  }
  return (
    <div className={estilos.rolagem}>
      <table
        className={estilos.grade}
        data-por="local"
        style={{ '--colunas': matriz.locais.length } as CSSProperties}
      >
        <caption className={estilos.oculto}>Os pacotes ativos frente aos locais</caption>
        <thead>
          <tr>
            <th scope="col" className={estilos.canto}>
              <span className={estilos.oculto}>Pacote</span>
            </th>
            {matriz.locais.map((local) => (
              <th
                key={local.id}
                scope="col"
                className={estilos.cabecaDoLocal}
                data-escolhido={escolhida?.localId === local.id || undefined}
              >
                {local.nome}
                <small>{local.maquinas} máq.</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pacotes.map((pacote) => {
            const contas = matriz.locais.map((local) => daCelula(pacote, local));
            return (
              <tr key={pacote.id}>
                <th scope="row" className={estilos.pacote}>
                  <NomeDoPacote
                    pacote={pacote}
                    conta={{
                      quantas: soma(contas.map((conta) => conta.quantas)),
                      de: soma(contas.map((conta) => conta.de)),
                    }}
                  />
                </th>
                {matriz.locais.map((local, posicao) => {
                  const { quantas, de } = contas[posicao] ?? { quantas: 0, de: 0 };
                  const estado = quantas === de ? 'todas' : quantas === 0 ? 'nenhuma' : 'parte';
                  const aberta =
                    escolhida?.pacoteId === pacote.id && escolhida.localId === local.id;
                  return (
                    <td key={local.id}>
                      <Botao
                        nivel="terciario"
                        className={estilos.celula}
                        data-estado={estado}
                        data-marcada={aberta || undefined}
                        aria-label={`${local.nome} · ${pacote.nome}: ${quantas} de ${de} ${daConta(pacote).dentro}${aberta ? ', aberta ao lado' : ''}`}
                        onPress={() => aoEscolher({ pacoteId: pacote.id, localId: local.id })}
                      >
                        {quantas} de {de}
                      </Botao>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function rotuloDaMaquina(
  maquina: MaquinaDaMatriz,
  celula: CelulaDaMaquina | undefined,
): { situacao: Situacao; texto: string } {
  const { distribuicao } = celula ?? {};
  if (distribuicao?.situacao === 'em-andamento') return { situacao: 'info', texto: 'Instalando' };
  if (distribuicao?.situacao === 'falhou') {
    return {
      situacao: 'critico',
      texto: `Falhou${distribuicao.codigo !== null ? ` · ${distribuicao.codigo}` : ''}`,
    };
  }
  if (maquina.semContato) return { situacao: 'atencao', texto: 'Sem contato' };
  if (distribuicao) return { situacao: 'neutra', texto: distribuicao.texto };
  if (celula?.situacao === 'desatualizada') {
    return { situacao: 'atencao', texto: 'Abaixo da versão-alvo' };
  }
  return { situacao: 'neutra', texto: 'Falta' };
}

/** O painel da célula do "Por local" (m07): as máquinas do local frente ao pacote. */
function PainelDaCelula({
  matriz,
  escolhida,
  aoDistribuir,
  aoAbrirLocal,
}: {
  matriz: MatrizPorLocal;
  escolhida: { pacoteId: string; localId: string };
  aoDistribuir: (pacoteId: string, maquinas: readonly string[], local: string) => void;
  aoAbrirLocal: (local: string) => void;
}) {
  const titulo = useId();
  const { formatarHora, grupoDoDia } = useDataHora();
  const doLocal = useMatrizPorMaquina(escolhida.localId);
  const local = matriz.locais.find((um) => um.id === escolhida.localId);
  const pacote = matriz.pacotes.find((um) => um.id === escolhida.pacoteId);
  if (!local || !pacote) return null;
  const conta = daConta(pacote);
  const celula = matriz.celulas.find(
    (uma) => uma.pacoteId === pacote.id && uma.localId === local.id,
  );
  const dados = doLocal.data?.local.id === local.id ? doLocal.data : undefined;
  const celulas = new Map(
    (dados?.celulas ?? [])
      .filter((uma) => uma.pacoteId === pacote.id)
      .map((uma) => [uma.ativoId, uma]),
  );
  const maquinas = dados?.maquinas ?? [];
  const naAlvo = maquinas.filter((maquina) => naVersao(celulas.get(maquina.id)));
  const fora = maquinas.filter((maquina) => !naVersao(celulas.get(maquina.id)));
  const ultima = dados?.ultimas.find((uma) => uma.pacoteId === pacote.id);
  return (
    <aside className={estilos.painel} aria-labelledby={titulo}>
      <Carimbo id={titulo}>{local.caminho}</Carimbo>
      <div className={estilos.pacoteDoPainel}>
        <IconeDoPacote nome={pacote.nome} />
        <span className={estilos.textoDoPainel}>
          <b className={estilos.tituloDoPacote}>{nomeComVersao(pacote)}</b>
          <span className={estilos.tipoDoPainel}>
            {tipoETamanho(pacote)} · {plural(local.maquinas, 'máquina', 'máquinas')}
          </span>
        </span>
      </div>
      <hr className={estilos.separador} />
      <p className={estilos.total}>
        <span className={estilos.numeroGrande}>{celula?.naVersao ?? 0}</span>
        <span>
          de {celula?.total ?? local.maquinas} {conta.dentro}
        </span>
      </p>
      {doLocal.isError ? (
        <p role="alert" className={estilos.nota}>
          {doLocal.error.message}
        </p>
      ) : !dados ? (
        <p role="status" className={estilos.nota}>
          Carregando as máquinas do local…
        </p>
      ) : (
        <>
          {fora.length > 0 && (
            <>
              <p className={estilos.legendaDoPainel}>
                {fora.length} {conta.fora}
              </p>
              <ul className={estilos.fora} aria-label={`Máquinas ${conta.fora}`}>
                {fora.map((maquina) => {
                  const daMaquina = celulas.get(maquina.id);
                  const rotulo = rotuloDaMaquina(maquina, daMaquina);
                  return (
                    <li key={maquina.id}>
                      <span className={estilos.nomeDaMaquina}>{maquina.rotulo}</span>
                      <span>
                        {daMaquina?.versao
                          ? `${pacote.nome} ${daMaquina.versao}`
                          : 'Sem o programa'}
                      </span>
                      <RotuloDeSituacao situacao={rotulo.situacao} semIcone>
                        {rotulo.texto}
                      </RotuloDeSituacao>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {naAlvo.length > 0 && (
            <p className={estilos.dado}>
              <b>
                {naAlvo.length} {pacote.versao ? `na versão ${pacote.versao}` : 'com o programa'}:
              </b>{' '}
              {nomesDasMaquinas(naAlvo, 6)}
            </p>
          )}
          {ultima && (
            <p className={estilos.dado}>
              <b>Última distribuição:</b>{' '}
              {grupoDoDia(new Date(ultima.criadaEm), new Date()).toLowerCase()},{' '}
              <span className={estilos.mono}>{formatarHora(new Date(ultima.criadaEm))}</span>, por{' '}
              {ultima.criadaPor}
            </p>
          )}
        </>
      )}
      <div className={estilos.acoesDoPainel}>
        <Botao
          nivel="primario"
          icone={Rocket}
          className={estilos.acaoDoPainel}
          isDisabled={!dados || fora.length === 0}
          onPress={() =>
            aoDistribuir(
              pacote.id,
              fora.map((maquina) => maquina.id),
              local.id,
            )
          }
        >
          Distribuir {nomeComVersao(pacote)}{' '}
          {fora.length === 1 ? 'a esta' : `a estas ${fora.length}`}
        </Botao>
        <Botao className={estilos.acaoDoPainel} onPress={() => aoAbrirLocal(local.id)}>
          Abrir a matriz do local {local.nome}
        </Botao>
      </div>
    </aside>
  );
}
