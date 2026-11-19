// As respostas prontas (spec modulo-chamados, "Respostas prontas e horário da TI na tela"; change
// chamados-da-ti, design, "As respostas prontas (tarefa 5.25)"), para quem configura os chamados: a
// lista na ordem, com a alça, o rótulo, o selo "Espera a resposta", o começo do texto e os tipos; e
// a gaveta da resposta, com "Salvar" e "Remover". A ordem muda pela alça, com o `useArrastar`, e, no
// teclado, pelo "Subir" e pelo "Descer" do menu da linha.
import {
  AreaDeTexto,
  avisar,
  Botao,
  CampoDeTexto,
  Checkbox,
  type ColunaQueSeOrdena,
  Dialogo,
  EstadoVazio,
  Gaveta,
  GrupoDeCheckboxes,
  Interruptor,
  type ItemDoMenuDeContexto,
  RotuloDeSituacao,
  TabelaQueSeOrdena,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import {
  CHAVE_DAS_RESPOSTAS_PRONTAS,
  useRespostasProntas,
  useTiposDeChamado,
} from '../consultas.ts';
import { Recusa } from '../formulario/Recusa.tsx';
import { Selo } from '../Pecas.tsx';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { TelaDosChamados } from '../TelaDosChamados.tsx';
import { moverNaOrdem, movimentosNaOrdem, reordenar } from '../tipos/edicao.ts';
import { useArrastar } from '../useArrastar.ts';
import estilos from './Respostas.module.css';
import {
  contagemDasRespostas,
  type EdicaoDaResposta,
  type ErrosDaResposta,
  edicaoDaResposta,
  errosDaResposta,
  limiteDasRespostas,
  mudouAResposta,
  RESPOSTA_NOVA,
  type RespostaPronta,
  recusasQueValem,
  textoNumaLinha,
  tiposNaLista,
  tiposParaEscolher,
} from './respostas.ts';

const ENDERECO = '/chamados/respostas-prontas';

/** O primeiro campo recusado, onde o foco vai depois da gravação recusada. */
const RECUSADO = 'input[aria-invalid="true"], textarea[aria-invalid="true"], [data-invalid] input';

const ROTULO_DO_MOVIMENTO = { subir: 'Subir', descer: 'Descer' } as const;

type ListaDasRespostas = { respostas: RespostaPronta[] };

/** A gaveta aberta: a resposta gravada, pelo id, ou a nova; a de quando abriu fica, se sumir da lista. */
interface GavetaAberta {
  id: string | null;
  inicial: RespostaPronta | null;
}

/** A recusa da gravação, com a resposta como estava quando foi recusada. */
interface RecusaDaResposta {
  erros: ErrosDaResposta;
  naRecusa: EdicaoDaResposta;
}

export function RespostasProntas() {
  return (
    <TelaDosChamados
      titulo="Respostas prontas"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="às respostas prontas"
    >
      <TelaDasRespostas />
    </TelaDosChamados>
  );
}

function TelaDasRespostas() {
  const idDoTitulo = useId();
  const api = useApi();
  const consultas = useQueryClient();
  const consulta = useRespostasProntas();
  const tipos = useTiposDeChamado();
  const respostas = consulta.data?.respostas ?? null;

  const [aberta, definirAberta] = useState<GavetaAberta | null>(null);
  const [edicao, definirEdicao] = useState<EdicaoDaResposta>(RESPOSTA_NOVA);
  const [recusa, definirRecusa] = useState<RecusaDaResposta | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [andamento, definirAndamento] = useState<'salvar' | 'remover' | null>(null);
  const [confirmando, definirConfirmando] = useState<'fechar' | 'remover' | null>(null);
  const [erroDoRemover, definirErroDoRemover] = useState<string | null>(null);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const areaDaGaveta = useRef<HTMLDivElement>(null);
  // A gaveta sai com o que mostrava enquanto fecha.
  const ultima = useRef<GavetaAberta | null>(null);
  if (aberta) ultima.current = aberta;
  const naGaveta = aberta ?? ultima.current;

  const gravada = naGaveta?.id
    ? (respostas?.find(({ id }) => id === naGaveta.id) ?? naGaveta.inicial)
    : null;
  const mudou = aberta !== null && mudouAResposta(edicao, gravada);
  const erros = recusa ? recusasQueValem(recusa.erros, recusa.naRecusa, edicao) : {};

  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    areaDaGaveta.current?.querySelector<HTMLElement>(RECUSADO)?.focus();
  }, [pedidoDeFoco]);

  // Sair da tela com a gaveta mudada pede a confirmação, como no editor dos tipos.
  const bloqueio = useBlocker({
    shouldBlockFn: ({ next }) => mudou && next.pathname !== ENDERECO,
    enableBeforeUnload: () => mudou,
    withResolver: true,
  });

  const abrir = (resposta: RespostaPronta | null) => {
    definirAberta({ id: resposta?.id ?? null, inicial: resposta });
    definirEdicao(edicaoDaResposta(resposta));
    definirRecusa(null);
    definirFalha(null);
    definirErroDoRemover(null);
  };

  const fechar = () => {
    definirAberta(null);
    definirConfirmando(null);
    definirRecusa(null);
    definirFalha(null);
  };

  /** Fechar com mudanças espera a confirmação de descartá-las. */
  const pedirParaFechar = () => {
    if (mudou) definirConfirmando('fechar');
    else fechar();
  };

  const mudar = (parte: Partial<EdicaoDaResposta>) =>
    definirEdicao((atual) => ({ ...atual, ...parte }));

  /** Põe a resposta que a API devolveu na lista: no lugar dela, ou no fim, quando é nova. */
  const guardarNaLista = (resposta: RespostaPronta) =>
    consultas.setQueryData<ListaDasRespostas>(CHAVE_DAS_RESPOSTAS_PRONTAS, (atual) => {
      if (!atual) return atual;
      const existe = atual.respostas.some(({ id }) => id === resposta.id);
      return {
        ...atual,
        respostas: existe
          ? atual.respostas.map((cada) => (cada.id === resposta.id ? resposta : cada))
          : [...atual.respostas, resposta],
      };
    });

  /** A recusa da API: nos campos, com o foco no primeiro, ou, sem campo, no pé. */
  const recusar = (naRecusa: EdicaoDaResposta, falhou: FalhaDoPedido) => {
    const doCampo = errosDaResposta(falhou.problema?.campos ?? {});
    if (Object.keys(doCampo).length > 0) {
      definirRecusa({ erros: doCampo, naRecusa });
      definirFalha(null);
      definirPedidoDeFoco((vez) => vez + 1);
    } else {
      definirRecusa(null);
      definirFalha(falhou.erro);
    }
  };

  /** "Salvar": cria a nova, no fim da ordem, ou grava a escolhida; nos dois casos, a gaveta fecha. */
  async function salvar() {
    if (andamento || !aberta) return;
    const gravando = edicao;
    const id = aberta.id;
    definirAndamento('salvar');
    try {
      const resultado =
        id === null
          ? await pedir(
              () => api.POST('/chamados/respostas-prontas', { body: gravando }),
              'criar a resposta pronta',
            )
          : await pedir(
              () =>
                api.PUT('/chamados/respostas-prontas/{id}', {
                  params: { path: { id } },
                  body: gravando,
                }),
              'salvar a resposta pronta',
            );
      if ('erro' in resultado) {
        recusar(gravando, resultado);
        return;
      }
      guardarNaLista(resultado.dados);
      fechar();
      avisar({
        situacao: 'sucesso',
        titulo: id === null ? 'Resposta pronta criada.' : 'Resposta pronta salva.',
      });
    } finally {
      definirAndamento(null);
    }
  }

  /** "Remover a resposta", confirmado: ela sai da lista, e a gaveta fecha. */
  async function remover() {
    if (andamento || !aberta?.id) return;
    const id = aberta.id;
    definirAndamento('remover');
    definirErroDoRemover(null);
    try {
      const resultado = await pedir(
        () => api.DELETE('/chamados/respostas-prontas/{id}', { params: { path: { id } } }),
        'remover a resposta pronta',
      );
      if ('erro' in resultado) {
        definirErroDoRemover(resultado.erro);
        return;
      }
      consultas.setQueryData<ListaDasRespostas>(CHAVE_DAS_RESPOSTAS_PRONTAS, (atual) =>
        atual ? { ...atual, respostas: atual.respostas.filter((cada) => cada.id !== id) } : atual,
      );
      fechar();
      avisar({ situacao: 'sucesso', titulo: 'Resposta pronta removida.' });
    } finally {
      definirAndamento(null);
    }
  }

  async function reordenarAsRespostas(ids: string[]) {
    const atual = consultas.getQueryData<ListaDasRespostas>(CHAVE_DAS_RESPOSTAS_PRONTAS);
    // A ordem nova aparece na hora; a resposta da API fica no lugar dela.
    if (atual) {
      const porId = new Map(atual.respostas.map((cada) => [cada.id, cada]));
      consultas.setQueryData(CHAVE_DAS_RESPOSTAS_PRONTAS, {
        ...atual,
        respostas: ids.flatMap((id) => porId.get(id) ?? []),
      });
    }
    const resultado = await pedir(
      () => api.PUT('/chamados/respostas-prontas/ordem', { body: { ids } }),
      'mudar a ordem das respostas prontas',
    );
    if ('erro' in resultado) {
      await consultas.invalidateQueries({ queryKey: CHAVE_DAS_RESPOSTAS_PRONTAS });
      avisar({
        situacao: 'critico',
        titulo: 'A ordem não mudou.',
        descricao: resultado.problema?.campos?.ids ?? resultado.erro,
      });
      return;
    }
    consultas.setQueryData(CHAVE_DAS_RESPOSTAS_PRONTAS, resultado.dados);
  }

  let lista: ReactNode;
  if (consulta.isPending) {
    lista = <p className={estilos.carregando}>Carregando as respostas prontas…</p>;
  } else if (consulta.isError && !respostas) {
    lista = (
      <EstadoVazio
        titulo={consulta.error.message}
        acao={
          <Botao
            carregando={consulta.isFetching}
            rotuloCarregando="Tentando de novo"
            onPress={() => void consulta.refetch()}
          >
            Tentar de novo
          </Botao>
        }
      />
    );
  } else if (respostas && respostas.length === 0) {
    lista = (
      <EstadoVazio
        titulo="Nenhuma resposta pronta."
        descricao="Crie as que a TI manda sempre, como o pedido do print do erro."
        acao={
          <Botao nivel="primario" icone={Plus} onPress={() => abrir(null)}>
            Nova resposta
          </Botao>
        }
      />
    );
  } else if (respostas) {
    lista = (
      <TabelaDasRespostas
        respostas={respostas}
        idDoTitulo={idDoTitulo}
        aoAbrir={(id) => abrir(respostas.find((cada) => cada.id === id) ?? null)}
        aoReordenar={(ids) => void reordenarAsRespostas(ids)}
      />
    );
  }

  const limite = respostas ? limiteDasRespostas(respostas.length) : null;
  const nova = naGaveta?.id === null;
  const titulo = nova ? 'Nova resposta' : (gravada?.rotulo ?? 'Resposta pronta');
  const confirmandoFechar = confirmando === 'fechar' || bloqueio.status === 'blocked';
  const continuar = () => {
    definirConfirmando(null);
    if (bloqueio.status === 'blocked') bloqueio.reset();
  };
  const descartarESeguir = () => {
    if (bloqueio.status === 'blocked') {
      bloqueio.proceed();
      return;
    }
    fechar();
  };
  const opcoesDosTipos = tipos.data ? tiposParaEscolher(tipos.data.tipos) : null;

  return (
    <div className={estilos.tela} data-janela-inteira="rola-por-dentro">
      <div className={estilos.cabecalho}>
        <div className={estilos.titulo}>
          <h1 id={idDoTitulo}>Respostas prontas</h1>
          {respostas && respostas.length > 0 && (
            <RotuloDeSituacao situacao="neutra" semIcone>
              {contagemDasRespostas(respostas.length)}
            </RotuloDeSituacao>
          )}
        </div>
        <p>
          Quem atende as usa no campo de escrever do chamado, nesta ordem. Arraste as linhas para
          mudar a ordem.
        </p>
        {respostas && respostas.length > 0 && (
          <div className={estilos.acoes}>
            <Botao
              nivel="primario"
              icone={Plus}
              onPress={() => abrir(null)}
              isDisabled={limite !== null}
            >
              Nova resposta
            </Botao>
            {limite && <span className={estilos.limite}>{limite}</span>}
          </div>
        )}
      </div>

      <div className={estilos.rolagem}>{lista}</div>

      <Gaveta
        titulo={titulo}
        aberta={aberta !== null}
        aoMudarAberta={(abrindo) => {
          if (!abrindo) pedirParaFechar();
        }}
      >
        <div ref={areaDaGaveta} className={estilos.gaveta}>
          <CampoDeTexto
            rotulo="Rótulo"
            obrigatorio
            value={edicao.rotulo}
            onChange={(rotulo) => mudar({ rotulo })}
            descricao="Aparece no menu e nos botões do campo de escrever."
            erro={erros.rotulo}
          />
          <AreaDeTexto
            rotulo="Texto"
            obrigatorio
            value={edicao.texto}
            onChange={(texto) => mudar({ texto })}
            descricao="{nome} vira o primeiro nome da pessoa do chamado."
            erro={erros.texto}
          />
          <ChaveDaEspera
            ligada={edicao.esperaAResposta}
            aoMudar={(esperaAResposta) => mudar({ esperaAResposta })}
          />
          {opcoesDosTipos ? (
            <GrupoDeCheckboxes
              rotulo="Tipos em que aparece"
              value={edicao.tipos}
              onChange={(marcados) => mudar({ tipos: marcados })}
              descricao="Sem nenhum marcado, a resposta aparece em todos os tipos."
              erro={erros.tipos}
            >
              {opcoesDosTipos.map((tipo) => (
                <Checkbox key={tipo.id} value={tipo.id}>
                  {tipo.nome}
                  {tipo.inativo && <span className={estilos.inativo}> · inativo</span>}
                </Checkbox>
              ))}
            </GrupoDeCheckboxes>
          ) : tipos.isError ? (
            <Recusa texto={tipos.error.message} />
          ) : (
            <p className={estilos.carregando}>Carregando os tipos…</p>
          )}
          {falha && <Recusa texto={falha} />}
          <div className={estilos.pe}>
            {!nova && (
              <Botao
                icone={Trash2}
                onPress={() => {
                  definirErroDoRemover(null);
                  definirConfirmando('remover');
                }}
                isDisabled={andamento !== null}
              >
                Remover
              </Botao>
            )}
            <Botao
              nivel="primario"
              onPress={() => void salvar()}
              isDisabled={(!nova && !mudou) || (andamento !== null && andamento !== 'salvar')}
              carregando={andamento === 'salvar'}
              rotuloCarregando="Salvando"
            >
              Salvar
            </Botao>
          </div>
        </div>
      </Gaveta>

      <Dialogo
        alerta
        titulo={`Remover “${gravada?.rotulo ?? ''}”?`}
        aberto={confirmando === 'remover'}
        aoMudarAberto={(abrindo) => {
          if (!abrindo && andamento !== 'remover') definirConfirmando(null);
        }}
        acoes={() => (
          <>
            <Botao onPress={() => definirConfirmando(null)} isDisabled={andamento === 'remover'}>
              Cancelar
            </Botao>
            <Botao
              nivel="destrutivo"
              onPress={() => void remover()}
              carregando={andamento === 'remover'}
              rotuloCarregando="Removendo"
            >
              Remover a resposta
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          Ela sai do campo de escrever de todos os chamados. As mensagens já mandadas ficam na
          conversa.
        </p>
        {erroDoRemover && <Recusa texto={erroDoRemover} />}
      </Dialogo>

      <Dialogo
        alerta
        titulo={nova ? 'Descartar a resposta nova?' : 'Descartar as mudanças na resposta?'}
        aberto={confirmandoFechar}
        aoMudarAberto={(abrindo) => {
          if (!abrindo) continuar();
        }}
        acoes={() => (
          <>
            <Botao onPress={continuar}>Continuar editando</Botao>
            <Botao nivel="destrutivo" onPress={descartarESeguir}>
              Descartar mudanças
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          {nova
            ? 'O que foi escrito sai, e nenhuma resposta é criada.'
            : 'As mudanças que não foram salvas saem, e a resposta continua como está gravada.'}
        </p>
      </Dialogo>
    </div>
  );
}

/** "Espera a resposta", com a explicação e "Ligado" ou "Desligado" escrito, como as chaves do tipo. */
function ChaveDaEspera({
  ligada,
  aoMudar,
}: {
  ligada: boolean;
  aoMudar: (ligada: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={estilos.chave}>
      <span className={estilos.textoDaChave}>
        <span id={`${id}-titulo`}>Espera a resposta</span>
        <small id={`${id}-descricao`}>
          Mandar a resposta põe o chamado em Aguardando o colaborador, e o relógio para.
        </small>
      </span>
      <Interruptor
        isSelected={ligada}
        onChange={aoMudar}
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-descricao`}
        className={estilos.interruptor}
      >
        {ligada ? 'Ligado' : 'Desligado'}
      </Interruptor>
    </div>
  );
}

/** A coluna da resposta: o rótulo com o selo e o começo do texto; e a dos tipos. */
const COLUNAS: ColunaQueSeOrdena<RespostaPronta>[] = [
  {
    id: 'resposta',
    titulo: 'Resposta',
    nomeDaLinha: true,
    celula: (resposta) => (
      <span className={estilos.respostaNaLinha}>
        <span className={estilos.rotuloNaLinha}>
          <span>{resposta.rotulo}</span>
          {resposta.esperaAResposta && <Selo selo="espera-a-resposta" />}
        </span>
        <span className={estilos.comecoDoTexto}>{textoNumaLinha(resposta.texto)}</span>
      </span>
    ),
  },
  {
    id: 'tipos',
    titulo: 'Tipos',
    largura: 280,
    celula: (resposta) => tiposNaLista(resposta.tipos),
  },
];

function TabelaDasRespostas({
  respostas,
  idDoTitulo,
  aoAbrir,
  aoReordenar,
}: {
  respostas: readonly RespostaPronta[];
  idDoTitulo: string;
  aoAbrir: (id: string) => void;
  /** A ordem nova, com todos os ids. */
  aoReordenar: (ids: string[]) => void;
}) {
  const ids = respostas.map((resposta) => resposta.id);
  const mudar = (nova: string[]) => {
    if (nova.some((id, indice) => id !== ids[indice])) aoReordenar(nova);
  };
  const { arraste, alca, alvo } = useArrastar<string>({
    aoSoltar: (id, { chave, metade }) => mudar(reordenar(ids, id, chave, metade)),
  });
  const menuDaLinha = (resposta: RespostaPronta): ItemDoMenuDeContexto[] =>
    movimentosNaOrdem(ids, resposta.id).map((movimento) => ({
      id: movimento,
      rotulo: ROTULO_DO_MOVIMENTO[movimento],
      aoEscolher: () => mudar(moverNaOrdem(ids, resposta.id, movimento)),
    }));

  return (
    <TabelaQueSeOrdena
      aria-labelledby={idDoTitulo}
      itens={respostas}
      idDe={(resposta) => resposta.id}
      nomeDe={(resposta) => resposta.rotulo}
      colunas={COLUNAS}
      aoAbrir={aoAbrir}
      alca={(resposta) => alca(resposta.id)}
      alvo={(resposta) => alvo(resposta.id)}
      arraste={
        arraste && {
          noAr: arraste.item,
          encaixe: arraste.alvo && { id: arraste.alvo.chave, metade: arraste.alvo.metade },
        }
      }
      menuDaLinha={menuDaLinha}
      alta={() => true}
    />
  );
}
