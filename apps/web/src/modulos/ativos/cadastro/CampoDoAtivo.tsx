import {
  type DefinicaoNoAtivo,
  type FiltroDaVisao,
  mostrarValor,
  ROTULOS_DAS_ORIGENS,
  type ValorDeCampo,
} from '@grafite/domain';
import {
  AreaDeTexto,
  CampoDeData,
  CampoDeTexto,
  Checkbox,
  EstadoDoCampo,
  GrupoDeCheckboxes,
  Selecao,
  useDataHora,
} from '@grafite/ui';
import { useCallback } from 'react';
import { useApi } from '../../../api/useApi.tsx';
import { useBuscarFornecedores } from '../../administracao/fornecedores/escolha.ts';
import { ReferenciaAoFornecedor } from '../../administracao/fornecedores/ReferenciaAoFornecedor.tsx';
import { ReferenciaAoLocal } from '../../administracao/locais/ReferenciaAoLocal.tsx';
import { ReferenciaAPessoa } from '../../administracao/pessoas/ReferenciaAPessoa.tsx';
import { SeletorDeConta } from '../../administracao/seletores/SeletorDeConta.tsx';
import { SeletorDeLocal } from '../../administracao/seletores/SeletorDeLocal.tsx';
import { CampoComCadastro } from '../../cadastros.tsx';
import estilos from '../Ativos.module.css';
import type { FichaDoAtivo } from '../consultas.ts';
import { ArquivoDoCampo } from './ArquivoDoCampo.tsx';

/**
 * O valor de um campo no formulário: o texto digitado, o id escolhido, os ids marcados de uma
 * lista múltipla, ou `null`. O motor de campos lê a entrada antes do envio.
 */
export type EntradaDoCampo = string | string[] | null;

const NUMERICOS = new Set(['inteiro', 'decimal', 'moeda']);

/**
 * Os tipos que ocupam a linha inteira da grade dos campos, no cadastro e na ficha (change
 * janela-rolavel-e-campos-em-colunas, design, decisão 7): o texto longo, as opções marcadas e o
 * arquivo e a imagem, com a prévia.
 */
const LARGOS = new Set(['texto-longo', 'lista-multipla', 'arquivo', 'imagem']);
const DE_ESCOLHA = new Set(['lista', 'pessoa', 'local', 'ativo', 'fornecedor', 'data']);

/** A entrada de um valor guardado: os números como o pt-BR os digita; o resto como está guardado. */
export function entradaInicial(
  definicao: DefinicaoNoAtivo,
  valor: ValorDeCampo | undefined,
): EntradaDoCampo {
  if (definicao.tipo === 'lista-multipla') return Array.isArray(valor) ? valor : [];
  if (valor === undefined || valor === null) return DE_ESCOLHA.has(definicao.tipo) ? null : '';
  // A moeda se digita sem o "R$", que o motor também aceita.
  if (NUMERICOS.has(definicao.tipo)) return mostrarValor(definicao, valor).replace(/^R\$\s*/, '');
  return String(valor);
}

const AVISO_DE_RESTRITO = 'Restrito: só quem vê os campos restritos vê este valor.';

export interface PropsDoCampoDoAtivo {
  definicao: DefinicaoNoAtivo;
  entrada: EntradaDoCampo;
  /** A entrada nova e, na escolha de uma pessoa ou de um ativo, o nome do escolhido. */
  aoMudar: (entrada: EntradaDoCampo, nome?: string) => void;
  erro?: string;
  soLeitura: boolean;
  /** O nome atual da pessoa, do local ou do ativo apontado, pelo id. */
  nomeDoRegistro: (id: string) => string | undefined;
  /** O estado gravado do campo: a origem, o momento, o autor e a trava. */
  estado?: FichaDoAtivo['estado'][string];
  /** A trava no formulário, que vai com "Salvar alterações". */
  travado: boolean;
  aoMudarTrava?: (travado: boolean) => void;
  /** O ativo da ficha, que não aparece na escolha de um ativo. */
  ativoAtual?: string;
  /** O local do ativo no formulário: a escolha de uma pessoa sugere as que trabalham nele. */
  localDoAtivo?: string | null;
  /** Na ficha, o ativo, de onde vêm o arquivo e a imagem dos campos; no cadastro, nenhum. */
  ficha?: FichaDoAtivo;
  /** A ficha que a API devolve depois de enviar ou remover o arquivo de um campo. */
  aplicar?: (ficha: FichaDoAtivo) => void;
}

