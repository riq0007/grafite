// O editor de filtro de uma coluna (spec componentes-base e tabelas-configuraveis): a condição e os
// campos do valor conforme o tipo do filtro, "Aplicar filtro" e, num filtro que já existe, "Tirar
// filtro", com as recusas no próprio campo. O seletor do local e o das pessoas são da tela. Na
// escolha, cada opção pode dizer quantos registros traz, com as de zero no fim, e o botão diz o
// resultado das marcadas (change filtros-e-barra-da-tabela, design, decisão 2).
import { type ReactNode, useId, useState } from 'react';
import { Botao } from '../botao/Botao.tsx';
import { CampoDeData } from '../campo/CampoDeData.tsx';
import { CampoDeTexto } from '../campo/CampoDeTexto.tsx';
import { Checkbox, GrupoDeCheckboxes } from '../escolhas/Checkbox.tsx';
import { GrupoDeRadios, Radio } from '../escolhas/Radio.tsx';
import { Selecao } from '../selecao/Selecao.tsx';
import estilos from './EditorDeFiltro.module.css';
import {
  type CampoDoFiltro,
  type ErrosDoFiltro,
  type FiltroDoEditor,
  montarFiltro,
  type OperadorDoEditor,
  operadoresDoEditor,
  type RascunhoDoFiltro,
  rascunhoDe,
  type TipoDoFiltro,
} from './filtro.ts';

export interface OpcaoDoFiltro {
  id: string;
  rotulo: string;
  /** Quantos registros a opção traz, com os outros filtros e a busca; ausente enquanto não chega. */
  quantos?: number;
}

/** Quantas opções da escolha aparecem antes de "Mostrar mais". */
export const OPCOES_A_VISTA = 20;

/** As opções na ordem do editor: as que não trazem nenhum registro vão ao fim. */
function naOrdemDasContagens(opcoes: readonly OpcaoDoFiltro[]): OpcaoDoFiltro[] {
  return [
    ...opcoes.filter((opcao) => opcao.quantos !== 0),
    ...opcoes.filter((opcao) => opcao.quantos === 0),
  ];
}

const comContagem = (opcao: OpcaoDoFiltro) =>
  opcao.quantos === undefined
    ? opcao.rotulo
    : `${opcao.rotulo} (${opcao.quantos.toLocaleString('pt-BR')})`;

export interface PropsDoEditorDeFiltro {
  /** O rótulo da coluna. */
  coluna: string;
  /** O tipo do filtro da coluna; nulo quando ela só aceita "Está vazio" e "Está preenchido". */
  tipo: TipoDoFiltro | null;
  /** O sufixo dos números do intervalo, como "%", que os rótulos "De" e "Até" dizem. */
  unidade?: string;
  /** A coluna pode ficar sem valor: "Está vazio" e "Está preenchido". */
  podeFicarVazia: boolean;
  /** O filtro que a coluna já tem: o editor abre nele e oferece "Tirar filtro". */
  filtro?: FiltroDoEditor | null;
  /** As opções da escolha ("É qualquer de") e da situação. */
  opcoes?: readonly OpcaoDoFiltro[];
  /** O seletor do local que a tela dá, no lugar da lista das opções. */
  seletorDeLocal?: (props: {
    valor: string | null;
    aoMudar: (local: string | null) => void;
    erro?: string;
  }) => ReactNode;
  /** O seletor das opções que a tela dá, como o das pessoas, no lugar da lista das opções. */
  seletorDeOpcoes?: (props: {
    valores: string[];
    aoMudar: (valores: string[]) => void;
    erro?: string;
  }) => ReactNode;
  /**
   * O botão da escolha, pelas opções marcadas, como "Mostrar 134 ativos"; nulo enquanto não se
   * sabe, e o botão fica "Aplicar filtro".
   */
  resultadoDaEscolha?: (valores: readonly string[]) => string | null;
  aoAplicar: (filtro: FiltroDoEditor) => void;
  aoTirar?: () => void;
}

const ROTULOS_DOS_OPERADORES: Record<OperadorDoEditor, string> = {
  contem: 'Contém',
  entre: 'No intervalo',
  qualquer: 'É qualquer de',
  em: 'Em',
  situacao: 'É',
  vazio: 'Está vazio',
  preenchido: 'Está preenchido',
};

