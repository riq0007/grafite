import {
  CORES_DE_CONSUMIVEL,
  type CorDeConsumivel,
  type DadosDaSolicitacao,
  type ErrosDaSolicitacao,
  type ItemDoToner,
  lerQuantidade,
  limparSolicitacao,
  MENSAGEM_SEM_COMPATIVEL,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
  retornoDoRegistro,
  TIPOS_DE_SOLICITACAO,
  type TipoDeSolicitacao,
  textoDoContadorCongelado,
  validarSolicitacao,
} from '@grafite/domain';
import {
  AreaDeTexto,
  avisar,
  Botao,
  CampoDeTexto,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  Icone,
  LinhaDeCampos,
  LinkDeCadastro,
  MensagemDoPasso,
  Radio,
  Selecao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { SeletorDeLocal } from '../../administracao/seletores/SeletorDeLocal.tsx';
import { useCadastro } from '../../cadastros.tsx';
import { lidoEmCurto, rotuloDoAtivo } from '../estoque/apresentacao.ts';
import estilosDaOperacao from '../Operacao.module.css';
import { resumoDaSolicitacao } from './acoes.ts';
import { CHAVE_DAS_SOLICITACOES, type Solicitacao } from './consultas.ts';
import {
  useAtivoDoEndereco,
  useBuscarAtivos,
  useBuscarImpressoras,
  useBuscarPessoas,
  useImpressoraParaSolicitacao,
  useTiposDeAtivo,
} from './escolhas.ts';
import estilos from './Solicitacoes.module.css';

/** Uma impressora do toner, com a quantidade de cada cor como foi digitada; vazia, a cor não vai. */
interface ImpressoraNoFormulario {
  id: string;
  quantidades: Partial<Record<CorDeConsumivel, string>>;
  /** Na alteração: o consumível de cada item pendente que a solicitação já tem, que fica. */
  consumiveis?: Partial<Record<CorDeConsumivel, string | null>>;
  /** Na alteração: as cores já entregues, que não mudam nem vão no pedido. */
  entregues?: Partial<Record<CorDeConsumivel, number>>;
  /** Na alteração: o total de páginas congelado quando a impressora entrou na solicitação. */
  congelado?: { paginas: number; lidoEm: string } | null;
}

/** O que o formulário guarda: as escolhas com o rótulo delas e os textos como foram digitados. */
interface DadosNoFormulario {
  tipo: TipoDeSolicitacao;
  pessoa: ContaDoSeletor | null;
  observacao: string;
  impressoras: ImpressoraNoFormulario[];
  ativo: ContaDoSeletor | null;
  /** O local do ativo do conserto, para as pessoas dele virem primeiro em "Pedida por". */
  localDoAtivo: string | null;
  defeito: string;
  tipoDeAtivo: string | null;
  quantidade: string;
  motivo: string;
  local: string | null;
}

/** A nova solicitação que a gaveta abre: o tipo e, pela ficha do ativo, a impressora ou o ativo. */
export interface NovaSolicitacao {
  tipo: TipoDeSolicitacao;
  ativo?: string;
}

/** As recusas na tela: os campos pelo nome, a impressora por `impressora:<id>` e o item por `item:<id>:<cor>`. */
type ErrosNoFormulario = Record<string, string>;

/** O item do toner na ordem da solicitação: a impressora e a cor de cada um. */
interface PosicaoDoItem {
  impressora: string;
  cor: CorDeConsumivel;
}

function inicialDe({ tipo, ativo }: NovaSolicitacao): DadosNoFormulario {
  return {
    tipo,
    pessoa: null,
    observacao: '',
    impressoras: tipo === 'toner' && ativo ? [{ id: ativo, quantidades: {} }] : [],
    ativo: null,
    localDoAtivo: null,
    defeito: '',
    tipoDeAtivo: null,
    quantidade: '',
    motivo: '',
    local: null,
  };
}

/** O que a solicitação já tem, para a alteração: os itens entregues ficam como estão. */
function inicialDaSolicitacao(solicitacao: Solicitacao): DadosNoFormulario {
  return {
    tipo: solicitacao.tipo,
    pessoa: { id: solicitacao.pessoa.id, rotulo: solicitacao.pessoa.nome },
    observacao: solicitacao.observacao ?? '',
    impressoras: solicitacao.impressoras.map(({ ativo, contador, itens }) => ({
      id: ativo.id,
      quantidades: Object.fromEntries(
        itens.map(({ cor, quantidade }) => [cor, String(quantidade)]),
      ),
      consumiveis: Object.fromEntries(
        itens
          .filter(({ entrega }) => entrega === null)
          .map(({ cor, consumivel }) => [cor, consumivel?.id ?? null]),
      ),
      entregues: Object.fromEntries(
        itens
          .filter(({ entrega }) => entrega !== null)
          .map(({ cor, quantidade }) => [cor, quantidade]),
      ),
      congelado: contador,
    })),
    ativo: solicitacao.ativo
      ? { id: solicitacao.ativo.id, rotulo: rotuloDoAtivo(solicitacao.ativo) }
      : null,
    localDoAtivo: solicitacao.locais[0]?.id ?? null,
    defeito: solicitacao.defeito ?? '',
    tipoDeAtivo: solicitacao.tipoDeAtivo?.id ?? null,
    quantidade: solicitacao.quantidade === null ? '' : String(solicitacao.quantidade),
    motivo: solicitacao.motivo ?? '',
    local: solicitacao.local?.id ?? null,
  };
}

/**
 * A solicitação como o domínio a confere, com a posição de cada item: as cores pendentes com a
 * quantidade digitada, de cada impressora, na ordem da tela. O item que a solicitação já tem fica
 * com o consumível dele; o novo, sem ele, para a API sugerir. As cores entregues não vão.
 */
function doDominio(dados: DadosNoFormulario): {
  solicitacao: DadosDaSolicitacao;
  posicoes: PosicaoDoItem[];
} {
  const comum = { pessoa: dados.pessoa?.id ?? null, observacao: dados.observacao };
  switch (dados.tipo) {
    case 'toner': {
      const posicoes: PosicaoDoItem[] = [];
      const itens: ItemDoToner[] = [];
      for (const impressora of dados.impressoras) {
        for (const cor of CORES_DE_CONSUMIVEL) {
          const quantidade = impressora.quantidades[cor] ?? '';
          if (quantidade.trim() === '' || impressora.entregues?.[cor] !== undefined) continue;
          posicoes.push({ impressora: impressora.id, cor });
          itens.push({
            impressora: impressora.id,
            cor,
            quantidade: lerQuantidade(quantidade),
            consumivel: impressora.consumiveis?.[cor] ?? null,
          });
        }
      }
      return {
        solicitacao: {
          tipo: 'toner',
          ...comum,
          impressoras: dados.impressoras.map(({ id }) => id),
          itens,
        },
        posicoes,
      };
    }
    case 'conserto':
      return {
        solicitacao: {
          tipo: 'conserto',
          ...comum,
          ativo: dados.ativo?.id ?? null,
          defeito: dados.defeito,
        },
        posicoes: [],
      };
    case 'equipamento':
      return {
        solicitacao: {
          tipo: 'equipamento',
          ...comum,
          tipoDeAtivo: dados.tipoDeAtivo,
          quantidade: lerQuantidade(dados.quantidade),
          motivo: dados.motivo,
          local: dados.local,
        },
        posicoes: [],
      };
  }
}

/** As recusas pelo caminho do domínio e da API, com os itens levados à impressora e à cor deles. */
function errosNoFormulario(
  erros: ErrosDaSolicitacao,
  impressoras: readonly ImpressoraNoFormulario[],
  posicoes: readonly PosicaoDoItem[],
): ErrosNoFormulario {
  const naTela: ErrosNoFormulario = {};
  for (const [caminho, motivo] of Object.entries(erros)) {
    const doItem = /^itens\.(\d+)\.\w+$/.exec(caminho);
    const daImpressora = /^impressoras\.(\d+)$/.exec(caminho);
    let chave = caminho;
    if (doItem) {
      const posicao = posicoes[Number(doItem[1])];
      chave = posicao ? `item:${posicao.impressora}:${posicao.cor}` : 'impressoras';
    } else if (daImpressora) {
      const impressora = impressoras[Number(daImpressora[1])];
      chave = impressora ? `impressora:${impressora.id}` : 'impressoras';
    }
    naTela[chave] ??= motivo;
  }
  return naTela;
}

/**
 * A gaveta da nova solicitação (spec modulo-operacao, "Formulários das solicitações"). O que foi
 * preenchido fica aqui, fora da gaveta: a Nova pessoa pedida por "Pedida por" abre numa aba da
 * janela, e a gaveta, que cobriria a aba, sai da frente até a pessoa voltar criada.
 */
export function GavetaDaNovaSolicitacao({
  nova,
  aoFechar,
}: {
  nova: NovaSolicitacao;
  aoFechar: () => void;
}) {
  const [dados, definirDados] = useState(() => inicialDe(nova));
  // O ativo do conserto que o endereço traz chega só pelo id: o rótulo e o local vêm da API.
  const doEndereco = useAtivoDoEndereco(nova.tipo === 'conserto' ? nova.ativo : undefined);
  const [doEnderecoNoCampo, definirDoEnderecoNoCampo] = useState(false);
  if (doEndereco.data && !doEnderecoNoCampo) {
    definirDoEnderecoNoCampo(true);
    definirDados((atuais) => ({
      ...atuais,
      ativo: doEndereco.data.conta,
      localDoAtivo: doEndereco.data.local,
    }));
  }
  return (
    <GavetaDoFormulario
      titulo="Nova solicitação"
      dados={dados}
      definirDados={definirDados}
      aoFechar={aoFechar}
    />
  );
}

/**
 * A alteração da solicitação pendente, aberta pela ficha e pela linha (spec solicitacoes,
 * "Alteração da solicitação"): os mesmos campos, sem mudar o tipo. A impressora com item entregue
 * fica, e a cor entregue aparece sem mudar.
 */
export function GavetaDaAlteracao({
  solicitacao,
  aoFechar,
}: {
  solicitacao: Solicitacao;
  aoFechar: () => void;
}) {
  const [dados, definirDados] = useState(() => inicialDaSolicitacao(solicitacao));
  return (
    <GavetaDoFormulario
      titulo={`Alterar a solicitação ${solicitacao.numero}`}
      dados={dados}
      definirDados={definirDados}
      alteracao={solicitacao}
      aoFechar={aoFechar}
    />
  );
}

/** A gaveta com o formulário e a Nova pessoa numa aba, que a tira da frente enquanto está aberta. */
function GavetaDoFormulario({
  titulo,
  dados,
  definirDados,
  alteracao,
  aoFechar,
}: {
  titulo: string;
  dados: DadosNoFormulario;
  definirDados: (mudar: (atuais: DadosNoFormulario) => DadosNoFormulario) => void;
  alteracao?: Solicitacao;
  aoFechar: () => void;
}) {
  const [pedindo, definirPedindo] = useState(false);
  const cadastroDaPessoa = useCadastro('pessoa');
  const mudar = (mudanca: Partial<DadosNoFormulario>) =>
    definirDados((atuais) => ({ ...atuais, ...mudanca }));

  const pessoaPorCadastro = cadastroDaPessoa
    ? {
        link: cadastroDaPessoa.link,
        pedir: async () => {
          definirPedindo(true);
          const criada = await cadastroDaPessoa.pedir('solicitacao-pessoa', {
            aoVoltar: () => true,
          });
          definirPedindo(false);
          if (criada) mudar({ pessoa: { id: criada.id, rotulo: criada.nome } });
        },
      }
    : undefined;

  return (
    <Gaveta
      aberta={!pedindo}
      aoMudarAberta={(aberta) => {
        if (!aberta && !pedindo) aoFechar();
      }}
      titulo={titulo}
    >
      <FormularioDaSolicitacao
        dados={dados}
        mudar={mudar}
        alteracao={alteracao}
        cadastroDaPessoa={pessoaPorCadastro}
        aoRegistrar={aoFechar}
        aoCancelar={aoFechar}
      />
    </Gaveta>
  );
}

/**
 * O formulário da nova solicitação (spec solicitacoes, "Solicitação" e "Itens do toner"): o tipo e
 * os campos dele, com as regras do domínio, as mesmas da API, o motivo em cada campo e o foco no
 * primeiro recusado. No toner, cada impressora mostra o total de páginas de agora e as cinco
 * cores, com o consumível que a API vai sugerir. A recusa da API fica no campo dela, e o que foi
 * preenchido fica.
 */
function FormularioDaSolicitacao({
  dados,
  mudar,
  alteracao,
  cadastroDaPessoa,
  aoRegistrar,
  aoCancelar,
}: {
  dados: DadosNoFormulario;
  mudar: (mudanca: Partial<DadosNoFormulario>) => void;
  /** A solicitação alterada; sem ela, o registro de uma nova. */
  alteracao?: Solicitacao;
  cadastroDaPessoa?: { link: string; pedir: () => void };
  aoRegistrar: () => void;
  aoCancelar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [erros, definirErros] = useState<ErrosNoFormulario>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const buscarImpressoras = useBuscarImpressoras();
  const ativos = useBuscarAtivos();
  const tipos = useTiposDeAtivo();
  // As pessoas do local da primeira impressora, do ativo ou do equipamento vêm primeiro.
  const primeira = useImpressoraParaSolicitacao(dados.impressoras[0]?.id);
  const localDasPessoas =
    dados.tipo === 'toner'
      ? (primeira.data?.local?.id ?? null)
      : dados.tipo === 'conserto'
        ? dados.localDoAtivo
        : dados.local;
  const buscarPessoas = useBuscarPessoas(localDasPessoas);

  // O foco vai ao primeiro campo recusado, depois de a tela mostrar as recusas.
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    area.current?.querySelector<HTMLElement>('input[aria-invalid="true"]')?.focus();
  }, [pedidoDeFoco]);

  const tirarErros = (...chaves: string[]) =>
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const chave of chaves) delete restantes[chave];
      return restantes;
    });
  const mudarCampo = (campo: string, mudanca: Partial<DadosNoFormulario>) => {
    mudar(mudanca);
    tirarErros(campo);
  };
  const recusar = (motivos: ErrosNoFormulario) => {
    definirErros(motivos);
    definirPedidoDeFoco((atual) => atual + 1);
  };

  const mudarQuantidade = (id: string, cor: CorDeConsumivel, valor: string) => {
    mudar({
      impressoras: dados.impressoras.map((impressora) =>
        impressora.id === id
          ? { ...impressora, quantidades: { ...impressora.quantidades, [cor]: valor } }
          : impressora,
      ),
    });
    tirarErros(`item:${id}:${cor}`, `impressora:${id}`);
  };
  const incluirImpressora = (escolhida: ContaDoSeletor | null) => {
    if (!escolhida || dados.impressoras.some(({ id }) => id === escolhida.id)) return;
    mudarCampo('impressoras', {
      impressoras: [...dados.impressoras, { id: escolhida.id, quantidades: {} }],
    });
  };
  const tirarImpressora = (id: string) => {
    mudar({ impressoras: dados.impressoras.filter((impressora) => impressora.id !== id) });
    tirarErros(`impressora:${id}`, ...CORES_DE_CONSUMIVEL.map((cor) => `item:${id}:${cor}`));
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const { solicitacao, posicoes } = doDominio(dados);
    // Na alteração, a impressora com item entregue tem o item dela, mesmo sem item pendente.
    const comEntrega = new Set(
      dados.impressoras
        .filter(({ entregues }) => Object.keys(entregues ?? {}).length > 0)
        .map(({ id }) => id),
    );
    const conferidos = validarSolicitacao(solicitacao, { comEntrega });
    if (Object.keys(conferidos).length > 0) {
      return recusar(errosNoFormulario(conferidos, dados.impressoras, posicoes));
    }
    definirEnviando(true);
    try {
      const corpo = limparSolicitacao(solicitacao) as never;
      const resultado = await pedir(
        () =>
          alteracao
            ? api.PATCH('/solicitacoes/{numero}', {
                params: { path: { numero: alteracao.numero } },
                body: corpo,
              })
            : api.POST('/solicitacoes', { body: corpo }),
        alteracao ? 'alterar a solicitação' : 'registrar a solicitação',
      );
      if ('erro' in resultado) {
        const recusa = recusaDe<string>(resultado);
        if (recusa.campos && Object.keys(recusa.campos).length > 0) {
          return recusar(
            errosNoFormulario(recusa.campos as ErrosDaSolicitacao, dados.impressoras, posicoes),
          );
        }
        definirFalha(recusa.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SOLICITACOES });
      avisar({
        situacao: 'sucesso',
        titulo: alteracao ? 'Solicitação alterada.' : retornoDoRegistro(resultado.dados.numero),
      });
      aoRegistrar();
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <div ref={area} className={estilosDaOperacao.tela}>
      <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
        {alteracao ? (
          <p className={estilosDaOperacao.informacao}>{resumoDaSolicitacao(alteracao)}</p>
        ) : (
          <GrupoDeRadios
            rotulo="Tipo"
            orientation="horizontal"
            value={dados.tipo}
            onChange={(tipo) => mudar({ tipo: tipo as TipoDeSolicitacao })}
          >
            {TIPOS_DE_SOLICITACAO.map((tipo) => (
              <Radio key={tipo} value={tipo}>
                {ROTULOS_DOS_TIPOS_DE_SOLICITACAO[tipo]}
              </Radio>
            ))}
          </GrupoDeRadios>
        )}
        <div className={estilosDaOperacao.lista}>
          <SeletorDeConta
            rotulo="Pedida por"
            obrigatorio
            valor={dados.pessoa}
            aoMudar={(pessoa) => mudarCampo('pessoa', { pessoa })}
            buscar={buscarPessoas}
            erro={erros.pessoa}
          />
          {cadastroDaPessoa && (
            <LinkDeCadastro
              texto={cadastroDaPessoa.link}
              campo="Pedida por"
              aoPressionar={cadastroDaPessoa.pedir}
            />
          )}
        </div>
        {dados.tipo === 'toner' && (
          <>
            {dados.impressoras.map((impressora) => (
              <ImpressoraNoPedido
                key={impressora.id}
                impressora={impressora}
                erros={erros}
                aoMudarQuantidade={(cor, valor) => mudarQuantidade(impressora.id, cor, valor)}
                aoTirar={() => tirarImpressora(impressora.id)}
              />
            ))}
            <SeletorDeConta
              // Depois de cada impressora incluída, o campo volta vazio para a próxima.
              key={dados.impressoras.length}
              rotulo="Adicionar impressora"
              obrigatorio={dados.impressoras.length === 0}
              valor={null}
              aoMudar={incluirImpressora}
              buscar={buscarImpressoras}
              descricao="As impressoras ativas que usam consumíveis, pelo nome ou pelo patrimônio."
              erro={erros.impressoras}
            />
          </>
        )}
        {dados.tipo === 'conserto' && (
          <>
            <SeletorDeConta
              rotulo="Ativo"
              obrigatorio
              valor={dados.ativo}
              aoMudar={(ativo) =>
                mudarCampo('ativo', {
                  ativo,
                  localDoAtivo: ativo ? ativos.localDe(ativo.id) : null,
                })
              }
              buscar={ativos.buscar}
              erro={erros.ativo}
            />
            <AreaDeTexto
              rotulo="Defeito"
              obrigatorio
              value={dados.defeito}
              onChange={(defeito) => mudarCampo('defeito', { defeito })}
              erro={erros.defeito}
            />
          </>
        )}
        {dados.tipo === 'equipamento' && (
          <>
            <Selecao
              rotulo="Tipo de ativo"
              obrigatorio
              opcoes={tipos.data ?? []}
              selectedKey={dados.tipoDeAtivo}
              onSelectionChange={(chave) =>
                mudarCampo('tipoDeAtivo', { tipoDeAtivo: chave === null ? null : String(chave) })
              }
              erro={erros.tipoDeAtivo ?? (tipos.isError ? tipos.error.message : undefined)}
            />
            <CampoDeTexto
              rotulo="Quantidade"
              obrigatorio
              inputMode="numeric"
              autoComplete="off"
              value={dados.quantidade}
              onChange={(quantidade) => mudarCampo('quantidade', { quantidade })}
              erro={erros.quantidade}
            />
            <AreaDeTexto
              rotulo="Motivo"
              obrigatorio
              value={dados.motivo}
              onChange={(motivo) => mudarCampo('motivo', { motivo })}
              erro={erros.motivo}
            />
            <SeletorDeLocal
              rotulo="Local"
              obrigatorio
              valor={dados.local}
              aoMudar={(local) => mudarCampo('local', { local })}
              erro={erros.local}
            />
          </>
        )}
        <AreaDeTexto
          rotulo="Observação"
          value={dados.observacao}
          onChange={(observacao) => mudarCampo('observacao', { observacao })}
          erro={erros.observacao}
        />
        <MensagemDoPasso texto={falha} chave={tentativa} />
        <LinhaDeCampos>
          <div className={estilosDaOperacao.acoes}>
            <Botao
              type="submit"
              nivel="primario"
              carregando={enviando}
              rotuloCarregando={alteracao ? 'Salvando' : 'Registrando'}
            >
              {alteracao ? 'Salvar' : 'Registrar'}
            </Botao>
            <Botao nivel="terciario" onPress={aoCancelar}>
              Cancelar
            </Botao>
          </div>
        </LinhaDeCampos>
      </Formulario>
    </div>
  );
}

