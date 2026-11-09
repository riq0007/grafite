import {
  type CampoNoCatalogo,
  CHAVE_DO_MODELO,
  camposDoAtivo,
  ROTULOS_DAS_ORIGENS,
} from '@grafite/domain';
import {
  Botao,
  EstadoDoCampo,
  EtapasDoFormulario,
  Formulario,
  MensagemDoPasso,
  Selecao,
  useDataHora,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { RecusaDoFormulario } from '../../administracao/recusa.ts';
import { useCaminhoDoLocal } from '../../administracao/seletores/SeletorDeLocal.tsx';
import { CampoComCadastro } from '../../cadastros.tsx';
import estilos from '../Ativos.module.css';
import {
  type CampoDaOrganizacao,
  CHAVE_DOS_MODELOS,
  type FichaDoAtivo,
  type TipoDeAtivo,
} from '../consultas.ts';
import { ReferenciaAoModelo } from '../modelos/ReferenciaAoModelo.tsx';
import { ReferenciaAoTipo } from '../tipos/ReferenciaAoTipo.tsx';
import { CampoDoAtivo, type EntradaDoCampo, entradaInicial } from './CampoDoAtivo.tsx';
import {
  alteracoesNaoSalvas,
  cartaoComRecusa,
  cartoesDaFicha,
  type SituacaoDaCapacidade,
  textoDasAlteracoes,
  VISAO_GERAL,
} from './cartoes.ts';
import {
  errosDaRecusa,
  entradasIguais as iguais,
  montarPedidoDoAtivo,
  type PedidoDoAtivo,
} from './pedidoDoAtivo.ts';

export interface PropsDoFormularioDoAtivo {
  tipo: TipoDeAtivo;
  campos: readonly CampoDaOrganizacao[];
  /** O ativo gravado. O cadastro do ativo é feito em etapas (change cadastro-em-etapas). */
  ficha: FichaDoAtivo;
  soLeitura?: boolean;
  verRestritos: boolean;
  editarRestritos: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoAtivo) => Promise<{ ok: true } | RecusaDoFormulario>;
  /**
   * Na ficha, a ficha que a API devolve depois de enviar ou remover o arquivo de um campo, que vale
   * na hora, fora do envio do formulário.
   */
  aplicar?: (ficha: FichaDoAtivo) => void;
  /**
   * O cartão aberto, pela chave, como o endereço o guarda (change ficha-em-cartoes); sem ele, o
   * primeiro cartão do tipo (change primeiro-cartao-da-ficha).
   */
  cartaoAberto: string | undefined;
  /** A troca de cartão, com o aviso de que o aberto é o primeiro, que fica fora do endereço. */
  aoAbrirCartao: (chave: string, primeiro: boolean) => void;
  /** O primeiro cartão escolhido no tipo; nulo no automático. */
  primeiroCartao: string | null;
  /** A imagem do ativo, no painel de cada cartão. */
  imagem: ReactNode;
  /** O conteúdo da Visão geral: os blocos dos módulos e os segredos. */
  visaoGeral: ReactNode;
  resumoDaVisaoGeral: string;
  /** O painel e a situação de cada capacidade que tem um, pela chave da capacidade. */
  capacidades: Readonly<Record<string, { painel: ReactNode; situacao: SituacaoDaCapacidade }>>;
}

/** Para onde o foco vai depois da troca de cartão: o nome dele, ou o primeiro campo recusado. */
type Foco = { alvo: 'titulo' | 'recusa'; vez: number };

/**
 * O formulário do ativo na ficha, em cartões (spec cadastro-de-ativos, "Aba Dados em cartões";
 * change ficha-em-cartoes, decisões 1 e 5): à esquerda os cartões dos grupos, cada um com o resumo
 * do que tem; à direita o cartão aberto, com a imagem e os campos ao lado, cada um com o estado e a
 * trava. O estado de todos os cartões fica aqui: trocar de cartão não perde o que foi digitado, e
 * "Salvar alterações" manda só as chaves que mudaram, lidas pelo motor de campos antes do envio,
 * com as mesmas recusas da API, que abrem o cartão do campo, com o foco nele.
 */
