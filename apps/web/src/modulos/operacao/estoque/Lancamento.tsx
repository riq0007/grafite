import {
  type CampoDoLancamento,
  type DadosDoLancamento,
  DIRECOES_DO_AJUSTE,
  type DirecaoDoAjuste,
  type ErrosDoLancamento,
  lerQuantidade,
  limparLancamento,
  MOTIVOS_DO_AJUSTE,
  type MotivoDoAjuste,
  ROTULOS_DAS_DIRECOES_DO_AJUSTE,
  ROTULOS_DOS_MOTIVOS_DO_AJUSTE,
  type TipoDeMovimento,
  validarLancamento,
} from '@grafite/domain';
import {
  AreaDeTexto,
  avisar,
  Botao,
  CampoDeTexto,
  Formulario,
  Gaveta,
  LinhaDeCampos,
  LinkDeCadastro,
  MensagemDoPasso,
  Selecao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useBuscarFornecedores } from '../../administracao/fornecedores/escolha.ts';
import { recusaDe } from '../../administracao/recusa.ts';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import {
  SeletorDeLocal,
  useCaminhoDoLocal,
} from '../../administracao/seletores/SeletorDeLocal.tsx';
import { type CadastroDoCampo, useCadastro } from '../../cadastros.tsx';
import estilosDaOperacao from '../Operacao.module.css';
import { quantidadeEscrita } from './apresentacao.ts';
import { CHAVE_DO_ESTOQUE } from './consultas.ts';
import estilos from './Estoque.module.css';
import {
  useAtivoDoEndereco,
  useBuscarAtivosParaSaida,
  useBuscarConsumiveis,
  useConsumivelDoEndereco,
  useLocaisForaDoAlcance,
  useSaldoNaOrigem,
} from './escolhas.ts';

/** O que o formulário guarda: as escolhas com o rótulo delas e os textos como foram digitados. */
export interface DadosNoFormulario {
  consumivel: ContaDoSeletor | null;
  quantidade: string;
  origem: string | null;
  destino: string | null;
  local: string | null;
  fornecedor: ContaDoSeletor | null;
  notaFiscal: string;
  ativo: ContaDoSeletor | null;
  direcao: DirecaoDoAjuste | null;
  motivo: MotivoDoAjuste | null;
  observacao: string;
}

/** O lançamento que a gaveta abre: o tipo e o que já vem escolhido, pela linha ou pelo endereço. */
export interface LancamentoAberto {
  tipo: TipoDeMovimento;
  /** O consumível da linha, com o código, ou só o id, quando vem do endereço. */
  consumivel?: ContaDoSeletor | { id: string; rotulo?: undefined };
  /** O local da linha: a origem, o destino ou o local do ajuste, conforme o tipo. */
  local?: string;
  /** O ativo da saída, pelo id, quando vem do endereço. */
  ativo?: string;
}

const VAZIO: DadosNoFormulario = {
  consumivel: null,
  quantidade: '',
  origem: null,
  destino: null,
  local: null,
  fornecedor: null,
  notaFiscal: '',
  ativo: null,
  direcao: null,
  motivo: null,
  observacao: '',
};

export const TITULOS: Record<TipoDeMovimento, string> = {
  entrada: 'Nova entrada',
  saida: 'Nova saída',
  transferencia: 'Nova transferência',
  ajuste: 'Novo ajuste',
};

const RETORNOS: Record<TipoDeMovimento, string> = {
  entrada: 'Entrada lançada.',
  saida: 'Saída lançada.',
  transferencia: 'Transferência lançada.',
  ajuste: 'Ajuste lançado.',
};

/** A ordem dos campos na tela, que decide qual recebe o foco quando mais de um é recusado. */
const ORDEM: readonly CampoDoLancamento[] = [
  'consumivel',
  'quantidade',
  'origem',
  'destino',
  'local',
  'fornecedor',
  'notaFiscal',
  'ativo',
  'direcao',
  'motivo',
  'observacao',
];

/** Os dados iniciais: o local da linha vai ao campo do tipo, onde o saldo sai ou entra. */
function inicialDe({ tipo, consumivel, local }: LancamentoAberto): DadosNoFormulario {
  const dados: DadosNoFormulario = {
    ...VAZIO,
    consumivel: consumivel ? { id: consumivel.id, rotulo: consumivel.rotulo ?? '' } : null,
  };
  if (!local) return dados;
  if (tipo === 'entrada') return { ...dados, destino: local };
  if (tipo === 'ajuste') return { ...dados, local };
  return { ...dados, origem: local };
}

