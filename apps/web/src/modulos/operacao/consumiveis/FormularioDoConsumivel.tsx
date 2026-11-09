import {
  type CampoDoConsumivel,
  type CorDeConsumivel,
  type DadosDoConsumivel,
  type ErrosDoConsumivel,
  lerRendimento,
  limparConsumivel,
  type TipoDeConsumivel,
  validarConsumivel,
} from '@grafite/domain';
import {
  Botao,
  CampoDeTexto,
  Formulario,
  LinhaDeCampos,
  MensagemDoPasso,
  Selecao,
} from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useBuscarFornecedores } from '../../administracao/fornecedores/escolha.ts';
import type { RecusaDoFormulario } from '../../administracao/recusa.ts';
import { SeletorDeConta } from '../../administracao/seletores/SeletorDeConta.tsx';
import { CampoComCadastro } from '../../cadastros.tsx';
import estilos from '../Operacao.module.css';
import {
  type FichaDoConsumivel,
  type FornecedorDoConsumivel,
  type ModeloDoConsumivel,
  type PedidoDoConsumivel,
  useModelosParaOsConsumiveis,
} from './consultas.ts';
import { OPCOES_DE_COR, OPCOES_DE_TIPO } from './filtros.ts';

/** O consumível no formulário: os textos como foram digitados e as listas com os nomes. */
export interface DadosNoFormulario {
  codigo: string;
  nome: string;
  tipo: TipoDeConsumivel | null;
  cor: CorDeConsumivel | null;
  /** O rendimento como foi digitado, como "3.000". */
  rendimento: string;
  fornecedores: FornecedorDoConsumivel[];
  modelos: ModeloDoConsumivel[];
}

export const CONSUMIVEL_VAZIO: DadosNoFormulario = {
  codigo: '',
  nome: '',
  tipo: null,
  cor: null,
  rendimento: '',
  fornecedores: [],
  modelos: [],
};

/** O consumível da ficha no formulário, com o rendimento escrito com os milhares. */
export const dadosDoConsumivel = (ficha: FichaDoConsumivel): DadosNoFormulario => ({
  codigo: ficha.codigo,
  nome: ficha.nome ?? '',
  tipo: ficha.tipo,
  cor: ficha.cor,
  rendimento: ficha.rendimento === null ? '' : ficha.rendimento.toLocaleString('pt-BR'),
  fornecedores: ficha.fornecedores,
  modelos: ficha.modelos,
});

/** A ordem dos campos na tela, que decide qual recebe o foco quando mais de um é recusado. */
const ORDEM: readonly CampoDoConsumivel[] = [
  'codigo',
  'nome',
  'tipo',
  'cor',
  'rendimento',
  'fornecedores',
  'modelos',
];

const SEM_COR = 'sem-cor';

/** O modelo como a tela o mostra: o fabricante e o nome. */
export const nomeDoModelo = (modelo: Pick<ModeloDoConsumivel, 'fabricante' | 'nome'>) =>
  `${modelo.fabricante} ${modelo.nome}`;

const comInativo = (texto: string, situacao: 'ativo' | 'inativo') =>
  situacao === 'inativo' ? `${texto} (inativo)` : texto;

export interface PropsDoFormularioDoConsumivel {
  inicial: DadosNoFormulario;
  /**
   * A ficha como está no servidor: os nomes dela valem nos itens das listas, para o fornecedor ou o
   * modelo renomeado aparecer com o nome novo, sem perder o que foi digitado.
   */
  ficha?: FichaDoConsumivel;
  rotuloDoEnvio: string;
  enviar: (
    pedido: PedidoDoConsumivel,
  ) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoConsumivel>>;
  aoCancelar?: () => void;
  /** Se algo foi preenchido, como na aba do cadastro, que então pede confirmação para fechar. */
  aoMudarPreenchido?: (preenchido: boolean) => void;
}

