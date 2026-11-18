// Um campo do formulário que se preenche (change chamados-da-ti, design, decisão 21): a entrada
// conforme o tipo do campo, no visual dos campos do kit ou, na prévia do colaborador, no da aba
// (decisão 16), com as escolhas em cartões e em chips. O Ativo sugere os ativos da pessoa e busca
// entre os que a conta vê; o Local sugere o local de trabalho dela; a Pessoa se busca pelo nome,
// com o local de cada uma. O Anexo é o `AnexosDoCampo`.
import { type CampoDoFormulario, mostrarDecimal, type RespostaDoCampo } from '@grafite/domain';
import {
  AreaDeTexto,
  CampoDeData,
  CampoDeTexto,
  Checkbox,
  GrupoDeCheckboxes,
  GrupoDeRadios,
  Icone,
  Radio,
  Selecao,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import {
  type ResultadoDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import {
  SeletorDeLocal,
  useCaminhoDoLocal,
} from '../../administracao/seletores/SeletorDeLocal.tsx';
import { buscarPessoas, opcoesDasSugestoes, type PessoaDoFormulario } from './buscas.ts';
import {
  avisoSemOsAtivos,
  type Citado,
  type CitadosDoFormulario,
  descricaoDoCampo,
  lerNumero,
  type QuemPreenche,
  rotuloDoAtivoCitado,
  textoDaResposta,
} from './estado.ts';
import estilos from './Formulario.module.css';
import { Recusa } from './Recusa.tsx';
import { useBuscaDoAtivo } from './useBuscaDoAtivo.ts';

export interface PropsDoCampoQueSePreenche {
  campo: CampoDoFormulario;
  resposta: RespostaDoCampo | undefined;
  citados: CitadosDoFormulario;
  /** A resposta nova, ou `null` sem resposta, com o nome do que ela cita. */
  responder: (resposta: RespostaDoCampo | null, citados?: readonly Citado[]) => void;
  quem: QuemPreenche;
  pessoa: PessoaDoFormulario | null;
  erro?: string;
  /**
   * O visual da tela, ou o da aba, na prévia do colaborador (decisão 16): a Escolha única e o Sim
   * ou não em cartões, e as Várias opções em chips.
   */
  visual?: VisualDoFormulario;
  /**
   * Na aba, o campo que se cola à pergunta de cima, como a continuação dela (o m05 da 19): as
   * escolhas, também a Escolha única e o Sim ou não, vão em chips, na linha do rótulo.
   */
  continuacao?: boolean;
}

/** O visual dos campos: o da tela, nos campos do kit, ou o da aba, na prévia do colaborador. */
export type VisualDoFormulario = 'tela' | 'aba';

/** O que todo campo do kit recebe. */
interface Comum {
  rotulo: string;
  obrigatorio: boolean;
  descricao?: string;
  erro?: string;
}

const NENHUM = { id: '', rotulo: 'Nenhum' };

/** O "Nenhum" esvazia a escolha que não é exigida. */
const chaveEscolhida = (chave: string | null, exigido: boolean) =>
  chave ?? (exigido ? null : NENHUM.id);

export function CampoQueSePreenche({
  campo,
  resposta,
  citados,
  responder,
  quem,
  pessoa,
  erro,
  visual = 'tela',
  continuacao = false,
}: PropsDoCampoQueSePreenche) {
  // O campo só da TI é opcional na abertura: só a resposta da pessoa é exigida aqui.
  const exigido = campo.obrigatorio && !campo.soDaTi;
  const comum: Comum = {
    rotulo: campo.rotulo,
    obrigatorio: exigido,
    descricao: descricaoDoCampo(campo),
    erro,
  };
  const texto = typeof resposta === 'string' ? resposta : null;
  const mudarTexto = (valor: string) => responder(valor);
  const naAba = visual === 'aba';
  const forma: FormaDaEscolha = continuacao ? 'chips' : 'cartoes';

  switch (campo.tipo) {
    case 'texto-curto':
      return <CampoDeTexto {...comum} value={texto ?? ''} onChange={mudarTexto} />;
    case 'texto-longo':
      return <AreaDeTexto {...comum} value={texto ?? ''} onChange={mudarTexto} />;
    case 'escolha-unica':
      if (naAba) {
        return (
          <EscolhaDaAba
            forma={forma}
            comum={comum}
            opcoes={[
              ...campo.opcoes.map((opcao) => ({ id: opcao.id, rotulo: opcao.texto })),
              ...(exigido ? [] : [NENHUM]),
            ]}
            escolhida={chaveEscolhida(texto, exigido)}
            aoEscolher={(chave) => responder(chave === NENHUM.id ? null : chave)}
          />
        );
      }
      return (
        <Selecao
          {...comum}
          opcoes={[
            ...(exigido ? [] : [NENHUM]),
            ...campo.opcoes.map((opcao) => ({ id: opcao.id, rotulo: opcao.texto })),
          ]}
          selectedKey={chaveEscolhida(texto, exigido)}
          onSelectionChange={(chave) =>
            responder(chave === null || chave === NENHUM.id ? null : String(chave))
          }
        />
      );
    case 'varias-opcoes': {
      const ligadas = Array.isArray(resposta) ? resposta : [];
      return (
        <GrupoDeCheckboxes
          rotulo={comum.rotulo}
          obrigatorio={comum.obrigatorio}
          descricao={comum.descricao}
          erro={erro}
          value={ligadas}
          // A resposta vai na ordem das opções, como o domínio a confere.
          onChange={(ids) =>
            responder(campo.opcoes.filter((opcao) => ids.includes(opcao.id)).map((o) => o.id))
          }
          className={naAba ? estilos.chips : undefined}
          data-forma={naAba ? 'chips' : undefined}
        >
          {campo.opcoes.map((opcao) => (
            <Checkbox key={opcao.id} value={opcao.id} className={naAba ? estilos.chip : undefined}>
              {naAba && ligadas.includes(opcao.id) && <Visto />}
              {opcao.texto}
            </Checkbox>
          ))}
        </GrupoDeCheckboxes>
      );
    }
    case 'ativo':
      return (
        <EscolhaDoAtivo
          campo={campo}
          comum={comum}
          escolhido={texto}
          citados={citados}
          responder={responder}
          quem={quem}
          pessoa={pessoa}
        />
      );
    case 'local':
      return (
        <EscolhaDoLocal
          comum={comum}
          escolhido={texto}
          responder={responder}
          quem={quem}
          pessoa={pessoa}
        />
      );
    case 'pessoa':
      return (
        <EscolhaDaPessoa
          comum={comum}
          escolhida={texto}
          citados={citados}
          responder={responder}
          quem={quem}
        />
      );
    case 'data':
      return <CampoDeData {...comum} valor={texto} aoMudar={(data) => responder(data)} />;
    case 'numero':
      return (
        <EntradaDoNumero
          comum={comum}
          valor={typeof resposta === 'number' ? resposta : null}
          responder={responder}
        />
      );
    case 'sim-ou-nao': {
      const chave = typeof resposta === 'boolean' ? (resposta ? 'sim' : 'nao') : null;
      const responderSimOuNao = (escolhida: unknown) => {
        if (escolhida === 'sim' || escolhida === 'nao') responder(escolhida === 'sim');
        else responder(null);
      };
      const simOuNao = [
        { id: 'sim', rotulo: 'Sim' },
        { id: 'nao', rotulo: 'Não' },
      ];
      if (naAba) {
        return (
          <EscolhaDaAba
            forma={forma}
            comum={comum}
            opcoes={[...simOuNao, ...(exigido ? [] : [NENHUM])]}
            escolhida={chaveEscolhida(chave, exigido)}
            aoEscolher={responderSimOuNao}
          />
        );
      }
      return (
        <Selecao
          {...comum}
          opcoes={[...(exigido ? [] : [NENHUM]), ...simOuNao]}
          selectedKey={chaveEscolhida(chave, exigido)}
          onSelectionChange={responderSimOuNao}
        />
      );
    }
    case 'anexo':
      return null;
  }
}

/** O visto da escolha ligada, no visual da aba: o estado não fica só na cor. */
function Visto() {
  return (
    <span className={estilos.visto} data-parte="visto">
      <Icone icone={Check} tamanho={12} />
    </span>
  );
}

/** A forma das escolhas na aba: em cartões, na pergunta, ou em chips, na continuação. */
type FormaDaEscolha = 'cartoes' | 'chips';

interface PropsDaEscolhaDaAba {
  forma: FormaDaEscolha;
  comum: Comum;
  opcoes: readonly { id: string; rotulo: string }[];
  /** A opção escolhida; o "Nenhum" é a chave vazia, e nenhuma, no exigido sem resposta. */
  escolhida: string | null;
  aoEscolher: (chave: string) => void;
}

/**
 * A Escolha única e o Sim ou não no visual da aba (decisão 16), rádios por baixo, com a escolhida
 * cheia na cor da aba e o visto: na pergunta, cartões em duas colunas, com o visto depois do
 * texto; na continuação, chips na linha do rótulo, com o visto antes, como os das Várias opções. O
 * "Nenhum" do que não é exigido vem por último: na aba, a pessoa lê as respostas antes de pular a
 * pergunta.
 */
function EscolhaDaAba({ forma, comum, opcoes, escolhida, aoEscolher }: PropsDaEscolhaDaAba) {
  const emChips = forma === 'chips';
  const classe = emChips ? estilos.chip : estilos.cartao;
  return (
    <GrupoDeRadios
      rotulo={comum.rotulo}
      obrigatorio={comum.obrigatorio}
      descricao={comum.descricao}
      erro={comum.erro}
      value={escolhida}
      onChange={aoEscolher}
      className={emChips ? estilos.chips : estilos.cartoes}
      data-forma={forma}
    >
      {opcoes.map((opcao) => (
        <Radio
          key={opcao.id}
          value={opcao.id}
          // O "Nenhum" escolhido é a falta de resposta, e não uma resposta: fica sem o preenchimento.
          className={opcao.id === NENHUM.id ? `${classe} ${estilos.nenhum}` : classe}
        >
          {emChips && escolhida === opcao.id && <Visto />}
          {opcao.rotulo}
          {!emChips && escolhida === opcao.id && <Visto />}
        </Radio>
      ))}
    </GrupoDeRadios>
  );
}

interface PropsDaEscolhaDoAtivo {
  campo: CampoDoFormulario;
  comum: Comum;
  escolhido: string | null;
  citados: CitadosDoFormulario;
  responder: PropsDoCampoQueSePreenche['responder'];
  quem: QuemPreenche;
  pessoa: PessoaDoFormulario | null;
}

/**
 * O Ativo: sem nada digitado, os ativos sugeridos pela pessoa, sob a origem; com o texto, a busca
 * entre os ativos que a conta vê, só dos tipos do campo, com as sugeridas no alto. Sem a pessoa, ou
 * sem sugestão, a lista abre com os primeiros ativos. A quem não vê os ativos, o campo só diz isso,
 * porque a busca seria recusada.
 */
function EscolhaDoAtivo({
  campo,
  comum,
  escolhido,
  citados,
  responder,
  quem,
  pessoa,
}: PropsDaEscolhaDoAtivo) {
  const { pode } = useAcesso();
  const { buscar, vistos } = useBuscaDoAtivo({ quem, pessoa, tipos: campo.tiposDeAtivo });

  if (!pode('ativos.ver')) {
    // A resposta que já existe aparece, pelo nome que a ficha traz; sem ela, a falta e a saída.
    const respondido = textoDaResposta(campo, escolhido ?? undefined, citados);
    return (
      <>
        <span className={estilos.rotulo} data-parte="rotulo">
          {comum.rotulo}
          {comum.obrigatorio && (
            <span className={estilos.obrigatorio} aria-hidden="true">
              obrigatório
            </span>
          )}
        </span>
        {respondido && <p className={estilos.resposta}>{respondido}</p>}
        <p className={estilos.descricao}>
          {respondido ? 'Você não vê os ativos.' : avisoSemOsAtivos(campo, quem)}
        </p>
        {comum.descricao && <p className={estilos.descricao}>{comum.descricao}</p>}
        {comum.erro && <Recusa texto={comum.erro} />}
      </>
    );
  }
  const ativo = escolhido === null ? undefined : citados.ativos.get(escolhido);
  return (
    <SeletorDeConta
      {...comum}
      valor={
        escolhido === null
          ? null
          : { id: escolhido, rotulo: ativo ? rotuloDoAtivoCitado(ativo) : escolhido }
      }
      aoMudar={(escolha) => {
        const visto = escolha ? vistos.get(escolha.id) : undefined;
        if (!escolha) responder(null);
        else responder(escolha.id, visto ? [{ tipo: 'ativo', id: escolha.id, ativo: visto }] : []);
      }}
      buscar={buscar}
    />
  );
}

interface PropsDaEscolhaDoLocal {
  comum: Comum;
  escolhido: string | null;
  responder: PropsDoCampoQueSePreenche['responder'];
  quem: QuemPreenche;
  pessoa: PessoaDoFormulario | null;
}

/** O Local, na árvore dos locais, com o local de trabalho da pessoa sugerido no alto. */
function EscolhaDoLocal({ comum, escolhido, responder, quem, pessoa }: PropsDaEscolhaDoLocal) {
  const api = useApi();
  const caminhoDoLocal = useCaminhoDoLocal();
  const sugestoes = useQuery({
    ...opcoesDasSugestoes(api, quem, pessoa?.id ?? '', []),
    enabled: pessoa !== null,
  });
  const local = pessoa === null ? null : (sugestoes.data?.local ?? null);
  return (
    <SeletorDeLocal
      {...comum}
      valor={escolhido}
      aoMudar={(id) => {
        const caminho = id === null ? undefined : caminhoDoLocal(id);
        responder(id, id !== null && caminho ? [{ tipo: 'local', id, caminho }] : []);
      }}
      sugerido={
        local && pessoa ? { id: local.id, origem: `local de trabalho de ${pessoa.nome}` } : null
      }
      limpavel={!comum.obrigatorio}
    />
  );
}

interface PropsDaEscolhaDaPessoa {
  comum: Comum;
  escolhida: string | null;
  citados: CitadosDoFormulario;
  responder: PropsDoCampoQueSePreenche['responder'];
  quem: QuemPreenche;
}

/** A Pessoa, pela busca do nome, com o local de cada uma ao lado, para os homônimos. */
function EscolhaDaPessoa({ comum, escolhida, citados, responder, quem }: PropsDaEscolhaDaPessoa) {
  const api = useApi();
  // O nome de cada pessoa que a lista mostrou: a resposta cita o nome, sem o local.
  const nomes = useRef(new Map<string, string>());
  const buscar = useCallback(
    async (texto: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const achadas = await buscarPessoas(api, quem, texto, sinal);
      for (const pessoa of achadas.itens) nomes.current.set(pessoa.id, pessoa.nome);
      return {
        itens: achadas.itens.map((pessoa) => ({
          id: pessoa.id,
          rotulo: pessoa.local ? `${pessoa.nome} · ${pessoa.local}` : pessoa.nome,
        })),
        total: achadas.total,
      };
    },
    [api, quem],
  );
  return (
    <SeletorDeConta
      {...comum}
      valor={
        escolhida === null
          ? null
          : { id: escolhida, rotulo: citados.pessoas.get(escolhida) ?? escolhida }
      }
      aoMudar={(escolha) => {
        if (!escolha) {
          responder(null);
          return;
        }
        const nome = nomes.current.get(escolha.id) ?? escolha.rotulo;
        responder(escolha.id, [{ tipo: 'pessoa', id: escolha.id, nome }]);
      }}
      buscar={buscar}
    />
  );
}

interface PropsDaEntradaDoNumero {
  comum: Comum;
  valor: number | null;
  responder: PropsDoCampoQueSePreenche['responder'];
}

const comoSeDigita = (valor: number | null) => (valor === null ? '' : mostrarDecimal(valor));

/**
 * O Número, com o teclado numérico: o texto aceita só os algarismos e os pontos de milhar, e o
 * outro caractere não entra. A resposta que muda de fora troca o texto.
 */
function EntradaDoNumero({ comum, valor, responder }: PropsDaEntradaDoNumero) {
  const [texto, definirTexto] = useState(() => comoSeDigita(valor));
  const lido = useMemo(() => lerNumero(texto), [texto]);
  if (lido.ok && lido.valor !== valor) definirTexto(comoSeDigita(valor));
  return (
    <CampoDeTexto
      {...comum}
      inputMode="numeric"
      value={texto}
      onChange={(digitado) => {
        const numero = lerNumero(digitado);
        if (!numero.ok) return;
        definirTexto(digitado);
        responder(numero.valor);
      }}
    />
  );
}
