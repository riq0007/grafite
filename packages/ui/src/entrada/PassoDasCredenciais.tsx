import { type FormEvent, useRef, useState } from 'react';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CampoDeSenha } from '../componentes/campo/CampoDeSenha.tsx';
import { CampoDeTexto } from '../componentes/campo/CampoDeTexto.tsx';
import estilos from './Entrada.module.css';
import { MensagemDoPasso } from './MensagemDoPasso.tsx';

/**
 * O que o app responde a um passo: seguiu, ou a recusa em texto. A recusa pode pedir para limpar a
 * senha digitada ou apontar o campo que falhou.
 */
export type ResultadoDoPasso =
  | { ok: true }
  | { erro: string; limparSenha?: boolean; campo?: 'senhaAtual' | 'senhaNova' };

export interface PropsDoPasso {
  /** Envia o usuário e a senha; enquanto a resposta não vem, o botão mostra que está entrando. */
  aoEntrar: (credenciais: { usuario: string; senha: string }) => Promise<ResultadoDoPasso>;
  /** Na sessão que terminou no meio do uso, o usuário já vem preenchido, e o foco vai à senha. */
  usuarioInicial?: string;
  /** Um aviso acima dos campos, como "Sua sessão terminou. Entre de novo para continuar.". */
  aviso?: string;
}

/** O primeiro passo da entrada: usuário e senha. */
export function PassoDasCredenciais({ aoEntrar, usuarioInicial = '', aviso }: PropsDoPasso) {
  const [usuario, definirUsuario] = useState(usuarioInicial);
  const [senha, definirSenha] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [ajudaAberta, definirAjudaAberta] = useState(false);
  const campoDaSenha = useRef<HTMLInputElement>(null);
  /** Um segundo Enter durante o envio não sai: o estado do React ainda não chegou ao formulário. */
  const emEnvio = useRef(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (emEnvio.current) return;
    emEnvio.current = true;
    definirEnviando(true);
    try {
      const resultado = await aoEntrar({ usuario, senha });
      if ('erro' in resultado) {
        definirErro(resultado.erro);
        definirTentativa((atual) => atual + 1);
        if (resultado.limparSenha) {
          definirSenha('');
          campoDaSenha.current?.focus();
        }
      }
    } finally {
      emEnvio.current = false;
      definirEnviando(false);
    }
  }

  return (
    <>
      <h1 className={estilos.titulo}>Entrar</h1>
      {aviso && <p className={estilos.aviso}>{aviso}</p>}
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <CampoDeTexto
          rotulo="Usuário"
          name="usuario"
          autoComplete="username"
          value={usuario}
          onChange={definirUsuario}
          autoFocus={!usuarioInicial}
        />
        <CampoDeSenha
          ref={campoDaSenha}
          rotulo="Senha"
          name="senha"
          autoComplete="current-password"
          value={senha}
          onChange={definirSenha}
          autoFocus={Boolean(usuarioInicial)}
        />
        <MensagemDoPasso texto={erro} chave={tentativa} />
        <div className={estilos.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Entrando">
            Entrar
          </Botao>
          <Botao
            nivel="terciario"
            aria-expanded={ajudaAberta}
            aria-controls="ajuda-da-senha"
            onPress={() => definirAjudaAberta((atual) => !atual)}
          >
            Esqueci minha senha
          </Botao>
        </div>
        {ajudaAberta && (
          <p id="ajuda-da-senha" className={estilos.texto}>
            Peça à TI para redefinir a sua senha.
          </p>
        )}
      </form>
    </>
  );
}
