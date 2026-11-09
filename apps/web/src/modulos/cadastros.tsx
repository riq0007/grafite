// Os cadastros que abrem numa aba (change cadastro-em-abas, design, decisão 4): o campo pede o
// cadastro pelo que ele cria, sem conhecer o módulo que o registra, e só a conta que pode criar o
// registro, com o módulo ligado, vê o link.
import { LinkDeCadastro } from '@grafite/ui';
import { rootRouteId, useRouteContext } from '@tanstack/react-router';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { type PedidoDoCampo, type RegistroCriado, useAbasDaJanela } from '../casca/abasDoApp.tsx';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useServidor } from '../sessao/useSessao.tsx';
import estilos from './cadastros.module.css';
import { registroDaConta } from './registroDaConta.ts';
import type { AlvoDoCadastro } from './tipos.ts';

/** O cadastro à mão do campo: o texto do link e o pedido. */
export interface CadastroDoCampo {
  /** O título da aba, como "Novo local". */
  titulo: string;
  /** O texto do link embaixo do campo, como "Cadastrar novo local". */
  link: string;
  /**
   * Abre o cadastro numa aba, pelo campo que pede, único na tela. Resolve com o registro criado,
   * ou com `null` quando a aba fecha sem salvar ou quando o campo já saiu da tela.
   */
  pedir: (
    campo: string,
    opcoes?: Pick<PedidoDoCampo, 'inicial' | 'aoVoltar'>,
  ) => Promise<RegistroCriado | null>;
}

/**
 * O cadastro que um módulo ligado registra para o alvo, se a conta pode criá-lo e a tela está na
 * casca; sem isso, nada, e o campo não mostra o link.
 */
export function useCadastro(alvo: AlvoDoCadastro): CadastroDoCampo | undefined {
  const { modulos } = useRouteContext({ from: rootRouteId });
  const { pode } = useAcesso();
  const desligados = useServidor()?.modulosDesligados;
  const { pedir, disponivel } = useAbasDaJanela();
  const cadastro = useMemo(
    () =>
      registroDaConta(modulos, pode, desligados)
        .flatMap((modulo) => modulo.cadastros ?? [])
        .find((candidato) => candidato.alvo === alvo),
    [modulos, pode, desligados, alvo],
  );
  // O campo que saiu da tela, como depois de a pessoa navegar, não recebe o registro.
  const naTela = useRef(true);
  useEffect(() => {
    naTela.current = true;
    return () => {
      naTela.current = false;
    };
  }, []);
  return useMemo(() => {
    if (!cadastro || !disponivel) return undefined;
    return {
      titulo: cadastro.titulo,
      link: cadastro.link,
      pedir: async (campo, opcoes = {}) => {
        const registro = await pedir({
          alvo,
          titulo: cadastro.titulo,
          campo,
          componente: cadastro.componente,
          ...opcoes,
        });
        return naTela.current ? registro : null;
      },
    };
  }, [cadastro, disponivel, pedir, alvo]);
}

export interface PropsDoCampoComCadastro {
  /** O que o cadastro cria, como `local`. */
  alvo: AlvoDoCadastro;
  /** O nome do campo, como "Local", que o leitor de tela anuncia junto do link. */
  campo: string;
  /** O campo na tela, único nela; sem ele, o próprio alvo. */
  chave?: string;
  /** Os valores com que o cadastro abre, como o tipo do ativo no Novo modelo. */
  inicial?: Readonly<Record<string, string>>;
  /** O campo está desabilitado ou só para leitura: o link não aparece. */
  bloqueado?: boolean;
  /** O registro criado, que o campo passa a mostrar. */
  aoCriar: (registro: RegistroCriado) => void;
  children: ReactNode;
}

/**
 * Um campo que aponta outro cadastro, com o link embaixo dele (spec cadastro-de-ativos, "Cadastro
 * pedido por um campo do ativo"): o link aparece só com o cadastro à mão, e, quando a aba do
 * cadastro fecha, o foco volta ao campo.
 */
export function CampoComCadastro({ children, ...link }: PropsDoCampoComCadastro) {
  const { disponivel } = useAbasDaJanela();
  const caixa = useRef<HTMLDivElement>(null);
  return (
    <div ref={caixa} className={estilos.campoComCadastro}>
      {children}
      {/* Fora da casca, como no teste de um campo sozinho, não há abas nem link. */}
      {disponivel && <LinkDoCampo {...link} caixa={caixa} />}
    </div>
  );
}

/** Quantos quadros o foco espera o campo de busca mostrar o registro criado. */
const QUADROS_PELO_TEXTO = 10;

/** O link do cadastro embaixo do campo, só com o cadastro à mão. */
function LinkDoCampo({
  alvo,
  campo,
  chave,
  inicial,
  bloqueado = false,
  aoCriar,
  caixa,
}: Omit<PropsDoCampoComCadastro, 'children'> & { caixa: RefObject<HTMLDivElement | null> }) {
  const cadastro = useCadastro(alvo);
  // O foco volta ao campo depois de ele mostrar o registro. A busca com sugestões só escreve o
  // nome quando a lista dela já o tem, e não o troca mais com o foco nela: o foco espera alguns
  // quadros pelo texto.
  const [voltas, definirVoltas] = useState(0);
  useEffect(() => {
    if (voltas === 0) return;
    let quadros = 0;
    let quadro = 0;
    const focar = () => {
      const elemento = caixa.current?.querySelector<HTMLElement>('input, button, [tabindex="0"]');
      if (
        elemento instanceof HTMLInputElement &&
        elemento.value === '' &&
        quadros < QUADROS_PELO_TEXTO
      ) {
        quadros += 1;
        quadro = requestAnimationFrame(focar);
        return;
      }
      elemento?.focus();
    };
    focar();
    return () => cancelAnimationFrame(quadro);
  }, [voltas, caixa]);
  if (!cadastro) return null;
  return (
    <LinkDeCadastro
      texto={cadastro.link}
      campo={campo}
      campoBloqueado={bloqueado}
      aoPressionar={async () => {
        const criado = await cadastro.pedir(chave ?? alvo, {
          ...(inicial ? { inicial } : {}),
          aoVoltar: () => caixa.current !== null,
        });
        if (criado) aoCriar(criado);
        definirVoltas((vez) => vez + 1);
      }}
    />
  );
}
