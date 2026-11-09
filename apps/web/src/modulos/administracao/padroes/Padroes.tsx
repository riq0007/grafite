import {
  type AjustesDasPreferencias,
  aplicarMudanca,
  lerAjustes,
  type MudancaDasPreferencias,
  resolverPreferencias,
} from '@grafite/domain';
import { Abas, avisar, Botao, CabecalhoDaPagina, Dialogo, MensagemDoPasso } from '@grafite/ui';
import { useBlocker, useNavigate, useParams } from '@tanstack/react-router';
import { type ComponentType, useMemo, useState, useSyncExternalStore } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { type AlvoDasPreferencias, ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { camposNulos, contarMudancas, juntar, normalizar } from '../../../preferencias/mudancas.ts';
import { useLojaDaSessao } from '../../../sessao/useSessao.tsx';
import { SecaoAcessibilidade } from '../../ajustes/secoes/Acessibilidade.tsx';
import { SecaoAparencia } from '../../ajustes/secoes/Aparencia.tsx';
import { SecaoCursor } from '../../ajustes/secoes/Cursor.tsx';
import { SecaoDock } from '../../ajustes/secoes/Dock.tsx';
import { SecaoIdiomaERegiao } from '../../ajustes/secoes/IdiomaERegiao.tsx';
import { SecaoNotificacoes } from '../../ajustes/secoes/Notificacoes.tsx';
import { SecaoTabelas } from '../../ajustes/secoes/Tabelas.tsx';
import estilos from '../Administracao.module.css';

/** As seções de preferências dos Ajustes, na mesma ordem, cada uma numa aba com endereço próprio. */
export const SECOES_DOS_PADROES: ReadonlyArray<{
  id: string;
  nome: string;
  Secao: ComponentType;
}> = [
  { id: 'aparencia', nome: 'Aparência', Secao: SecaoAparencia },
  { id: 'dock', nome: 'Dock', Secao: SecaoDock },
  { id: 'cursor', nome: 'Cursor', Secao: SecaoCursor },
  { id: 'notificacoes', nome: 'Notificações', Secao: SecaoNotificacoes },
  { id: 'tabelas', nome: 'Tabelas', Secao: SecaoTabelas },
  { id: 'idioma-e-regiao', nome: 'Idioma e região', Secao: SecaoIdiomaERegiao },
  { id: 'acessibilidade', nome: 'Acessibilidade', Secao: SecaoAcessibilidade },
];

const ENDERECO = '/administracao/padroes';

const SEM_PADROES: AjustesDasPreferencias = {};

/** Quantos ajustes mudaram, em texto. */
function textoDaContagem(quantas: number): string {
  if (quantas === 0) return 'Nenhuma mudança para salvar.';
  return quantas === 1 ? '1 ajuste mudou.' : `${quantas} ajustes mudaram.`;
}

/**
 * Os padrões da organização (spec modulo-administracao; design do F2c, decisão 5): as mesmas
 * seções dos Ajustes, sobre um rascunho dos padrões gravados. As mudanças ficam pendentes até
 * "Salvar padrões", que grava todas de uma vez, e sair da tela com elas pede confirmação. A casca de
 * quem edita não muda antes de salvar: as seções e as prévias delas mostram o rascunho.
 */
export function Padroes() {
  const { secao } = useParams({ from: '/administracao/padroes/$secao' });
  const navegar = useNavigate();
  const api = useApi();
  const loja = useLojaDaSessao();
  const gravados = useSyncExternalStore(loja.assinar, loja.lerPadroes) ?? SEM_PADROES;
  const [mudancas, definirMudancas] = useState<MudancaDasPreferencias>({});
  const [salvando, definirSalvando] = useState(false);
  const [falha, definirFalha] = useState<{ texto: string; vez: number } | null>(null);

  const camada = useMemo(() => lerAjustes(gravados), [gravados]);
  const quantas = contarMudancas(camada, mudancas);
  const alvo = useMemo<AlvoDasPreferencias>(
    () => ({
      preferencias: resolverPreferencias(aplicarMudanca(camada, mudancas)),
      mudar: (deQual, mudanca) =>
        definirMudancas((atuais) =>
          juntar(atuais, { [deQual]: normalizar(deQual, mudanca as Record<string, unknown>) }),
        ),
      restaurar: (deQual) =>
        definirMudancas((atuais) => juntar(atuais, { [deQual]: camposNulos(deQual) })),
      rotuloDeRestaurar: 'Restaurar padrões de fábrica',
      numaAba: true,
    }),
    [camada, mudancas],
  );

  // Sair da tela com mudanças pede confirmação; trocar de aba, não.
  const bloqueio = useBlocker({
    shouldBlockFn: ({ next }) => quantas > 0 && !next.pathname.startsWith(ENDERECO),
    enableBeforeUnload: () => quantas > 0,
    withResolver: true,
  });

  async function salvar() {
    definirSalvando(true);
    definirFalha(null);
    const resultado = await pedir(
      () => api.PATCH('/organizacao/padroes', { body: { mudancas } }),
      'salvar os padrões',
    );
    if ('erro' in resultado) {
      definirSalvando(false);
      definirFalha((anterior) => ({ texto: resultado.erro, vez: (anterior?.vez ?? 0) + 1 }));
      return;
    }
    // Os padrões gravados chegam com o estado da sessão, antes de o rascunho sair.
    await loja.validar();
    definirMudancas({});
    definirSalvando(false);
    avisar({ situacao: 'sucesso', titulo: 'Padrões salvos.' });
  }

  const escolhida = SECOES_DOS_PADROES.some((uma) => uma.id === secao) ? secao : 'aparencia';
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Padrões" />
      <p className={estilos.informacao}>
        Os padrões valem para quem não mudou o ajuste nos próprios Ajustes do Sistema.
      </p>
      <div className={estilos.rascunho}>
        <p aria-live="polite" className={estilos.contagem}>
          {textoDaContagem(quantas)}
        </p>
        <div className={estilos.acoes}>
          <Botao
            isDisabled={quantas === 0 || salvando}
            onPress={() => {
              definirMudancas({});
              definirFalha(null);
            }}
          >
            Descartar
          </Botao>
          <Botao
            nivel="primario"
            isDisabled={quantas === 0}
            carregando={salvando}
            rotuloCarregando="Salvando"
            onPress={() => void salvar()}
          >
            Salvar padrões
          </Botao>
        </div>
      </div>
      <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
      <ProvedorDoAlvo alvo={alvo}>
        <Abas
          rotulo="Seções dos padrões"
          selecionada={escolhida}
          aoMudar={(id) =>
            void navegar({ to: '/administracao/padroes/$secao', params: { secao: id } })
          }
          abas={SECOES_DOS_PADROES.map(({ id, nome, Secao }) => ({
            id,
            rotulo: nome,
            conteudo: <Secao />,
          }))}
        />
      </ProvedorDoAlvo>
      <Dialogo
        alerta
        titulo="Descartar as mudanças nos padrões?"
        aberto={bloqueio.status === 'blocked'}
        aoMudarAberto={(aberto) => {
          if (!aberto && bloqueio.status === 'blocked') bloqueio.reset();
        }}
        acoes={() => (
          <>
            <Botao onPress={() => bloqueio.reset?.()}>Continuar editando</Botao>
            <Botao nivel="destrutivo" onPress={() => bloqueio.proceed?.()}>
              Descartar mudanças
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          As mudanças que não foram salvas saem, e os padrões continuam como estão gravados.
        </p>
      </Dialogo>
    </div>
  );
}
