import { avisar, Botao, ListaDeDados, useDataHora } from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useId } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { Confirmacao } from '../Confirmacao.tsx';
import { Parte, useFocoNoTitulo } from '../Parte.tsx';
import type { Conta } from './ContaDaPessoa.tsx';
import type { Ficha } from './ficha.ts';

/** A chave das sessões abertas de uma conta nas consultas. */
export const chaveDasSessoes = (contaId: string) => ['sessoes-da-conta', contaId] as const;

const textoDasEncerradas = (encerradas: number) =>
  encerradas === 1 ? '1 sessão encerrada.' : `${encerradas} sessões encerradas.`;

/**
 * As sessões abertas da conta de outra pessoa (spec administracao-de-pessoas): o dispositivo, o
 * IP e os horários no fuso escolhido, e "Encerrar todas as sessões", com confirmação.
 */
export function SessoesDaConta({ pessoa, conta }: { pessoa: Ficha; conta: Conta }) {
  const api = useApi();
  const consultas = useQueryClient();
  const { formatarHorario } = useDataHora();
  const idDoDispositivo = useId();
  const sessoes = useQuery({
    queryKey: chaveDasSessoes(conta.id),
    queryFn: () =>
      consultar(
        () => api.GET('/contas/{id}/sessoes', { params: { path: { id: conta.id } } }),
        'carregar as sessões',
      ),
  });

  // Encerradas as sessões, "Encerrar todas as sessões" some com elas: o foco vai ao título.
  const { titulo, pedirFoco } = useFocoNoTitulo(sessoes.data);

  const parte = (conteudo: ReactNode) => (
    <Parte titulo="Sessões" refDoTitulo={titulo}>
      {conteudo}
    </Parte>
  );
  if (sessoes.isPending) {
    return parte(
      <p role="status" className={estilos.informacao}>
        Carregando as sessões…
      </p>,
    );
  }
  if (sessoes.isError) {
    return parte(
      <div className={estilos.falha}>
        <p role="alert" className={estilos.informacao}>
          {sessoes.error.message}
        </p>
        <Botao onPress={() => void sessoes.refetch()}>Tentar de novo</Botao>
      </div>,
    );
  }

  const lista = sessoes.data;
  return parte(
    <>
      {lista.length === 0 ? (
        <p className={estilos.informacao}>Nenhuma sessão aberta.</p>
      ) : (
        <ul aria-label="Sessões abertas" className={estilos.sessoes}>
          {lista.map((sessao) => (
            <li key={sessao.id} className={estilos.sessao}>
              <p id={`${idDoDispositivo}-${sessao.id}`} className={estilos.dispositivo}>
                {sessao.dispositivo}
              </p>
              <ListaDeDados
                itens={[
                  { rotulo: 'Endereço IP', valor: sessao.ip ?? 'Desconhecido' },
                  { rotulo: 'Entrou em', valor: formatarHorario(new Date(sessao.criadaEm)) },
                  { rotulo: 'Último uso', valor: formatarHorario(new Date(sessao.ultimoUsoEm)) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {conta.permite.encerrarSessoes && lista.length > 0 && (
        <div className={estilos.acoes}>
          <Confirmacao
            acao="Encerrar todas as sessões"
            titulo={`Encerrar todas as sessões de ${pessoa.nome}?`}
            confirmar="Encerrar as sessões"
            confirmando="Encerrando"
            fazer={async () => {
              const resultado = await pedir(
                () => api.DELETE('/contas/{id}/sessoes', { params: { path: { id: conta.id } } }),
                'encerrar as sessões',
              );
              if ('erro' in resultado) return resultado;
              pedirFoco();
              await consultas.invalidateQueries({ queryKey: chaveDasSessoes(conta.id) });
              avisar({
                situacao: 'sucesso',
                titulo: textoDasEncerradas(resultado.dados.encerradas),
              });
              return { ok: true };
            }}
          >
            <p className={estilos.informacao}>
              A pessoa precisa entrar de novo em todos os dispositivos.
            </p>
          </Confirmacao>
        </div>
      )}
    </>,
  );
}
