import { lerFaixas } from '@grafite/domain';
import { AreaDeTexto, Botao, CampoDeTexto, Formulario, MensagemDoPasso } from '@grafite/ui';
import { type FormEvent, useRef, useState } from 'react';
import estilos from '../Administracao.module.css';
import type { RecusaDoFormulario } from '../recusa.ts';

/** O coletor no formulário: as faixas no texto, uma por linha. */
export interface DadosDoColetor {
  nome: string;
  faixas: string;
}

/** O que vai para a API: o nome sem os espaços das pontas e as faixas na forma canônica. */
export interface PedidoDoColetor {
  nome: string;
  faixas: string[];
}

type CampoDoColetor = keyof DadosDoColetor;

export const COLETOR_VAZIO: DadosDoColetor = { nome: '', faixas: '' };

const linhasDe = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '');

/** As regras do nome e as das faixas, do domínio, as mesmas da API, com a mesma mensagem. */
function conferir({
  nome,
  faixas,
}: DadosDoColetor):
  | { ok: true; pedido: PedidoDoColetor }
  | { ok: false; motivos: Partial<Record<CampoDoColetor, string>> } {
  const motivos: Partial<Record<CampoDoColetor, string>> = {};
  if (nome.trim() === '') motivos.nome = 'Informe o nome do coletor.';
  else if (nome.trim().length > 60) motivos.nome = 'Use até 60 caracteres.';
  const lidas = lerFaixas(linhasDe(faixas));
  if (!lidas.ok) motivos.faixas = lidas.erro;
  if (Object.keys(motivos).length > 0 || !lidas.ok) return { ok: false, motivos };
  return { ok: true, pedido: { nome: nome.trim(), faixas: lidas.faixas } };
}

export interface PropsDoFormularioDoColetor {
  inicial: DadosDoColetor;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoColetor) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoColetor>>;
  aoCancelar?: () => void;
}

/**
 * O formulário do coletor (spec coletor-local, "Coletor da organização"): o nome, único na
 * organização, e as faixas de rede que ele alcança, uma por linha, como 10.0.0.0/24.
 */
export function FormularioDoColetor({
  inicial,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
}: PropsDoFormularioDoColetor) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDoColetor, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<CampoDoColetor, HTMLElement | null>>>({});

  const mudar = (campo: CampoDoColetor, valor: string) => {
    definirDados((atuais) => ({ ...atuais, [campo]: valor }));
    definirErros(({ [campo]: _, ...outros }) => outros);
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado. */
  const recusar = (motivos: Partial<Record<CampoDoColetor, string>>) => {
    definirErros(motivos);
    const primeiro = (['nome', 'faixas'] as const).find((campo) => motivos[campo]);
    if (primeiro) entradas.current[primeiro]?.focus();
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const conferido = conferir(dados);
    if (!conferido.ok) return recusar(conferido.motivos);
    definirEnviando(true);
    try {
      const resultado = await enviar(conferido.pedido);
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
        obrigatorio
        autoComplete="off"
        value={dados.nome}
        onChange={(nome) => mudar('nome', nome)}
        erro={erros.nome}
      />
      <AreaDeTexto
        ref={(elemento) => {
          entradas.current.faixas = elemento;
        }}
        rotulo="Faixas de rede"
        descricao="Uma por linha, como 10.0.0.0/24. Sem faixas, o coletor não recebe nada para coletar."
        value={dados.faixas}
        onChange={(faixas) => mudar('faixas', faixas)}
        erro={erros.faixas}
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
