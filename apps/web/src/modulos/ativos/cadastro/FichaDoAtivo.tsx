import { resumoDosCompativeis } from '@grafite/domain';
import {
  Abas,
  avisar,
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  MensagemDoPasso,
  MiniaturaDeAtivo,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Fragment, type ReactNode, useCallback, useState } from 'react';
import { FalhaDaConsulta } from '../../../api/consultas.ts';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcoesDaTela } from '../../../busca/acoesDaTela.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { ReferenciaAoLocal } from '../../administracao/locais/ReferenciaAoLocal.tsx';
import { useFocoPerdido } from '../../administracao/Parte.tsx';
import { ReferenciaAPessoa } from '../../administracao/pessoas/ReferenciaAPessoa.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { RelacoesDaFicha, useResumosDasRelacoes } from '../../relacoes.tsx';
import estilos from '../Ativos.module.css';
import {
  CHAVE_DOS_ATIVOS,
  chaveDoAtivo,
  type FichaDoAtivo as Ficha,
  quantosLigados,
  useAtivo,
  useCampos,
  useLigados,
  useTipos,
} from '../consultas.ts';
import { ConsumiveisNaFicha } from '../consumiveis.tsx';
import { rotuloDoControlId, SaudeDoControlIdNaFicha } from '../control-id.tsx';
import { BackupsNaFicha } from '../controlid/BackupsDoControlId.tsx';
import { EscolherLoginDoControle } from '../controlid/LoginDoControle.tsx';
import { DisponibilidadeNaFicha, rotuloDaDisponibilidade } from '../disponibilidade.tsx';
import { buscaDasEtiquetas } from '../etiquetas/endereco.ts';
import { ReferenciaAoModelo } from '../modelos/ReferenciaAoModelo.tsx';
import { SuprimentosNaFicha, textoDosSuprimentos } from '../suprimentos.tsx';
import { buscaDaAba, buscaDoCartao } from './abas.ts';
import type { SituacaoDaCapacidade } from './cartoes.ts';
import { FormularioDoAtivo } from './FormularioDoAtivo.tsx';
import { HistoricoDoAtivo } from './HistoricoDoAtivo.tsx';
import { ImagemDoAtivo } from './ImagemDoAtivo.tsx';
import { imagensDoAtivo } from './imagens.ts';
import { LigadosDoAtivo } from './LigadosDoAtivo.tsx';
import { SegredosDoAtivo } from './SegredosDoAtivo.tsx';
import { SoftwaresDoAtivo } from './SoftwaresDoAtivo.tsx';
import { situacaoDoAtivo } from './situacao.ts';

/**
 * A ficha do ativo (spec cadastro-de-ativos): o nome, a situação, o patrimônio e a miniatura da
 * imagem do ativo, ou da do modelo, no título, com a inativação e a reativação; e as abas, com a
 * aberta no endereço. A Dados, com a imagem do ativo no alto e o formulário, o estado e a trava de
 * cada campo, só para leitura sem `ativos.editar`, fica montada na troca de aba, para o que foi
 * digitado continuar; a Ligados traz no título quantos ativos estão ligados.
 */
