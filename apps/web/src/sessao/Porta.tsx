// A porta entre a entrada e a casca (design do F2a, decisão 13). Com a sessão valendo, ou sem
// servidor, a casca; sem sessão, com um passo pendente ou num endereço desconhecido, a tela de
// entrada, numa camada à frente. A casca só monta depois da primeira sessão ativa ou desconhecida
// da página: na primeira abertura sem sessão, os módulos não carregam nada.
//
// Quando a sessão termina com a casca montada, ela continua montada, inerte e escondida, debaixo
// da entrada. A mesma conta, entrando de novo, tira a camada e encontra a casca como estava; outra
// conta recarrega a página, sem nada da anterior.
import { type ReactNode, useEffect, useState } from 'react';
import { Entrada } from './Entrada.tsx';
import { pagina } from './pagina.ts';
import { useSessao } from './useSessao.tsx';

interface CascaNaPorta {
  montada: boolean;
  /** A conta da primeira sessão que valeu com a casca; aberta sem servidor, ainda nenhuma. */
  conta: string | null;
}

export function Porta({ children }: { children: ReactNode }) {
  const sessao = useSessao();
  const abre = sessao.tipo === 'ativa' || sessao.tipo === 'desconhecida';
  const contaAtiva = sessao.tipo === 'ativa' ? sessao.conta.usuario : null;
  const [casca, definirCasca] = useState<CascaNaPorta>({ montada: abre, conta: contaAtiva });
  if ((abre && !casca.montada) || (casca.conta === null && contaAtiva !== null)) {
    definirCasca({ montada: true, conta: casca.conta ?? contaAtiva });
  }
  const outraConta = contaAtiva !== null && casca.conta !== null && contaAtiva !== casca.conta;
  useEffect(() => {
    if (outraConta) pagina.recarregar();
  }, [outraConta]);

  if (sessao.tipo === 'validando') return null;
  const coberta = !abre || outraConta;
  return (
    <>
      {casca.montada && (
        <div
          inert={coberta || undefined}
          style={{ display: 'contents', visibility: coberta ? 'hidden' : undefined }}
        >
          {children}
        </div>
      )}
      {sessao.tipo !== 'ativa' && sessao.tipo !== 'desconhecida' && <Entrada sessao={sessao} />}
    </>
  );
}
