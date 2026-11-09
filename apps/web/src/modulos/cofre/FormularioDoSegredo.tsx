import { type ClassificacaoDeSegredo, conferirSegredo, type TipoDeSegredo } from '@grafite/domain';
import {
  AreaDeTexto,
  Botao,
  BuscaComSugestoes,
  CampoDeData,
  CampoDeSenha,
  CampoDeTexto,
  Formulario,
  LinhaDeCampos,
  MensagemDoPasso,
  Selecao,
} from '@grafite/ui';
import { type FormEvent, useCallback, useRef, useState } from 'react';
import { useApi } from '../../api/useApi.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import type { RecusaDoFormulario } from '../administracao/recusa.ts';
import { SeletorDeConta } from '../administracao/seletores/SeletorDeConta.tsx';
import estilos from './Cofre.module.css';
import { usePessoasDoCofre } from './consultas.ts';
import { OPCOES_DE_CLASSIFICACAO, OPCOES_DE_TIPO } from './filtros.ts';

/** Um registro ligado ao segredo, pelo id e pelo nome que a tela mostra. */
export interface Ligado {
  id: string;
  rotulo: string;
}

/** O segredo no formulário: os textos como foram digitados e os vínculos com o nome. */
export interface DadosDoSegredo {
  nome: string;
  tipo: TipoDeSegredo | null;
  classificacao: ClassificacaoDeSegredo | null;
  identificador: string;
  endereco: string;
  notas: string;
  validade: string | null;
  proximaRotacao: string | null;
  pessoa: Ligado | null;
  ativos: Ligado[];
  valor: string;
}

export const SEGREDO_VAZIO: DadosDoSegredo = {
  nome: '',
  tipo: null,
  classificacao: null,
  identificador: '',
  endereco: '',
  notas: '',
  validade: null,
  proximaRotacao: null,
  pessoa: null,
  ativos: [],
  valor: '',
};

/** O que vai para a API: os textos sem as pontas e vazios como nulo, e o valor só no cadastro. */
export interface PedidoDoSegredo {
  nome: string;
  tipo: TipoDeSegredo;
  classificacao: ClassificacaoDeSegredo;
  identificador: string | null;
  endereco: string | null;
  notas: string | null;
  validade: string | null;
  proximaRotacao: string | null;
  pessoaId: string | null;
  ativoIds: string[];
  valor?: string;
}

type CampoDoSegredo =
  | 'nome'
  | 'tipo'
  | 'classificacao'
  | 'identificador'
  | 'endereco'
  | 'notas'
  | 'validade'
  | 'proximaRotacao'
  | 'pessoaId'
  | 'ativoIds'
  | 'valor';

const ORDEM_DOS_CAMPOS: readonly CampoDoSegredo[] = [
  'nome',
  'tipo',
  'classificacao',
  'identificador',
  'endereco',
  'validade',
  'proximaRotacao',
  'pessoaId',
  'ativoIds',
  'notas',
  'valor',
];

export interface PropsDoFormularioDoSegredo {
  inicial: DadosDoSegredo;
  /** O cadastro pede o valor; a edição nunca o mostra: o valor troca por "Trocar o valor". */
  comValor: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoSegredo) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoSegredo>>;
  aoCancelar?: () => void;
}

/**
 * O formulário do segredo (spec cofre-de-segredos, "Segredo" e "Vínculos com a pessoa e os ativos";
 * spec modulo-cofre, "Cadastro e ficha do segredo"): os dados, a pessoa e os ativos ligados e, no
 * cadastro, o valor, escondido enquanto é digitado, com a opção de mostrar. As regras são as do
 * domínio, as mesmas da API.
 */
