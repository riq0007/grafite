import { avisar, Botao, CabecalhoDaPagina, Dialogo, EstadoVazio } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { type RecusaDoFormulario, recusaDe } from '../../administracao/recusa.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { useCadastro } from '../../cadastros.tsx';
import estilos from '../Ativos.module.css';
import {
  type CampoDaOrganizacao,
  CHAVE_DOS_ATIVOS,
  chaveDoAtivo,
  type TipoDeAtivo,
  useCampos,
  useTipos,
} from '../consultas.ts';
import { lerOrigem, useOrigem } from '../origem.ts';
import { CadastroEmEtapas, type PedidoDoCadastro } from './CadastroEmEtapas.tsx';
import {
  CADASTRO_VAZIO,
  decidirPelaOrigem,
  type EstadoDoCadastro,
  estadoDoTipo,
  type PreenchidoPelaOrigem,
  retomarRascunho,
} from './rascunho.ts';
import {
  CHAVE_DO_RASCUNHO,
  useLeituraDoRascunho,
  useRascunhoDoAtivo,
} from './useRascunhoDoAtivo.ts';

/**
 * O cadastro de um ativo (spec cadastro-de-ativos): em etapas, o tipo primeiro, entre os ativos, e
 * depois os grupos da ficha, com o rascunho guardado na conta (change cadastro-em-etapas). Sem
 * nenhum tipo ativo, o cadastro diz isso e leva quem cuida do catálogo a ele. Vindo da tabela com uma
 * origem, o título diz qual e o campo dela vem preenchido, com o tipo e o modelo já escolhidos na
 * origem do modelo e do tipo. Com um rascunho guardado, o cadastro volta de onde parou; com ele e
 * outra origem, a tela pergunta se a pessoa continua o começado.
 */