export function EditorDeFiltro({
  coluna,
  tipo,
  unidade,
  podeFicarVazia,
  filtro,
  opcoes = [],
  seletorDeLocal,
  seletorDeOpcoes,
  resultadoDaEscolha,
  aoAplicar,
  aoTirar,
}: PropsDoEditorDeFiltro) {
  const [todasAsOpcoes, definirTodasAsOpcoes] = useState(false);
  const idDaColuna = useId();
  const operadores = operadoresDoEditor(tipo, podeFicarVazia);
  const [rascunho, definirRascunho] = useState(() => rascunhoDe(filtro, tipo, podeFicarVazia));
  const [erros, definirErros] = useState<ErrosDoFiltro>({});
  // As datas que não existem, como o usuário as digitou: o campo já diz por quê, e o filtro espera.
  const [recusadas, definirRecusadas] = useState<{ de: string | null; ate: string | null }>({
    de: null,
    ate: null,
  });
  const esquecerErro = (campo: CampoDoFiltro) =>
    definirErros(({ [campo]: _, ...outros }) => outros);
  const mudar = (mudanca: Partial<RascunhoDoFiltro>, campo: CampoDoFiltro) => {
    definirRascunho((atual) => ({ ...atual, ...mudanca }));
    esquecerErro(campo);
  };
  const aplicar = () => {
    if (rascunho.operador === 'entre' && (recusadas.de || recusadas.ate)) return;
    const montado = montarFiltro(rascunho, tipo);
    if ('erros' in montado) definirErros(montado.erros);
    else aoAplicar(montado.filtro);
  };

  const limite = (campo: 'de' | 'ate', rotulo: string) => {
    const comLimite = (texto: string) => (campo === 'de' ? { de: texto } : { ate: texto });
    return tipo === 'numero' ? (
      <CampoDeTexto
        rotulo={rotulo}
        inputMode="decimal"
        value={rascunho[campo]}
        onChange={(texto) => mudar(comLimite(texto), campo)}
        erro={erros[campo]}
      />
    ) : (
      <CampoDeData
        rotulo={rotulo}
        valor={rascunho[campo] || null}
        aoMudar={(data) => mudar(comLimite(data ?? ''), campo)}
        aoRecusar={(texto) => {
          definirRecusadas((atuais) => ({ ...atuais, [campo]: texto }));
          if (texto) esquecerErro(campo);
        }}
        erro={erros[campo]}
      />
    );
  };

  // Acima de 20 opções, as 20 primeiras e as marcadas que ficariam abaixo delas.
  const ordenadas = naOrdemDasContagens(opcoes);
  const aVista =
    todasAsOpcoes || ordenadas.length <= OPCOES_A_VISTA
      ? ordenadas
      : ordenadas.filter(
          (opcao, indice) => indice < OPCOES_A_VISTA || rascunho.valores.includes(opcao.id),
        );
  const escondidas = ordenadas.length - aVista.length;
  const rotuloDoAplicar =
    (rascunho.operador === 'qualquer' && resultadoDaEscolha?.(rascunho.valores)) ||
    'Aplicar filtro';

  const valor = (): ReactNode => {
    switch (rascunho.operador) {
      case 'contem':
        return (
          <CampoDeTexto
            rotulo="Texto"
            value={rascunho.texto}
            onChange={(texto) => mudar({ texto }, 'texto')}
            erro={erros.texto}
          />
        );
      case 'entre':
        return (
          <div className={estilos.intervalo}>
            {limite('de', unidade ? `De (${unidade})` : 'De')}
            {limite('ate', unidade ? `Até (${unidade})` : 'Até')}
          </div>
        );
      case 'qualquer':
        return seletorDeOpcoes ? (
          seletorDeOpcoes({
            valores: rascunho.valores,
            aoMudar: (valores) => mudar({ valores }, 'valores'),
            erro: erros.valores,
          })
        ) : (
          <div className={estilos.escolha}>
            <GrupoDeCheckboxes
              rotulo="Opções"
              value={rascunho.valores}
              onChange={(valores) => mudar({ valores }, 'valores')}
              erro={erros.valores}
              className={estilos.opcoes}
            >
              {aVista.map((opcao) => (
                <Checkbox key={opcao.id} value={opcao.id}>
                  {comContagem(opcao)}
                </Checkbox>
              ))}
            </GrupoDeCheckboxes>
            {escondidas > 0 && (
              <Botao nivel="terciario" onPress={() => definirTodasAsOpcoes(true)}>
                Mostrar mais
              </Botao>
            )}
          </div>
        );
      case 'em':
        return seletorDeLocal ? (
          seletorDeLocal({
            valor: rascunho.local,
            aoMudar: (local) => mudar({ local }, 'local'),
            erro: erros.local,
          })
        ) : (
          <Selecao
            rotulo="Local"
            opcoes={[...opcoes]}
            selectedKey={rascunho.local}
            onSelectionChange={(chave) =>
              mudar({ local: chave === null ? null : String(chave) }, 'local')
            }
            erro={erros.local}
          />
        );
      case 'situacao':
        return (
          <GrupoDeRadios
            rotulo={coluna}
            value={rascunho.situacao}
            onChange={(situacao) => mudar({ situacao }, 'situacao')}
            erro={erros.situacao}
          >
            {opcoes.map((opcao) => (
              <Radio key={opcao.id} value={opcao.id}>
                {opcao.rotulo}
              </Radio>
            ))}
          </GrupoDeRadios>
        );
      default:
        return null;
    }
  };

  return (
    <form
      aria-labelledby={idDaColuna}
      noValidate
      className={estilos.editor}
      onSubmit={(evento) => {
        evento.preventDefault();
        aplicar();
      }}
    >
      <span id={idDaColuna} className={estilos.coluna}>
        {coluna}
      </span>
      {operadores.length > 1 && (
        <GrupoDeRadios
          rotulo="Condição"
          value={rascunho.operador}
          onChange={(operador) => {
            definirRascunho((atual) => ({ ...atual, operador: operador as OperadorDoEditor }));
            definirErros({});
          }}
        >
          {operadores.map((operador) => (
            <Radio key={operador} value={operador}>
              {ROTULOS_DOS_OPERADORES[operador]}
            </Radio>
          ))}
        </GrupoDeRadios>
      )}
      {valor()}
      <div className={estilos.acoes}>
        {filtro && aoTirar && (
          <Botao nivel="terciario" onPress={aoTirar}>
            Tirar filtro
          </Botao>
        )}
        <Botao nivel="primario" type="submit">
          {rotuloDoAplicar}
        </Botao>
      </div>
    </form>
  );
}
