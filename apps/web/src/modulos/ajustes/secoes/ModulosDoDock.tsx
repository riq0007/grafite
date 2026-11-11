import { LIMITES_DAS_PREFERENCIAS, MODULO_DOS_AJUSTES } from '@grafite/domain';
import { Botao, Carimbo, Icone } from '@grafite/ui';
import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import { type ModuloDaConta, useModulosDaConta } from '../../../casca/modulosDaConta.tsx';
import { useAlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import {
  type ItemDaLista,
  listaComAusentes,
  moverItem,
  ocultarItem,
  ordenarItens,
} from '../../../preferencias/listaOrdenada.ts';
import estilos from './Secoes.module.css';

/** O botão de uma linha, pelo que ele faz: é por ele que o foco acha o módulo depois da mudança. */
type Acao = 'subir' | 'descer' | 'tirar' | 'por';

/** As duas listas como estão na tela: os ids de cada uma, na ordem. */
const retratoDe = (noDock: readonly ModuloDaConta[], noMais: readonly ModuloDaConta[]) =>
  `${noDock.map(({ id }) => id).join(' ')}|${noMais.map(({ id }) => id).join(' ')}`;

/**
 * A parte "Módulos do dock" da seção Dock (spec ajustes-do-sistema, "Seção Dock"; change
 * dock-personalizavel, design, decisão 4): a lista "No dock", com Subir, Descer e Tirar do dock em
 * cada módulo, e a lista "No Mais", com Pôr no dock. Cada clique grava a lista inteira no alvo, a
 * conta ou os padrões da organização, e vale na hora.
 *
 * As listas trazem os módulos que quem ajusta vê, sem Ajustes, que fica sempre no fim. A lista
 * gravada guarda também o módulo que ele não vê, no lugar dele. O foco acompanha o módulo: continua
 * no botão de mover, ou vai ao outro quando esse fica desabilitado, e, quando a linha muda de
 * lista, vai ao botão que desfaz a ação.
 */
export function ModulosDoDock() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const daConta = useModulosDaConta();
  const modulos = useMemo(
    () => daConta.filter((modulo) => modulo.id !== MODULO_DOS_AJUSTES),
    [daConta],
  );
  const salvos = preferencias.dock.modulos;
  const { visiveis: noDock, ocultos: noMais } = ordenarItens(modulos, salvos);
  const retrato = retratoDe(noDock, noMais);

  const idDoTitulo = useId();
  const idNoDock = useId();
  const idNoMais = useId();
  const parte = useRef<HTMLElement>(null);
  const focoPendente = useRef<{ modulo: string; acoes: readonly Acao[]; retrato: string } | null>(
    null,
  );

  // O foco vai ao botão do módulo depois de as listas mostrarem a mudança: o navegador o tira do
  // botão que fica desabilitado, do que sai da tela e do que muda de lugar na lista.
  useLayoutEffect(() => {
    const pendente = focoPendente.current;
    if (!pendente || pendente.retrato !== retrato) return;
    focoPendente.current = null;
    for (const acao of pendente.acoes) {
      const botao = parte.current?.querySelector<HTMLButtonElement>(
        `[data-modulo="${pendente.modulo}"] [data-acao="${acao}"]`,
      );
      if (botao && !botao.disabled) {
        botao.focus();
        return;
      }
    }
  }, [retrato]);

  /** Grava a lista inteira e guarda aonde o foco vai quando as listas a mostrarem. */
  const gravar = (nova: ItemDaLista[], modulo: ModuloDaConta, acoes: readonly Acao[]) => {
    const depois = ordenarItens(modulos, nova);
    focoPendente.current = {
      modulo: modulo.id,
      acoes,
      retrato: retratoDe(depois.visiveis, depois.ocultos),
    };
    mudar('dock', { modulos: nova });
  };
  const lista = () => listaComAusentes(modulos, salvos, LIMITES_DAS_PREFERENCIAS.modulosDoDock);
  const mover = (modulo: ModuloDaConta, sentido: -1 | 1) =>
    gravar(
      moverItem(lista(), modulo.id, sentido, new Set(modulos.map(({ id }) => id))),
      modulo,
      sentido === -1 ? ['subir', 'descer'] : ['descer', 'subir'],
    );

  return (
    <section ref={parte} aria-labelledby={idDoTitulo} className={estilos.parte}>
      <Carimbo id={idDoTitulo}>Módulos do dock</Carimbo>
      <p className={estilos.explicacao}>Ajustes fica sempre no fim do dock.</p>
      <div className={estilos.listasDeModulos}>
        <div className={estilos.grupoDeOpcoes} data-foco="modulos-do-dock">
          <p id={idNoDock} className={estilos.tituloDoGrupo}>
            No dock
          </p>
          {noDock.length === 0 ? (
            <p className={estilos.explicacao}>Nenhum módulo no dock.</p>
          ) : (
            <ul aria-labelledby={idNoDock} className={estilos.listaDeModulos}>
              {noDock.map((modulo, indice) => (
                <li key={modulo.id} data-modulo={modulo.id} className={estilos.moduloDaLista}>
                  <span className={estilos.nomeDoModulo}>
                    <Icone icone={modulo.icone} />
                    {modulo.nome}
                  </span>
                  <span className={estilos.acoesDoModulo}>
                    <Botao
                      nivel="terciario"
                      data-acao="subir"
                      aria-label={`Subir ${modulo.nome}`}
                      isDisabled={indice === 0}
                      onPress={() => mover(modulo, -1)}
                    >
                      Subir
                    </Botao>
                    <Botao
                      nivel="terciario"
                      data-acao="descer"
                      aria-label={`Descer ${modulo.nome}`}
                      isDisabled={indice === noDock.length - 1}
                      onPress={() => mover(modulo, 1)}
                    >
                      Descer
                    </Botao>
                    <Botao
                      nivel="terciario"
                      data-acao="tirar"
                      aria-label={`Tirar ${modulo.nome} do dock`}
                      onPress={() => gravar(ocultarItem(lista(), modulo.id, true), modulo, ['por'])}
                    >
                      Tirar do dock
                    </Botao>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={estilos.grupoDeOpcoes}>
          <p id={idNoMais} className={estilos.tituloDoGrupo}>
            No Mais
          </p>
          {noMais.length === 0 ? (
            <p className={estilos.explicacao}>Nenhum módulo fora do dock.</p>
          ) : (
            <ul aria-labelledby={idNoMais} className={estilos.listaDeModulos}>
              {noMais.map((modulo) => (
                <li key={modulo.id} data-modulo={modulo.id} className={estilos.moduloDaLista}>
                  <span className={estilos.nomeDoModulo}>
                    <Icone icone={modulo.icone} />
                    {modulo.nome}
                  </span>
                  <span className={estilos.acoesDoModulo}>
                    <Botao
                      nivel="terciario"
                      data-acao="por"
                      aria-label={`Pôr ${modulo.nome} no dock`}
                      onPress={() =>
                        gravar(ocultarItem(lista(), modulo.id, false), modulo, ['tirar'])
                      }
                    >
                      Pôr no dock
                    </Botao>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
