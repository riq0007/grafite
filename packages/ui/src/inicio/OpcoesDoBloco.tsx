import { useId, useMemo } from 'react';
import type { ItemDaArvore } from '../componentes/arvore/Arvore.tsx';
import { EscolhaEmArvore } from '../componentes/arvore/EscolhaEmArvore.tsx';
import { Botao } from '../componentes/botao/Botao.tsx';
import estilosDoCampo from '../componentes/campo/Campo.module.css';
import { ControleDeslizante } from '../componentes/deslizante/ControleDeslizante.tsx';
import { Checkbox, GrupoDeCheckboxes } from '../componentes/escolhas/Checkbox.tsx';
import { Gaveta } from '../componentes/modal/Gaveta.tsx';
import estilos from './OpcoesDoBloco.module.css';
import type { OpcaoDoBloco, ValorDaOpcaoDoBloco, ValoresDasOpcoesDoBloco } from './opcaoDoBloco.ts';

export interface PropsDasOpcoesDoBloco {
  /** O título do bloco, que nomeia a gaveta: "Opções de Suprimentos que acabam primeiro". */
  bloco: string;
  opcoes: readonly OpcaoDoBloco[];
  /** O valor que vale de cada opção, já resolvido por quem usa. */
  valores: ValoresDasOpcoesDoBloco;
  /** Cada mudança vale na hora: não há botão de salvar. */
  aoMudar: (chave: string, valor: ValorDaOpcaoDoBloco) => void;
  /** Volta todas as opções às de fábrica. */
  aoRestaurar: () => void;
  /** A árvore dos locais ativos, para as opções de locais; sem ela, a escolha de local espera. */
  locais?: ItemDaArvore[];
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
}

const lista = (valor: ValorDaOpcaoDoBloco | undefined): readonly string[] =>
  typeof valor === 'number' || valor === undefined ? [] : valor;

/** O caminho de cada local da árvore, como "Campinas › Expedição". */
function caminhosDe(
  itens: readonly ItemDaArvore[],
  acima = '',
  caminhos = new Map<string, string>(),
) {
  for (const item of itens) {
    const caminho = acima ? `${acima} › ${item.rotulo}` : item.rotulo;
    caminhos.set(item.id, caminho);
    caminhosDe(item.filhos ?? [], caminho, caminhos);
  }
  return caminhos;
}

type Escolhas = Extract<OpcaoDoBloco, { forma: 'escolhas' }>;
type Numero = Extract<OpcaoDoBloco, { forma: 'numero' }>;

/** As caixas de marcar de uma escolha: no mínimo, as marcadas não desmarcam, e o texto diz por quê. */
function EscolhasDaOpcao({
  opcao,
  escolhidos,
  aoMudar,
}: {
  opcao: Escolhas;
  escolhidos: readonly string[];
  aoMudar: (valor: readonly string[]) => void;
}) {
  const minimo = opcao.minimo ?? 0;
  const noMinimo = minimo > 0 && escolhidos.length <= minimo;
  return (
    <GrupoDeCheckboxes
      rotulo={opcao.rotulo}
      value={[...escolhidos]}
      // A escolha vai na ordem em que o bloco declara os valores, e não na dos cliques.
      onChange={(marcados) =>
        aoMudar(opcao.opcoes.map(({ id }) => id).filter((id) => marcados.includes(id)))
      }
      descricao={
        noMinimo
          ? minimo === 1
            ? 'Pelo menos um fica escolhido.'
            : `Pelo menos ${minimo} ficam escolhidos.`
          : undefined
      }
    >
      {opcao.opcoes.map((uma) => (
        <Checkbox key={uma.id} value={uma.id} isDisabled={noMinimo && escolhidos.includes(uma.id)}>
          {uma.rotulo}
        </Checkbox>
      ))}
    </GrupoDeCheckboxes>
  );
}

