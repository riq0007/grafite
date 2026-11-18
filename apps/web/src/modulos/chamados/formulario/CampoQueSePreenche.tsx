// Um campo do formulário que se preenche (change chamados-da-ti, design, decisão 21): a entrada
// conforme o tipo do campo, no visual dos campos do kit. O Ativo sugere os ativos da pessoa e busca
// entre os que a conta vê; o Local sugere o local de trabalho dela; a Pessoa se busca pelo nome,
// com o local de cada uma. O Anexo é o `AnexosDoCampo`.
import {
  type AtivoDasRespostas,
  type CampoDoFormulario,
  type FiltroDaVisao,
  mostrarDecimal,
  type RespostaDoCampo,
} from '@grafite/domain';
import {
  AreaDeTexto,
  CampoDeData,
  CampoDeTexto,
  Checkbox,
  GrupoDeCheckboxes,
  Selecao,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  origemDasSugestoes,
  type QuemPreenche,
  rotuloDoAtivoCitado,
  textoDaResposta,
} from './estado.ts';
import estilos from './Formulario.module.css';
import { Recusa } from './Recusa.tsx';

export interface PropsDoCampoQueSePreenche {
  campo: CampoDoFormulario;
  resposta: RespostaDoCampo | undefined;
  citados: CitadosDoFormulario;
  /** A resposta nova, ou `null` sem resposta, com o nome do que ela cita. */
  responder: (resposta: RespostaDoCampo | null, citados?: readonly Citado[]) => void;
  quem: QuemPreenche;
  pessoa: PessoaDoFormulario | null;
  erro?: string;
}

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

  switch (campo.tipo) {
    case 'texto-curto':
      return <CampoDeTexto {...comum} value={texto ?? ''} onChange={mudarTexto} />;
    case 'texto-longo':
      return <AreaDeTexto {...comum} value={texto ?? ''} onChange={mudarTexto} />;
    case 'escolha-unica':
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
    case 'varias-opcoes':
      return (
        <GrupoDeCheckboxes
          rotulo={comum.rotulo}
          obrigatorio={comum.obrigatorio}
          descricao={comum.descricao}
          erro={erro}
          value={Array.isArray(resposta) ? resposta : []}
          // A resposta vai na ordem das opções, como o domínio a confere.
          onChange={(ids) =>
            responder(campo.opcoes.filter((opcao) => ids.includes(opcao.id)).map((o) => o.id))
          }
        >
          {campo.opcoes.map((opcao) => (
            <Checkbox key={opcao.id} value={opcao.id}>
              {opcao.texto}
            </Checkbox>
          ))}
        </GrupoDeCheckboxes>
      );
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
      return (
        <Selecao
          {...comum}
          opcoes={[
            ...(exigido ? [] : [NENHUM]),
            { id: 'sim', rotulo: 'Sim' },
            { id: 'nao', rotulo: 'Não' },
          ]}
          selectedKey={chaveEscolhida(chave, exigido)}
          onSelectionChange={(escolhida) => {
            if (escolhida === 'sim' || escolhida === 'nao') responder(escolhida === 'sim');
            else responder(null);
          }}
        />
      );
    }
    case 'anexo':
      return null;
  }
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
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  // As dependências da busca são textos, para ela ficar a mesma entre as renderizações.
  const chaveDosTipos = campo.tiposDeAtivo.join(',');
  const pessoaId = pessoa?.id ?? null;
  const nome = pessoa?.nome ?? '';
  // O nome e o patrimônio de cada ativo que a lista mostrou, para a resposta citar o escolhido.
  const vistos = useRef(new Map<string, AtivoDasRespostas>());

  const buscar = useCallback(
    async (texto: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const tipos = chaveDosTipos === '' ? [] : chaveDosTipos.split(',');
      // A falha das sugestões vira "sem sugestões": a busca pelo texto segue.
      const sugestoes =
        pessoaId === null
          ? null
          : await consultas
              .fetchQuery(opcoesDasSugestoes(api, quem, pessoaId, tipos))
              .catch(() => null);
      const sugeridos = sugestoes?.ativos ?? [];
      const origem = origemDasSugestoes(
        sugeridos.map((ativo) => ativo.motivo),
        nome,
      );
      const opcao = (ativo: { id: string; rotulo: string; patrimonio: string | null }) => {
        vistos.current.set(ativo.id, { rotulo: ativo.rotulo, patrimonio: ativo.patrimonio });
        return { id: ativo.id, rotulo: rotuloDoAtivoCitado(ativo) };
      };
      if (texto === '' && sugeridos.length > 0) {
        return {
          itens: sugeridos.map(opcao),
          sugeridas: { ids: sugeridos.map((ativo) => ativo.id), origem },
        };
      }
      const doTipo: FiltroDaVisao[] =
        tipos.length > 0 ? [{ chave: 'ativo.tipo', operador: 'qualquer', valores: tipos }] : [];
      const { data, error } = await api.GET('/ativos', {
        params: {
          query: {
            busca: texto,
            limite: 20,
            ...(doTipo.length > 0 && { filtros: JSON.stringify(doTipo) }),
          },
        },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      const itens = data.itens.map(opcao);
      const achados = new Set(itens.map((item) => item.id));
      return {
        itens,
        total: data.total,
        sugeridas: {
          ids: sugeridos.filter((ativo) => achados.has(ativo.id)).map((ativo) => ativo.id),
          origem,
        },
      };
    },
    [api, consultas, quem, chaveDosTipos, pessoaId, nome],
  );

  if (!pode('ativos.ver')) {
    // A resposta que já existe aparece, pelo nome que a ficha traz; sem ela, a falta e a saída.
    const respondido = textoDaResposta(campo, escolhido ?? undefined, citados);
    return (
      <>
        <span className={estilos.rotulo}>
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
        const visto = escolha ? vistos.current.get(escolha.id) : undefined;
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
