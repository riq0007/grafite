// As equipes e os canais (spec modulo-chat, "Equipes e canais na tela"; spec chat, "Equipes e
// canais"; change chat-com-chamados, design, decisão 15), para quem configura o chat: a lista, com o
// nome, o tipo, o grupo, quem escreve, "Avisar a cada mensagem" e a situação em texto; e a gaveta,
// com "Salvar" e "Arquivar" ou "Reativar", o aviso de cada mudança e a recusa no campo dela. É uma
// tela da casca, sem a moldura do chat, que é de quem o usa.
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeTexto,
  Celula,
  Coluna,
  CorpoDaTabela,
  Dialogo,
  EstadoVazio,
  Gaveta,
  GrupoDeRadios,
  Interruptor,
  Linha,
  MensagemDoPasso,
  Radio,
  RotuloDeSituacao,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { Archive, ArchiveRestore, Plus } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import {
  CHAVE_DAS_EQUIPES_E_CANAIS,
  useEquipesECanais,
  useGruposDoChat,
} from '../../chat/consultas.ts';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import estilos from './EquipesECanais.module.css';
import {
  avisarEmTexto,
  avisoDaMudanca,
  type EdicaoDaEquipeOuCanal,
  type EquipeOuCanal,
  type ErrosDaEquipeOuCanal,
  edicaoDa,
  edicaoNova,
  errosDaEquipeOuCanal,
  grupoNaLinha,
  mudouAEquipeOuCanal,
  nomeDoTipo,
  opcoesDosGrupos,
  pedidoDa,
  quemEscreveNaLinha,
  recusasQueValem,
  type TipoDaConversa,
  tetoDaLista,
} from './equipesECanais.ts';

const ENDERECO = '/conversas/equipes-e-canais';

const TITULO = 'Equipes e canais';

/** O primeiro campo recusado, onde o foco vai depois da gravação recusada: o texto ou a escolha. */
const RECUSADO = 'input[aria-invalid="true"], [data-invalid] > button';

type ListaDasEquipesECanais = { itens: EquipeOuCanal[] };

/** "a equipe" ou "o canal", nas frases do pedido e da confirmação. */
const oTipo = (tipo: TipoDaConversa) => (tipo === 'equipe' ? 'a equipe' : 'o canal');

/** A gaveta aberta: a gravada, pelo id, ou a nova, do tipo do botão; a de quando abriu fica, se sumir. */
interface GavetaAberta {
  id: string | null;
  tipo: TipoDaConversa;
  inicial: EquipeOuCanal | null;
}

/** A recusa da gravação, com a gaveta como estava quando foi recusada. */
interface RecusaDaGaveta {
  erros: ErrosDaEquipeOuCanal;
  naRecusa: EdicaoDaEquipeOuCanal;
}

type Andamento = 'salvar' | 'arquivar' | 'reativar';

export function EquipesECanais() {
  const { pode } = useAcesso();
  if (!pode('chat.configurar')) {
    return (
      <>
        <CabecalhoDaPagina titulo={TITULO} />
        <SemPermissao a="às equipes e aos canais" />
      </>
    );
  }
  return <TelaDasEquipesECanais />;
}

/** A ordem da API: as ativas primeiro e depois pelo nome. */
function naOrdem(itens: readonly EquipeOuCanal[]): EquipeOuCanal[] {
  return [...itens].sort(
    (uma, outra) =>
      Number(uma.arquivada) - Number(outra.arquivada) ||
      uma.nome.localeCompare(outra.nome, 'pt-BR', { sensitivity: 'base' }),
  );
}