/** O lançamento como o domínio o confere. */
function doDominio(tipo: TipoDeMovimento, dados: DadosNoFormulario): DadosDoLancamento {
  const comum = {
    consumivel: dados.consumivel?.id ?? null,
    quantidade: lerQuantidade(dados.quantidade),
    observacao: dados.observacao,
  };
  switch (tipo) {
    case 'entrada':
      return {
        ...comum,
        tipo,
        destino: dados.destino,
        fornecedor: dados.fornecedor?.id ?? null,
        notaFiscal: dados.notaFiscal,
      };
    case 'saida':
      return { ...comum, tipo, origem: dados.origem, ativo: dados.ativo?.id ?? null };
    case 'transferencia':
      return { ...comum, tipo, origem: dados.origem, destino: dados.destino };
    case 'ajuste':
      return {
        ...comum,
        tipo,
        local: dados.local,
        direcao: dados.direcao,
        motivo: dados.motivo,
      };
  }
}

/**
 * A gaveta de um lançamento (spec modulo-operacao, "Lançamento das movimentações"). O que foi
 * preenchido fica aqui, fora da gaveta: o cadastro pedido por um campo abre numa aba da janela, e
 * a gaveta, que cobriria a aba, sai da frente até o cadastro voltar com o registro criado.
 */
export function GavetaDoLancamento({
  lancamento,
  aoFechar,
}: {
  lancamento: LancamentoAberto;
  aoFechar: () => void;
}) {
  const { tipo } = lancamento;
  const [dados, definirDados] = useState(() => inicialDe(lancamento));
  const [pedindo, definirPedindo] = useState(false);
  const cadastroDoConsumivel = useCadastro('consumivel');
  const cadastroDoFornecedor = useCadastro('fornecedor');

  // O consumível e o ativo que o endereço traz chegam só pelo id: o rótulo vem da API.
  const doEndereco = useConsumivelDoEndereco(
    lancamento.consumivel && lancamento.consumivel.rotulo === undefined
      ? lancamento.consumivel.id
      : undefined,
  );
  const ativoDoEndereco = useAtivoDoEndereco(lancamento.ativo);
  const consumivel =
    dados.consumivel && dados.consumivel.rotulo === '' && doEndereco.data
      ? doEndereco.data
      : dados.consumivel;
  const ativo = dados.ativo ?? ativoDoEndereco.data ?? null;

  const mudar = (mudanca: Partial<DadosNoFormulario>) =>
    definirDados((atuais) => ({ ...atuais, ...mudanca }));

  const pedirCadastro = (
    cadastro: CadastroDoCampo | undefined,
    campo: 'consumivel' | 'fornecedor',
  ) =>
    cadastro
      ? {
          link: cadastro.link,
          pedir: async () => {
            definirPedindo(true);
            const criado = await cadastro.pedir(`lancamento-${campo}`, { aoVoltar: () => true });
            definirPedindo(false);
            if (criado) mudar({ [campo]: { id: criado.id, rotulo: criado.nome } });
          },
        }
      : undefined;

  return (
    <Gaveta
      aberta={!pedindo}
      aoMudarAberta={(aberta) => {
        if (!aberta && !pedindo) aoFechar();
      }}
      titulo={TITULOS[tipo]}
    >
      <FormularioDoLancamento
        tipo={tipo}
        dados={{ ...dados, consumivel, ativo }}
        mudar={mudar}
        cadastros={{
          consumivel: pedirCadastro(cadastroDoConsumivel, 'consumivel'),
          fornecedor: pedirCadastro(cadastroDoFornecedor, 'fornecedor'),
        }}
        aoLancar={aoFechar}
        aoCancelar={aoFechar}
      />
    </Gaveta>
  );
}

interface CadastroNoCampo {
  link: string;
  pedir: () => void;
}

/** O campo com o link do cadastro embaixo, para quem pode criar o registro. */
function ComCadastro({
  cadastro,
  campo,
  children,
}: {
  cadastro: CadastroNoCampo | undefined;
  campo: string;
  children: ReactNode;
}) {
  return (
    <div className={estilosDaOperacao.lista}>
      {children}
      {cadastro && (
        <LinkDeCadastro texto={cadastro.link} campo={campo} aoPressionar={cadastro.pedir} />
      )}
    </div>
  );
}

