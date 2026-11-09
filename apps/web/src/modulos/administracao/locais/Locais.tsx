import type { components } from '@grafite/api-client';
import { type ArvoreDeLocais, montarArvore, ROTULOS_DOS_TIPOS } from '@grafite/domain';
import {
  Arvore,
  avisar,
  Botao,
  CabecalhoDaPagina,
  Checkbox,
  Dialogo,
  EstadoVazio,
  Interruptor,
  ListaDeDados,
  MensagemDoPasso,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import {
  CHAVE_DOS_RESUMOS,
  contagemComRotulo,
  quantidade,
  type ResumoDe,
  useResumo,
} from '../../../relacoes/resumos.ts';
import { RelacoesDaFicha } from '../../relacoes.tsx';
import estilos from '../Administracao.module.css';
import { VerNaAuditoria } from '../auditoria/VerNaAuditoria.tsx';
import { Confirmacao } from '../Confirmacao.tsx';
import { Parte, useFocoNoTitulo } from '../Parte.tsx';
import { recusaDe } from '../recusa.ts';
import { SeletorDeLocal } from '../seletores/SeletorDeLocal.tsx';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';
import { FormularioDoLocal } from './FormularioDoLocal.tsx';
import { itensDaArvoreDeLocais } from './itensDaArvore.ts';

type Local = components['schemas']['Local'];

type Gaveta = { tipo: 'novo'; paiId: string | null } | { tipo: 'renomear'; id: string };

/**
 * A tela de locais (spec modulo-administracao): a árvore, com o tipo e os inativos marcados, e o
 * local escolhido, com o caminho e as ações que a permissão no ramo dele permite. Os formulários
 * abrem numa gaveta, com a árvore à vista.
 */
export function Locais() {
  const api = useApi();
  const consultas = useQueryClient();
  const dados = useQuery({
    queryKey: ['locais'],
    queryFn: () => consultar(() => api.GET('/locais'), 'carregar os locais'),
  });
  const locais = dados.data?.locais;
  const arvore = useMemo(() => montarArvore(locais ?? []), [locais]);
  // O local do endereço, como o da referência a ele, vem escolhido.
  const { local: doEndereco } = useSearch({ from: '/administracao/locais' });
  const [escolhido, definirEscolhido] = useState<string | null>(doEndereco ?? null);
  const [mostrarInativos, definirMostrarInativos] = useState(false);
  // As contagens da árvore (change relacoes-vivas, decisão 6): pedidas só com o interruptor ligado.
  const [mostrarContagens, definirMostrarContagens] = useState(false);
  const contagens = useQuery({
    queryKey: [...CHAVE_DOS_RESUMOS, 'contagens-dos-locais'],
    queryFn: ({ signal }) =>
      consultar(() => api.GET('/locais/contagens', { signal }), 'carregar as contagens'),
    enabled: mostrarContagens,
    staleTime: 30_000,
  });
  const textosDasContagens = useMemo(
    () =>
      mostrarContagens && contagens.data
        ? new Map(
            contagens.data.locais.flatMap((local) => {
              const texto = textoDaContagem(local);
              return texto ? [[local.id, texto] as const] : [];
            }),
          )
        : undefined,
    [mostrarContagens, contagens.data],
  );
  const [expandidos, definirExpandidos] = useState<Set<string> | null>(null);
  const [gaveta, definirGaveta] = useState<Gaveta | null>(null);
  const [focar, definirFocar] = useState<string | null>(null);

  const itens = useMemo(
    () =>
      itensDaArvoreDeLocais(arvore, null, {
        comInativos: mostrarInativos,
        contagens: textosDasContagens,
      }),
    [arvore, mostrarInativos, textosDasContagens],
  );
  // No começo, os locais da raiz ficam abertos, e os de cima do local do endereço também.
  const abertos =
    expandidos ??
    new Set([
      ...arvore.filhos(null).map((local) => local.id),
      ...(doEndereco && arvore.local(doEndereco) ? arvore.ancestrais(doEndereco) : []),
    ]);

  // Um endereço novo com outro local, como o de outra referência, escolhe esse local.
  useEffect(() => {
    if (!doEndereco) return;
    definirEscolhido(doEndereco);
  }, [doEndereco]);

  /** Abre a árvore até o local, para ele aparecer. */
  const revelar = (ids: string[]) =>
    definirExpandidos((atuais) => new Set([...(atuais ?? abertos), ...ids]));

  // Depois de mover, o foco volta ao local na árvore, no lugar novo.
  useEffect(() => {
    if (!focar) return;
    const linha = document.querySelector<HTMLElement>(
      `[role="treegrid"] [role="row"][data-key="${focar}"]`,
    );
    if (!linha) return;
    linha.focus();
    definirFocar(null);
  });

  /** Relê a árvore depois de uma mudança; a lista de pessoas mostra os caminhos. */
  const atualizar = async () => {
    await consultas.invalidateQueries({ queryKey: ['locais'] });
    void consultas.invalidateQueries({ queryKey: ['pessoas'] });
  };

  if (dados.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Locais" />
        <p role="status" className={estilos.contagem}>
          Carregando os locais…
        </p>
      </>
    );
  }
  if (dados.isError) {
    return (
      <>
        <CabecalhoDaPagina titulo="Locais" />
        <EstadoVazio
          titulo={dados.error.message}
          acao={<Botao onPress={() => void dados.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }

  const local = escolhido ? dados.data.locais.find((atual) => atual.id === escolhido) : undefined;
  const editado = gaveta?.tipo === 'renomear' ? arvore.local(gaveta.id) : undefined;
  const paiDoNovo = gaveta?.tipo === 'novo' && gaveta.paiId ? arvore.local(gaveta.paiId) : null;

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Locais"
        acoes={
          dados.data.permite.cadastrarNaRaiz && (
            <Botao
              nivel="primario"
              icone={Plus}
              data-foco="novo-local"
              onPress={() => definirGaveta({ tipo: 'novo', paiId: null })}
            >
              Novo local
            </Botao>
          )
        }
      />
      <div className={estilos.locais}>
        <div className={estilos.parte}>
          <Interruptor isSelected={mostrarInativos} onChange={definirMostrarInativos}>
            Mostrar inativos
          </Interruptor>
          <Interruptor isSelected={mostrarContagens} onChange={definirMostrarContagens}>
            Mostrar contagens
          </Interruptor>
          <Arvore
            rotulo="Locais"
            itens={itens}
            escolhido={escolhido}
            aoEscolher={definirEscolhido}
            expandidos={abertos}
            aoExpandir={definirExpandidos}
            vazio={<EstadoVazio titulo="Nenhum local cadastrado." />}
          />
        </div>
        {local ? (
          <DetalhesDoLocal
            local={local}
            arvore={arvore}
            podeNaRaiz={dados.data.permite.cadastrarNaRaiz}
            aoNovoDentro={() => definirGaveta({ tipo: 'novo', paiId: local.id })}
            aoRenomear={() => definirGaveta({ tipo: 'renomear', id: local.id })}
            atualizar={atualizar}
            aoMover={async (destino) => {
              await atualizar();
              revelar([...(destino ? [...arvore.ancestrais(destino), destino] : [])]);
              definirFocar(local.id);
            }}
          />
        ) : (
          <p className={estilos.informacao}>Escolha um local para ver o caminho e as ações.</p>
        )}
      </div>
      <FormularioDoLocal
        titulo={
          editado
            ? `Renomear ${editado.nome}`
            : paiDoNovo
              ? `Novo local em ${paiDoNovo.nome}`
              : 'Novo local na raiz'
        }
        aberta={gaveta !== null}
        aoMudarAberta={(aberta) => {
          if (!aberta) definirGaveta(null);
        }}
        inicial={editado ? { nome: editado.nome, tipo: editado.tipo } : { nome: '', tipo: null }}
        rotuloDoEnvio={editado ? 'Salvar' : 'Cadastrar'}
        conferirNome={(nome) =>
          editado
            ? arvore.podeRenomear(editado.id, nome)
            : arvore.podeCriar({ paiId: paiDoNovo?.id ?? null, nome })
        }
        enviar={async (pedido) => {
          if (editado) {
            const resultado = await pedir(
              () =>
                api.PATCH('/locais/{id}', { params: { path: { id: editado.id } }, body: pedido }),
              'salvar o local',
            );
            if ('erro' in resultado) return recusaDe(resultado);
            definirGaveta(null);
            await atualizar();
            avisar({ situacao: 'sucesso', titulo: 'Local salvo.' });
            return { ok: true };
          }
          const paiId = paiDoNovo?.id ?? null;
          const resultado = await pedir(
            () => api.POST('/locais', { body: { ...pedido, paiId } }),
            'cadastrar o local',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          definirGaveta(null);
          await atualizar();
          if (paiId) revelar([...arvore.ancestrais(paiId), paiId]);
          definirEscolhido(resultado.dados.id);
          avisar({ situacao: 'sucesso', titulo: 'Local cadastrado.' });
          return { ok: true };
        }}
      />
    </div>
  );
}

interface PropsDosDetalhes {
  local: Local;
  arvore: ArvoreDeLocais;
  podeNaRaiz: boolean;
  aoNovoDentro: () => void;
  aoRenomear: () => void;
  atualizar: () => Promise<void>;
  /** Depois de mover, com o destino (`null` na raiz). */
  aoMover: (destino: string | null) => Promise<void>;
}

/** O local escolhido: o caminho, o tipo, a situação e as ações que a permissão no ramo dá. */
function DetalhesDoLocal({
  local,
  arvore,
  podeNaRaiz,
  aoNovoDentro,
  aoRenomear,
  atualizar,
  aoMover,
}: PropsDosDetalhes) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<{ local: string; texto: string } | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  // "Inativar" vira "Reativar": o foco perdido vai ao título do local.
  const { titulo, pedirFoco } = useFocoNoTitulo(local.situacao);
  const situacao = SITUACOES_DO_REGISTRO[local.situacao];
  const ativo = local.situacao === 'ativo';
  const noLocal = { params: { path: { id: local.id } } };

  const depoisDe = async (resultado: { dados: Local } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return resultado;
    pedirFoco();
    await atualizar();
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <Parte titulo={local.nome} refDoTitulo={titulo}>
      <ListaDeDados
        itens={[
          { rotulo: 'Caminho', valor: arvore.caminho(local.id) },
          { rotulo: 'Tipo', valor: ROTULOS_DOS_TIPOS[local.tipo] },
          {
            rotulo: 'Situação',
            valor: <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>,
          },
        ]}
      />
      <RelacoesDaFicha alvo="local" id={local.id} />
      <PessoasDoLocal id={local.id} />
      <VerNaAuditoria alvo={[`local:${local.id}`]} nome={arvore.caminho(local.id)} />
      {local.permite.editar ? (
        <>
          <div className={estilos.acoes}>
            {ativo && <Botao onPress={aoNovoDentro}>Novo local dentro</Botao>}
            <Botao onPress={aoRenomear}>Renomear</Botao>
            <MoverLocal local={local} arvore={arvore} podeNaRaiz={podeNaRaiz} aoMover={aoMover} />
            {!ativo && (
              <Botao
                carregando={reativando}
                rotuloCarregando="Reativando"
                onPress={async () => {
                  definirReativando(true);
                  definirFalha(null);
                  const resultado = await depoisDe(
                    await pedir(
                      () => api.POST('/locais/{id}/reativacao', noLocal),
                      'reativar o local',
                    ),
                    'Local reativado.',
                  );
                  definirReativando(false);
                  if ('erro' in resultado) {
                    definirFalha({ local: local.id, texto: resultado.erro });
                    definirTentativa((atual) => atual + 1);
                  }
                }}
              >
                Reativar
              </Botao>
            )}
          </div>
          <MensagemDoPasso
            texto={falha?.local === local.id ? falha.texto : null}
            chave={tentativa}
          />
          {ativo && (
            <div className={estilos.acoesDestrutivas}>
              <Confirmacao
                acao="Inativar"
                titulo={`Inativar o local ${local.nome}?`}
                confirmar="Inativar o local"
                confirmando="Inativando"
                fazer={async () =>
                  depoisDe(
                    await pedir(
                      () => api.POST('/locais/{id}/inativacao', noLocal),
                      'inativar o local',
                    ),
                    'Local inativado.',
                  )
                }
              >
                <p className={estilos.informacao}>
                  O local deixa de ser oferecido para escolha nova. O que já cita o local continua,
                  com ele marcado como inativo, e ele pode ser reativado.
                </p>
                <VaiJunto local={local} arvore={arvore} />
              </Confirmacao>
            </div>
          )}
        </>
      ) : (
        <p className={estilos.informacao}>Você não pode alterar este local.</p>
      )}
    </Parte>
  );
}

/** As pessoas que trabalham no local e dentro dele, no escopo de quem vê, com "Ver pessoas". */
function PessoasDoLocal({ id }: { id: string }) {
  const pessoas = useResumo('local', id).data?.pessoas;
  if (!pessoas) return null;
  return (
    <p className={estilos.relacao}>
      <span>{contagemComRotulo('Pessoas', pessoas.comOsDeDentro)}</span>
      <Link to="/administracao/pessoas" search={{ local: id }} className={estilos.link}>
        Ver pessoas
      </Link>
    </p>
  );
}

/** O texto das contagens de um local na árvore: "30 ativos · 4 pessoas", com os de dentro. */
function textoDaContagem({
  ativos,
  pessoas,
}: Pick<ResumoDe<'local'>, 'ativos' | 'pessoas'>): string | undefined {
  const partes = [
    ...(ativos ? [quantidade(ativos.comOsDeDentro, 'ativo', 'ativos')] : []),
    ...(pessoas ? [quantidade(pessoas.comOsDeDentro, 'pessoa', 'pessoas')] : []),
  ];
  return partes.length > 0 ? partes.join(' · ') : undefined;
}

/**
 * O que vai junto ao mover ou inativar o local (spec locais, "Contagens dos locais"): os locais de
 * dentro, e os ativos e as pessoas, com os de dentro, no escopo de quem vê.
 */
function VaiJunto({ local, arvore }: { local: Local; arvore: ArvoreDeLocais }) {
  const resumo = useResumo('local', local.id).data;
  if (!resumo) return null;
  const dentro = arvore.ramo(local.id).size - 1;
  const partes = [
    ...(dentro > 0 ? [quantidade({ quantos: dentro, recortada: false }, 'local', 'locais')] : []),
    ...(resumo.ativos && resumo.ativos.comOsDeDentro.quantos > 0
      ? [quantidade(resumo.ativos.comOsDeDentro, 'ativo', 'ativos')]
      : []),
    ...(resumo.pessoas && resumo.pessoas.comOsDeDentro.quantos > 0
      ? [quantidade(resumo.pessoas.comOsDeDentro, 'pessoa', 'pessoas')]
      : []),
  ];
  if (partes.length === 0) return null;
  const lista =
    partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
  return <p className={estilos.informacao}>{`Vai junto: ${lista}.`}</p>;
}

/**
 * "Mover para…": o destino entre os locais ativos fora do ramo do local, ou a raiz para quem pode
 * cadastrar nela. As regras da árvore avisam antes de enviar.
 */
function MoverLocal({
  local,
  arvore,
  podeNaRaiz,
  aoMover,
}: {
  local: Local;
  arvore: ArvoreDeLocais;
  podeNaRaiz: boolean;
  aoMover: (destino: string | null) => Promise<void>;
}) {
  const api = useApi();
  const [aberto, definirAberto] = useState(false);
  const [destino, definirDestino] = useState<string | null>(null);
  const [paraARaiz, definirParaARaiz] = useState(false);
  const [erro, definirErro] = useState<string | undefined>();
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  // O próprio ramo e o local de cima não são destinos.
  const excluir = useMemo(
    () => new Set([...arvore.ramo(local.id), ...(local.paiId ? [local.paiId] : [])]),
    [arvore, local.id, local.paiId],
  );

  async function mover() {
    definirFalha(null);
    if (!paraARaiz && destino === null) return definirErro('Escolha para onde o local vai.');
    const paiId = paraARaiz ? null : destino;
    const motivo = arvore.podeMover(local.id, paiId);
    if (motivo) return definirErro(motivo);
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/locais/{id}/movimento', {
            params: { path: { id: local.id } },
            body: { paiId },
          }),
        'mover o local',
      );
      if ('erro' in resultado) {
        definirFalha(resultado.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      definirAberto(false);
      await aoMover(paiId);
      avisar({ situacao: 'sucesso', titulo: 'Local movido.' });
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo={`Mover ${local.nome} para…`}
      gatilho={<Botao>Mover para…</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        if (!abrir) return;
        definirDestino(null);
        definirParaARaiz(false);
        definirErro(undefined);
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao nivel="primario" carregando={enviando} rotuloCarregando="Movendo" onPress={mover}>
            Mover
          </Botao>
        </>
      )}
    >
      <p className={estilos.informacao}>
        O que está dentro de {local.nome} vai junto. Hoje: {arvore.caminho(local.id)}.
      </p>
      <VaiJunto local={local} arvore={arvore} />
      {podeNaRaiz && local.paiId !== null && (
        <Checkbox
          isSelected={paraARaiz}
          onChange={(valor) => {
            definirParaARaiz(valor);
            definirErro(undefined);
          }}
        >
          Levar para a raiz
        </Checkbox>
      )}
      {!paraARaiz && (
        <SeletorDeLocal
          rotulo="Para dentro de"
          obrigatorio
          valor={destino}
          aoMudar={(id) => {
            definirDestino(id);
            definirErro(undefined);
          }}
          excluir={excluir}
          erro={erro}
        />
      )}
      {paraARaiz && erro && <MensagemDoPasso texto={erro} chave={tentativa} />}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}