/**
 * Um campo do ativo (spec cadastro-de-ativos): a entrada conforme o tipo de campo, ou o valor em
 * texto para quem só vê, e o estado dele, com a trava. O arquivo e a imagem vão e saem na hora,
 * pela ficha, fora da entrada do formulário.
 */
export function CampoDoAtivo({
  definicao,
  entrada,
  aoMudar,
  erro,
  soLeitura,
  nomeDoRegistro,
  estado,
  travado,
  aoMudarTrava,
  ativoAtual,
  localDoAtivo,
  ficha,
  aplicar,
}: PropsDoCampoDoAtivo) {
  const { formatarDataEHora } = useDataHora();
  return (
    <div
      className={estilos.campoDoAtivo}
      data-largura={LARGOS.has(definicao.tipo) ? 'linha' : undefined}
    >
      {definicao.tipo === 'arquivo' || definicao.tipo === 'imagem' ? (
        <ArquivoDoCampo
          definicao={definicao}
          ficha={ficha}
          soLeitura={soLeitura}
          descricao={definicao.restrito ? AVISO_DE_RESTRITO : undefined}
          aplicar={aplicar}
        />
      ) : soLeitura ? (
        <ValorSoParaLeitura
          definicao={definicao}
          entrada={entrada}
          nomeDoRegistro={nomeDoRegistro}
          ficha={ficha}
        />
      ) : (
        <Entrada
          definicao={definicao}
          entrada={entrada}
          aoMudar={aoMudar}
          erro={erro}
          nomeDoRegistro={nomeDoRegistro}
          ativoAtual={ativoAtual}
          localDoAtivo={localDoAtivo}
        />
      )}
      <EstadoDoCampo
        rotuloDoCampo={definicao.rotulo}
        origem={estado?.origem ? ROTULOS_DAS_ORIGENS[estado.origem] : null}
        // O valor coletado tem o coletor no lugar do autor (spec impressoras-por-snmp).
        autor={estado?.autor?.nome ?? estado?.coletor?.nome ?? null}
        momento={estado?.momento ? formatarDataEHora(new Date(estado.momento)) : null}
        travado={travado}
        aoMudarTrava={soLeitura ? undefined : aoMudarTrava}
      />
    </div>
  );
}

function ValorSoParaLeitura({
  definicao,
  entrada,
  nomeDoRegistro,
  ficha,
}: Pick<PropsDoCampoDoAtivo, 'definicao' | 'entrada' | 'nomeDoRegistro' | 'ficha'>) {
  // O local e o responsável do ativo são referências com cartão (spec cadastro-de-ativos).
  if (definicao.chave === 'ativo.local' && ficha?.local) {
    return (
      <p className={estilos.informacao}>
        {definicao.rotulo}: <ReferenciaAoLocal local={ficha.local} />
      </p>
    );
  }
  if (definicao.chave === 'ativo.responsavel' && ficha?.responsavel) {
    return (
      <p className={estilos.informacao}>
        {definicao.rotulo}:{' '}
        <ReferenciaAPessoa pessoa={ficha.responsavel} comCartao={ficha.permite.verResponsavel} />
      </p>
    );
  }
  // O fornecedor pelo nome atual, que leva à ficha dele (change p4a-fornecedores, decisão 3).
  if (definicao.tipo === 'fornecedor' && typeof entrada === 'string' && entrada !== '') {
    return (
      <p className={estilos.informacao}>
        {definicao.rotulo}:{' '}
        <ReferenciaAoFornecedor id={entrada} nome={nomeDoRegistro(entrada) ?? entrada} />
      </p>
    );
  }
  const vazio =
    entrada === null || entrada === '' || (Array.isArray(entrada) && entrada.length === 0);
  const texto = vazio
    ? ''
    : NUMERICOS.has(definicao.tipo)
      ? String(entrada)
      : mostrarValor(definicao, entrada as ValorDeCampo, nomeDoRegistro);
  const descricao = definicao.restrito ? AVISO_DE_RESTRITO : undefined;
  return definicao.tipo === 'texto-longo' ? (
    <AreaDeTexto rotulo={definicao.rotulo} value={texto} isReadOnly descricao={descricao} />
  ) : (
    <CampoDeTexto rotulo={definicao.rotulo} value={texto} isReadOnly descricao={descricao} />
  );
}

