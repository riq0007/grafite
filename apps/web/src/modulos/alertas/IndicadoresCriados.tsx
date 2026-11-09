// Os indicadores da organização na tela dos indicadores (spec indicadores, "Indicadores da
// organização" e "Tela dos indicadores"; change regras-indicadores-e-tarefas, design, decisões 3 e
// 5): cada indicador criado no Indicador da biblioteca, com a medida e o recorte em texto, a lista do
// que passou da meta e, para quem administra os alertas, "Novo indicador", "Editar" e "Apagar". O
// formulário confere pelo domínio, com a recusa no campo.
import {
  type CampoDoIndicadorCriado,
  conferirIndicadorCriado,
  definicaoDaMedida,
  MEDIDAS_DOS_INDICADORES_CRIADOS,
  type MedidaDoIndicadorCriado,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaTabela,
  CampoDeTexto,
  Carimbo,
  Celula,
  Coluna,
  CorpoDaTabela,
  Dialogo,
  EstadoVazio,
  Gaveta,
  Indicador,
  Linha,
  MensagemDoPasso,
  Selecao,
  useDataHora,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { consultar } from '../../api/consultas.ts';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { recusaDe } from '../administracao/recusa.ts';
import { SeletorDeConta } from '../administracao/seletores/SeletorDeConta.tsx';
import { SeletorDeLocal } from '../administracao/seletores/SeletorDeLocal.tsx';
import { ListaDoIndicador } from '../indicadores/ListaDoIndicador.tsx';
import estilos from './Alertas.module.css';
import {
  CHAVE_DOS_INDICADORES_CRIADOS,
  type IndicadorCriado,
  useIndicadoresCriados,
} from './consultas.ts';
import {
  baseDoCriado,
  medidaERecorte,
  metaDeFabricaNoCampo,
  metaDoCampo,
  metaDoCriado,
  metaNoCampo,
  semValorDoCriado,
  UNIDADE_DA_META,
  valorDoCriado,
} from './indicadoresCriados.ts';

const OPCOES_DA_MEDIDA = MEDIDAS_DOS_INDICADORES_CRIADOS.map((id) => ({
  id,
  rotulo: definicaoDaMedida(id).nome,
}));

const OPCOES_DO_RECORTE = [
  { id: 'todos', rotulo: 'Todos os tipos e modelos' },
  { id: 'tipo', rotulo: 'Um tipo' },
  { id: 'modelo', rotulo: 'Um modelo' },
] as const;

type Registro = { id: string; rotulo: string } | null;

interface Rascunho {
  nome: string;
  medida: MedidaDoIndicadorCriado | null;
  recorte: (typeof OPCOES_DO_RECORTE)[number]['id'];
  tipo: Registro;
  modelo: Registro;
  local: string | null;
  meta: string;
}

const rascunhoDe = (indicador: IndicadorCriado | null): Rascunho =>
  indicador
    ? {
        nome: indicador.nome,
        medida: indicador.medida,
        recorte: indicador.recorte.modelo ? 'modelo' : indicador.recorte.tipo ? 'tipo' : 'todos',
        tipo: indicador.recorte.tipo
          ? { id: indicador.recorte.tipo.id, rotulo: indicador.recorte.tipo.nome }
          : null,
        modelo: indicador.recorte.modelo
          ? { id: indicador.recorte.modelo.id, rotulo: indicador.recorte.modelo.nome }
          : null,
        local: indicador.recorte.local?.id ?? null,
        meta: metaNoCampo(indicador.medida, indicador.meta),
      }
    : { nome: '', medida: null, recorte: 'todos', tipo: null, modelo: null, local: null, meta: '' };

/** A gaveta do indicador novo ou do que existe. */
function FormularioDoIndicador({
  indicador,
  aoFechar,
}: {
  indicador: IndicadorCriado | null;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const tipos = useQuery({
    queryKey: ['tipos-de-ativo'],
    queryFn: () => consultar(() => api.GET('/tipos-de-ativo'), 'carregar os tipos de ativo'),
  });
  const [rascunho, definirRascunho] = useState(() => rascunhoDe(indicador));
  const [erros, definirErros] = useState<Partial<Record<CampoDoIndicadorCriado, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  const mudar = (mudanca: Partial<Rascunho>, ...campos: CampoDoIndicadorCriado[]) => {
    definirRascunho((atual) => ({ ...atual, ...mudanca }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const campo of campos) delete restantes[campo];
      return restantes;
    });
  };

  const buscarModelos = useCallback(
    async (texto: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/modelos', {
        params: { query: { busca: texto, limite: 8 } },
        signal: sinal,
      });
      if (!data) throw new Error(error ? 'Não foi possível buscar os modelos.' : 'Sem conexão.');
      return {
        itens: data.itens.map((modelo) => ({
          id: modelo.id,
          rotulo: `${modelo.fabricante} ${modelo.nome}`,
        })),
        total: data.total,
      };
    },
    [api],
  );

  async function salvar() {
    if (enviando) return;
    definirFalha(null);
    const pedido = {
      nome: rascunho.nome,
      medida: rascunho.medida ?? '',
      recorte: {
        tipoId: rascunho.recorte === 'tipo' ? (rascunho.tipo?.id ?? '-') : null,
        modeloId: rascunho.recorte === 'modelo' ? (rascunho.modelo?.id ?? '-') : null,
        localId: rascunho.local,
      },
      meta: rascunho.medida ? metaDoCampo(rascunho.medida, rascunho.meta) : Number.NaN,
    };
    const conferido = conferirIndicadorCriado(pedido);
    if (!conferido.ok) {
      definirErros(conferido.erros);
      return;
    }
    definirEnviando(true);
    const corpo = conferido.dados;
    const resultado = await pedir(
      () =>
        indicador
          ? api.PATCH('/alertas/indicadores/criados/{id}', {
              params: { path: { id: indicador.id } },
              body: corpo,
            })
          : api.POST('/alertas/indicadores/criados', { body: corpo }),
      indicador ? 'salvar o indicador' : 'criar o indicador',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<CampoDoIndicadorCriado>(resultado);
      if (campos && Object.keys(campos).length > 0) {
        definirErros(campos);
        return;
      }
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: indicador ? 'Indicador salvo.' : 'Indicador criado.' });
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_INDICADORES_CRIADOS });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={indicador ? 'Editar indicador' : 'Novo indicador'}
    >
      <div className={estilos.tela}>
        <CampoDeTexto
          rotulo="Nome"
          obrigatorio
          autoComplete="off"
          value={rascunho.nome}
          onChange={(nome) => mudar({ nome }, 'nome')}
          erro={erros.nome}
        />
        <Selecao
          rotulo="Medida"
          obrigatorio
          placeholder="Escolha a medida"
          opcoes={OPCOES_DA_MEDIDA}
          selectedKey={rascunho.medida}
          descricao={rascunho.medida ? definicaoDaMedida(rascunho.medida).mede : undefined}
          onSelectionChange={(chave) => {
            const medida = String(chave) as MedidaDoIndicadorCriado;
            mudar(
              {
                medida,
                meta:
                  rascunho.meta === '' || rascunho.medida === null || rascunho.medida !== medida
                    ? metaDeFabricaNoCampo(medida)
                    : rascunho.meta,
              },
              'medida',
              'meta',
            );
          }}
          erro={erros.medida}
        />
        <Selecao
          rotulo="Tipo ou modelo"
          opcoes={[...OPCOES_DO_RECORTE]}
          selectedKey={rascunho.recorte}
          onSelectionChange={(chave) =>
            mudar(
              { recorte: String(chave) as Rascunho['recorte'], tipo: null, modelo: null },
              'tipo',
              'modelo',
            )
          }
        />
        {rascunho.recorte === 'tipo' && (
          <Selecao
            rotulo="Tipo"
            placeholder="Escolha o tipo"
            opcoes={(tipos.data?.tipos ?? [])
              .filter((tipo) => tipo.situacao === 'ativo')
              .map(({ id, nome }) => ({ id, rotulo: nome }))}
            selectedKey={rascunho.tipo?.id ?? null}
            onSelectionChange={(chave) => {
              const tipo = tipos.data?.tipos.find((um) => um.id === chave);
              mudar({ tipo: tipo ? { id: tipo.id, rotulo: tipo.nome } : null }, 'tipo');
            }}
            erro={erros.tipo}
          />
        )}
        {rascunho.recorte === 'modelo' && (
          <SeletorDeConta
            rotulo="Modelo"
            valor={rascunho.modelo}
            aoMudar={(modelo) => mudar({ modelo }, 'modelo')}
            buscar={buscarModelos}
            erro={erros.modelo}
          />
        )}
        <SeletorDeLocal
          rotulo="Local"
          descricao="Opcional: só os ativos deste local e dos de baixo."
          valor={rascunho.local}
          aoMudar={(local) => mudar({ local }, 'local')}
          erro={erros.local}
        />
        <CampoDeTexto
          rotulo="Meta"
          obrigatorio
          inputMode="decimal"
          autoComplete="off"
          descricao={rascunho.medida ? UNIDADE_DA_META[rascunho.medida] : 'Escolha a medida antes.'}
          value={rascunho.meta}
          onChange={(meta) => mudar({ meta }, 'meta')}
          erro={erros.meta}
        />
        <MensagemDoPasso texto={falha} chave={tentativa} />
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Salvando"
            onPress={() => void salvar()}
          >
            {indicador ? 'Salvar' : 'Criar indicador'}
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/** "Apagar", com a confirmação. */
function ApagarIndicador({ indicador }: { indicador: IndicadorCriado }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [apagando, definirApagando] = useState(false);
  return (
    <Dialogo
      gatilho={<Botao nivel="terciario">Apagar</Botao>}
      titulo={`Apagar o indicador ${indicador.nome}?`}
      alerta
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="destrutivo"
            carregando={apagando}
            rotuloCarregando="Apagando"
            onPress={async () => {
              definirApagando(true);
              const resultado = await pedir(
                () =>
                  api.DELETE('/alertas/indicadores/criados/{id}', {
                    params: { path: { id: indicador.id } },
                  }),
                'apagar o indicador',
              );
              definirApagando(false);
              if ('erro' in resultado) {
                avisar({ situacao: 'critico', titulo: resultado.erro });
                return;
              }
              fechar();
              avisar({ situacao: 'sucesso', titulo: 'Indicador apagado.' });
              await consultas.invalidateQueries({ queryKey: CHAVE_DOS_INDICADORES_CRIADOS });
            }}
          >
            Apagar
          </Botao>
        </>
      )}
    >
      <p className={estilos.informacao}>
        A meta e o recorte dele saem da tela. Os alertas e as outras metas continuam.
      </p>
    </Dialogo>
  );
}