export function FichaDoAtivo() {
  const { id } = useParams({ from: '/ativos/$id' });
  // Sem o cartão no endereço, a ficha abre no primeiro do tipo (change primeiro-cartao-da-ficha).
  const { aba = 'dados', grupo } = useSearch({ from: '/ativos/$id' });
  const navegar = useNavigate({ from: '/ativos/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const ativo = useAtivo(id);
  const tipos = useTipos();
  const campos = useCampos();
  const ligados = useLigados(id);
  const agora = useAgora();
  const { pode } = useAcesso();
  // O que os blocos dos módulos resumem no cartão da Visão geral (change ficha-em-cartoes).
  const resumos = useResumosDasRelacoes('ativo', id);
  // A versão do formulário: depois de salvar, ele recomeça do que foi gravado.
  const [versao, definirVersao] = useState(0);
  const pedirFoco = useFocoPerdido(ativo.data, () => focarDestino(undefined));
  // As ações da ficha na busca, em "Nesta tela" (change relacoes-vivas, decisão 5).
  useAcoesDaTela([
    {
      id: 'imprimir-etiqueta',
      rotulo: 'Imprimir etiqueta',
      palavrasChave: ['etiquetas'],
      executar: () => void navegar({ to: '/ativos/etiquetas', search: buscaDasEtiquetas([id]) }),
    },
    {
      id: 'ir-para-ligados',
      rotulo: 'Ir para Ligados',
      palavrasChave: ['ligacoes'],
      executar: () => void navegar({ search: buscaDaAba('ligados'), replace: true }),
    },
  ]);
  const aplicar = useCallback(
    (novo: Ficha) => {
      consultas.setQueryData(chaveDoAtivo(novo.id), novo);
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_ATIVOS });
    },
    [consultas],
  );

  const falha = ativo.error ?? tipos.error ?? campos.error;
  if (falha) {
    const naoExiste = falha instanceof FalhaDaConsulta && falha.codigo === 'nao-encontrado';
    return (
      <>
        <CabecalhoDaPagina titulo="Ativo" />
        <EstadoVazio
          titulo={falha.message}
          acao={
            naoExiste ? undefined : (
              <Botao
                onPress={() => {
                  void ativo.refetch();
                  void tipos.refetch();
                  void campos.refetch();
                }}
              >
                Tentar de novo
              </Botao>
            )
          }
        />
      </>
    );
  }
  const ficha = ativo.data;
  const tipo = tipos.data?.tipos.find((candidato) => candidato.id === ficha?.tipo.id);
  if (!ficha || !campos.data || !tipo) {
    return (
      <>
        <CabecalhoDaPagina titulo="Ativo" />
        <p role="status" className={estilos.contagem}>
          Carregando o ativo…
        </p>
      </>
    );
  }

  const situacao = situacaoDoAtivo(ficha);
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        detalhe={
          <RelacoesDoAtivo
            ficha={ficha}
            ligados={ligados.data ? quantosLigados(ligados.data) : null}
          />
        }
        titulo={
          <span className={estilos.tituloDaFicha}>
            <MiniaturaDeAtivo tipo={ficha.tipo.icone} {...imagensDoAtivo(ficha, 128)} />
            {ficha.rotulo}
            <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>
            {ficha.patrimonio && <span className={estilos.patrimonio}>{ficha.patrimonio}</span>}
          </span>
        }
        acoes={
          <>
            <Botao
              onPress={() =>
                void navegar({ to: '/ativos/etiquetas', search: buscaDasEtiquetas([ficha.id]) })
              }
            >
              Imprimir etiqueta
            </Botao>
            {ficha.permite.acessoRemoto && (
              <Botao
                onPress={() => void navegar({ to: '/ativos/$id/remoto', params: { id: ficha.id } })}
              >
                Acesso remoto
              </Botao>
            )}
            {ficha.permite.editar && (
              <AcoesDoAtivo
                ficha={ficha}
                aplicar={(novo) => {
                  pedirFoco();
                  aplicar(novo);
                }}
              />
            )}
          </>
        }
      />
      <Abas
        rotulo="Ficha do ativo"
        selecionada={aba}
        // A troca de aba substitui a entrada do histórico: voltar sai da ficha.
        // O cartão aberto na Dados continua no endereço ao trocar de aba.
        aoMudar={(escolhida) =>
          void navegar({
            search: (atual) => ({
              ...buscaDaAba(escolhida),
              ...(atual.grupo ? { grupo: atual.grupo } : {}),
            }),
            replace: true,
          })
        }
        manterMontadas={['dados']}
        abas={[
          {
            id: 'dados',
            rotulo: 'Dados',
            conteudo: (
              <div className={estilos.dadosDoAtivo}>
                <FormularioDoAtivo
                  key={`${ficha.id}-${versao}`}
                  tipo={tipo}
                  campos={campos.data.campos}
                  ficha={ficha}
                  soLeitura={!ficha.permite.editar}
                  verRestritos={ficha.permite.verRestritos}
                  editarRestritos={ficha.permite.editarRestritos}
                  aplicar={aplicar}
                  cartaoAberto={grupo}
                  primeiroCartao={tipo.primeiroCartao ?? null}
                  // A troca de cartão substitui a entrada do histórico, como a de aba.
                  aoAbrirCartao={(chave, primeiro) =>
                    void navegar({
                      search: (atual) => ({
                        ...buscaDaAba(atual.aba ?? 'dados'),
                        ...buscaDoCartao(chave, primeiro),
                      }),
                      replace: true,
                    })
                  }
                  imagem={<ImagemDoAtivo ficha={ficha} aplicar={aplicar} />}
                  visaoGeral={
                    <div className={estilos.visaoGeralEmCartoes}>
                      {/* O que outros módulos mostram do ativo, como os alertas dele (P3a). */}
                      <RelacoesDaFicha alvo="ativo" id={ficha.id} nome={ficha.rotulo} />
                      <SegredosDoAtivo segredos={ficha.segredos} />
                    </div>
                  }
                  resumoDaVisaoGeral={
                    resumos.length > 0 ? resumos.join(' · ') : 'Nada pede atenção'
                  }
                  capacidades={paineisDasCapacidades(ficha, agora, {
                    backups:
                      pode('controlid.ver') &&
                      (tipo?.capacidades.includes('controlid.backup') ?? false),
                  })}
                  rotuloDoEnvio="Salvar alterações"
                  enviar={async (pedido) => {
                    const resultado = await pedir(
                      () =>
                        api.PATCH('/ativos/{id}', {
                          params: { path: { id: ficha.id } },
                          body: pedido,
                        }),
                      'salvar o ativo',
                    );
                    if ('erro' in resultado) return recusaDe(resultado);
                    aplicar(resultado.dados);
                    definirVersao((atual) => atual + 1);
                    avisar({ situacao: 'sucesso', titulo: 'Ativo salvo.' });
                    return { ok: true };
                  }}
                />
              </div>
            ),
          },
          {
            id: 'ligados',
            rotulo: ligados.data ? `Ligados (${quantosLigados(ligados.data)})` : 'Ligados',
            conteudo: <LigadosDoAtivo ficha={ficha} />,
          },
          // Os softwares do agente do GLPI, nos tipos com o inventário de hardware
          // (change inventario-pelo-agente-glpi).
          ...(tipo.capacidades.includes('hardware.inventario')
            ? [
                {
                  id: 'softwares',
                  rotulo: 'Softwares',
                  conteudo: <SoftwaresDoAtivo ativoId={ficha.id} />,
                },
              ]
            : []),
          { id: 'historico', rotulo: 'Histórico', conteudo: <HistoricoDoAtivo ficha={ficha} /> },
        ]}
      />
    </div>
  );
}

