// "Mudar a meta" de um indicador (spec indicadores, "Metas da organização"; change
// p3d-indicadores, design, decisões 2 e 6; spec indicadores-da-operacao, "Metas dos indicadores da
// operação"; change p4f-indicadores-da-operacao, design, decisão 10): para quem administra o módulo
// do indicador, um diálogo com o número e, nos tempos, a unidade, conferido pelo domínio antes de
// mandar à rota da meta do módulo, com a recusa da API no campo e o retorno "Meta salva.".
import { DEFINICOES_DOS_INDICADORES, type Indicador, textoDaMeta } from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeTexto,
  ControleSegmentado,
  Dialogo,
  LinhaDeCampos,
  MensagemDoPasso,
  Segmento,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import estilos from './Indicadores.module.css';
import {
  conferirRascunhoDaMeta,
  ehTempo,
  type RascunhoDaMeta,
  rascunhoDaMeta,
  UNIDADES_DOS_TEMPOS,
  type UnidadeDoTempo,
} from './metas.ts';

/** O título do diálogo, com o artigo de cada indicador. */
const TITULOS: Record<Indicador, string> = {
  toner: 'Meta do tempo de atendimento do toner',
  critico: 'Meta do tempo até reconhecer o Crítico',
  disponibilidade: 'Meta da disponibilidade dos ativos',
  'que-voltam': 'Meta dos alertas que voltam',
  'resolucao-das-os': 'Meta do tempo de resolução das OS',
  'os-repetidas': 'Meta das OS repetidas',
  'paginas-por-toner': 'Meta das páginas por toner',
};

/** O que vem depois do número, nos indicadores sem a escolha da unidade. */
const SUFIXOS: Partial<Record<Indicador, string>> = {
  disponibilidade: 'Em porcentagem, como 99,5.',
  'que-voltam': 'Em vezes no mesmo ativo, nos últimos 30 dias.',
  'os-repetidas': 'Em OS no mesmo ativo, nos últimos 30 dias.',
  'paginas-por-toner': 'Em porcentagem do rendimento, como 80.',
};

/** A rota da meta de cada módulo: a dos alertas ou a da operação. */
export type RotaDaMeta =
  | '/alertas/indicadores/{indicador}/meta'
  | '/operacao/indicadores/{indicador}/meta';

export function MudarAMeta({
  indicador,
  meta,
  rota,
  chave,
}: {
  indicador: Indicador;
  meta: number;
  rota: RotaDaMeta;
  /** A consulta dos indicadores do módulo, lida de novo com a meta salva. */
  chave: readonly unknown[];
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [aberto, definirAberto] = useState(false);
  const [rascunho, definirRascunho] = useState<RascunhoDaMeta>(() =>
    rascunhoDaMeta(indicador, meta),
  );
  const [erro, definirErro] = useState<string | undefined>();
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const { metaDeFabrica } = DEFINICOES_DOS_INDICADORES[indicador];
  const unidades = ehTempo(indicador) ? UNIDADES_DOS_TEMPOS[indicador] : null;

  const salvar = async (fechar: () => void) => {
    definirFalha(null);
    const conferida = conferirRascunhoDaMeta(indicador, rascunho);
    if (!conferida.ok) {
      definirErro(conferida.erro);
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.PUT(rota, {
            params: { path: { indicador } },
            body: { meta: conferida.meta },
          }),
        'mudar a meta',
      );
      if ('erro' in resultado) {
        const doCampo = resultado.problema?.campos?.meta;
        if (doCampo) {
          definirErro(doCampo);
          return;
        }
        definirFalha(resultado.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: chave });
      avisar({ situacao: 'sucesso', titulo: 'Meta salva.' });
      fechar();
    } finally {
      definirEnviando(false);
    }
  };

  return (
    <Dialogo
      titulo={TITULOS[indicador]}
      gatilho={<Botao>Mudar a meta</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        // Cada abertura começa da meta atual, sem o erro de antes.
        if (abrir) definirRascunho(rascunhoDaMeta(indicador, meta));
        definirErro(undefined);
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Salvando"
            onPress={() => void salvar(fechar)}
          >
            Salvar
          </Botao>
        </>
      )}
    >
      <p className={estilos.informacao}>De fábrica: {textoDaMeta(indicador, metaDeFabrica)}.</p>
      <LinhaDeCampos>
        <CampoDeTexto
          rotulo="Meta"
          descricao={SUFIXOS[indicador]}
          inputMode="decimal"
          autoComplete="off"
          value={rascunho.numero}
          onChange={(numero) => {
            definirRascunho((atual) => ({ ...atual, numero }));
            definirErro(undefined);
          }}
          erro={erro}
        />
        {unidades ? (
          <ControleSegmentado
            rotulo="Unidade"
            value={rascunho.unidade ?? unidades[0]?.id}
            onChange={(unidade) => {
              definirRascunho((atual) => ({ ...atual, unidade: unidade as UnidadeDoTempo }));
              definirErro(undefined);
            }}
          >
            {unidades.map(({ id, rotulo }) => (
              <Segmento key={id} value={id}>
                {rotulo}
              </Segmento>
            ))}
          </ControleSegmentado>
        ) : null}
      </LinhaDeCampos>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}