function TelaDasEquipesECanais() {
  const api = useApi();
  const consultas = useQueryClient();
  const consulta = useEquipesECanais();
  const itens = consulta.data?.itens ?? null;

  const [aberta, definirAberta] = useState<GavetaAberta | null>(null);
  const [edicao, definirEdicao] = useState<EdicaoDaEquipeOuCanal>(edicaoNova('equipe'));
  const [recusa, definirRecusa] = useState<RecusaDaGaveta | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [andamento, definirAndamento] = useState<Andamento | null>(null);
  const [confirmando, definirConfirmando] = useState<'fechar' | 'arquivar' | null>(null);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const areaDaGaveta = useRef<HTMLDivElement>(null);
  // A gaveta sai com o que mostrava enquanto fecha.
  const ultima = useRef<GavetaAberta | null>(null);
  if (aberta) ultima.current = aberta;
  const naGaveta = aberta ?? ultima.current;
  const grupos = useGruposDoChat(aberta !== null);

  const gravada = naGaveta?.id
    ? (itens?.find(({ id }) => id === naGaveta.id) ?? naGaveta.inicial)
    : null;
  const mudou = aberta !== null && mudouAEquipeOuCanal(edicao, gravada);
  const erros = recusa ? recusasQueValem(recusa.erros, recusa.naRecusa, edicao) : {};

  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    areaDaGaveta.current?.querySelector<HTMLElement>(RECUSADO)?.focus();
  }, [pedidoDeFoco]);

  // Sair da tela com a gaveta mudada pede a confirmação, como nas respostas prontas.
  const bloqueio = useBlocker({
    shouldBlockFn: ({ next }) => mudou && next.pathname !== ENDERECO,
    enableBeforeUnload: () => mudou,
    withResolver: true,
  });

  const abrir = (item: EquipeOuCanal | null, tipo: TipoDaConversa) => {
    definirAberta({ id: item?.id ?? null, tipo, inicial: item });
    definirEdicao(item ? edicaoDa(item) : edicaoNova(tipo));
    definirRecusa(null);
    definirFalha(null);
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

  const mudar = (parte: Partial<EdicaoDaEquipeOuCanal>) =>
    definirEdicao((atual) => ({ ...atual, ...parte }));

  /** Põe na lista o que a API devolveu, no lugar dela pela ordem da API. */
  const guardarNaLista = (item: EquipeOuCanal) =>
    consultas.setQueryData<ListaDasEquipesECanais>(CHAVE_DAS_EQUIPES_E_CANAIS, (atual) =>
      atual
        ? {
            ...atual,
            itens: naOrdem([...atual.itens.filter(({ id }) => id !== item.id), item]),
          }
        : atual,
    );

  /** A recusa da API: nos campos, com o foco no primeiro, ou, sem campo, no pé da gaveta. */
  const recusar = (naRecusa: EdicaoDaEquipeOuCanal, falhou: FalhaDoPedido) => {
    const doCampo = errosDaEquipeOuCanal(falhou.problema?.campos ?? {});
    if (Object.keys(doCampo).length > 0) {
      definirRecusa({ erros: doCampo, naRecusa });
      definirFalha(null);
      definirPedidoDeFoco((vez) => vez + 1);
    } else {
      definirRecusa(null);
      definirFalha(falhou.erro);
    }
  };

  /** Grava o que a gaveta mostra: cria a nova ou salva a gravada. */
  const gravar = (id: string | null, gravando: EdicaoDaEquipeOuCanal) =>
    id === null
      ? pedir(
          () => api.POST('/chat/equipes-e-canais', { body: pedidoDa(gravando) }),
          `criar ${oTipo(gravando.tipo)}`,
        )
      : pedir(
          () =>
            api.PUT('/chat/equipes-e-canais/{id}', {
              params: { path: { id } },
              body: pedidoDa(gravando),
            }),
          `salvar ${oTipo(gravando.tipo)}`,
        );

  /** "Salvar": cria a nova ou grava a escolhida; nos dois casos, a gaveta fecha. */
  async function salvar() {
    if (andamento || !aberta) return;
    const gravando = edicao;
    const id = aberta.id;
    definirAndamento('salvar');
    try {
      const resultado = await gravar(id, gravando);
      if ('erro' in resultado) {
        recusar(gravando, resultado);
        return;
      }
      guardarNaLista(resultado.dados);
      fechar();
      avisar({
        situacao: 'sucesso',
        titulo: avisoDaMudanca(id === null ? 'criacao' : 'alteracao', resultado.dados),
      });
    } finally {
      definirAndamento(null);
    }
  }

  /**
   * "Arquivar", confirmado, e "Reativar": as mudanças da gaveta são salvas antes, como o nome novo
   * que deixa reativar o canal cujo nome outro já usa; depois, a situação muda, e a gaveta fecha.
   */
  async function mudarASituacao(acao: 'arquivar' | 'reativar') {
    if (andamento || !aberta?.id) return;
    const id = aberta.id;
    const gravando = edicao;
    definirAndamento(acao);
    definirConfirmando(null);
    try {
      if (mudou) {
        const salvo = await gravar(id, gravando);
        if ('erro' in salvo) {
          recusar(gravando, salvo);
          return;
        }
        guardarNaLista(salvo.dados);
      }
      const caminho = { params: { path: { id } } };
      const resultado = await pedir(
        () =>
          acao === 'arquivar'
            ? api.POST('/chat/equipes-e-canais/{id}/arquivamento', caminho)
            : api.POST('/chat/equipes-e-canais/{id}/reativacao', caminho),
        `${acao} ${oTipo(gravando.tipo)}`,
      );
      if ('erro' in resultado) {
        recusar(gravando, resultado);
        return;
      }
      guardarNaLista(resultado.dados);
      fechar();
      avisar({
        situacao: 'sucesso',
        titulo: avisoDaMudanca(
          acao === 'arquivar' ? 'arquivamento' : 'reativacao',
          resultado.dados,
        ),
      });
    } finally {
      definirAndamento(null);
    }
  }

  let lista: ReactNode;
  if (consulta.isPending) {
    lista = (
      <p role="status" className={estilos.nota}>
        Carregando as equipes e os canais…
      </p>
    );
  } else if (consulta.isError && !itens) {
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
  } else if (itens) {
    lista = (
      <TabelaDasEquipesECanais
        itens={itens}
        aoAbrir={(id) => {
          const item = itens.find((cada) => cada.id === id);
          if (item) abrir(item, item.tipo);
        }}
      />
    );
  }

  const teto = itens ? tetoDaLista(itens) : null;
  const tipo = naGaveta?.tipo ?? 'equipe';
  const nova = naGaveta?.id === null;
  const titulo = nova
    ? tipo === 'equipe'
      ? 'Nova equipe'
      : 'Novo canal'
    : (gravada?.nome ?? nomeDoTipo(tipo));
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

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={TITULO}
        detalhe="As equipes são dos grupos do Grafite, e os canais, de todos que usam o chat."
        acoes={
          <>
            {teto && <span className={estilos.teto}>{teto}</span>}
            <Botao
              nivel="primario"
              icone={Plus}
              onPress={() => abrir(null, 'equipe')}
              isDisabled={teto !== null}
            >
              Nova equipe
            </Botao>
            <Botao icone={Plus} onPress={() => abrir(null, 'canal')} isDisabled={teto !== null}>
              Novo canal
            </Botao>
          </>
        }
      />

      {lista}

      <Gaveta
        titulo={titulo}
        aberta={aberta !== null}
        aoMudarAberta={(abrindo) => {
          if (!abrindo) pedirParaFechar();
        }}
      >
        <div ref={areaDaGaveta} className={estilos.gaveta}>
          {gravada && (
            <p className={estilos.resumo}>
              <span>{nomeDoTipo(gravada.tipo)}</span>
              <Situacao arquivada={gravada.arquivada} />
            </p>
          )}
          <CampoDeTexto
            rotulo="Nome"
            obrigatorio
            value={edicao.nome}
            onChange={(nome) => mudar({ nome })}
            descricao="Aparece na lista do Chat de quem participa."
            erro={erros.nome}
          />
          {tipo === 'equipe' ? (
            <EscolhaDoGrupo
              rotulo="Grupo da equipe"
              descricao="Participam as contas do grupo que usam o chat."
              grupos={grupos}
              gravado={gravada?.grupo ?? null}
              escolhido={edicao.grupoId}
              aoEscolher={(grupoId) => mudar({ grupoId })}
              erro={erros.grupoId}
            />
          ) : (
            <p className={estilos.informacao}>Participam todas as contas que usam o chat.</p>
          )}
          <GrupoDeRadios
            rotulo="Quem escreve"
            value={edicao.quemEscreve}
            onChange={(quemEscreve) =>
              mudar({ quemEscreve: quemEscreve === 'grupo' ? 'grupo' : 'todos' })
            }
          >
            <Radio value="todos">Todos que participam</Radio>
            <Radio value="grupo">Um grupo</Radio>
          </GrupoDeRadios>
          {edicao.quemEscreve === 'grupo' && (
            <EscolhaDoGrupo
              rotulo="Grupo que escreve"
              descricao="Só as contas do grupo que participam escrevem, como a TI num canal de avisos."
              grupos={grupos}
              gravado={gravada?.escreve ?? null}
              escolhido={edicao.escreveGrupoId}
              aoEscolher={(escreveGrupoId) => mudar({ escreveGrupoId })}
              erro={erros.escreveGrupoId}
            />
          )}
          <ChaveDoAvisar ligada={edicao.avisar} aoMudar={(avisar) => mudar({ avisar })} />
          <MensagemDoPasso texto={falha} chave={0} />
          <div className={estilos.pe}>
            {gravada &&
              (gravada.arquivada ? (
                <Botao
                  icone={ArchiveRestore}
                  onPress={() => void mudarASituacao('reativar')}
                  isDisabled={andamento !== null && andamento !== 'reativar'}
                  carregando={andamento === 'reativar'}
                  rotuloCarregando="Reativando"
                >
                  Reativar
                </Botao>
              ) : (
                <Botao
                  icone={Archive}
                  onPress={() => definirConfirmando('arquivar')}
                  isDisabled={andamento !== null}
                >
                  Arquivar
                </Botao>
              ))}
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
        titulo={`Arquivar ${oTipo(tipo)} ${gravada?.nome ?? ''}?`}
        aberto={confirmando === 'arquivar' || andamento === 'arquivar'}
        aoMudarAberto={(abrindo) => {
          if (!abrindo && andamento !== 'arquivar') definirConfirmando(null);
        }}
        acoes={() => (
          <>
            <Botao onPress={() => definirConfirmando(null)} isDisabled={andamento === 'arquivar'}>
              Cancelar
            </Botao>
            <Botao
              nivel="destrutivo"
              onPress={() => void mudarASituacao('arquivar')}
              carregando={andamento === 'arquivar'}
              rotuloCarregando="Arquivando"
            >
              {`Arquivar ${oTipo(tipo)}`}
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          {tipo === 'equipe' ? 'Ela' : 'Ele'} sai da lista de quem participa e não recebe mensagens.
          A conversa fica guardada, e reativar a traz de volta.
        </p>
      </Dialogo>

      <Dialogo
        alerta
        titulo={
          nova
            ? `Descartar ${tipo === 'equipe' ? 'a equipe nova' : 'o canal novo'}?`
            : 'Descartar as mudanças?'
        }
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
            ? `O que foi escrito sai, e ${tipo === 'equipe' ? 'nenhuma equipe é criada' : 'nenhum canal é criado'}.`
            : `As mudanças que não foram salvas saem, e ${oTipo(tipo)} continua como está gravad${tipo === 'equipe' ? 'a' : 'o'}.`}
        </p>
      </Dialogo>
    </div>
  );
}

