import { Link } from '@tanstack/react-router';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Administracao.module.css';

/**
 * O histórico de um registro (spec consulta-da-auditoria): leva à auditoria já filtrada por ele,
 * com o nome à vista nos filtros ativos. Só para quem consulta a auditoria.
 */
export function VerNaAuditoria({ alvo, nome }: { alvo: string[]; nome: string }) {
  const { pode } = useAcesso();
  if (!pode('auditoria.ver')) return null;
  return (
    <p className={estilos.informacao}>
      <Link
        to="/administracao/auditoria"
        search={{ alvo, nomeDoAlvo: nome }}
        className={estilos.link}
      >
        Ver na auditoria
      </Link>
    </p>
  );
}