/**
 * Uma impressora do toner na gaveta: o nome, o total de páginas de agora, que a solicitação congela
 * ao registrar, ou o congelado, da impressora que ela já tem, e as cinco cores, cada uma com a
 * quantidade e o consumível sugerido, ou "Nenhum compatível dessa cor.". A cor entregue fica sem
 * mudar, e a impressora com ela não sai da solicitação.
 */
function ImpressoraNoPedido({
  impressora,
  erros,
  aoMudarQuantidade,
  aoTirar,
}: {
  impressora: ImpressoraNoFormulario;
  erros: ErrosNoFormulario;
  aoMudarQuantidade: (cor: CorDeConsumivel, valor: string) => void;
  aoTirar: () => void;
}) {
  const dataHora = useDataHora();
  const consulta = useImpressoraParaSolicitacao(impressora.id);
  const dados = consulta.data;
  const nome = dados
    ? rotuloDoAtivo(dados.ativo)
    : consulta.isError
      ? 'Impressora'
      : 'Carregando a impressora…';
  const referencia = dados ? (dados.ativo.patrimonio ?? dados.ativo.rotulo) : 'impressora';
  const recusas = [erros[`impressora:${impressora.id}`], consulta.error?.message].filter(Boolean);
  const contador = impressora.congelado !== undefined ? impressora.congelado : dados?.contador;
  const comEntrega = Object.keys(impressora.entregues ?? {}).length > 0;
  return (
    <fieldset className={estilos.impressora}>
      <legend className={estilos.nomeDaImpressora}>{nome}</legend>
      <div className={estilos.cabecalhoDaImpressora}>
        <p className={estilos.contador}>
          {contador !== undefined
            ? textoDoContadorCongelado(
                contador?.paginas ?? null,
                contador ? lidoEmCurto(new Date(contador.lidoEm), dataHora) : null,
              )
            : null}
        </p>
        {!comEntrega && (
          <Botao nivel="terciario" aria-label={`Tirar a ${referencia}`} onPress={aoTirar}>
            Tirar
          </Botao>
        )}
      </div>
      {recusas.map((recusa) => (
        <p key={recusa} className={estilos.erroDaImpressora}>
          <Icone icone={CircleAlert} />
          {recusa}
        </p>
      ))}
      {dados && (
        <div className={estilos.cores}>
          {CORES_DE_CONSUMIVEL.map((cor) => {
            const daCor = dados.cores.find((atual) => atual.cor === cor);
            const sugerido = daCor?.compativeis.find(({ id }) => id === daCor.sugerido);
            const entregue = impressora.entregues?.[cor];
            return (
              <CampoDeTexto
                key={cor}
                rotulo={ROTULOS_DAS_CORES_DE_CONSUMIVEL[cor]}
                inputMode="numeric"
                autoComplete="off"
                isReadOnly={entregue !== undefined}
                value={
                  entregue !== undefined ? String(entregue) : (impressora.quantidades[cor] ?? '')
                }
                onChange={(valor) => aoMudarQuantidade(cor, valor)}
                descricao={
                  entregue !== undefined
                    ? 'Entregue'
                    : sugerido
                      ? `Sugerido: ${[sugerido.codigo, sugerido.nome].filter(Boolean).join(' · ')}`
                      : MENSAGEM_SEM_COMPATIVEL
                }
                erro={erros[`item:${impressora.id}:${cor}`]}
              />
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
