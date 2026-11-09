import { type CampoNoCatalogo, CHAVE_DO_MODELO, camposDoAtivo } from '@grafite/domain';
import {
  Botao,
  Dialogo,
  EstadoDoCampo,
  EtapasDoFormulario,
  Formulario,
  MensagemDoPasso,
  MiniaturaDeAtivo,
  Selecao,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { RecusaDoFormulario } from '../../administracao/recusa.ts';
import { SeletorDeConta } from '../../administracao/seletores/SeletorDeConta.tsx';
import { CampoComCadastro } from '../../cadastros.tsx';
import estilosDoAtivo from '../Ativos.module.css';
import { type CampoDaOrganizacao, chaveDoModelo, type TipoDeAtivo } from '../consultas.ts';
import { imagemDoModelo } from '../modelos/imagens.ts';
import estilos from './CadastroEmEtapas.module.css';
import { CampoDoAtivo, type EntradaDoCampo } from './CampoDoAtivo.tsx';
import {
  etapaAnterior,
  etapaComRecusa,
  etapaSeguinte,
  etapasDoCadastro,
  gruposDoCadastro,
} from './etapas.ts';
import {
  entradasIguais,
  errosDaRecusa,
  montarPedidoDoAtivo,
  type PedidoDoAtivo,
} from './pedidoDoAtivo.ts';
import { type EstadoDoCadastro, estadoDoTipo, type PreenchidoPelaOrigem } from './rascunho.ts';

/** O pedido do cadastro: o tipo e o que o formulário montou. */
export type PedidoDoCadastro = PedidoDoAtivo & { tipoId: string };

export interface PropsDoCadastroEmEtapas {
  /** Os tipos ativos, entre os quais a pessoa escolhe. */
  tipos: readonly TipoDeAtivo[];
  campos: readonly CampoDaOrganizacao[];
  /** Onde o cadastro começa: vazio, com o tipo da origem ou retomado do rascunho. */
  inicial: EstadoDoCadastro;
  /** O que a origem da tabela preenche quando o tipo é escolhido. */
  preenchido?: PreenchidoPelaOrigem;
  editarRestritos: boolean;
  /** Cada mudança do cadastro, para o rascunho. */
  aoMudar?: (estado: EstadoDoCadastro) => void;
  cadastrar: (pedido: PedidoDoCadastro) => Promise<{ ok: true } | RecusaDoFormulario>;
  /** O que fica embaixo da lista das etapas, como a situação do rascunho. */
  rodape?: ReactNode;
}

/** Para onde o foco vai depois da troca de etapa: o nome dela, ou o primeiro campo recusado. */
type Foco = { alvo: 'titulo' | 'recusa'; vez: number };

/**
 * O cadastro do ativo em etapas (spec cadastro-de-ativos, "Cadastro do ativo em etapas"; change
 * cadastro-em-etapas, decisões 4 e 5): à esquerda as etapas, cada uma com a situação em texto; à
 * direita a aberta, com a imagem do modelo, ou o ícone do tipo, e os campos ao lado. "Voltar" e
 * "Continuar para …" andam sem recusar campos vazios, e o Enter num campo continua. Na última,
 * "Cadastrar" confere tudo e abre a primeira etapa com uma recusa, com o foco no campo. Trocar o
 * tipo com algo preenchido pede confirmação.
 */
export function CadastroEmEtapas({
  tipos,
  campos,
  inicial,
  preenchido,
  editarRestritos,
  aoMudar,
  cadastrar,
  rodape,
}: PropsDoCadastroEmEtapas) {
  const api = useApi();
  const [estado, definirEstado] = useState(inicial);
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const [tipoATrocar, definirTipoATrocar] = useState<string | null>(null);
  /** O tipo criado numa aba, escolhido quando ele chega na lista. */
  const [tipoPedido, definirTipoPedido] = useState<string | null>(null);
  const [foco, definirFoco] = useState<Foco | null>(null);
  const painel = useRef<HTMLDivElement>(null);
  const primeiro = useRef(estado);

  // Cada mudança vai para o rascunho; a primeira renderização não é uma mudança.
  useEffect(() => {
    if (estado !== primeiro.current) aoMudar?.(estado);
  }, [estado, aoMudar]);

  const tipo = tipos.find((candidato) => candidato.id === estado.tipoId) ?? null;
  const definicoes = useMemo(
    () =>
      tipo
        ? camposDoAtivo({
            tipo: { capacidades: tipo.capacidades, campos: tipo.campos },
            campos: campos as readonly CampoNoCatalogo[],
          })
        : null,
    [tipo, campos],
  );
  const grupos = useMemo(
    () => (definicoes ? gruposDoCadastro(definicoes, editarRestritos) : []),
    [definicoes, editarRestritos],
  );

  const modelo = useQuery({
    queryKey: chaveDoModelo(estado.modeloId ?? ''),
    queryFn: () =>
      consultar(
        () => api.GET('/modelos/{id}', { params: { path: { id: estado.modeloId ?? '' } } }),
        'carregar o modelo',
      ),
    enabled: estado.modeloId !== null,
  });
  const modeloValido =
    modelo.data && modelo.data.tipo.id === tipo?.id && modelo.data.situacao === 'ativo'
      ? modelo.data
      : null;
  // O modelo inativado, o de outro tipo e o que não existe mais saem do cadastro.
  const modeloRecusado =
    estado.modeloId !== null && (modelo.isError || (modelo.data !== undefined && !modeloValido));
  useEffect(() => {
    if (modeloRecusado) definirEstado((atual) => ({ ...atual, modeloId: null }));
  }, [modeloRecusado]);

  const etapas = etapasDoCadastro({
    tipo,
    modelo: modeloValido,
    grupos,
    entradas: estado.entradas,
  });
  const etapa = etapas.find((candidata) => candidata.chave === estado.etapa) ?? etapas[0];
  const chaveDaEtapa = etapa?.chave ?? 'tipo';
  const seguinte = etapaSeguinte(etapas, chaveDaEtapa);
  const anterior = etapaAnterior(etapas, chaveDaEtapa);

  // O foco vai para o nome da etapa aberta, ou para o primeiro campo recusado dela.
  useLayoutEffect(() => {
    if (!foco || !painel.current) return;
    const recusado =
      foco.alvo === 'recusa'
        ? painel.current.querySelector<HTMLElement>('[aria-invalid="true"]')
        : null;
    (recusado ?? painel.current.querySelector<HTMLElement>('h2'))?.focus();
  }, [foco]);

  const abrirEtapa = useCallback((chave: string, alvo: Foco['alvo'] = 'titulo') => {
    definirEstado((atual) => (atual.etapa === chave ? atual : { ...atual, etapa: chave }));
    definirFoco((anterior) => ({ alvo, vez: (anterior?.vez ?? 0) + 1 }));
  }, []);

  /** O cadastro novo de um tipo, com o que a origem preenche; o modelo dela, só se for do tipo. */
  const estadoDe = useCallback(
    (escolhido: TipoDeAtivo, origem: string | null) =>
      estadoDoTipo({
        tipo: escolhido,
        campos,
        origem,
        editarRestritos,
        ...(preenchido && {
          preenchido:
            preenchido.tipoId === undefined || preenchido.tipoId === escolhido.id
              ? preenchido
              : { valores: preenchido.valores, nomes: preenchido.nomes },
        }),
      }),
    [campos, editarRestritos, preenchido],
  );

  // Preenchido fora da etapa do Tipo: o modelo, uma trava ou uma entrada diferente da inicial.
  const padroes = tipo ? estadoDe(tipo, estado.origem) : null;
  const algoPreenchido =
    padroes !== null &&
    (estado.modeloId !== padroes.modeloId ||
      Object.keys(estado.travas).length > 0 ||
      Object.entries(estado.entradas).some(
        ([chave, entrada]) => !entradasIguais(entrada, padroes.entradas[chave]),
      ));

  const trocarTipo = (id: string) => {
    const escolhido = tipos.find((candidato) => candidato.id === id);
    if (!escolhido) return;
    definirErros({});
    definirFalha(null);
    definirEstado((atual) => ({ ...estadoDe(escolhido, atual.origem), etapa: 'tipo' }));
  };
  const pedirTipo = (id: string) => {
    if (id === estado.tipoId) return;
    if (algoPreenchido) definirTipoATrocar(id);
    else trocarTipo(id);
  };

  // O tipo criado numa aba entra quando a lista dos tipos já o traz.
  const tipoChegou = tipoPedido !== null && tipos.some((candidato) => candidato.id === tipoPedido);
  useEffect(() => {
    if (!tipoChegou || tipoPedido === null) return;
    definirTipoPedido(null);
    pedirTipo(tipoPedido);
  });

  const mudarEntrada = (chave: string, entrada: EntradaDoCampo, nome?: string) => {
    definirEstado((atual) => ({
      ...atual,
      entradas: { ...atual.entradas, [chave]: entrada },
      nomes:
        nome && typeof entrada === 'string' ? { ...atual.nomes, [entrada]: nome } : atual.nomes,
    }));
    definirErros(({ [chave]: _resolvido, ...restantes }) => restantes);
  };
  const travar = (chave: string, travado: boolean) =>
    definirEstado((atual) => ({ ...atual, travas: { ...atual.travas, [chave]: travado } }));
  const escolherModelo = (id: string | null, nome?: string) => {
    definirEstado((atual) => ({
      ...atual,
      modeloId: id,
      nomes: id && nome ? { ...atual.nomes, [id]: nome } : atual.nomes,
    }));
    definirErros(({ [CHAVE_DO_MODELO]: _resolvido, ...restantes }) => restantes);
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    if (!tipo || !definicoes) {
      definirErros({ tipo: 'Escolha o tipo do ativo.' });
      abrirEtapa('tipo', 'recusa');
      return;
    }
    if (seguinte) {
      abrirEtapa(seguinte.chave);
      return;
    }
    definirFalha(null);
    const montagem = montarPedidoDoAtivo({
      definicoes,
      entradas: estado.entradas,
      iniciais: {},
      travas: estado.travas,
      travasIniciais: {},
      modeloId: estado.modeloId,
      ficha: null,
    });
    if (!montagem.ok) {
      definirErros(montagem.erros);
      abrirEtapa(etapaComRecusa(etapas, montagem.erros) ?? chaveDaEtapa, 'recusa');
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await cadastrar({ tipoId: tipo.id, ...montagem.pedido });
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        const recusas = errosDaRecusa(resultado.campos);
        definirErros(recusas);
        abrirEtapa(etapaComRecusa(etapas, recusas) ?? chaveDaEtapa, 'recusa');
        return;
      }
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
    } finally {
      definirEnviando(false);
    }
  }

  const nomeDoModelo = modeloValido
    ? `${modeloValido.fabricante} ${modeloValido.nome}`
    : estado.modeloId
      ? estado.nomes[estado.modeloId]
      : undefined;
  const tipoId = tipo?.id ?? '';
  const buscarModelos = useCallback(
    async (busca: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/modelos', {
        params: { query: { tipo: tipoId, situacao: 'ativos', busca, limite: 20 } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os modelos.');
      return {
        itens: data.itens.map((item) => ({
          id: item.id,
          rotulo: `${item.fabricante} ${item.nome}`,
        })),
        total: data.total,
      };
    },
    [api, tipoId],
  );

  const campoDoTipo = (
    <CampoComCadastro
      alvo="tipo"
      campo="Tipo do ativo"
      aoCriar={(criado) => definirTipoPedido(criado.id)}
    >
      <Selecao
        rotulo="Tipo do ativo"
        obrigatorio
        opcoes={tipos.map((candidato) => ({ id: candidato.id, rotulo: candidato.nome }))}
        selectedKey={tipo ? tipo.id : null}
        onSelectionChange={(chave) => {
          if (chave !== null) pedirTipo(String(chave));
          definirErros(({ tipo: _resolvido, ...restantes }) => restantes);
        }}
        erro={erros.tipo}
      />
    </CampoComCadastro>
  );

  const campoDoModelo = tipo && (
    <>
      <div className={estilos.campo}>
        {/* O modelo que ainda não existe é cadastrado numa aba, já com o tipo do ativo. */}
        <CampoComCadastro
          alvo="modelo"
          campo="Modelo"
          inicial={{ tipoId: tipo.id }}
          aoCriar={(criado) => escolherModelo(criado.id, criado.nome)}
        >
          <SeletorDeConta
            rotulo="Modelo"
            descricao="Procure pelo nome ou pelo fabricante."
            valor={estado.modeloId ? { id: estado.modeloId, rotulo: nomeDoModelo ?? '' } : null}
            aoMudar={(escolhido) => escolherModelo(escolhido?.id ?? null, escolhido?.rotulo)}
            buscar={buscarModelos}
            erro={erros[CHAVE_DO_MODELO]}
          />
        </CampoComCadastro>
        <EstadoDoCampo
          rotuloDoCampo="Modelo"
          origem={null}
          autor={null}
          momento={null}
          travado={estado.travas[CHAVE_DO_MODELO] ?? false}
          aoMudarTrava={(travado) => travar(CHAVE_DO_MODELO, travado)}
        />
      </div>
      <p className={estilos.informacao}>
        Fabricante: {modeloValido ? modeloValido.fabricante : 'vem do modelo escolhido'}
      </p>
      <p className={estilos.informacao}>Tipo: {tipo.nome}</p>
    </>
  );

  return (
    <>
      <Formulario className={estilos.formulario} validationBehavior="aria" onSubmit={aoEnviar}>
        <EtapasDoFormulario
          rotulo="Etapas do cadastro"
          etapas={etapas.map((item) => ({
            id: item.chave,
            nome: item.nome,
            situacao: item.situacao,
            tom: item.tom,
            ...(item.motivo !== undefined && { motivo: item.motivo }),
          }))}
          atual={chaveDaEtapa}
          aoEscolher={(chave) => abrirEtapa(chave)}
          rodape={rodape}
        >
          <div ref={painel} className={estilos.painel}>
            <h2 tabIndex={-1} className={estilos.titulo}>
              {etapa?.nome}
            </h2>
            <div className={estilos.ladoALado}>
              <MiniaturaDeAtivo
                tipo={tipo?.icone ?? 'generico'}
                imagemDoModelo={modeloValido ? imagemDoModelo(modeloValido, 256) : undefined}
                rotulo={modeloValido ? `Imagem de ${nomeDoModelo}` : undefined}
                className={estilos.imagem}
              />
              <div className={estilos.campos}>
                {chaveDaEtapa === 'tipo' ? (
                  campoDoTipo
                ) : chaveDaEtapa === 'modelo' ? (
                  campoDoModelo
                ) : (
                  // Os campos lado a lado enquanto cabem, como na ficha em cartões.
                  <div className={estilosDoAtivo.camposEmColunas}>
                    {etapa?.campos.map((definicao) => (
                      <CampoDoAtivo
                        key={definicao.chave}
                        definicao={definicao}
                        entrada={estado.entradas[definicao.chave] ?? null}
                        aoMudar={(entrada, nome) => mudarEntrada(definicao.chave, entrada, nome)}
                        erro={erros[definicao.chave]}
                        soLeitura={definicao.restrito && !editarRestritos}
                        nomeDoRegistro={(id) => estado.nomes[id]}
                        travado={estado.travas[definicao.chave] ?? false}
                        aoMudarTrava={(travado) => travar(definicao.chave, travado)}
                        localDoAtivo={
                          typeof estado.entradas['ativo.local'] === 'string'
                            ? estado.entradas['ativo.local']
                            : null
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <MensagemDoPasso texto={falha} chave={tentativa} />
            <div className={estilos.acoes}>
              {anterior && <Botao onPress={() => abrirEtapa(anterior.chave)}>Voltar</Botao>}
              <Botao
                type="submit"
                nivel="primario"
                carregando={enviando}
                rotuloCarregando="Enviando"
              >
                {seguinte ? `Continuar para ${seguinte.nome}` : 'Cadastrar'}
              </Botao>
            </div>
          </div>
        </EtapasDoFormulario>
      </Formulario>
      <Dialogo
        alerta
        titulo="Trocar o tipo?"
        aberto={tipoATrocar !== null}
        aoMudarAberto={(aberto) => {
          if (!aberto) definirTipoATrocar(null);
        }}
        acoes={() => (
          <>
            <Botao onPress={() => definirTipoATrocar(null)}>Manter o tipo</Botao>
            <Botao
              nivel="destrutivo"
              onPress={() => {
                if (tipoATrocar) trocarTipo(tipoATrocar);
                definirTipoATrocar(null);
              }}
            >
              Trocar o tipo
            </Botao>
          </>
        )}
      >
        <p className={estilos.aviso}>O que foi preenchido nas outras etapas sai.</p>
      </Dialogo>
    </>
  );
}
