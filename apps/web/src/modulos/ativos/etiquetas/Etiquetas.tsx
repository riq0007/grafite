import type { components } from '@grafite/api-client';
import {
  Botao,
  CabecalhoDaPagina,
  ControleSegmentado,
  EstadoVazio,
  EtiquetaDoAtivo,
  FORMATOS_DE_ETIQUETA,
  type FormatoDeEtiqueta,
  Segmento,
  Selecao,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { type CSSProperties, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import estilosDosAtivos from '../Ativos.module.css';
import estilos from './Etiquetas.module.css';

type ItemDaEtiqueta = components['schemas']['EtiquetasDosAtivos']['itens'][number];

/** Quantas etiquetas cabem numa impressão, como a API confere. */
const LIMITE = 200;

const POSICOES_DA_FOLHA = Array.from({ length: 21 }, (_, i) => ({
  id: String(i + 1),
  rotulo: String(i + 1),
}));

const contagem = (quantas: number) => (quantas === 1 ? '1 etiqueta' : `${quantas} etiquetas`);

const deFora = (quantos: number) =>
  quantos === 1
    ? '1 ativo fora do seu acesso ficou de fora.'
    : `${quantos} ativos fora do seu acesso ficaram de fora.`;

/** As folhas do formato: as etiquetas nas posições, com as anteriores ao início em branco. */
function Folhas({
  itens,
  formato,
  inicio,
  organizacao,
}: {
  itens: readonly ItemDaEtiqueta[];
  formato: FormatoDeEtiqueta;
  inicio: number;
  organizacao: string;
}) {
  const medidas = FORMATOS_DE_ETIQUETA[formato];
  const porFolha = medidas.colunas * medidas.linhas;
  const posicoes: (ItemDaEtiqueta | null)[] = [
    ...Array.from({ length: formato === 'folha-a4' ? inicio - 1 : 0 }, () => null),
    ...itens,
  ];
  const folhas = Array.from({ length: Math.ceil(posicoes.length / porFolha) }, (_, i) =>
    posicoes.slice(i * porFolha, (i + 1) * porFolha),
  );
  const variaveis = {
    '--largura-da-pagina': `${medidas.pagina.largura}mm`,
    '--altura-da-pagina': `${medidas.pagina.altura}mm`,
    '--margem-de-cima': `${medidas.margem.topo}mm`,
    '--margem-do-lado': `${medidas.margem.esquerda}mm`,
    '--colunas-da-folha': medidas.colunas,
    '--largura-da-posicao': `${medidas.etiqueta.largura}mm`,
    '--altura-da-posicao': `${medidas.etiqueta.altura}mm`,
    '--espaco-entre-colunas': `${medidas.espaco.colunas}mm`,
    '--espaco-entre-linhas': `${medidas.espaco.linhas}mm`,
  } as CSSProperties;
  return folhas.map((folha, numero) => (
    <figure
      // biome-ignore lint/suspicious/noArrayIndexKey: a folha é a posição dela na impressão.
      key={numero}
      aria-label={`Folha ${numero + 1}`}
      className={estilos.folha}
      style={variaveis}
    >
      {Array.from({ length: porFolha }, (_, posicao) => {
        const item = folha[posicao];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a posição é o lugar da etiqueta na folha.
          <div key={posicao} data-posicao={posicao + 1} className={estilos.posicao}>
            {item && (
              <EtiquetaDoAtivo
                endereco={`${window.location.origin}/ativos/${item.id}`}
                patrimonio={item.patrimonio}
                nome={item.rotulo}
                organizacao={organizacao}
                formato={formato}
              />
            )}
          </div>
        );
      })}
    </figure>
  ));
}

/** O tamanho da página na impressão, enquanto a tela das etiquetas está aberta. */
function useTamanhoDaPagina(formato: FormatoDeEtiqueta) {
  useEffect(() => {
    const { pagina } = FORMATOS_DE_ETIQUETA[formato];
    const estilo = document.createElement('style');
    estilo.textContent = `@page { size: ${pagina.largura}mm ${pagina.altura}mm; margin: 0; }`;
    document.head.append(estilo);
    return () => estilo.remove();
  }, [formato]);
}

/**
 * A tela das etiquetas (spec etiquetas-de-ativos; design do P1f, decisões 3 a 5): os ativos
 * escolhidos, até 200, o formato, a etiqueta onde começar na folha A4, a prévia das folhas e
 * "Imprimir", pelo diálogo do navegador. A impressão leva só uma cópia das folhas, num portal no
 * `body`, sem a casca.
 */
export function Etiquetas() {
  const { pode } = useAcesso();
  const api = useApi();
  const sessao = useSessao();
  const navegar = useNavigate({ from: '/ativos/etiquetas' });
  const busca = useSearch({ from: '/ativos/etiquetas' });
  const ids = (busca.ids ?? '').split(',').filter(Boolean);
  const formato: FormatoDeEtiqueta = busca.formato ?? 'folha-a4';
  const inicio = formato === 'folha-a4' ? (busca.inicio ?? 1) : 1;
  const podeImprimir = pode('ativos.ver');
  const etiquetas = useQuery({
    queryKey: ['etiquetas', busca.ids],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/etiquetas', { params: { query: { ids: busca.ids ?? '' } } }),
        'carregar as etiquetas',
      ),
    enabled: podeImprimir && ids.length > 0 && ids.length <= LIMITE,
  });
  useTamanhoDaPagina(formato);

  if (!podeImprimir) {
    return (
      <>
        <CabecalhoDaPagina titulo="Etiquetas" />
        <SemPermissao a="às etiquetas dos ativos" />
      </>
    );
  }
  if (ids.length === 0 || ids.length > LIMITE) {
    return (
      <>
        <CabecalhoDaPagina titulo="Etiquetas" />
        <EstadoVazio
          titulo={ids.length === 0 ? 'Nenhum ativo escolhido.' : 'Escolha até 200 ativos por vez.'}
          descricao='Escolha os ativos na tabela e use "Imprimir etiquetas".'
          acao={<Botao onPress={() => void navegar({ to: '/ativos' })}>Abrir a tabela</Botao>}
        />
      </>
    );
  }
  if (etiquetas.isError && !etiquetas.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Etiquetas" />
        <EstadoVazio
          titulo={etiquetas.error.message}
          acao={<Botao onPress={() => void etiquetas.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }
  if (!etiquetas.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Etiquetas" />
        <p role="status" className={estilosDosAtivos.contagem}>
          Carregando as etiquetas…
        </p>
      </>
    );
  }
  const { itens, fora } = etiquetas.data;
  const organizacao = 'organizacao' in sessao ? sessao.organizacao : '';
  const mudar = (mudancas: { formato?: FormatoDeEtiqueta; inicio?: number }) =>
    void navegar({
      search: (atual) => {
        const proxima = { ...atual, ...mudancas };
        return {
          ...(proxima.ids ? { ids: proxima.ids } : {}),
          ...(proxima.formato === 'impressora' ? { formato: 'impressora' as const } : {}),
          ...(proxima.inicio && proxima.inicio > 1 ? { inicio: proxima.inicio } : {}),
        };
      },
      replace: true,
    });
  const folhas = (
    <Folhas itens={itens} formato={formato} inicio={inicio} organizacao={organizacao} />
  );

  return (
    <div className={estilosDosAtivos.tela}>
      <CabecalhoDaPagina
        titulo="Etiquetas"
        detalhe={
          <>
            <span>{contagem(itens.length)}</span>
            {fora > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{deFora(fora)}</span>
              </>
            )}
          </>
        }
      />
      <div className={estilos.escolhas}>
        <ControleSegmentado
          rotulo="Formato"
          value={formato}
          onChange={(valor) => mudar({ formato: valor as FormatoDeEtiqueta, inicio: 1 })}
          descricao={FORMATOS_DE_ETIQUETA[formato].descricao}
        >
          {(Object.keys(FORMATOS_DE_ETIQUETA) as FormatoDeEtiqueta[]).map((id) => (
            <Segmento key={id} value={id}>
              {FORMATOS_DE_ETIQUETA[id].rotulo}
            </Segmento>
          ))}
        </ControleSegmentado>
        {formato === 'folha-a4' && (
          <Selecao
            rotulo="Começar na etiqueta"
            descricao="Na folha já usada em parte, as etiquetas antes desta ficam em branco."
            opcoes={POSICOES_DA_FOLHA}
            selectedKey={String(inicio)}
            onSelectionChange={(chave) => mudar({ inicio: Number(chave) })}
          />
        )}
      </div>
      <div className={estilos.acoes}>
        <Botao nivel="primario" isDisabled={itens.length === 0} onPress={() => window.print()}>
          Imprimir
        </Botao>
        <p className={estilosDosAtivos.contagem}>
          No diálogo de impressão, escolha as margens "Nenhuma" e a escala 100%.
        </p>
      </div>
      <section aria-label="Prévia das etiquetas" className={estilos.previa}>
        {folhas}
      </section>
      {createPortal(
        <div aria-hidden="true" className={estilos.impressao}>
          {folhas}
        </div>,
        document.body,
      )}
    </div>
  );
}