function Entrada({
  definicao,
  entrada,
  aoMudar,
  erro,
  nomeDoRegistro,
  ativoAtual,
  localDoAtivo,
}: Pick<
  PropsDoCampoDoAtivo,
  'definicao' | 'entrada' | 'aoMudar' | 'erro' | 'nomeDoRegistro' | 'ativoAtual' | 'localDoAtivo'
>) {
  const api = useApi();
  const buscarFornecedores = useBuscarFornecedores();
  const comum = {
    rotulo: definicao.rotulo,
    obrigatorio: definicao.obrigatorio,
    erro,
    descricao: definicao.restrito ? AVISO_DE_RESTRITO : undefined,
  };
  const texto = typeof entrada === 'string' ? entrada : '';
  const escolhido = typeof entrada === 'string' && entrada !== '' ? entrada : null;
  const opcoes = definicao.configuracao.opcoes ?? [];

  // As pessoas do local do ativo vêm primeiro, como sugeridas (spec administracao-de-pessoas,
  // "Nomes das pessoas para a escolha").
  const buscarPessoas = useCallback(
    async (busca: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/pessoas/nomes', {
        params: { query: { busca, ...(localDoAtivo && { local: localDoAtivo }) } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar as pessoas.');
      return {
        itens: data.pessoas.map((pessoa) => ({ id: pessoa.id, rotulo: pessoa.nome })),
        total: data.total,
        sugeridas: {
          ids: data.pessoas.filter((pessoa) => pessoa.doMesmoLocal).map((pessoa) => pessoa.id),
          origem: 'Do mesmo local do ativo',
        },
      };
    },
    [api, localDoAtivo],
  );
  // A escolha do ativo só oferece os tipos aceitos do campo, quando ele os tem.
  const tiposAceitos = definicao.configuracao.tipos;
  const buscarAtivos = useCallback(
    async (busca: string, sinal: AbortSignal) => {
      const doTipo: FiltroDaVisao[] =
        tiposAceitos && tiposAceitos.length > 0
          ? [{ chave: 'ativo.tipo', operador: 'qualquer', valores: [...tiposAceitos] }]
          : [];
      const { data, error } = await api.GET('/ativos', {
        params: {
          query: {
            busca,
            limite: 20,
            ...(doTipo.length > 0 && { filtros: JSON.stringify(doTipo) }),
          },
        },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      return data.itens
        .filter((ativo) => ativo.id !== ativoAtual)
        .map((ativo) => ({
          id: ativo.id,
          rotulo: ativo.patrimonio ? `${ativo.rotulo} · ${ativo.patrimonio}` : ativo.rotulo,
        }));
    },
    [api, ativoAtual, tiposAceitos],
  );

  switch (definicao.tipo) {
    case 'texto-longo':
      return <AreaDeTexto {...comum} value={texto} onChange={aoMudar} />;
    case 'inteiro':
    case 'decimal':
    case 'moeda':
      return (
        <CampoDeTexto
          {...comum}
          inputMode={definicao.tipo === 'inteiro' ? 'numeric' : 'decimal'}
          value={texto}
          onChange={aoMudar}
        />
      );
    case 'data':
      return <CampoDeData {...comum} valor={escolhido} aoMudar={aoMudar} />;
    case 'lista': {
      const guardadaInativa = opcoes.find(
        (opcao) => opcao.id === escolhido && opcao.situacao === 'inativa',
      );
      return (
        <Selecao
          {...comum}
          opcoes={[
            ...(definicao.obrigatorio ? [] : [{ id: '', rotulo: 'Nenhum' }]),
            ...opcoes
              .filter((opcao) => opcao.situacao === 'ativa')
              .map((opcao) => ({ id: opcao.id, rotulo: opcao.rotulo })),
            ...(guardadaInativa
              ? [{ id: guardadaInativa.id, rotulo: `${guardadaInativa.rotulo} (inativa)` }]
              : []),
          ]}
          selectedKey={escolhido ?? (definicao.obrigatorio ? null : '')}
          onSelectionChange={(chave) =>
            aoMudar(chave === '' || chave === null ? null : String(chave))
          }
        />
      );
    }
    case 'lista-multipla': {
      const marcadas = Array.isArray(entrada) ? entrada : [];
      return (
        <div className={estilos.campoDoAtivo}>
          <GrupoDeCheckboxes
            rotulo={definicao.rotulo}
            descricao={comum.descricao}
            value={marcadas}
            onChange={(ids) =>
              aoMudar(opcoes.filter((opcao) => ids.includes(opcao.id)).map((opcao) => opcao.id))
            }
          >
            {opcoes
              .filter((opcao) => opcao.situacao === 'ativa' || marcadas.includes(opcao.id))
              .map((opcao) => (
                <Checkbox key={opcao.id} value={opcao.id}>
                  {opcao.situacao === 'ativa' ? opcao.rotulo : `${opcao.rotulo} (inativa)`}
                </Checkbox>
              ))}
          </GrupoDeCheckboxes>
          {erro && (
            <p role="alert" className={estilos.erro}>
              {erro}
            </p>
          )}
        </div>
      );
    }
    // O local e a pessoa que ainda não existem são cadastrados numa aba, e voltam no campo
    // (change cadastro-em-abas).
    case 'local':
      return (
        <CampoComCadastro
          alvo="local"
          campo={definicao.rotulo}
          chave={definicao.chave}
          aoCriar={(local) => aoMudar(local.id)}
        >
          <SeletorDeLocal {...comum} valor={escolhido} aoMudar={aoMudar} />
        </CampoComCadastro>
      );
    case 'pessoa':
    case 'ativo': {
      const escolha = (
        <SeletorDeConta
          {...comum}
          valor={
            escolhido ? { id: escolhido, rotulo: nomeDoRegistro(escolhido) ?? escolhido } : null
          }
          aoMudar={(registro) => aoMudar(registro?.id ?? null, registro?.rotulo)}
          buscar={definicao.tipo === 'pessoa' ? buscarPessoas : buscarAtivos}
        />
      );
      return definicao.tipo === 'pessoa' ? (
        <CampoComCadastro
          alvo="pessoa"
          campo={definicao.rotulo}
          chave={definicao.chave}
          aoCriar={(pessoa) => aoMudar(pessoa.id, pessoa.nome)}
        >
          {escolha}
        </CampoComCadastro>
      ) : (
        escolha
      );
    }
    // O fornecedor, entre os ativos, ou cadastrado numa aba (change p4a-fornecedores, decisão 7).
    case 'fornecedor':
      return (
        <CampoComCadastro
          alvo="fornecedor"
          campo={definicao.rotulo}
          chave={definicao.chave}
          aoCriar={(fornecedor) => aoMudar(fornecedor.id, fornecedor.nome)}
        >
          <SeletorDeConta
            {...comum}
            valor={
              escolhido ? { id: escolhido, rotulo: nomeDoRegistro(escolhido) ?? escolhido } : null
            }
            aoMudar={(registro) => aoMudar(registro?.id ?? null, registro?.rotulo)}
            buscar={buscarFornecedores}
          />
        </CampoComCadastro>
      );
    default:
      return (
        <CampoDeTexto
          {...comum}
          inputMode={definicao.tipo === 'url' ? 'url' : undefined}
          value={texto}
          onChange={aoMudar}
        />
      );
  }
}