export function FormularioDoSegredo({
  inicial,
  comValor,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
}: PropsDoFormularioDoSegredo) {
  const { pode } = useAcesso();
  const api = useApi();
  const pessoas = usePessoasDoCofre();
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDoSegredo, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<CampoDoSegredo, HTMLElement | null>>>({});

  const mudar = <C extends keyof DadosDoSegredo>(campo: C, valor: DadosDoSegredo[C]) => {
    definirDados((atuais) => ({ ...atuais, [campo]: valor }));
    const doErro: CampoDoSegredo =
      campo === 'pessoa' ? 'pessoaId' : campo === 'ativos' ? 'ativoIds' : campo;
    definirErros(({ [doErro]: _, ...outros }) => outros);
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado. */
  const recusar = (motivos: Partial<Record<CampoDoSegredo, string>>) => {
    definirErros(motivos);
    const primeiro = ORDEM_DOS_CAMPOS.find((campo) => motivos[campo]);
    if (primeiro) entradas.current[primeiro]?.focus();
  };

  // A pessoa ligada fica entre as opções, mesmo inativada, para o campo mostrar o nome dela.
  const opcoesDePessoa = [
    ...(dados.pessoa && !pessoas.data?.pessoas.some((pessoa) => pessoa.id === dados.pessoa?.id)
      ? [dados.pessoa]
      : []),
    ...(pessoas.data?.pessoas.map((pessoa) => ({ id: pessoa.id, rotulo: pessoa.nome })) ?? []),
  ];

  const buscarAtivos = useCallback(
    async (texto: string, sinal: AbortSignal): Promise<Ligado[]> => {
      const { data, error } = await api.GET('/ativos', {
        params: { query: { busca: texto, situacao: 'ativos', limite: 8 } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      return data.itens.map((ativo) => ({
        id: ativo.id,
        rotulo: [ativo.patrimonio, ativo.rotulo].filter(Boolean).join(' · '),
      }));
    },
    [api],
  );

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const conferido = conferirSegredo(
      {
        nome: dados.nome,
        tipo: dados.tipo,
        classificacao: dados.classificacao,
        identificador: dados.identificador,
        endereco: dados.endereco,
        notas: dados.notas,
        validade: dados.validade,
        proximaRotacao: dados.proximaRotacao,
        ...(comValor ? { valor: dados.valor === '' ? null : dados.valor } : {}),
      },
      { valorObrigatorio: comValor },
    );
    if (!conferido.ok) return recusar(conferido.erros);
    const { valor, ...resto } = conferido.dados;
    const pedido: PedidoDoSegredo = {
      ...resto,
      pessoaId: dados.pessoa?.id ?? null,
      ativoIds: dados.ativos.map((ativo) => ativo.id),
      ...(comValor && valor !== null ? { valor } : {}),
    };
    definirEnviando(true);
    try {
      const resultado = await enviar(pedido);
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

  const guardarEntrada = (campo: CampoDoSegredo) => (elemento: HTMLElement | null) => {
    entradas.current[campo] = elemento;
  };

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      <CampoDeTexto
        ref={guardarEntrada('nome')}
        rotulo="Nome"
        obrigatorio
        autoComplete="off"
        value={dados.nome}
        onChange={(nome) => mudar('nome', nome)}
        erro={erros.nome}
      />
      <LinhaDeCampos>
        <Selecao
          rotulo="Tipo"
          obrigatorio
          opcoes={OPCOES_DE_TIPO}
          selectedKey={dados.tipo}
          onSelectionChange={(chave) => mudar('tipo', String(chave) as TipoDeSegredo)}
          erro={erros.tipo}
        />
        <Selecao
          rotulo="Classificação"
          obrigatorio
          opcoes={OPCOES_DE_CLASSIFICACAO}
          selectedKey={dados.classificacao}
          onSelectionChange={(chave) =>
            mudar('classificacao', String(chave) as ClassificacaoDeSegredo)
          }
          erro={erros.classificacao}
        />
      </LinhaDeCampos>
      <CampoDeTexto
        ref={guardarEntrada('identificador')}
        rotulo="Identificador"
        descricao="Como o usuário da conta."
        autoComplete="off"
        value={dados.identificador}
        onChange={(identificador) => mudar('identificador', identificador)}
        erro={erros.identificador}
      />
      <CampoDeTexto
        ref={guardarEntrada('endereco')}
        rotulo="Endereço"
        descricao="Onde o segredo é usado, como a URL de um painel."
        autoComplete="off"
        value={dados.endereco}
        onChange={(endereco) => mudar('endereco', endereco)}
        erro={erros.endereco}
      />
      <LinhaDeCampos>
        <CampoDeData
          rotulo="Validade"
          valor={dados.validade}
          aoMudar={(validade) => mudar('validade', validade)}
          erro={erros.validade}
        />
        <CampoDeData
          rotulo="Próxima rotação"
          valor={dados.proximaRotacao}
          aoMudar={(proximaRotacao) => mudar('proximaRotacao', proximaRotacao)}
          erro={erros.proximaRotacao}
        />
      </LinhaDeCampos>
      <BuscaComSugestoes
        rotulo="Pessoa"
        isDisabled={!pessoas.data}
        descricao="A dona da conta, se houver. O vínculo não dá acesso ao segredo."
        sugestoes={opcoesDePessoa}
        aceitaTextoLivre={false}
        selectedKey={dados.pessoa?.id ?? null}
        onSelectionChange={(chave) =>
          mudar(
            'pessoa',
            chave === null ? null : (opcoesDePessoa.find((pessoa) => pessoa.id === chave) ?? null),
          )
        }
        erro={erros.pessoaId}
      />
      <AtivosDoSegredo
        ativos={dados.ativos}
        podeIncluir={pode('ativos.ver')}
        buscar={buscarAtivos}
        aoMudar={(ativos) => mudar('ativos', ativos)}
        erro={erros.ativoIds}
      />
      <AreaDeTexto
        ref={guardarEntrada('notas')}
        rotulo="Notas"
        value={dados.notas}
        onChange={(notas) => mudar('notas', notas)}
        erro={erros.notas}
      />
      {comValor && (
        <CampoDeSenha
          ref={guardarEntrada('valor')}
          rotulo="Valor"
          obrigatorio
          autoComplete="new-password"
          descricao="O valor vai cifrado e só aparece ao ser revelado."
          value={dados.valor}
          onChange={(valor) => mudar('valor', valor)}
          erro={erros.valor}
        />
      )}
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

/** Os ativos ligados, cada um com "Retirar", e a busca que inclui mais um, para quem vê ativos. */
function AtivosDoSegredo({
  ativos,
  podeIncluir,
  buscar,
  aoMudar,
  erro,
}: {
  ativos: Ligado[];
  podeIncluir: boolean;
  buscar: (texto: string, sinal: AbortSignal) => Promise<Ligado[]>;
  aoMudar: (ativos: Ligado[]) => void;
  erro?: string;
}) {
  return (
    <div className={estilos.tela}>
      {ativos.length > 0 && (
        <ul className={estilos.lista} aria-label="Ativos ligados">
          {ativos.map((ativo) => (
            <li key={ativo.id} className={estilos.acoes}>
              <span>{ativo.rotulo}</span>
              <Botao
                nivel="terciario"
                aria-label={`Retirar ${ativo.rotulo}`}
                onPress={() => aoMudar(ativos.filter((outro) => outro.id !== ativo.id))}
              >
                Retirar
              </Botao>
            </li>
          ))}
        </ul>
      )}
      {podeIncluir ? (
        <SeletorDeConta
          // Um ativo incluído limpa a busca para o próximo.
          key={ativos.map((ativo) => ativo.id).join()}
          rotulo="Incluir um ativo"
          descricao="Os ativos em que o segredo é usado, como o switch de uma senha de administração."
          valor={null}
          buscar={buscar}
          aoMudar={(ativo) => {
            if (ativo && !ativos.some((outro) => outro.id === ativo.id)) {
              aoMudar([...ativos, ativo]);
            }
          }}
          erro={erro}
        />
      ) : (
        erro && <MensagemDoPasso texto={erro} chave={0} />
      )}
    </div>
  );
}
