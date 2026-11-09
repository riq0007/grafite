import { type CampoDaPessoa, limparPessoa, validarPessoa } from '@grafite/domain';
import { Botao, CampoDeTexto, Formulario, LinhaDeCampos, MensagemDoPasso } from '@grafite/ui';
import { type FormEvent, useRef, useState } from 'react';
import { CampoComCadastro } from '../../cadastros.tsx';
import estilos from '../Administracao.module.css';
import type { RecusaDoFormulario } from '../recusa.ts';
import { SeletorDeLocal } from '../seletores/SeletorDeLocal.tsx';

/** Os campos do formulário, como o usuário os vê: o local pelo id, e o vazio como texto vazio. */
export interface DadosDoFormulario {
  nome: string;
  email: string;
  matricula: string;
  telefone: string;
  localId: string | null;
  /** O caminho do local, para a ficha só de leitura. */
  caminhoDoLocal?: string;
}

/** O que vai para a API: os campos limpos pelas regras da pessoa, e o vazio como nulo. */
export interface PedidoDaPessoa {
  nome: string;
  email: string | null;
  matricula: string | null;
  telefone: string | null;
  localId: string | null;
}

type CampoDoFormulario = CampoDaPessoa | 'localId';

export const FORMULARIO_VAZIO: DadosDoFormulario = {
  nome: '',
  email: '',
  matricula: '',
  telefone: '',
  localId: null,
};

const ORDEM_DOS_CAMPOS: CampoDoFormulario[] = ['nome', 'email', 'matricula', 'telefone', 'localId'];

export interface PropsDoFormularioDaPessoa {
  inicial: DadosDoFormulario;
  /** Os dados à vista, sem edição nem ação, para quem não pode editar. */
  soLeitura?: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDaPessoa) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoFormulario>>;
  aoCancelar?: () => void;
  /** Avisa se algo já foi preenchido, para fechar a aba do cadastro pedir confirmação. */
  aoMudarPreenchido?: (preenchido: boolean) => void;
}

/**
 * O formulário da pessoa (spec administracao-de-pessoas): as regras do domínio avisam antes de
 * enviar, e a recusa da API aparece junto ao campo, com o formulário preenchido.
 */
export function FormularioDaPessoa({
  inicial,
  soLeitura = false,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoFormularioDaPessoa) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDoFormulario, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<CampoDoFormulario, HTMLInputElement | null>>>({});

  const mudar = (campo: CampoDoFormulario, valor: string | null) => {
    const novos = { ...dados, [campo]: valor };
    aoMudarPreenchido?.(
      novos.localId !== null ||
        [novos.nome, novos.email, novos.matricula, novos.telefone].some(
          (texto) => texto.trim() !== '',
        ),
    );
    definirDados((atuais) => ({ ...atuais, [campo]: valor }));
    definirErros(({ [campo]: _, ...outros }) => outros);
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado. */
  const recusar = (motivos: Partial<Record<CampoDoFormulario, string>>) => {
    definirErros(motivos);
    const primeiro = ORDEM_DOS_CAMPOS.find((campo) => motivos[campo]);
    if (primeiro) entradas.current[primeiro]?.focus();
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const pessoa = {
      nome: dados.nome,
      email: dados.email,
      matricula: dados.matricula,
      telefone: dados.telefone,
    };
    const motivos = validarPessoa(pessoa);
    definirFalha(null);
    if (Object.keys(motivos).length > 0) return recusar(motivos);
    definirEnviando(true);
    try {
      const resultado = await enviar({ ...limparPessoa(pessoa), localId: dados.localId });
      if ('erro' in resultado) {
        if (resultado.campos && Object.keys(resultado.campos).length > 0) recusar(resultado.campos);
        else {
          definirFalha(resultado.erro);
          definirTentativa((atual) => atual + 1);
        }
      }
    } finally {
      definirEnviando(false);
    }
  }

  const texto = (campo: CampoDaPessoa, rotulo: string, extras: object = {}) => (
    <CampoDeTexto
      ref={(elemento) => {
        entradas.current[campo] = elemento;
      }}
      rotulo={rotulo}
      value={dados[campo]}
      onChange={(valor) => mudar(campo, valor)}
      isReadOnly={soLeitura}
      erro={erros[campo]}
      {...extras}
    />
  );

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      {texto('nome', 'Nome', { obrigatorio: !soLeitura, autoComplete: 'off' })}
      <LinhaDeCampos>
        {texto('email', 'E-mail', { type: 'email', autoComplete: 'off' })}
        {texto('telefone', 'Telefone', { type: 'tel', autoComplete: 'off' })}
      </LinhaDeCampos>
      <LinhaDeCampos>
        {texto('matricula', 'Matrícula', { autoComplete: 'off' })}
        {soLeitura ? (
          <CampoDeTexto rotulo="Local de trabalho" value={dados.caminhoDoLocal ?? ''} isReadOnly />
        ) : (
          // O local que ainda não existe é cadastrado numa aba, e volta escolhido (change
          // cadastro-em-abas).
          <CampoComCadastro
            alvo="local"
            campo="Local de trabalho"
            chave="localDeTrabalho"
            aoCriar={(local) => mudar('localId', local.id)}
          >
            <SeletorDeLocal
              rotulo="Local de trabalho"
              valor={dados.localId}
              aoMudar={(local) => mudar('localId', local)}
              erro={erros.localId}
            />
          </CampoComCadastro>
        )}
      </LinhaDeCampos>
      {!soLeitura && (
        <>
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
        </>
      )}
    </Formulario>
  );
}

/** Os dados de uma pessoa da API no formulário. */
export function dadosDoFormulario(pessoa: {
  nome: string;
  email: string | null;
  matricula: string | null;
  telefone: string | null;
  local: { id: string; caminho: string } | null;
}): DadosDoFormulario {
  return {
    nome: pessoa.nome,
    email: pessoa.email ?? '',
    matricula: pessoa.matricula ?? '',
    telefone: pessoa.telefone ?? '',
    localId: pessoa.local?.id ?? null,
    ...(pessoa.local && { caminhoDoLocal: pessoa.local.caminho }),
  };
}