export function AtivoNovo() {
  const { pode } = useAcesso();
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const tipos = useTipos();
  const campos = useCampos();
  const leitura = useLeituraDoRascunho();
  const cadastroDoTipo = useCadastro('tipo');
  const [tipoId, definirTipoId] = useState<string | null>(null);
  /** Cada descarte recomeça o cadastro vazio. */
  const [recomeco, definirRecomeco] = useState(0);
  const [comecandoNovo, definirComecandoNovo] = useState(false);
  const [falhaDoNovo, definirFalhaDoNovo] = useState<string | null>(null);
  const { origem: daBusca } = useSearch({ from: '/ativos/novo' });
  const origem = useMemo(() => lerOrigem({ origem: daBusca }), [daBusca]);
  const daOrigem = useOrigem(origem);
  const preenchido = daOrigem.estado === 'pronta' ? daOrigem.resumo.preenchido : undefined;
  const titulo = daOrigem.estado === 'pronta' ? daOrigem.resumo.tituloDoCadastro : 'Novo ativo';

  if (!pode('ativos.editar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo ativo" />
        <SemPermissao a="ao cadastro de ativos" />
      </>
    );
  }
  // Sem o rascunho lido, o cadastro não começa vazio: ele sobrescreveria o guardado.
  const falha = tipos.error ?? campos.error ?? leitura.error;
  if (falha) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo ativo" />
        <EstadoVazio
          titulo={falha.message}
          acao={
            <Botao
              onPress={() => {
                void tipos.refetch();
                void campos.refetch();
                void leitura.refetch();
              }}
            >
              Tentar de novo
            </Botao>
          }
        />
      </>
    );
  }
  if (
    !tipos.data ||
    !campos.data ||
    leitura.data === undefined ||
    daOrigem.estado === 'carregando'
  ) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo ativo" />
        <p role="status" className={estilos.contagem}>
          Carregando o catálogo…
        </p>
      </>
    );
  }
  const ativos = tipos.data.tipos.filter((tipo) => tipo.situacao === 'ativo');
  if (ativos.length === 0) {
    // Quem cuida do catálogo cadastra o primeiro tipo numa aba, e ele volta escolhido (change
    // cadastro-em-abas).
    return (
      <>
        <CabecalhoDaPagina titulo="Novo ativo" />
        <EstadoVazio
          titulo="Nenhum tipo de ativo ainda."
          descricao={
            cadastroDoTipo
              ? 'Cadastre os tipos de ativo que a organização tem.'
              : 'Quem cuida do catálogo cadastra os tipos de ativo.'
          }
          acao={
            cadastroDoTipo ? (
              <Botao
                onPress={async () => {
                  const criado = await cadastroDoTipo.pedir('tipo');
                  if (criado) definirTipoId(criado.id);
                }}
              >
                {cadastroDoTipo.link}
              </Botao>
            ) : undefined
          }
        />
      </>
    );
  }

  const rascunho = leitura.data;
  const decisao = decidirPelaOrigem({ rascunho, origem: daBusca ?? null });
  // Sem a origem na tela, o cadastro começado continua.
  const continuarOComecado = () => void navegar({ to: '/ativos/novo', search: {}, replace: true });
  const comecarUmNovo = async () => {
    definirComecandoNovo(true);
    definirFalhaDoNovo(null);
    const resultado = await pedir(() => api.DELETE('/ativos/rascunho'), 'descartar o rascunho');
    definirComecandoNovo(false);
    if ('erro' in resultado) definirFalhaDoNovo(resultado.erro);
    else consultas.setQueryData(CHAVE_DO_RASCUNHO, null);
  };
  if (decisao === 'perguntar') {
    return (
      <>
        <CabecalhoDaPagina titulo={titulo} />
        <Dialogo
          titulo="Continuar o cadastro começado?"
          aberto
          aoMudarAberto={(aberto) => {
            if (!aberto) continuarOComecado();
          }}
          acoes={() => (
            <>
              <Botao onPress={continuarOComecado}>Continuar o começado</Botao>
              <Botao
                nivel="primario"
                carregando={comecandoNovo}
                rotuloCarregando="Descartando"
                onPress={comecarUmNovo}
              >
                Começar um novo
              </Botao>
            </>
          )}
        >
          <p className={estilos.informacao}>
            Há um cadastro de ativo começado nesta conta. Começar um novo descarta o que foi
            preenchido nele.
          </p>
          {falhaDoNovo && (
            <p role="alert" className={estilos.erro}>
              {falhaDoNovo}
            </p>
          )}
        </Dialogo>
      </>
    );
  }

  // O cadastro começa do rascunho, do tipo criado na tela sem tipos, do da origem ou vazio.
  const editarRestritos = pode('ativos.restritos');
  const retomado = decisao === 'retomar' && rascunho ? rascunho : null;
  const doInicio = ativos.find((candidato) => candidato.id === (tipoId ?? preenchido?.tipoId));
  const inicial: EstadoDoCadastro = retomado
    ? retomarRascunho({
        rascunho: retomado,
        tipos: ativos,
        campos: campos.data.campos,
        editarRestritos,
      })
    : doInicio
      ? estadoDoTipo({
          tipo: doInicio,
          campos: campos.data.campos,
          preenchido,
          origem: daBusca ?? null,
          editarRestritos,
        })
      : { ...CADASTRO_VAZIO, origem: daBusca ?? null };
  return (
    <div className={estilos.tela}>
      {/* Com a barra das abas, a primeira aba já diz o título, e ele sai de cima das etapas. */}
      <CabecalhoDaPagina titulo={titulo} ocultarComAbas />
      <CadastroComRascunho
        // O tipo criado na tela sem tipos pode chegar depois da lista, e o descarte recomeça: em
        // ambos, o cadastro começa de novo.
        key={`${tipoId ?? ''}-${recomeco}-${retomado ? 'retomado' : 'novo'}`}
        tipos={ativos}
        campos={campos.data.campos}
        inicial={inicial}
        preenchido={preenchido}
        editarRestritos={editarRestritos}
        guardadoEm={retomado?.atualizadoEm ?? null}
        aoDescartar={() => {
          consultas.setQueryData(CHAVE_DO_RASCUNHO, null);
          definirTipoId(null);
          definirRecomeco((atual) => atual + 1);
          if (daBusca) void navegar({ to: '/ativos/novo', search: {}, replace: true });
        }}
        cadastrar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/ativos', { body: { valores: {}, travas: {}, ...pedido } }),
            'cadastrar o ativo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          consultas.setQueryData(chaveDoAtivo(resultado.dados.id), resultado.dados);
          void consultas.invalidateQueries({ queryKey: CHAVE_DOS_ATIVOS });
          avisar({ situacao: 'sucesso', titulo: 'Ativo cadastrado.' });
          void navegar({
            to: '/ativos/$id',
            params: { id: resultado.dados.id },
            replace: true,
          });
          return { ok: true };
        }}
      />
    </div>
  );
}

