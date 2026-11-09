import { type FormEvent, useRef, useState } from 'react';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CampoDeTexto } from '../componentes/campo/CampoDeTexto.tsx';
import estilos from './Entrada.module.css';
import { MensagemDoPasso } from './MensagemDoPasso.tsx';
import type { ResultadoDoPasso } from './PassoDasCredenciais.tsx';

export interface PropsDoPassoDoCodigo {
  /** Manda o código do app ou um de recuperação, como foi digitado. */
  aoMandar: (codigo: string) => Promise<ResultadoDoPasso>;
  /** Encerra a sessão pendente e volta ao usuário e senha. */
  aoSair: () => void;
}

/** O segundo passo da entrada: o código do app autenticador ou um código de recuperação. */
export function PassoDoCodigo({ aoMandar, aoSair }: PropsDoPassoDoCodigo) {
  const [modo, definirModo] = useState<'app' | 'recuperacao'>('app');
  const [codigo, definirCodigo] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const emEnvio = useRef(false);
  const doApp = modo === 'app';

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (emEnvio.current) return;
    emEnvio.current = true;
    definirEnviando(true);
    try {
      const resultado = await aoMandar(codigo);
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

  function trocarDeModo() {
    definirModo(doApp ? 'recuperacao' : 'app');
    definirCodigo('');
    definirErro(null);
  }

  return (
    <>
      <h1 className={estilos.titulo}>Verificação em dois passos</h1>
      <p className={estilos.texto}>
        {doApp
          ? 'Digite o código de 6 dígitos que o app autenticador mostra.'
          : 'Digite um dos códigos de recuperação que você guardou.'}
      </p>
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        {doApp ? (
          <CampoDeTexto
            key="app"
            ref={campo}
            rotulo="Código do app"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={codigo}
            onChange={definirCodigo}
            autoFocus
          />
        ) : (
          <CampoDeTexto
            key="recuperacao"
            ref={campo}
            rotulo="Código de recuperação"
            name="codigo"
            autoComplete="off"
            placeholder="xxxxx-xxxxx"
            value={codigo}
            onChange={definirCodigo}
            autoFocus
          />
        )}
        <MensagemDoPasso texto={erro} chave={tentativa} />
        <div className={estilos.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Conferindo">
            Continuar
          </Botao>
          <Botao nivel="terciario" onPress={trocarDeModo}>
            {doApp ? 'Usar um código de recuperação' : 'Usar o código do app'}
          </Botao>
          <Botao nivel="terciario" onPress={aoSair}>
            Sair
          </Botao>
        </div>
      </form>
    </>
  );
}
