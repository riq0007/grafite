import { AreaDeTexto, Botao, CampoDeTexto, Formulario, MensagemDoPasso } from '@grafite/ui';
import { type FormEvent, useRef, useState } from 'react';
import estilos from '../Administracao.module.css';
import type { RecusaDoFormulario } from '../recusa.ts';

export interface DadosDoGrupo {
  nome: string;
  descricao: string;
}

/** O que vai para a API: o nome sem os espaços das pontas, e a descrição vazia como nula. */
export interface PedidoDoGrupo {
  nome: string;
  descricao: string | null;
}

type CampoDoGrupo = keyof DadosDoGrupo;

export const GRUPO_VAZIO: DadosDoGrupo = { nome: '', descricao: '' };

function validar({ nome, descricao }: DadosDoGrupo): Partial<Record<CampoDoGrupo, string>> {
  const motivos: Partial<Record<CampoDoGrupo, string>> = {};
  if (nome.trim() === '') motivos.nome = 'Informe o nome do grupo.';
  else if (nome.trim().length > 80) motivos.nome = 'Use até 80 caracteres.';
  if (descricao.trim().length > 500) motivos.descricao = 'Use até 500 caracteres.';
  return motivos;
}

export interface PropsDoFormularioDoGrupo {
  inicial: DadosDoGrupo;
  /** Os dados à vista, sem edição nem ação, para quem não pode alterar o grupo. */
  soLeitura?: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoGrupo) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoGrupo>>;
  aoCancelar?: () => void;
}

/** O formulário do grupo (spec perfis-e-grupos): o nome, único na organização, e a descrição. */
export function FormularioDoGrupo({
  inicial,
  soLeitura = false,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
}: PropsDoFormularioDoGrupo) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDoGrupo, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<CampoDoGrupo, HTMLElement | null>>>({});

  const mudar = (campo: CampoDoGrupo, valor: string) => {
    definirDados((atuais) => ({ ...atuais, [campo]: valor }));
    definirErros(({ [campo]: _, ...outros }) => outros);
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado. */
  const recusar = (motivos: Partial<Record<CampoDoGrupo, string>>) => {
    definirErros(motivos);
    const primeiro = (['nome', 'descricao'] as const).find((campo) => motivos[campo]);
    if (primeiro) entradas.current[primeiro]?.focus();
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const motivos = validar(dados);
    if (Object.keys(motivos).length > 0) return recusar(motivos);
    definirEnviando(true);
    try {
      const resultado = await enviar({
        nome: dados.nome.trim(),
        descricao: dados.descricao.trim() === '' ? null : dados.descricao.trim(),
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

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      <CampoDeTexto
        ref={(elemento) => {
          entradas.current.nome = elemento;
        }}
        rotulo="Nome"
        obrigatorio={!soLeitura}
        autoComplete="off"
        value={dados.nome}
        onChange={(nome) => mudar('nome', nome)}
        isReadOnly={soLeitura}
        erro={erros.nome}
      />
      <AreaDeTexto
        rotulo="Descrição"
        value={dados.descricao}
        onChange={(descricao) => mudar('descricao', descricao)}
        isReadOnly={soLeitura}
        erro={erros.descricao}
      />
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
