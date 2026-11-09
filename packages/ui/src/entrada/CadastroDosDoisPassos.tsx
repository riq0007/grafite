import { type FormEvent, useRef, useState } from 'react';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CampoDeTexto } from '../componentes/campo/CampoDeTexto.tsx';
import { CodigoQR } from '../componentes/codigoQR/CodigoQR.tsx';
import { TextoParaCopiar } from '../componentes/copiar/TextoParaCopiar.tsx';
import estilos from './Entrada.module.css';
import { MensagemDoPasso } from './MensagemDoPasso.tsx';
import type { ResultadoDoPasso } from './PassoDasCredenciais.tsx';

export interface PropsDoCadastro {
  /** A chave em grupos de 4, como a API a entrega. */
  chave: string;
  /** A URI do QR code. */
  uri: string;
  /** Confirma o cadastro com o código que o app mostra. */
  aoConfirmar: (codigo: string) => Promise<ResultadoDoPasso>;
  /** Na entrada, encerra a sessão pendente; nos Ajustes, desiste do cadastro. */
  aoSair: () => void;
  /** O nome do botão de desistir: "Sair" na entrada e "Cancelar" nos Ajustes. */
  rotuloDeSair?: string;
  /** O título da tela (h1) na entrada, ou o de dentro da parte da conta (h3) nos Ajustes. */
  nivelDoTitulo?: 1 | 2 | 3;
  /** Por que o cadastro apareceu, como quando a exigência surge com a casca aberta. */
  aviso?: string;
  copiar?: (texto: string) => Promise<void>;
}

/** O cadastro da verificação em dois passos: o QR code, a chave em texto e o código do app. */
export function CadastroDosDoisPassos({
  chave,
  uri,
  aoConfirmar,
  aoSair,
  rotuloDeSair = 'Sair',
  nivelDoTitulo = 1,
  aviso,
  copiar,
}: PropsDoCadastro) {
  const [codigo, definirCodigo] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const emEnvio = useRef(false);
  const Titulo = (['h1', 'h2', 'h3'] as const)[nivelDoTitulo - 1] ?? 'h1';

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (emEnvio.current) return;
    emEnvio.current = true;
    definirEnviando(true);
    try {
      const resultado = await aoConfirmar(codigo);
      if ('erro' in resultado) {
        definirErro(resultado.erro);
        definirTentativa((atual) => atual + 1);
        definirCodigo('');
        campo.current?.focus();
      }
    } finally {
      emEnvio.current = false;
      definirEnviando(false);
    }
  }

  return (
    <>
      <Titulo className={estilos.titulo}>Cadastre a verificação em dois passos</Titulo>
      {aviso && <p className={estilos.aviso}>{aviso}</p>}
      <p className={estilos.texto}>
        Abra o app autenticador do celular e leia o QR code. O app passa a mostrar um código novo a
        cada 30 segundos.
      </p>
      <CodigoQR valor={uri} rotulo="QR code para o app autenticador" className={estilos.codigoQR} />
      <p className={estilos.texto}>Sem câmera? Digite esta chave no app:</p>
      <TextoParaCopiar
        rotulo="Chave para o app autenticador"
        valor={chave.replaceAll(' ', '')}
        falhou="Não foi possível copiar. Selecione a chave e copie."
        copiar={copiar}
      >
        {chave}
      </TextoParaCopiar>
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <CampoDeTexto
          ref={campo}
          rotulo="Código do app"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={codigo}
          onChange={definirCodigo}
        />
        <MensagemDoPasso texto={erro} chave={tentativa} />
        <div className={estilos.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Ativando">
            Ativar
          </Botao>
          <Botao nivel="terciario" onPress={aoSair}>
            {rotuloDeSair}
          </Botao>
        </div>
      </form>
    </>
  );
}