/** Um indicador criado, com a lista do que passou da meta. */
function IndicadorCriadoNaTela({
  indicador,
  podeEditar,
  aoEditar,
}: {
  indicador: IndicadorCriado;
  podeEditar: boolean;
  aoEditar: () => void;
}) {
  const { formatarDataEHora } = useDataHora();
  const { medida, valor, anterior, base, situacao, meta, itens, mais } = indicador;
  const { decisao } = definicaoDaMedida(medida);
  // As medidas que contam ativos mostram o motivo também com zero, como os quatro dos alertas.
  const contaAtivos = medida === 'disponibilidade' || medida === 'que-voltam';
  const comValor = valor !== null && !(contaAtivos && valor === 0);
  const comId = itens.map((item, posicao) => ({ ...item, id: `${item.alvo.id}-${posicao}` }));
  const destinos = new Map(
    comId.map((item) => [
      item.id,
      item.alvo.tipo === 'ativo' ? `/ativos/${item.alvo.id}` : '/administracao/coletores',
    ]),
  );
  return (
    <Indicador
      nome={indicador.nome}
      mede={medidaERecorte(indicador)}
      base={base > 0 ? baseDoCriado(medida, base) : undefined}
      valor={comValor ? valorDoCriado(medida, valor) : undefined}
      semValor={comValor ? undefined : semValorDoCriado(medida, valor, meta)}
      anterior={anterior === null ? 'sem dado' : valorDoCriado(medida, anterior)}
      meta={metaDoCriado(medida, meta)}
      situacao={situacao}
      decisao={decisao}
      acao={
        podeEditar ? (
          <div className={estilos.acoes}>
            <Botao nivel="terciario" onPress={aoEditar}>
              Editar
            </Botao>
            <ApagarIndicador indicador={indicador} />
          </div>
        ) : undefined
      }
    >
      <ListaDoIndicador
        rotulo={`Fora da meta: ${indicador.nome}`}
        quantos={comId.length}
        destinos={destinos}
        mais={mais}
      >
        <CabecalhoDaTabela>
          <Coluna id="alvo" principal>
            Ativo ou coletor
          </Coluna>
          <Coluna id="detalhe" especie="situacao">
            Situação
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={comId}>
          {(item) => (
            <Linha id={item.id}>
              <Celula>{item.alvo.nome}</Celula>
              <Celula>
                {item.momento
                  ? `${item.detalhe}: ${formatarDataEHora(new Date(item.momento))}`
                  : item.detalhe}
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </ListaDoIndicador>
    </Indicador>
  );
}

/** A seção dos indicadores da organização, depois dos quatro. */
export function IndicadoresCriados() {
  const criados = useIndicadoresCriados();
  const [aberto, definirAberto] = useState<IndicadorCriado | 'novo' | null>(null);
  const podeCriar = criados.data?.permite.criar ?? false;
  const novo = podeCriar ? (
    <Botao nivel="primario" icone={Plus} onPress={() => definirAberto('novo')}>
      Novo indicador
    </Botao>
  ) : null;
  return (
    <section className={estilos.indicadoresCriados} aria-labelledby="indicadores-da-organizacao">
      <div className={estilos.cabecalhoDaSecao}>
        <Carimbo id="indicadores-da-organizacao">Indicadores da organização</Carimbo>
        {novo}
      </div>
      {criados.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando os indicadores da organização…
        </p>
      ) : criados.isError ? (
        <EstadoVazio
          titulo={criados.error.message}
          acao={<Botao onPress={() => void criados.refetch()}>Tentar de novo</Botao>}
        />
      ) : criados.data.indicadores.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum indicador criado."
          descricao="Crie um indicador para acompanhar só um tipo, um modelo ou um local, com a meta dele, como a disponibilidade das impressoras de uma unidade ou os backups dos controles de acesso."
          acao={novo ?? undefined}
        />
      ) : (
        criados.data.indicadores.map((indicador) => (
          <IndicadorCriadoNaTela
            key={indicador.id}
            indicador={indicador}
            podeEditar={podeCriar}
            aoEditar={() => definirAberto(indicador)}
          />
        ))
      )}
      {aberto && (
        <FormularioDoIndicador
          indicador={aberto === 'novo' ? null : aberto}
          aoFechar={() => definirAberto(null)}
        />
      )}
    </section>
  );
}