/**
 * A linha das relações no cabeçalho (spec cadastro-de-ativos, "Relações do ativo à vista"): o local,
 * o responsável e o modelo como referências com cartão, e "Ligados" com a quantidade, que leva à aba.
 */
function RelacoesDoAtivo({ ficha, ligados }: { ficha: Ficha; ligados: number | null }) {
  const partes: { id: string; conteudo: ReactNode }[] = [
    ...(ficha.local ? [{ id: 'local', conteudo: <ReferenciaAoLocal local={ficha.local} /> }] : []),
    ...(ficha.responsavel
      ? [
          {
            id: 'responsavel',
            conteudo: (
              <ReferenciaAPessoa
                pessoa={ficha.responsavel}
                comCartao={ficha.permite.verResponsavel}
              />
            ),
          },
        ]
      : []),
    ...(ficha.modelo
      ? [{ id: 'modelo', conteudo: <ReferenciaAoModelo modelo={ficha.modelo} /> }]
      : []),
    {
      id: 'ligados',
      conteudo: (
        <Link
          to="/ativos/$id"
          params={{ id: ficha.id }}
          search={buscaDaAba('ligados')}
          replace
          className={estilos.link}
        >
          {ligados === null ? 'Ligados' : `Ligados (${ligados})`}
        </Link>
      ),
    },
  ];
  return (
    <nav aria-label="Relações do ativo" className={estilos.relacoesDoAtivo}>
      {partes.map((parte, posicao) => (
        <Fragment key={parte.id}>
          {posicao > 0 && ' · '}
          {parte.conteudo}
        </Fragment>
      ))}
    </nav>
  );
}

