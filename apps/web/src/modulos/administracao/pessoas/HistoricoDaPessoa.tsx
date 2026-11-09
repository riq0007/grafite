import type { components } from '@grafite/api-client';
import { Botao, useDataHora } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { VerNaAuditoria } from '../auditoria/VerNaAuditoria.tsx';
import type { Ficha } from './ficha.ts';

type Ator = components['schemas']['AtorDoRegistro'];

/** Quantos registros recentes a aba mostra; o resto fica na auditoria. */
const RECENTES = 10;

const nomeDoAtor = (ator: Ator) =>
  ator.tipo === 'conta' ? ator.nome : ator.tipo === 'sistema' ? ator.descricao : 'Sem sessão';

/**
 * A aba Histórico da ficha (spec modulo-administracao), para quem vê a auditoria: os registros
 * mais recentes da pessoa e da conta dela, e "Ver na auditoria", que leva a lista já filtrada.
 */
export function HistoricoDaPessoa({ pessoa }: { pessoa: Ficha }) {
  const api = useApi();
  const { formatarHorario } = useDataHora();
  const alvo = [`pessoa:${pessoa.id}`, ...(pessoa.conta ? [`conta:${pessoa.conta.id}`] : [])];
  const registros = useQuery({
    queryKey: ['auditoria', { alvo, limite: RECENTES }],
    queryFn: () =>
      consultar(
        () => api.GET('/auditoria', { params: { query: { alvo, limite: RECENTES } } }),
        'carregar o histórico',
      ),
  });

  if (registros.isPending) {
    return (
      <p role="status" className={estilos.informacao}>
        Carregando o histórico…
      </p>
    );
  }
  if (registros.isError) {
    return (
      <div className={estilos.falha}>
        <p role="alert" className={estilos.informacao}>
          {registros.error.message}
        </p>
        <Botao onPress={() => void registros.refetch()}>Tentar de novo</Botao>
      </div>
    );
  }

  const { itens, total, maisDe } = registros.data;
  if (itens.length === 0) {
    return <p className={estilos.informacao}>Nenhum registro desta pessoa.</p>;
  }
  return (
    <div className={estilos.parte}>
      <ul aria-label="Registros recentes" className={estilos.itens}>
        {itens.map((registro) => (
          <li key={registro.id} className={estilos.item}>
            <div className={estilos.textoDoItem}>
              <p className={estilos.nomeDoItem}>{registro.rotulo}</p>
              <p className={estilos.detalheDoItem}>
                {formatarHorario(new Date(registro.momento))} · {nomeDoAtor(registro.ator)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {total > itens.length && (
        <p className={estilos.contagem}>
          {`Os ${itens.length} registros mais recentes, de ${
            maisDe ? 'mais de ' : ''
          }${total.toLocaleString('pt-BR')}.`}
        </p>
      )}
      <VerNaAuditoria alvo={alvo} nome={pessoa.nome} />
    </div>
  );
}
