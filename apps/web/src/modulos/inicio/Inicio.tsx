import { Botao, Carimbo, Icone, OQueResolverAgora, TeclaDeAtalho } from '@grafite/ui';
import { rootRouteId, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Search, SlidersHorizontal } from 'lucide-react';
import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/useApi.tsx';
import { useAbrirBusca } from '../../busca/abrirBusca.tsx';
import { vigiarOMinuto } from '../../casca/status/relogio.ts';
import { useCanal } from '../../eventos/useCanal.tsx';
import { moverItem, ocultarItem, ordenarItens } from '../../preferencias/listaOrdenada.ts';
import { usePreferencias } from '../../preferencias/usePreferencias.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { useServidor } from '../../sessao/useSessao.tsx';
import { registroDaConta } from '../registroDaConta.ts';
import estilos from './Inicio.module.css';
import { useOcorrencias } from './useOcorrencias.ts';

/** O bloco do próprio Início, "O que resolver agora", que fica sempre à vista. */
export const BLOCO_RESOLVER = 'inicio.resolver';

interface BlocoNaTela {
  id: string;
  titulo: string;
  componente?: ComponentType;
}

/**
 * Início (specs tela-inicial e change inicio-ajustavel): a busca no topo e os blocos, na ordem da
 * conta. "O que resolver agora" traz as ocorrências abertas das fontes do registro que a conta pode
 * ver, nos módulos ligados, com o título da janela; a ordem das ocorrências vem das preferências e
 * a coluna Há anda na virada do minuto. Os blocos dos módulos vêm depois, cada um com o carimbo.
 * "Personalizar o Início" dá a cada bloco Subir, Descer e Ocultar, menos o Ocultar de "O que
 * resolver agora", e cada clique grava a lista inteira na hora (change inicio-ajustavel, decisão 3).
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
  const { visiveis, ocultos, lista } = ordenarItens(registrados, preferencias.inicio.blocos);
  const [personalizando, definirPersonalizando] = useState(false);
  const gravar = (blocos: typeof lista) => mudar('inicio', { blocos });

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
      </div>
    );

  return (
    <div className={estilos.inicio}>
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
            <div key={bloco.id} className={estilos.bloco}>
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
          <section key={bloco.id} aria-labelledby={`bloco-${bloco.id}`} className={estilos.bloco}>
            <Carimbo id={`bloco-${bloco.id}`}>{bloco.titulo}</Carimbo>
            {arrumar(bloco, indice)}
            {Componente && <Componente />}
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
  );
}