/** "Reativar" e, confirmada, "Inativar". */
function AcoesDoAtivo({ ficha, aplicar }: { ficha: Ficha; aplicar: (ficha: Ficha) => void }) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const noAtivo = { params: { path: { id: ficha.id } } };

  const aplicarResultado = (resultado: { dados: Ficha } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return recusaDe(resultado);
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaFicha}>
      {ficha.situacao === 'inativo' ? (
        <Botao
          carregando={reativando}
          rotuloCarregando="Reativando"
          onPress={async () => {
            definirReativando(true);
            definirFalha(null);
            const resultado = aplicarResultado(
              await pedir(() => api.POST('/ativos/{id}/reativacao', noAtivo), 'reativar o ativo'),
              'Ativo reativado.',
            );
            definirReativando(false);
            if ('erro' in resultado) {
              definirFalha(resultado.erro);
              definirTentativa((atual) => atual + 1);
            }
          }}
        >
          Reativar
        </Botao>
      ) : (
        <Confirmacao
          acao="Inativar"
          titulo={`Inativar o ativo ${ficha.rotulo}?`}
          confirmar="Inativar o ativo"
          confirmando="Inativando"
          fazer={async () =>
            aplicarResultado(
              await pedir(() => api.POST('/ativos/{id}/inativacao', noAtivo), 'inativar o ativo'),
              'Ativo inativado.',
            )
          }
        >
          <p className={estilos.informacao}>
            O ativo sai da lista dos ativos, e os dados ficam guardados.
          </p>
        </Confirmacao>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}

/** As situações que pedem atenção no resumo do cartão da capacidade. */
const DISPONIBILIDADE_EM_ATENCAO = new Set(['offline', 'sem-dado']);
const CONTROL_ID_EM_ATENCAO = new Set([
  'login-recusado',
  'sem-resposta',
  'resposta-inesperada',
  'sem-dado',
]);

/**
 * O painel de cada capacidade que a ficha traz, com a situação dele para o resumo do cartão, nos
 * mesmos textos da tabela (change ficha-em-cartoes, design, decisão 2).
 */
function paineisDasCapacidades(
  ficha: Ficha,
  agora: Date,
  { backups }: { backups: boolean },
): Record<string, { painel: ReactNode; situacao: SituacaoDaCapacidade }> {
  const {
    disponibilidade,
    painelDeSuprimentos: suprimentos,
    controlId,
    consumiveisCompativeis: compativeis,
  } = ficha;
  const temModelo = ficha.modelo !== null;
  return {
    ...(disponibilidade && {
      'rede.disponibilidade': {
        painel: <DisponibilidadeNaFicha disponibilidade={disponibilidade} agora={agora} />,
        situacao: {
          texto: rotuloDaDisponibilidade(disponibilidade),
          tom: DISPONIBILIDADE_EM_ATENCAO.has(disponibilidade.situacao) ? 'atencao' : 'normal',
        },
      },
    }),
    ...(suprimentos && {
      'snmp.suprimentos': {
        painel: <SuprimentosNaFicha ativoId={ficha.id} painel={suprimentos} agora={agora} />,
        situacao: {
          texto: textoDosSuprimentos(suprimentos) ?? 'Não verificado',
          tom: (suprimentos.condicoes?.itens.length ?? 0) > 0 ? 'atencao' : 'normal',
        },
      },
    }),
    ...(controlId && {
      'controlid.saude': {
        painel: (
          <SaudeDoControlIdNaFicha
            saude={controlId}
            agora={agora}
            acaoDoLogin={
              ficha.permite.escolherLoginDoControle ? (
                <EscolherLoginDoControle ativoId={ficha.id} />
              ) : undefined
            }
          />
        ),
        situacao: {
          texto: rotuloDoControlId(controlId),
          tom: CONTROL_ID_EM_ATENCAO.has(controlId.situacao) ? 'atencao' : 'normal',
        },
      },
    }),
    // Os backups do controle (change p5a-backup-do-control-id), para quem os vê.
    ...(backups && {
      'controlid.backup': {
        painel: <BackupsNaFicha ativoId={ficha.id} />,
        situacao: { texto: 'Backup diário', tom: 'normal' },
      },
    }),
    // Os compatíveis do modelo (change p4b-consumiveis): nulos sem a capacidade ou com o Operação
    // desligado, e então a ficha não tem o cartão.
    ...(compativeis && {
      'consumiveis.compatibilidade': {
        painel: (
          <ConsumiveisNaFicha compativeis={compativeis} temModelo={temModelo} ativoId={ficha.id} />
        ),
        situacao: { texto: resumoDosCompativeis({ temModelo, compativeis }), tom: 'normal' },
      },
    }),
  };
}
