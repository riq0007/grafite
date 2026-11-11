import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Administracao.module.css';
import { Parte, useFocoNoTitulo } from '../Parte.tsx';
import { AcessoDaConta } from './AcessoDaConta.tsx';
import { AparelhosDaConta } from './AparelhosDaConta.tsx';
import { type AplicarNaConta, ContaDaPessoa, CriarConta, SemConta } from './ContaDaPessoa.tsx';
import { chaveDaFicha, type Ficha } from './ficha.ts';
import { chaveDasSessoes, SessoesDaConta } from './SessoesDaConta.tsx';

/**
 * A aba Acesso da ficha (spec modulo-administracao): a conta da pessoa, com as ações que a API
 * permite, as sessões abertas e os aparelhos confiáveis dela, para quem administra a conta, e os
 * perfis, os grupos e o que ela pode fazer, para quem vê os acessos.
 */
export function AcessoDaPessoa({ pessoa }: { pessoa: Ficha }) {
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const { conta } = pessoa;
  // O diálogo da criação fica fora da troca entre a conta e "sem conta": o evento da criação relê a
  // ficha com a senha temporária ainda à vista. Cada abertura o monta de novo, vazio. Fechado sem
  // criar, ele sai com a animação; com a conta criada, sai na hora.
  const [criacao, definirCriacao] = useState<{ vez: number; aberta: boolean } | null>(null);
  // Uma ação que some com o botão dela (como "Desbloquear a entrada"), ou o diálogo da criação que
  // sai, deixaria o foco perdido: ele vai ao título da conta. A ficha relida pelo evento da criação
  // já pode ter a conta, e aí só o diálogo muda.
  const estadoDaConta = useMemo(() => ({ conta, criacao }), [conta, criacao]);
  const { titulo, pedirFoco } = useFocoNoTitulo(estadoDaConta);

  const aplicar: AplicarNaConta = useCallback(
    (nova, { sessoes = false } = {}) => {
      pedirFoco();
      consultas.setQueryData<Ficha>(
        chaveDaFicha(pessoa.id),
        (ficha) => ficha && { ...ficha, conta: nova },
      );
      // A ficha relida traz o que a conta nova muda no `permite` da pessoa.
      void consultas.invalidateQueries({ queryKey: chaveDaFicha(pessoa.id) });
      void consultas.invalidateQueries({ queryKey: ['pessoas'] });
      if (sessoes) void consultas.invalidateQueries({ queryKey: chaveDasSessoes(nova.id) });
    },
    [consultas, pessoa.id, pedirFoco],
  );

  return (
    <div className={estilos.partes}>
      <Parte titulo="Conta" refDoTitulo={titulo}>
        {conta ? (
          <ContaDaPessoa pessoa={pessoa} conta={conta} aplicar={aplicar} />
        ) : (
          <SemConta
            pessoa={pessoa}
            aoCriarConta={() =>
              definirCriacao((atual) => ({ vez: (atual?.vez ?? 0) + 1, aberta: true }))
            }
          />
        )}
        {criacao && (
          <CriarConta
            key={criacao.vez}
            pessoa={pessoa}
            aberto={criacao.aberta}
            aoFechar={(criou) =>
              definirCriacao((atual) => (criou || !atual ? null : { ...atual, aberta: false }))
            }
            aplicar={aplicar}
          />
        )}
      </Parte>
      {conta && pessoa.permite.administrarConta && <SessoesDaConta pessoa={pessoa} conta={conta} />}
      {conta && pessoa.permite.administrarConta && (
        <AparelhosDaConta pessoa={pessoa} conta={conta} />
      )}
      {conta && pode('acessos.ver') && <AcessoDaConta pessoa={pessoa} conta={conta} />}
    </div>
  );
}
