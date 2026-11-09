import { type FormEvent, useRef, useState } from 'react';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CampoDeSenha } from '../componentes/campo/CampoDeSenha.tsx';
import estilos from './Entrada.module.css';
import { MensagemDoPasso } from './MensagemDoPasso.tsx';
import type { ResultadoDoPasso } from './PassoDasCredenciais.tsx';

/** A regra da senha à vista, a mesma do domínio, ao lado do campo da senha nova. */
export const REGRA_DA_SENHA = 'Use pelo menos 12 caracteres. Uma frase longa é uma boa senha.';

export interface PropsDoPassoDaSenhaNova {
  /** Troca a senha temporária pela nova. */
  aoTrocar: (senhas: { senhaAtual: string; senhaNova: string }) => Promise<ResultadoDoPasso>;
  /** A regra da senha (do domínio): o motivo da recusa, ou `null`. Conferida antes de enviar. */
  avaliarSenha: (senha: string) => string | null;
  /** Encerra a sessão pendente e volta ao usuário e senha. */
  aoSair: () => void;
  /**
   * A senha temporária digitada nesta entrada. Sem ela (a página recarregou no meio da entrada), a
   * tela pede a senha temporária de novo.
   */
  senhaAtual?: string;
}

interface ErrosDosCampos {
  senhaAtual?: string;
  senhaNova?: string;
  confirmacao?: string;
}

/** O passo da senha temporária: a senha nova, com a regra à vista e a confirmação. */
export function PassoDaSenhaNova({
  aoTrocar,
  avaliarSenha,
  aoSair,
  senhaAtual,
}: PropsDoPassoDaSenhaNova) {
  const [atual, definirAtual] = useState('');
  const [nova, definirNova] = useState('');
  const [confirmacao, definirConfirmacao] = useState('');
  const [erros, definirErros] = useState<ErrosDosCampos>({});
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const emEnvio = useRef(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (emEnvio.current) return;
    const motivo = avaliarSenha(nova);
    const diferentes = nova !== confirmacao;
    if (motivo || diferentes) {
      definirErros({
        senhaNova: motivo ?? undefined,
        confirmacao: diferentes ? 'As senhas não são iguais.' : undefined,
      });
      return;
    }
    emEnvio.current = true;
    definirEnviando(true);
    definirErros({});
    definirErro(null);
    try {
      const resultado = await aoTrocar({ senhaAtual: senhaAtual ?? atual, senhaNova: nova });
      if ('erro' in resultado) {
        if (resultado.campo) definirErros({ [resultado.campo]: resultado.erro });
        else {
          definirErro(resultado.erro);
          definirTentativa((anterior) => anterior + 1);
        }
      }
    } finally {
      emEnvio.current = false;
      definirEnviando(false);
    }
  }

  return (
    <>
      <h1 className={estilos.titulo}>Crie a sua senha</h1>
      <p className={estilos.texto}>
        A senha temporária vale só para esta entrada. Escolha a sua para continuar.
      </p>
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        {senhaAtual === undefined && (
          <CampoDeSenha
            rotulo="Senha temporária"
            name="senhaAtual"
            autoComplete="current-password"
            value={atual}
            onChange={definirAtual}
            erro={erros.senhaAtual}
            autoFocus
          />
        )}
        <CampoDeSenha
          rotulo="Senha nova"
          name="senhaNova"
          autoComplete="new-password"
          descricao={REGRA_DA_SENHA}
          value={nova}
          onChange={(valor) => {
            definirNova(valor);
            definirErros((anteriores) => ({ ...anteriores, senhaNova: undefined }));
          }}
          erro={erros.senhaNova}
          autoFocus={senhaAtual !== undefined}
        />
        <CampoDeSenha
          rotulo="Confirmar a senha nova"
          name="confirmacao"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(valor) => {
            definirConfirmacao(valor);
            definirErros((anteriores) => ({ ...anteriores, confirmacao: undefined }));
          }}
          erro={erros.confirmacao}
        />
        <MensagemDoPasso texto={erro} chave={tentativa} />
        <div className={estilos.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Trocando">
            Trocar a senha
          </Botao>
          <Botao nivel="terciario" onPress={aoSair}>
            Sair
          </Botao>
        </div>
      </form>
    </>
  );
}