export function FormularioDoAtivo({
  tipo,
  campos,
  ficha,
  soLeitura = false,
  verRestritos,
  editarRestritos,
  rotuloDoEnvio,
  enviar,
  aplicar,
  cartaoAberto,
  aoAbrirCartao,
  primeiroCartao,
  imagem,
  visaoGeral,
  resumoDaVisaoGeral,
  capacidades,
}: PropsDoFormularioDoAtivo) {
  const api = useApi();
  const { formatarDataEHora } = useDataHora();
  const definicoes = useMemo(
    () =>
      camposDoAtivo({
        tipo: { capacidades: tipo.capacidades, campos: tipo.campos },
        campos: campos as readonly CampoNoCatalogo[],
      }),
    [tipo, campos],
  );

  // O ponto de partida: o que está gravado.
  const [iniciais, definirIniciais] = useState(() =>
    Object.fromEntries(
      [...definicoes.porChave.values()].map((definicao) => [
        definicao.chave,
        entradaInicial(definicao, ficha.valores[definicao.chave]),
      ]),
    ),
  );
  const [travasIniciais] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.entries(ficha.estado).map(([chave, e]) => [chave, e.trava])),
  );
  const [entradas, definirEntradas] = useState<Record<string, EntradaDoCampo>>(iniciais);
  const [travas, definirTravas] = useState<Record<string, boolean>>(travasIniciais);

  // A ficha relida com a ficha aberta, como pelo evento dos ativos (spec cadastro-de-ativos,
  // "Valores do servidor na ficha aberta"): o campo que a pessoa não editou passa ao valor novo do
  // servidor, que vira a inicial dele; o editado fica como ela deixou, e salvar o envia.
  const [valoresLidos, definirValoresLidos] = useState(ficha.valores);
  if (ficha.valores !== valoresLidos) {
    definirValoresLidos(ficha.valores);
    const novasIniciais = { ...iniciais };
    const novasEntradas = { ...entradas };
    let mudou = false;
    for (const definicao of definicoes.porChave.values()) {
      const nova = entradaInicial(definicao, ficha.valores[definicao.chave]);
      const inicial = iniciais[definicao.chave];
      const atual = entradas[definicao.chave];
      if (atual === undefined || iguais(nova, inicial) || !iguais(atual, inicial)) continue;
      novasIniciais[definicao.chave] = nova;
      novasEntradas[definicao.chave] = nova;
      mudou = true;
    }
    if (mudou) {
      definirIniciais(novasIniciais);
      definirEntradas(novasEntradas);
    }
  }
  const [modeloId, definirModeloId] = useState<string | null>(ficha.modelo?.id ?? null);
  const [nomes, definirNomes] = useState<Record<string, string>>({});
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  const modelos = useQuery({
    queryKey: [...CHAVE_DOS_MODELOS, { tipo: tipo.id, situacao: 'ativos', escolha: true }],
    queryFn: () =>
      consultar(
        () =>
          api.GET('/modelos', {
            params: { query: { tipo: tipo.id, situacao: 'ativos', limite: 100 } },
          }),
        'carregar os modelos',
      ),
    enabled: !soLeitura,
  });

  // O local escolhido e ainda não salvo não está nas referências da ficha: o caminho vem dos locais
  // que a escolha trouxe, para o resumo do cartão.
  const caminhoDoLocal = useCaminhoDoLocal();
  const nomeDoRegistro = (id: string) =>
    nomes[id] ??
    ficha.referencias.pessoas[id] ??
    ficha.referencias.locais[id] ??
    ficha.referencias.ativos[id] ??
    ficha.referencias.fornecedores?.[id] ??
    caminhoDoLocal(id);

  const mudar = (chave: string, entrada: EntradaDoCampo, nome?: string) => {
    definirEntradas((atuais) => ({ ...atuais, [chave]: entrada }));
    if (nome && typeof entrada === 'string')
      definirNomes((atuais) => ({ ...atuais, [entrada]: nome }));
    definirErros(({ [chave]: _resolvido, ...restantes }) => restantes);
  };
  const travar = (chave: string, travado: boolean) =>
    definirTravas((atuais) => ({ ...atuais, [chave]: travado }));

  const cartoes = cartoesDaFicha({
    grupos: definicoes.grupos,
    entradas,
    verRestritos,
    situacoesDasCapacidades: Object.fromEntries(
      Object.entries(capacidades).map(([chave, { situacao }]) => [chave, situacao]),
    ),
    resumoDaVisaoGeral,
    nomeDoRegistro,
    primeiroCartao,
  });
  // O cartão aberto acompanha o endereço; a troca pela lista vale na hora, antes de ele mudar. Sem
  // cartão no endereço, abre o primeiro da lista.
  const [aberto, definirAberto] = useState(cartaoAberto);
  const [doEndereco, definirDoEndereco] = useState(cartaoAberto);
  if (cartaoAberto !== doEndereco) {
    definirDoEndereco(cartaoAberto);
    definirAberto(cartaoAberto);
  }
  const cartao = cartoes.find((candidato) => candidato.chave === aberto) ?? cartoes[0];
  const pendentes = alteracoesNaoSalvas({
    entradas,
    iniciais,
    travas,
    travasIniciais,
    modeloId,
    modeloInicial: ficha.modelo?.id ?? null,
  });

  const painel = useRef<HTMLDivElement>(null);
  const [foco, definirFoco] = useState<Foco | null>(null);
  // O foco vai para o nome do cartão aberto, ou para o primeiro campo recusado dele.
  useLayoutEffect(() => {
    if (!foco || !painel.current) return;
    const recusado =
      foco.alvo === 'recusa'
        ? painel.current.querySelector<HTMLElement>('[aria-invalid="true"]')
        : null;
    (recusado ?? painel.current.querySelector<HTMLElement>('h2'))?.focus();
  }, [foco]);
  const abrir = (chave: string, alvo: Foco['alvo'] = 'titulo') => {
    definirAberto(chave);
    aoAbrirCartao(chave, chave === cartoes[0]?.chave);
    definirFoco((anterior) => ({ alvo, vez: (anterior?.vez ?? 0) + 1 }));
  };

  async function salvar() {
    if (enviando || soLeitura) return;
    definirFalha(null);
    const montagem = montarPedidoDoAtivo({
      definicoes,
      entradas,
      iniciais,
      travas,
      travasIniciais,
      modeloId,
      ficha: { valores: ficha.valores, modeloId: ficha.modelo?.id ?? null },
    });
    if (!montagem.ok) {
      definirErros(montagem.erros);
      abrir(cartaoComRecusa(cartoes, montagem.erros) ?? cartao?.chave ?? VISAO_GERAL, 'recusa');
      return;
    }
    definirEnviando(true);
    try {
      // Só o que mudou: o modelo, os valores e as travas, cada um quando mudou.
      const resultado = await enviar(montagem.pedido);
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        const recusas = errosDaRecusa(resultado.campos);
        definirErros(recusas);
        abrir(cartaoComRecusa(cartoes, recusas) ?? cartao?.chave ?? VISAO_GERAL, 'recusa');
        return;
      }
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
    } finally {
      definirEnviando(false);
    }
  }

  const estadoDoModelo = ficha.estado[CHAVE_DO_MODELO];
  const opcoesDoModelo = [
    { id: '', rotulo: 'Sem modelo' },
    ...(modelos.data?.itens ?? []).map((modelo) => ({
      id: modelo.id,
      rotulo: `${modelo.fabricante} ${modelo.nome}`,
    })),
    ...(ficha.modelo && !modelos.data?.itens.some((modelo) => modelo.id === ficha.modelo?.id)
      ? [{ id: ficha.modelo.id, rotulo: `${ficha.modelo.fabricante} ${ficha.modelo.nome}` }]
      : []),
  ];
  const modeloEscolhido = opcoesDoModelo.find((opcao) => opcao.id === (modeloId ?? ''));

  const capacidade = cartao?.chave.startsWith('capacidade:')
    ? capacidades[cartao.chave.slice('capacidade:'.length)]
    : undefined;
  const blocoDoModelo = (
    <>
      <p className={estilos.informacao}>
        Tipo: <ReferenciaAoTipo tipo={ficha.tipo} />
      </p>
      <div className={estilos.campoDoAtivo}>
        {soLeitura ? (
          <p className={estilos.informacao}>
            Modelo:{' '}
            {ficha.modelo ? (
              <ReferenciaAoModelo modelo={ficha.modelo} />
            ) : (
              (modeloEscolhido?.rotulo ?? 'Sem modelo')
            )}
          </p>
        ) : (
          // O modelo que ainda não existe é cadastrado numa aba, já com o tipo do ativo, e volta
          // escolhido (change cadastro-em-abas).
          <CampoComCadastro
            alvo="modelo"
            campo="Modelo"
            inicial={{ tipoId: tipo.id }}
            aoCriar={(modelo) => {
              definirModeloId(modelo.id);
              definirErros(({ [CHAVE_DO_MODELO]: _resolvido, ...restantes }) => restantes);
            }}
          >
            <Selecao
              rotulo="Modelo"
              opcoes={opcoesDoModelo}
              selectedKey={modeloId ?? ''}
              onSelectionChange={(chave) => {
                definirModeloId(chave === '' || chave === null ? null : String(chave));
                definirErros(({ [CHAVE_DO_MODELO]: _resolvido, ...restantes }) => restantes);
              }}
              erro={erros[CHAVE_DO_MODELO]}
            />
          </CampoComCadastro>
        )}
        <EstadoDoCampo
          rotuloDoCampo="Modelo"
          origem={estadoDoModelo?.origem ? ROTULOS_DAS_ORIGENS[estadoDoModelo.origem] : null}
          autor={estadoDoModelo?.autor?.nome ?? null}
          momento={
            estadoDoModelo?.momento ? formatarDataEHora(new Date(estadoDoModelo.momento)) : null
          }
          travado={travas[CHAVE_DO_MODELO] ?? false}
          aoMudarTrava={soLeitura ? undefined : (travado) => travar(CHAVE_DO_MODELO, travado)}
        />
      </div>
    </>
  );

  return (
    <EtapasDoFormulario
      rotulo="Grupos da ficha"
      numerar={false}
      etapas={cartoes.map((item) => ({
        id: item.chave,
        nome: item.nome,
        situacao: item.resumo,
        tom: item.tom,
      }))}
      atual={cartao?.chave ?? VISAO_GERAL}
      aoEscolher={(chave) => abrir(chave)}
      rodape={
        soLeitura ? undefined : <p className={estilos.contagem}>{textoDasAlteracoes(pendentes)}</p>
      }
    >
      <div ref={painel} className={estilos.painelDoCartao}>
        <h2 tabIndex={-1} className={estilos.tituloDaParte}>
          {cartao?.nome}
        </h2>
        <div className={estilos.cartaoLadoALado}>
          <div className={estilos.imagemDoCartao}>{imagem}</div>
          <div className={estilos.conteudoDoCartao}>
            {cartao?.chave === VISAO_GERAL ? (
              visaoGeral
            ) : (
              <>
                {capacidade?.painel}
                {(cartao?.chave === 'identificacao' || (cartao?.campos.length ?? 0) > 0) && (
                  // O Enter num campo salva, como o botão.
                  <Formulario
                    validationBehavior="aria"
                    onSubmit={(evento) => {
                      evento.preventDefault();
                      void salvar();
                    }}
                  >
                    <div className={estilos.camposEmColunas}>
                      {cartao?.chave === 'identificacao' && blocoDoModelo}
                      {cartao?.campos.map((definicao) => (
                        <CampoDoAtivo
                          key={definicao.chave}
                          definicao={definicao}
                          entrada={entradas[definicao.chave] ?? null}
                          aoMudar={(entrada, nome) => mudar(definicao.chave, entrada, nome)}
                          erro={erros[definicao.chave]}
                          soLeitura={soLeitura || (definicao.restrito && !editarRestritos)}
                          nomeDoRegistro={nomeDoRegistro}
                          estado={ficha.estado[definicao.chave]}
                          travado={travas[definicao.chave] ?? false}
                          aoMudarTrava={(travado) => travar(definicao.chave, travado)}
                          ativoAtual={ficha.id}
                          localDoAtivo={
                            typeof entradas['ativo.local'] === 'string'
                              ? entradas['ativo.local']
                              : null
                          }
                          ficha={ficha}
                          aplicar={aplicar}
                        />
                      ))}
                    </div>
                  </Formulario>
                )}
              </>
            )}
          </div>
        </div>
        {!soLeitura && (
          <>
            <MensagemDoPasso texto={falha} chave={tentativa} />
            <div className={estilos.barraDeSalvar}>
              <Botao
                nivel="primario"
                carregando={enviando}
                rotuloCarregando="Enviando"
                onPress={() => void salvar()}
              >
                {rotuloDoEnvio}
              </Botao>
            </div>
          </>
        )}
      </div>
    </EtapasDoFormulario>
  );
}