/** A situação em texto: "Ativo" ou "Arquivado". */
function Situacao({ arquivada }: { arquivada: boolean }) {
  return (
    <RotuloDeSituacao situacao={arquivada ? 'neutra' : 'sucesso'}>
      {arquivada ? 'Arquivado' : 'Ativo'}
    </RotuloDeSituacao>
  );
}

/**
 * A escolha do grupo: os ativos e o gravado, mesmo inativo, como o escolhido. Enquanto os grupos
 * carregam, ou se falharam, a frase no lugar dela.
 */
function EscolhaDoGrupo({
  rotulo,
  descricao,
  grupos,
  gravado,
  escolhido,
  aoEscolher,
  erro,
}: {
  rotulo: string;
  descricao: string;
  grupos: ReturnType<typeof useGruposDoChat>;
  gravado: EquipeOuCanal['grupo'];
  escolhido: string | null;
  aoEscolher: (grupoId: string) => void;
  erro: string | undefined;
}) {
  if (grupos.isError && !grupos.data)
    return <MensagemDoPasso texto={grupos.error.message} chave={0} />;
  if (!grupos.data) {
    return (
      <p role="status" className={estilos.nota}>
        Carregando os grupos…
      </p>
    );
  }
  return (
    <Selecao
      rotulo={rotulo}
      obrigatorio
      opcoes={opcoesDosGrupos(grupos.data.itens, gravado)}
      selectedKey={escolhido}
      onSelectionChange={(chave) => {
        if (chave !== null) aoEscolher(String(chave));
      }}
      descricao={descricao}
      erro={erro}
    />
  );
}

