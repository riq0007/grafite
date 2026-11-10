import type { LarguraDoBloco } from '@grafite/domain';
import {
  Botao,
  Carimbo,
  ControleSegmentado,
  Icone,
  OpcoesDoBloco,
  OQueResolverAgora,
  Segmento,
  TeclaDeAtalho,
  usePostura,
  type ValorDaOpcaoDoBloco,
} from '@grafite/ui';
import { rootRouteId, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/useApi.tsx';
import { useAbrirBusca } from '../../busca/abrirBusca.tsx';
import { vigiarOMinuto } from '../../casca/status/relogio.ts';
import { useCanal } from '../../eventos/useCanal.tsx';
import { moverItem, ocultarItem, ordenarItens } from '../../preferencias/listaOrdenada.ts';
import { usePreferencias } from '../../preferencias/usePreferencias.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { useServidor } from '../../sessao/useSessao.tsx';
import { useLocaisAtivos } from '../administracao/seletores/SeletorDeLocal.tsx';
import { registroDaConta } from '../registroDaConta.ts';
import type { BlocoDoInicio } from '../tipos.ts';
import estilos from './Inicio.module.css';
import { resolverOpcoes } from './opcoes.ts';
import { useOcorrencias } from './useOcorrencias.ts';

/** O bloco do próprio Início, "O que resolver agora", que fica sempre à vista. */
export const BLOCO_RESOLVER = 'inicio.resolver';

/** Um bloco do Início na tela: "O que resolver agora", sem componente, ou o de um módulo. */
interface BlocoNaTela {
  id: string;
  titulo: string;
  opcoes?: BlocoDoInicio['opcoes'];
  componente?: BlocoDoInicio['componente'];
}

/**
 * Início (specs tela-inicial e change inicio-ajustavel): a busca no topo e os blocos, na ordem da
 * conta. "O que resolver agora" traz as ocorrências abertas das fontes do registro que a conta pode
 * ver, nos módulos ligados, com o título da janela; a ordem das ocorrências vem das preferências e
 * a coluna Há anda na virada do minuto. Os blocos dos módulos vêm depois, cada um com o carimbo.
 * "Personalizar o Início" dá a cada bloco Subir, Descer e Ocultar, menos o Ocultar de "O que
 * resolver agora", e cada clique grava a lista inteira na hora (change inicio-ajustavel, decisão 3).
 *
 * O bloco que declara opções recebe o valor que vale de cada uma, o guardado na conta ou o de
 * fábrica (change opcoes-dos-blocos-do-inicio, design, decisão 1). No modo Personalizar, ele ganha
 * "Opções…", que abre a gaveta: cada mudança grava a lista na hora, como o Subir e o Descer, e
 * "Restaurar as opções" tira as opções do item (decisão 3).
 *
 * Cada bloco de módulo tem a largura inteira ou a metade (decisão 4): no computador, com a área
 * larga, a grade tem duas colunas, e dois blocos de metade seguidos ficam lado a lado. A ordem no
 * documento é a da lista, e a grade não reordena. "O que resolver agora" é sempre inteiro.
 */
export function Inicio() {
  const { modulos } = useRouteContext({ from: rootRouteId });
  const { pode } = useAcesso();
  // As ocorrências e os blocos de um módulo que a organização desligou não aparecem.
  const desligados = useServidor()?.modulosDesligados;
  const daConta = useMemo(
    () => registroDaConta(modulos, pode, desligados),
    [modulos, pode, desligados],
  );
  const api = useApi();
  const canal = useCanal();
  const contexto = useMemo(() => ({ api, canal }), [api, canal]);
  const { fontes, tentarDeNovo } = useOcorrencias(daConta, contexto);
  const { preferencias, mudar } = usePreferencias();
  const navegar = useNavigate();
  const abrirBusca = useAbrirBusca();
  const [agora, definirAgora] = useState(() => new Date());
  useEffect(() => vigiarOMinuto(() => definirAgora(new Date())), []);

  const registrados = useMemo<BlocoNaTela[]>(
    () => [
      { id: BLOCO_RESOLVER, titulo: 'O que resolver agora' },
      ...daConta.flatMap((modulo) => modulo.blocosDoInicio ?? []),
    ],
    [daConta],
  );
  const salvos = preferencias.inicio.blocos;
  const { visiveis, ocultos, lista } = ordenarItens(registrados, salvos);
  // Os locais ativos tiram das opções o local que foi inativado; só são pedidos quando algum bloco
  // tem uma opção de locais.
  const locais = useLocaisAtivos(
    registrados.some((bloco) => bloco.opcoes?.some((opcao) => opcao.forma === 'locais')),
  );
  const opcoesDosBlocos = useMemo(
    () =>
      new Map(
        registrados.map((bloco) => [
          bloco.id,
          resolverOpcoes(
            bloco.opcoes ?? [],
            salvos.find((salvo) => salvo.id === bloco.id)?.opcoes,
            locais?.ids,
          ),
        ]),
      ),
    [registrados, salvos, locais],
  );
  const [personalizando, definirPersonalizando] = useState(false);
  const gravar = (blocos: typeof lista) => mudar('inicio', { blocos });

  // A grade só tem duas colunas no computador: no tablet e no celular, todo bloco é inteiro.
  const colunas = usePostura() === 'computador' ? 2 : 1;
  /** A largura que vale: a guardada no item do bloco de módulo, ou a inteira. */
  const larguraDo = (bloco: BlocoNaTela): LarguraDoBloco =>
    bloco.id === BLOCO_RESOLVER
      ? 'inteira'
      : (lista.find((item) => item.id === bloco.id)?.largura ?? 'inteira');
  /** Grava a largura no item do bloco; a inteira, que é a de fábrica, tira o campo. */
  const mudarLargura = (bloco: BlocoNaTela, largura: LarguraDoBloco) =>
    gravar(
      lista.map((item) => {
        if (item.id !== bloco.id) return item;
        const { largura: _largura, ...semLargura } = item;
        return largura === 'metade' ? { ...semLargura, largura } : semLargura;
      }),
    );

  // A gaveta das opções fica com o bloco em que abriu enquanto fecha, para a saída não piscar.
  const [gaveta, definirGaveta] = useState<{ bloco: string; aberta: boolean } | null>(null);
  const blocoDaGaveta = registrados.find((bloco) => bloco.id === gaveta?.bloco);
  /** Grava o valor novo de uma opção no item do bloco, só com as opções que ele declara. */
  const mudarOpcao = (bloco: BlocoNaTela, chave: string, valor: ValorDaOpcaoDoBloco) => {
    const declaradas = new Set((bloco.opcoes ?? []).map((opcao) => opcao.chave));
    gravar(
      lista.map((item) => {
        if (item.id !== bloco.id) return item;
        const guardadas = Object.fromEntries(
          Object.entries(item.opcoes ?? {}).filter(([guardada]) => declaradas.has(guardada)),
        );
        const novo = typeof valor === 'number' ? valor : [...valor];
        return { ...item, opcoes: { ...guardadas, [chave]: novo } };
      }),
    );
  };
  /** Tira as opções do item: o bloco volta às de fábrica, e a largura dele continua. */
  const restaurarOpcoes = (bloco: BlocoNaTela) =>
    gravar(
      lista.map((item) => {
        if (item.id !== bloco.id) return item;
        const { opcoes: _opcoes, ...semOpcoes } = item;
        return semOpcoes;
      }),
    );

  /** Subir, Descer e Ocultar de um bloco, no modo Personalizar. */
  const arrumar = (bloco: BlocoNaTela, indice: number) =>
    personalizando && (
      // biome-ignore lint/a11y/useSemanticElements: os botões que arrumam o bloco não são um formulário, e o fieldset traria a moldura e a legenda de um.
      <div role="group" aria-label={`Arrumar ${bloco.titulo}`} className={estilos.arrumar}>
        <Botao
          nivel="terciario"
          aria-label={`Subir ${bloco.titulo}`}
          isDisabled={indice === 0}
          onPress={() => gravar(moverItem(lista, bloco.id, -1))}
        >
          Subir
        </Botao>
        <Botao
          nivel="terciario"
          aria-label={`Descer ${bloco.titulo}`}
          isDisabled={indice === visiveis.length - 1}
          onPress={() => gravar(moverItem(lista, bloco.id, 1))}
        >
          Descer
        </Botao>
        {bloco.id !== BLOCO_RESOLVER && (
          <Botao
            nivel="terciario"
            aria-label={`Ocultar ${bloco.titulo}`}
            onPress={() => gravar(ocultarItem(lista, bloco.id, true))}
          >
            Ocultar
          </Botao>
        )}
        {bloco.id !== BLOCO_RESOLVER && (
          <span className={estilos.largura}>
            <span aria-hidden="true">Largura</span>
            <ControleSegmentado
              rotulo={`Largura de ${bloco.titulo}`}
              ocultarRotulo
              value={larguraDo(bloco)}
              onChange={(valor) => mudarLargura(bloco, valor as LarguraDoBloco)}
            >
              <Segmento value="inteira">Inteira</Segmento>
              <Segmento value="metade">Metade</Segmento>
            </ControleSegmentado>
          </span>
        )}
        {bloco.opcoes && bloco.opcoes.length > 0 && (
          <Botao
            nivel="terciario"
            aria-label={`Opções de ${bloco.titulo}`}
            onPress={() => definirGaveta({ bloco: bloco.id, aberta: true })}
          >
            Opções…
          </Botao>
        )}
      </div>
    );

  return (
    <div className={estilos.inicio}>
      <div className={estilos.grade} data-grade-do-inicio="" data-colunas={colunas}>
        <div className={estilos.topo}>
          <button type="button" className={estilos.busca} onClick={abrirBusca}>
            <Icone icone={Search} />
            <span className={estilos.textoDaBusca}>Buscar ativos, pessoas, locais e ações</span>
            <TeclaDeAtalho teclas={['mod', 'K']} />
          </button>
          {personalizando ? (
            <Botao nivel="primario" onPress={() => definirPersonalizando(false)}>
              Concluir
            </Botao>
          ) : (
            <Botao
              nivel="terciario"
              icone={SlidersHorizontal}
              onPress={() => definirPersonalizando(true)}
            >
              Personalizar o Início
            </Botao>
          )}
        </div>
        {visiveis.map((bloco, indice) => {
          if (bloco.id === BLOCO_RESOLVER) {
            return (
              <div key={bloco.id} className={estilos.bloco} data-largura="inteira">
                {arrumar(bloco, indice)}
                <OQueResolverAgora
                  fontes={fontes}
                  ordenacao={preferencias.inicio.ordenacao}
                  aoOrdenar={(ordenacao) => mudar('inicio', { ordenacao })}
                  agora={agora}
                  // Os destinos são endereços do app, conferidos pelo módulo que registrou a fonte.
                  aoAbrir={(destino) => void navegar({ to: destino })}
                  aoTentarDeNovo={tentarDeNovo}
                />
              </div>
            );
          }
          const Componente = bloco.componente;
          return (
            <section
              key={bloco.id}
              aria-labelledby={`bloco-${bloco.id}`}
              className={estilos.bloco}
              data-largura={larguraDo(bloco)}
            >
              <Carimbo id={`bloco-${bloco.id}`}>{bloco.titulo}</Carimbo>
              {arrumar(bloco, indice)}
              {Componente && <Componente opcoes={opcoesDosBlocos.get(bloco.id) ?? {}} />}
            </section>
          );
        })}
        {personalizando && ocultos.length > 0 && (
          <section aria-labelledby="blocos-ocultos" className={estilos.bloco}>
            <Carimbo id="blocos-ocultos">Blocos ocultos</Carimbo>
            <ul aria-label="Blocos ocultos" className={estilos.ocultos}>
              {ocultos.map((bloco) => (
                <li key={bloco.id} className={estilos.oculto}>
                  <span>{bloco.titulo}</span>
                  <Botao
                    nivel="terciario"
                    aria-label={`Mostrar ${bloco.titulo}`}
                    onPress={() => gravar(ocultarItem(lista, bloco.id, false))}
                  >
                    Mostrar
                  </Botao>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {blocoDaGaveta && (
        <OpcoesDoBloco
          bloco={blocoDaGaveta.titulo}
          opcoes={blocoDaGaveta.opcoes ?? []}
          valores={opcoesDosBlocos.get(blocoDaGaveta.id) ?? {}}
          locais={locais?.itens}
          aberta={gaveta?.aberta ?? false}
          aoMudarAberta={(aberta) => definirGaveta({ bloco: blocoDaGaveta.id, aberta })}
          aoMudar={(chave, valor) => mudarOpcao(blocoDaGaveta, chave, valor)}
          aoRestaurar={() => restaurarOpcoes(blocoDaGaveta)}
        />
      )}
    </div>
  );
}