/** O controle deslizante de um número, com a unidade que a opção declara. */
function NumeroDaOpcao({
  opcao,
  valor,
  aoMudar,
}: {
  opcao: Numero;
  valor: number;
  aoMudar: (valor: number) => void;
}) {
  const emPorcento = opcao.unidade === '%';
  return (
    <ControleDeslizante
      rotulo={opcao.rotulo}
      unidade="%"
      textoDoValor={
        emPorcento
          ? undefined
          : (numero) => (opcao.unidade ? `${numero} ${opcao.unidade}` : String(numero))
      }
      minValue={opcao.minimo}
      maxValue={opcao.maximo}
      step={opcao.passo ?? 1}
      value={valor}
      onChange={aoMudar}
    />
  );
}

/**
 * Os locais de uma opção: os escolhidos, cada um com o caminho e "Tirar", e a escolha em árvore, a
 * mesma dos cadastros, que acrescenta mais um. Sem nenhum escolhido, valem todos.
 */
function LocaisDaOpcao({
  rotulo,
  escolhidos,
  locais,
  aoMudar,
}: {
  rotulo: string;
  escolhidos: readonly string[];
  locais: ItemDaArvore[] | undefined;
  aoMudar: (valor: readonly string[]) => void;
}) {
  const idDoRotulo = useId();
  const caminhos = useMemo(() => caminhosDe(locais ?? []), [locais]);
  const jaEscolhidos = useMemo(() => new Set(escolhidos), [escolhidos]);
  return (
    <div className={estilos.locais}>
      <span id={idDoRotulo} className={estilosDoCampo.rotulo}>
        {rotulo}
      </span>
      {escolhidos.length === 0 ? (
        <p className={estilos.todos}>Todos os locais.</p>
      ) : (
        <ul aria-labelledby={idDoRotulo} className={estilos.escolhidos}>
          {escolhidos.map((id) => {
            const caminho = caminhos.get(id) ?? 'Local fora da lista';
            return (
              <li key={id} className={estilos.escolhido}>
                <span className={estilos.caminho}>{caminho}</span>
                <Botao
                  nivel="terciario"
                  aria-label={`Tirar ${caminho}`}
                  onPress={() => aoMudar(escolhidos.filter((outro) => outro !== id))}
                >
                  Tirar
                </Botao>
              </li>
            );
          })}
        </ul>
      )}
      <EscolhaEmArvore
        rotulo="Acrescentar um local"
        itens={locais ?? []}
        valor={null}
        aoMudar={(id) => aoMudar([...escolhidos, id])}
        desabilitados={jaEscolhidos}
        desabilitado={!locais}
        placeholder="Escolha um local"
      />
    </div>
  );
}

/**
 * A gaveta "Opções…" de um bloco do Início (spec tela-inicial, "Opções dos blocos"; change
 * opcoes-dos-blocos-do-inicio, design, decisão 3): um controle por forma de opção, na ordem em que
 * o bloco as declara, e "Restaurar as opções". Cada mudança sai na hora por `aoMudar`, e quem usa
 * grava a escolha e devolve os valores que valem.
 */
export function OpcoesDoBloco({
  bloco,
  opcoes,
  valores,
  aoMudar,
  aoRestaurar,
  locais,
  aberta,
  aoMudarAberta,
}: PropsDasOpcoesDoBloco) {
  return (
    <Gaveta titulo={`Opções de ${bloco}`} aberta={aberta} aoMudarAberta={aoMudarAberta}>
      <div className={estilos.opcoes}>
        {opcoes.map((opcao) => {
          const valor = valores[opcao.chave];
          if (opcao.forma === 'escolhas') {
            return (
              <EscolhasDaOpcao
                key={opcao.chave}
                opcao={opcao}
                escolhidos={lista(valor)}
                aoMudar={(novo) => aoMudar(opcao.chave, novo)}
              />
            );
          }
          if (opcao.forma === 'numero') {
            return (
              <NumeroDaOpcao
                key={opcao.chave}
                opcao={opcao}
                valor={typeof valor === 'number' ? valor : opcao.padrao}
                aoMudar={(novo) => aoMudar(opcao.chave, novo)}
              />
            );
          }
          return (
            <LocaisDaOpcao
              key={opcao.chave}
              rotulo={opcao.rotulo}
              escolhidos={lista(valor)}
              locais={locais}
              aoMudar={(novo) => aoMudar(opcao.chave, novo)}
            />
          );
        })}
        <div>
          <Botao nivel="terciario" onPress={aoRestaurar}>
            Restaurar as opções
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}