/**
 * O cadastro em etapas com o rascunho: cada mudança vai para ele; antes de cadastrar, a gravação
 * para, e o cadastro recusado volta a guardar. Embaixo das etapas, a situação do rascunho, o
 * "Tentar de novo" da falha e o "Descartar o rascunho", com a confirmação.
 */
function CadastroComRascunho({
  tipos,
  campos,
  inicial,
  preenchido,
  editarRestritos,
  guardadoEm,
  aoDescartar,
  cadastrar,
}: {
  tipos: readonly TipoDeAtivo[];
  campos: readonly CampoDaOrganizacao[];
  inicial: EstadoDoCadastro;
  preenchido?: PreenchidoPelaOrigem;
  editarRestritos: boolean;
  guardadoEm: string | null;
  aoDescartar: () => void;
  cadastrar: (pedido: PedidoDoCadastro) => Promise<{ ok: true } | RecusaDoFormulario>;
}) {
  const rascunho = useRascunhoDoAtivo({ guardadoEm });
  const ultimo = useRef(inicial);
  const [descartar, definirDescartar] = useState(false);
  const [descartando, definirDescartando] = useState(false);
  const [falhaDoDescarte, definirFalhaDoDescarte] = useState<string | null>(null);
  const { guardar } = rascunho;
  const aoMudar = useRef((estado: EstadoDoCadastro) => {
    ultimo.current = estado;
    guardar(estado);
  }).current;

  return (
    <>
      <CadastroEmEtapas
        tipos={tipos}
        campos={campos}
        inicial={inicial}
        preenchido={preenchido}
        editarRestritos={editarRestritos}
        aoMudar={aoMudar}
        cadastrar={async (pedido) => {
          await rascunho.antesDeCadastrar();
          const resultado = await cadastrar(pedido);
          // O cadastro recusado mantém o rascunho, com o que estava na tela.
          if (!('ok' in resultado)) guardar(ultimo.current);
          return resultado;
        }}
        rodape={
          rascunho.texto && (
            <div className={estilos.rascunho}>
              {!rascunho.falhou && <p className={estilos.contagem}>{rascunho.texto}</p>}
              <p role="status" className={estilos.contagem}>
                {rascunho.falhou ? rascunho.texto : ''}
              </p>
              {rascunho.falhou && (
                <Botao nivel="terciario" onPress={rascunho.tentarDeNovo}>
                  Tentar de novo
                </Botao>
              )}
              <Botao nivel="terciario" onPress={() => definirDescartar(true)}>
                Descartar o rascunho
              </Botao>
            </div>
          )
        }
      />
      <Dialogo
        alerta
        titulo="Descartar o rascunho?"
        aberto={descartar}
        aoMudarAberto={(aberto) => {
          if (!aberto) definirDescartar(false);
        }}
        acoes={() => (
          <>
            <Botao onPress={() => definirDescartar(false)}>Continuar editando</Botao>
            <Botao
              nivel="destrutivo"
              carregando={descartando}
              rotuloCarregando="Descartando"
              onPress={async () => {
                definirDescartando(true);
                definirFalhaDoDescarte(null);
                const resultado = await rascunho.descartar();
                definirDescartando(false);
                if ('erro' in resultado) {
                  definirFalhaDoDescarte(resultado.erro);
                  return;
                }
                definirDescartar(false);
                aoDescartar();
              }}
            >
              Descartar
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>O que foi preenchido sai, e o cadastro recomeça vazio.</p>
        {falhaDoDescarte && (
          <p role="alert" className={estilos.erro}>
            {falhaDoDescarte}
          </p>
        )}
      </Dialogo>
    </>
  );
}