/**
 * O formulário do consumível (spec consumiveis, "Consumível", "Fornecedores do consumível" e
 * "Compatibilidade com os modelos"; spec modulo-operacao, "Cadastro e ficha do consumível"): o
 * código, o nome, o tipo, a cor, o rendimento e as listas dos fornecedores e dos modelos, cada item
 * com "Retirar" e a busca que inclui mais um. As regras são as do domínio, as mesmas da API, com o
 * motivo em cada campo e o foco no primeiro recusado.
 */
export function FormularioDoConsumivel({
  inicial,
  ficha,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoFormularioDoConsumivel) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<ErrosDoConsumivel>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<CampoDoConsumivel, HTMLElement | null>>>({});

  useEffect(() => {
    aoMudarPreenchido?.(
      [dados.codigo, dados.nome, dados.rendimento].some((texto) => texto.trim() !== '') ||
        dados.tipo !== null ||
        dados.cor !== null ||
        dados.fornecedores.length > 0 ||
        dados.modelos.length > 0,
    );
  }, [dados, aoMudarPreenchido]);

  const mudar = <C extends keyof DadosNoFormulario>(campo: C, valor: DadosNoFormulario[C]) => {
    definirDados((atuais) => ({ ...atuais, [campo]: valor }));
    definirErros(({ [campo]: _, ...outros }) => outros);
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado. */
  const recusar = (motivos: ErrosDoConsumivel) => {
    definirErros(motivos);
    const primeiro = ORDEM.find((campo) => motivos[campo]);
    if (primeiro) entradas.current[primeiro]?.focus();
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const doDominio: DadosDoConsumivel = {
      codigo: dados.codigo,
      nome: dados.nome,
      tipo: dados.tipo,
      cor: dados.cor,
      rendimento: lerRendimento(dados.rendimento),
      fornecedores: dados.fornecedores.map(({ id }) => id),
      modelos: dados.modelos.map(({ id }) => id),
    };
    const conferidos = validarConsumivel(doDominio);
    if (Object.keys(conferidos).length > 0) return recusar(conferidos);
    const limpos = limparConsumivel(doDominio);
    definirEnviando(true);
    try {
      const resultado = await enviar({
        codigo: limpos.codigo,
        nome: limpos.nome,
        // O domínio já recusou o tipo vazio.
        tipo: limpos.tipo as TipoDeConsumivel,
        cor: limpos.cor,
        rendimento: limpos.rendimento,
        fornecedores: [...limpos.fornecedores],
        modelos: [...limpos.modelos],
      });
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        return recusar(resultado.campos);
      }
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
    } finally {
      definirEnviando(false);
    }
  }

  const guardarEntrada = (campo: CampoDoConsumivel) => (elemento: HTMLElement | null) => {
    entradas.current[campo] = elemento;
  };

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      <LinhaDeCampos>
        <CampoDeTexto
          ref={guardarEntrada('codigo')}
          rotulo="Código"
          obrigatorio
          autoComplete="off"
          descricao="O código do fabricante, como CF258A."
          value={dados.codigo}
          onChange={(codigo) => mudar('codigo', codigo)}
          erro={erros.codigo}
        />
        <CampoDeTexto
          ref={guardarEntrada('nome')}
          rotulo="Nome"
          autoComplete="off"
          descricao="Como a equipe o chama, como HP 58A."
          value={dados.nome}
          onChange={(nome) => mudar('nome', nome)}
          erro={erros.nome}
        />
      </LinhaDeCampos>
      <LinhaDeCampos>
        <Selecao
          rotulo="Tipo"
          obrigatorio
          opcoes={OPCOES_DE_TIPO}
          selectedKey={dados.tipo}
          onSelectionChange={(chave) => mudar('tipo', String(chave) as TipoDeConsumivel)}
          erro={erros.tipo}
        />
        <Selecao
          rotulo="Cor"
          opcoes={[{ id: SEM_COR, rotulo: 'Sem cor' }, ...OPCOES_DE_COR]}
          selectedKey={dados.cor ?? SEM_COR}
          onSelectionChange={(chave) =>
            mudar('cor', chave === SEM_COR ? null : (String(chave) as CorDeConsumivel))
          }
          erro={erros.cor}
        />
        <CampoDeTexto
          ref={guardarEntrada('rendimento')}
          rotulo="Rendimento"
          inputMode="numeric"
          autoComplete="off"
          descricao="Em páginas, como 3.000."
          value={dados.rendimento}
          onChange={(rendimento) => mudar('rendimento', rendimento)}
          erro={erros.rendimento}
        />
      </LinhaDeCampos>
      <FornecedoresDoConsumivel
        fornecedores={dados.fornecedores}
        atuais={ficha?.fornecedores}
        aoMudar={(fornecedores) => mudar('fornecedores', fornecedores)}
        erro={erros.fornecedores}
      />
      <ModelosDoConsumivel
        modelos={dados.modelos}
        atuais={ficha?.modelos}
        aoMudar={(modelos) => mudar('modelos', modelos)}
        erro={erros.modelos}
      />
      <MensagemDoPasso texto={falha} chave={tentativa} />
      <div className={estilos.acoes}>
        <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Enviando">
          {rotuloDoEnvio}
        </Botao>
        {aoCancelar && (
          <Botao nivel="terciario" onPress={aoCancelar}>
            Cancelar
          </Botao>
        )}
      </div>
    </Formulario>
  );
}