/** "Avisar a cada mensagem", com a explicação e "Ligado" ou "Desligado" escrito. */
function ChaveDoAvisar({
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
        <span id={`${id}-titulo`}>Avisar a cada mensagem</span>
        <small id={`${id}-descricao`}>Cada mensagem notifica quem participa.</small>
      </span>
      <Interruptor
        isSelected={ligada}
        onChange={aoMudar}
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-descricao`}
        className={estilos.interruptor}
      >
        {avisarEmTexto(ligada)}
      </Interruptor>
    </div>
  );
}

function TabelaDasEquipesECanais({
  itens,
  aoAbrir,
}: {
  itens: EquipeOuCanal[];
  aoAbrir: (id: string) => void;
}) {
  return (
    <Tabela rotulo={TITULO} aoAbrirLinha={aoAbrir}>
      <CabecalhoDaTabela>
        <Coluna id="nome" principal>
          Nome
        </Coluna>
        <Coluna id="tipo">Tipo</Coluna>
        <Coluna id="grupo">Grupo</Coluna>
        <Coluna id="escreve">Quem escreve</Coluna>
        <Coluna id="avisar">Avisar a cada mensagem</Coluna>
        <Coluna id="situacao" especie="situacao">
          Situação
        </Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela
        itens={itens}
        vazio={
          <EstadoVazio
            titulo="Nenhuma equipe ou canal."
            descricao="Crie as equipes pelos grupos do Grafite e os canais para todos que usam o chat."
          />
        }
      >
        {(item) => (
          <Linha id={item.id}>
            <Celula>{item.nome}</Celula>
            <Celula>{nomeDoTipo(item.tipo)}</Celula>
            <Celula>{grupoNaLinha(item)}</Celula>
            <Celula>{quemEscreveNaLinha(item)}</Celula>
            <Celula>{avisarEmTexto(item.avisar)}</Celula>
            <Celula>
              <Situacao arquivada={item.arquivada} />
            </Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </Tabela>
  );
}
