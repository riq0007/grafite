// A tela de entrada ligada à sessão (spec tela-de-entrada): o passo da vez, com as ações da loja.
// Cada passo leva ao estado que a API devolve, e "Sair" encerra a sessão pendente.
import { avaliarSenha } from '@grafite/domain';
import {
  avisar,
  CodigosDeRecuperacao,
  EnderecoDesconhecido,
  PassoDaSenhaNova,
  PassoDasCredenciais,
  PassoDoCodigo,
  PassoNoNavegador,
  TelaDeEntrada,
} from '@grafite/ui';
import { useEffect, useState } from 'react';
import { abrirForaDoChat } from '../chat/janela.ts';
import { FECHAR_A_ABA } from '../chat/naAba.ts';
import { useChegada } from '../chegada/avisos.tsx';
import { CadastroComChave } from './CadastroComChave.tsx';
import type { EstadoDaSessao } from './loja.ts';
import { useLojaDaSessao, useServidor } from './useSessao.tsx';

/** Os estados em que a entrada aparece, em vez da casca. */
export type EstadoNaEntrada = Extract<
  EstadoDaSessao,
  { tipo: 'sem-sessao' | 'pendente' | 'endereco-desconhecido' }
>;

const SESSAO_TERMINOU = 'Sua sessão terminou. Entre de novo para continuar.';

/**
 * Os passos que o chat da aba não resolve, porque ficam na conta, fora do alcance dele (change
 * aba-dos-colaboradores, decisão 8): a pessoa abre o Grafite no navegador, que pede o mesmo passo.
 */
const FORA_DA_ABA = {
  'trocar-senha': {
    titulo: 'Troque a senha temporária',
    texto:
      'A troca da senha temporária fica na sua conta, no Grafite. Abra o Grafite no navegador, troque a senha e volte ao chat pela aba.',
  },
  'cadastrar-dois-passos': {
    titulo: 'Ative a verificação em dois passos',
    texto:
      'A sua conta precisa da verificação em dois passos, que se ativa na sua conta, no Grafite. Abra o Grafite no navegador, ative e volte ao chat pela aba.',
  },
} as const;

export function Entrada({ sessao }: { sessao: EstadoNaEntrada }) {
  const { telaDesenhada } = useChegada();
  const servidor = useServidor();
  useEffect(() => telaDesenhada('entrada'), [telaDesenhada]);
  if (sessao.tipo === 'endereco-desconhecido') {
    return (
      <TelaDeEntrada>
        <EnderecoDesconhecido />
      </TelaDeEntrada>
    );
  }
  return (
    <TelaDeEntrada
      organizacao={sessao.organizacao}
      ambienteDeTeste={servidor?.ambiente === 'teste'}
      passo={sessao.tipo === 'sem-sessao' ? 'credenciais' : sessao.pendencia}
    >
      <PassoDaVez sessao={sessao} />
    </TelaDeEntrada>
  );
}

/**
 * Depois de entrar com um código de recuperação, quantos restam. Sem nenhum, o aviso diz isso, e a
 * notificação dele fica na central, gravada pela API na entrada.
 */
function avisarDosRestantes(restantes: number) {
  if (restantes === 0) {
    avisar({
      situacao: 'atencao',
      titulo: 'Este era o seu último código de recuperação. Gere novos na sua conta.',
    });
    return;
  }
  avisar({
    situacao: 'info',
    titulo:
      restantes === 1
        ? 'Resta 1 código de recuperação.'
        : `Restam ${restantes} códigos de recuperação.`,
  });
}

function PassoDaVez({
  sessao,
}: {
  sessao: Exclude<EstadoNaEntrada, { tipo: 'endereco-desconhecido' }>;
}) {
  const loja = useLojaDaSessao();
  // A senha digitada nesta entrada: o passo da senha temporária não a pede de novo.
  const [senhaDigitada, definirSenhaDigitada] = useState<string>();
  const naAba = sessao.tipo === 'pendente' && sessao.naAba;
  // No chat da aba, o "Sair" do passo fecha a tela maior: o fim da sessão fica fora do alcance dela,
  // e a pendente vence sozinha (change aba-dos-colaboradores, decisão 8).
  const sair = () => {
    definirSenhaDigitada(undefined);
    if (naAba) window.location.assign(FECHAR_A_ABA);
    else void loja.sair();
  };

  if (sessao.tipo === 'sem-sessao') {
    return (
      <PassoDasCredenciais
        aoEntrar={(credenciais) => {
          definirSenhaDigitada(credenciais.senha);
          return loja.entrar(credenciais);
        }}
        usuarioInicial={sessao.usuarioAnterior}
        aviso={sessao.mensagem ?? (sessao.terminou ? SESSAO_TERMINOU : undefined)}
      />
    );
  }
  // A senha temporária e os dois passos se resolvem na conta, fora do alcance do chat da aba.
  if (
    naAba &&
    (sessao.pendencia === 'trocar-senha' || sessao.pendencia === 'cadastrar-dois-passos')
  ) {
    return (
      <PassoNoNavegador
        {...FORA_DA_ABA[sessao.pendencia]}
        rotulo="Abrir o Grafite no navegador"
        aoAbrir={() => abrirForaDoChat('/conta')}
      />
    );
  }
  switch (sessao.pendencia) {
    case 'segundo-passo':
      return (
        <PassoDoCodigo
          diasDeConfianca={sessao.diasDeConfianca}
          aoMandar={async (codigo, opcoes) => {
            const resultado = await loja.mandarCodigo(codigo, opcoes);
            if ('ok' in resultado && resultado.codigosRestantes !== undefined) {
              avisarDosRestantes(resultado.codigosRestantes);
            }
            return resultado;
          }}
          aoSair={sair}
        />
      );
    case 'trocar-senha':
      return (
        <PassoDaSenhaNova
          aoTrocar={async (senhas) => {
            const resultado = await loja.trocarSenha(senhas);
            if ('ok' in resultado) definirSenhaDigitada(undefined);
            return resultado;
          }}
          avaliarSenha={(senha) => avaliarSenha(senha, { usuario: sessao.conta.usuario })}
          aoSair={sair}
          senhaAtual={senhaDigitada}
        />
      );
    case 'cadastrar-dois-passos':
      return (
        <CadastroComChave
          loja={loja}
          aoConfirmar={loja.confirmarCadastro}
          aoSair={sair}
          aviso={sessao.mensagem}
        />
      );
    case 'guardar-codigos':
      return <CodigosDeRecuperacao codigos={sessao.codigos} aoContinuar={loja.continuar} />;
  }
}