/** Um item de uma lista do consumível: o nome, que leva à ficha quando há para onde, e "Retirar". */
function ItemDaLista({
  rotulo,
  detalhe,
  link,
  aoRetirar,
}: {
  rotulo: string;
  detalhe?: string;
  link?: ReactNode;
  aoRetirar: () => void;
}) {
  return (
    <li className={estilos.item}>
      <span className={estilos.nomeDoItem}>
        {link ?? rotulo}
        {detalhe && <span className={estilos.semValor}>{detalhe}</span>}
      </span>
      <Botao nivel="terciario" aria-label={`Retirar ${rotulo}`} onPress={aoRetirar}>
        Retirar
      </Botao>
    </li>
  );
}

/**
 * Os fornecedores do consumível, cada um com "Retirar", e a busca que inclui um ativo, com
 * "Cadastrar novo fornecedor" embaixo para quem edita os fornecedores.
 */
function FornecedoresDoConsumivel({
  fornecedores,
  atuais,
  aoMudar,
  erro,
}: {
  fornecedores: FornecedorDoConsumivel[];
  atuais?: FornecedorDoConsumivel[];
  aoMudar: (fornecedores: FornecedorDoConsumivel[]) => void;
  erro?: string;
}) {
  const { pode } = useAcesso();
  const buscarTodos = useBuscarFornecedores();
  const incluidos = new Set(fornecedores.map(({ id }) => id));
  // Os ids incluídos num texto: a busca só muda quando a lista muda, e não a cada renderização.
  const ids = [...incluidos].join();
  const buscar = useCallback(
    async (texto: string) => {
      const jaIncluidos = new Set(ids.split(','));
      return (await buscarTodos(texto)).filter((fornecedor) => !jaIncluidos.has(fornecedor.id));
    },
    [buscarTodos, ids],
  );
  const incluir = (fornecedor: FornecedorDoConsumivel) => {
    if (!incluidos.has(fornecedor.id)) aoMudar([...fornecedores, fornecedor]);
  };
  const doServidor = new Map((atuais ?? []).map((fornecedor) => [fornecedor.id, fornecedor]));
  return (
    <fieldset className={estilos.lista}>
      <legend className={estilos.legenda}>Fornecedores</legend>
      {fornecedores.length > 0 ? (
        <ul aria-label="Fornecedores do consumível" className={estilos.itens}>
          {fornecedores.map((incluido) => {
            const fornecedor = doServidor.get(incluido.id) ?? incluido;
            const rotulo = comInativo(fornecedor.nome, fornecedor.situacao);
            return (
              <ItemDaLista
                key={fornecedor.id}
                rotulo={rotulo}
                link={
                  pode('fornecedores.ver') ? (
                    <Link
                      to="/administracao/fornecedores/$id"
                      params={{ id: fornecedor.id }}
                      className={estilos.link}
                    >
                      {rotulo}
                    </Link>
                  ) : undefined
                }
                aoRetirar={() => aoMudar(fornecedores.filter(({ id }) => id !== fornecedor.id))}
              />
            );
          })}
        </ul>
      ) : (
        <p className={estilos.semValor}>Nenhum fornecedor.</p>
      )}
      <CampoComCadastro
        alvo="fornecedor"
        campo="Fornecedores"
        chave="consumivel.fornecedores"
        aoCriar={(criado) => incluir({ id: criado.id, nome: criado.nome, situacao: 'ativo' })}
      >
        <SeletorDeConta
          // Um fornecedor incluído limpa a busca para o próximo.
          key={fornecedores.map(({ id }) => id).join()}
          rotulo="Incluir um fornecedor"
          valor={null}
          buscar={buscar}
          aoMudar={(escolhido) => {
            if (escolhido) incluir({ id: escolhido.id, nome: escolhido.rotulo, situacao: 'ativo' });
          }}
          erro={erro}
        />
      </CampoComCadastro>
    </fieldset>
  );
}