/**
 * O formulário de um lançamento (spec estoque, "Movimentação do estoque"): os campos do tipo, com as
 * regras do domínio, as mesmas da API, o motivo em cada campo e o foco no primeiro recusado. A
 * recusa da API, como o saldo que não basta, fica no campo dela, e o que foi preenchido fica.
 */
function FormularioDoLancamento({
  tipo,
  dados,
  mudar,
  cadastros,
  aoLancar,
  aoCancelar,
}: {
  tipo: TipoDeMovimento;
  dados: DadosNoFormulario;
  mudar: (mudanca: Partial<DadosNoFormulario>) => void;
  cadastros: { consumivel?: CadastroNoCampo; fornecedor?: CadastroNoCampo };
  aoLancar: () => void;
  aoCancelar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [erros, definirErros] = useState<ErrosDoLancamento>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<CampoDoLancamento, HTMLElement | null>>>({});
  const buscarConsumiveis = useBuscarConsumiveis();
  const buscarFornecedores = useBuscarFornecedores();
  const buscarAtivos = useBuscarAtivosParaSaida(dados.consumivel?.id ?? null);
  const foraDoAlcance = useLocaisForaDoAlcance();
  const origem = tipo === 'ajuste' && dados.direcao === 'retirar' ? dados.local : dados.origem;
  const saldo = useSaldoNaOrigem(dados.consumivel?.id ?? null, tipo === 'entrada' ? null : origem);

  const mudarCampo = (campo: CampoDoLancamento, mudanca: Partial<DadosNoFormulario>) => {
    mudar(mudanca);
    definirErros(({ [campo]: _, ...outros }) => outros);
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado, no controle dele. */
  const recusar = (motivos: ErrosDoLancamento) => {
    definirErros(motivos);
    const primeiro = ORDEM.find((campo) => motivos[campo]);
    const elemento = primeiro ? entradas.current[primeiro] : null;
    const controle = elemento?.matches('input, textarea, button')
      ? elemento
      : elemento?.querySelector<HTMLElement>('input, textarea, button');
    controle?.focus();
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const conferidos = validarLancamento(doDominio(tipo, dados));
    if (Object.keys(conferidos).length > 0) return recusar(conferidos);
    const { tipo: _tipo, ...corpo } = limparLancamento(doDominio(tipo, dados));
    definirEnviando(true);
    try {
      const resultado = await pedir(() => {
        switch (tipo) {
          case 'entrada':
            return api.POST('/estoque/entradas', { body: corpo as never });
          case 'saida':
            return api.POST('/estoque/saidas', { body: corpo as never });
          case 'transferencia':
            return api.POST('/estoque/transferencias', { body: corpo as never });
          case 'ajuste':
            return api.POST('/estoque/ajustes', { body: corpo as never });
        }
      }, 'lançar a movimentação');
      if ('erro' in resultado) {
        const recusa = recusaDe<CampoDoLancamento>(resultado);
        if (recusa.campos && Object.keys(recusa.campos).length > 0) return recusar(recusa.campos);
        definirFalha(recusa.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DO_ESTOQUE });
      avisar({ situacao: 'sucesso', titulo: RETORNOS[tipo] });
      aoLancar();
    } finally {
      definirEnviando(false);
    }
  }

  const guardar = (campo: CampoDoLancamento) => (elemento: HTMLElement | null) => {
    entradas.current[campo] = elemento;
  };
  const local = (campo: 'origem' | 'destino' | 'local', rotulo: string, valor: string | null) => (
    <div ref={guardar(campo)} className={estilos.campo}>
      <SeletorDeLocal
        rotulo={rotulo}
        obrigatorio
        valor={valor}
        aoMudar={(id) => mudarCampo(campo, { [campo]: id })}
        excluir={foraDoAlcance}
        erro={erros[campo]}
      />
    </div>
  );

  const caminhoDoLocal = useCaminhoDoLocal();
  const caminhoDaOrigem = origem ? caminhoDoLocal(origem) : undefined;
  const saldoNaOrigem =
    caminhoDaOrigem && saldo.data !== undefined
      ? `Saldo em ${caminhoDaOrigem}: ${quantidadeEscrita(saldo.data)}`
      : undefined;

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      <ComCadastro cadastro={cadastros.consumivel} campo="Consumível">
        <div ref={guardar('consumivel')} className={estilos.campo}>
          <SeletorDeConta
            rotulo="Consumível"
            obrigatorio
            valor={dados.consumivel}
            aoMudar={(escolhido) => mudarCampo('consumivel', { consumivel: escolhido })}
            buscar={buscarConsumiveis}
            erro={erros.consumivel}
          />
        </div>
      </ComCadastro>
      <CampoDeTexto
        ref={guardar('quantidade')}
        rotulo="Quantidade"
        obrigatorio
        inputMode="numeric"
        autoComplete="off"
        value={dados.quantidade}
        onChange={(quantidade) => mudarCampo('quantidade', { quantidade })}
        descricao={saldoNaOrigem}
        erro={erros.quantidade}
      />
      {tipo === 'entrada' && (
        <>
          {local('destino', 'Destino', dados.destino)}
          <ComCadastro cadastro={cadastros.fornecedor} campo="Fornecedor">
            <div ref={guardar('fornecedor')} className={estilos.campo}>
              <SeletorDeConta
                rotulo="Fornecedor"
                obrigatorio
                valor={dados.fornecedor}
                aoMudar={(escolhido) => mudarCampo('fornecedor', { fornecedor: escolhido })}
                buscar={buscarFornecedores}
                erro={erros.fornecedor}
              />
            </div>
          </ComCadastro>
          <CampoDeTexto
            ref={guardar('notaFiscal')}
            rotulo="Nota fiscal"
            obrigatorio
            autoComplete="off"
            value={dados.notaFiscal}
            onChange={(notaFiscal) => mudarCampo('notaFiscal', { notaFiscal })}
            erro={erros.notaFiscal}
          />
        </>
      )}
      {tipo === 'saida' && (
        <>
          {local('origem', 'Origem', dados.origem)}
          <div ref={guardar('ativo')} className={estilos.campo}>
            <SeletorDeConta
              rotulo="Ativo"
              obrigatorio
              valor={dados.ativo}
              aoMudar={(escolhido) => mudarCampo('ativo', { ativo: escolhido })}
              buscar={buscarAtivos}
              descricao="O ativo que recebeu o consumível, como a impressora."
              erro={erros.ativo}
            />
          </div>
        </>
      )}
      {tipo === 'transferencia' && (
        <>
          {local('origem', 'Origem', dados.origem)}
          {local('destino', 'Destino', dados.destino)}
        </>
      )}
      {tipo === 'ajuste' && (
        <>
          {local('local', 'Local', dados.local)}
          <div ref={guardar('direcao')} className={estilos.campo}>
            <Selecao
              rotulo="Direção"
              obrigatorio
              opcoes={DIRECOES_DO_AJUSTE.map((id) => ({
                id,
                rotulo: ROTULOS_DAS_DIRECOES_DO_AJUSTE[id],
              }))}
              selectedKey={dados.direcao}
              onSelectionChange={(chave) =>
                mudarCampo('direcao', { direcao: String(chave) as DirecaoDoAjuste })
              }
              erro={erros.direcao}
            />
          </div>
          <div ref={guardar('motivo')} className={estilos.campo}>
            <Selecao
              rotulo="Motivo"
              obrigatorio
              opcoes={MOTIVOS_DO_AJUSTE.map((id) => ({
                id,
                rotulo: ROTULOS_DOS_MOTIVOS_DO_AJUSTE[id],
              }))}
              selectedKey={dados.motivo}
              onSelectionChange={(chave) =>
                mudarCampo('motivo', { motivo: String(chave) as MotivoDoAjuste })
              }
              erro={erros.motivo}
            />
          </div>
        </>
      )}
      <div ref={guardar('observacao')} className={estilos.campo}>
        <AreaDeTexto
          rotulo="Observação"
          value={dados.observacao}
          onChange={(observacao) => mudarCampo('observacao', { observacao })}
          erro={erros.observacao}
        />
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
      <LinhaDeCampos>
        <div className={estilosDaOperacao.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Lançando">
            Lançar
          </Botao>
          <Botao nivel="terciario" onPress={aoCancelar}>
            Cancelar
          </Botao>
        </div>
      </LinhaDeCampos>
    </Formulario>
  );
}
