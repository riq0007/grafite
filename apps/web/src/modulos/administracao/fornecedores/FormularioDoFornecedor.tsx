import {
  type CampoDoFornecedor,
  type DadosDoFornecedor,
  type ErrosDoFornecedor,
  limparFornecedor,
  validarFornecedor,
} from '@grafite/domain';
import { AreaDeTexto, Botao, CampoDeTexto, Formulario, MensagemDoPasso } from '@grafite/ui';
import { type FormEvent, useRef, useState } from 'react';
import estilos from '../Administracao.module.css';
import type { RecusaDoFormulario } from '../recusa.ts';
import type { FichaDoFornecedor } from './consultas.ts';

/** O fornecedor no formulário: cada campo como foi digitado, o vazio como texto vazio. */
export type DadosNoFormulario = Record<CampoDoFornecedor, string>;

export const FORNECEDOR_VAZIO: DadosNoFormulario = {
  nome: '',
  cnpj: '',
  contato: '',
  email: '',
  telefone: '',
  observacoes: '',
};

/** A ordem dos campos na tela, que decide qual recebe o foco quando mais de um é recusado. */
const ORDEM: readonly CampoDoFornecedor[] = [
  'nome',
  'cnpj',
  'contato',
  'email',
  'telefone',
  'observacoes',
];

/** O fornecedor da ficha no formulário, com o CNPJ escrito com a pontuação, como a API o devolve. */
export const dadosDoFornecedor = (ficha: FichaDoFornecedor): DadosNoFormulario => ({
  nome: ficha.nome,
  cnpj: ficha.cnpj ?? '',
  contato: ficha.contato ?? '',
  email: ficha.email ?? '',
  telefone: ficha.telefone ?? '',
  observacoes: ficha.observacoes ?? '',
});

export interface PropsDoFormularioDoFornecedor {
  inicial: DadosNoFormulario;
  rotuloDoEnvio: string;
  /** Recebe os dados limpos pelo domínio: o CNPJ com os 14 caracteres, o vazio como nulo. */
  enviar: (
    pedido: DadosDoFornecedor,
  ) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoFornecedor>>;
  aoCancelar?: () => void;
  /** Se algo já foi preenchido, para a aba do cadastro pedir confirmação ao fechar. */
  aoMudarPreenchido?: (preenchido: boolean) => void;
}

/**
 * O formulário do fornecedor (spec fornecedores, "Fornecedor"): o nome, o CNPJ, o contato, o e-mail,
 * o telefone e as observações, conferidos pelas regras do domínio antes de ir à API, com o motivo
 * em cada campo e o foco no primeiro recusado.
 */
export function FormularioDoFornecedor({
  inicial,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoFormularioDoFornecedor) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<ErrosDoFornecedor>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<CampoDoFornecedor, HTMLElement | null>>>({});

  const mudar = (campo: CampoDoFornecedor, valor: string) => {
    const novos = { ...dados, [campo]: valor };
    definirDados(novos);
    definirErros(({ [campo]: _, ...outros }) => outros);
    aoMudarPreenchido?.(Object.values(novos).some((texto) => texto.trim() !== ''));
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado. */
  const recusar = (motivos: ErrosDoFornecedor) => {
    definirErros(motivos);
    const primeiro = ORDEM.find((campo) => motivos[campo]);
    if (primeiro) entradas.current[primeiro]?.focus();
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const conferidos = validarFornecedor(dados);
    if (Object.keys(conferidos).length > 0) return recusar(conferidos);
    definirEnviando(true);
    try {
      const resultado = await enviar(limparFornecedor(dados));
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

  const texto = (campo: Exclude<CampoDoFornecedor, 'observacoes'>, rotulo: string, extras = {}) => (
    <CampoDeTexto
      ref={(elemento) => {
        entradas.current[campo] = elemento;
      }}
      rotulo={rotulo}
      autoComplete="off"
      value={dados[campo]}
      onChange={(valor) => mudar(campo, valor)}
      erro={erros[campo]}
      {...extras}
    />
  );

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      {texto('nome', 'Nome', { obrigatorio: true })}
      {texto('cnpj', 'CNPJ', { descricao: 'Com ou sem a pontuação, como 12.345.678/0001-95.' })}
      {texto('contato', 'Contato', { descricao: 'Quem atende a organização no fornecedor.' })}
      {texto('email', 'E-mail', { type: 'email' })}
      {texto('telefone', 'Telefone', { type: 'tel' })}
      <AreaDeTexto
        ref={(elemento) => {
          entradas.current.observacoes = elemento;
        }}
        rotulo="Observações"
        value={dados.observacoes}
        onChange={(valor) => mudar('observacoes', valor)}
        erro={erros.observacoes}
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