/**
 * Os modelos compatíveis, cada um pelo fabricante e pelo nome, com o tipo e "Retirar", e a busca
 * que inclui um dos modelos ativos dos tipos que ligam a capacidade.
 */
function ModelosDoConsumivel({
  modelos,
  atuais,
  aoMudar,
  erro,
}: {
  modelos: ModeloDoConsumivel[];
  atuais?: ModeloDoConsumivel[];
  aoMudar: (modelos: ModeloDoConsumivel[]) => void;
  erro?: string;
}) {
  const paraEscolher = useModelosParaOsConsumiveis();
  const incluidos = new Set(modelos.map(({ id }) => id));
  const disponiveis = paraEscolher.data?.modelos;
  const ids = [...incluidos].join();
  const buscar = useCallback(
    async (texto: string) => {
      const busca = texto.trim().toLowerCase();
      const jaIncluidos = new Set(ids.split(','));
      return (disponiveis ?? [])
        .filter(
          (modelo) =>
            !jaIncluidos.has(modelo.id) &&
            (busca === '' || nomeDoModelo(modelo).toLowerCase().includes(busca)),
        )
        .map((modelo) => ({
          id: modelo.id,
          rotulo: `${nomeDoModelo(modelo)} · ${modelo.tipo.nome}`,
        }));
    },
    [disponiveis, ids],
  );
  const doServidor = new Map((atuais ?? []).map((modelo) => [modelo.id, modelo]));
  return (
    <fieldset className={estilos.lista}>
      <legend className={estilos.legenda}>Modelos compatíveis</legend>
      {modelos.length > 0 ? (
        <ul aria-label="Modelos compatíveis" className={estilos.itens}>
          {modelos.map((incluido) => {
            const modelo = doServidor.get(incluido.id) ?? incluido;
            const rotulo = comInativo(nomeDoModelo(modelo), modelo.situacao);
            return (
              <ItemDaLista
                key={modelo.id}
                rotulo={rotulo}
                detalhe={modelo.tipo.nome}
                link={
                  <Link
                    to="/gestao/catalogo/modelos/$id"
                    params={{ id: modelo.id }}
                    className={estilos.link}
                  >
                    {rotulo}
                  </Link>
                }
                aoRetirar={() => aoMudar(modelos.filter(({ id }) => id !== modelo.id))}
              />
            );
          })}
        </ul>
      ) : (
        <p className={estilos.semValor}>Nenhum modelo.</p>
      )}
      <SeletorDeConta
        key={modelos.map(({ id }) => id).join()}
        rotulo="Incluir um modelo"
        descricao="Os modelos ativos dos tipos com os consumíveis compatíveis."
        valor={null}
        buscar={buscar}
        aoMudar={(escolhido) => {
          const modelo = disponiveis?.find(({ id }) => id === escolhido?.id);
          if (modelo && !incluidos.has(modelo.id)) {
            aoMudar([...modelos, { ...modelo, situacao: 'ativo' }]);
          }
        }}
        erro={erro}
      />
    </fieldset>
  );
}
