// O bloco "Backups do Control iD" do Início (spec tela-inicial, "Backups do Control iD no Início";
// change inicio-ajustavel, design, decisão 6): cada controle com o nome, que leva à ficha, os
// rostos do último backup, há quantos dias está sem backup e a faixa dos últimos 14 dias, com os
// que estão há mais dias sem backup primeiro.
import { FaixaDeDias, formatarNumero } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from './BackupsNoInicio.module.css';
import { CHAVE_DOS_BACKUPS } from './consultas.ts';
import type { ResumoDeUmControle } from './ResumoDosBackups.tsx';

/** Os dias da faixa do Início. */
const DIAS = 14;

/** Os dias seguidos, até hoje, sem um backup bom: sem backup ou com falha. */
export function diasSeguidosSemBackup(dias: ResumoDeUmControle['dias']): number {
  let seguidos = 0;
  for (let indice = dias.length - 1; indice >= 0; indice--) {
    const situacao = dias[indice]?.situacao;
    if (situacao !== 'nada' && situacao !== 'falha') break;
    seguidos++;
  }
  return seguidos;
}

const textoDosDias = (seguidos: number) =>
  seguidos === 0 ? 'Em dia' : `Sem backup há ${seguidos} ${seguidos === 1 ? 'dia' : 'dias'}`;

const textoDosRostos = (rostos: number | null | undefined) =>
  rostos == null
    ? 'Rostos sem dado'
    : `${formatarNumero(rostos)} ${rostos === 1 ? 'rosto' : 'rostos'}`;

export function BackupsNoInicio() {
  const api = useApi();
  const resumo = useQuery({
    queryKey: [...CHAVE_DOS_BACKUPS, 'resumo', 'inicio', DIAS],
    queryFn: () =>
      consultar(
        () => api.GET('/controlid/backups/resumo', { params: { query: { dias: DIAS } } }),
        'carregar o resumo dos backups',
      ),
  });
  if (resumo.isPending) {
    return (
      <p role="status" className={estilos.informacao}>
        Carregando os backups…
      </p>
    );
  }
  if (resumo.isError) {
    return <p className={estilos.informacao}>Não foi possível carregar os backups.</p>;
  }
  if (resumo.data.controles.length === 0) {
    return <p className={estilos.informacao}>Nenhum controle com o backup ligado.</p>;
  }
  const emOrdem = [...resumo.data.controles].sort(
    (a, b) =>
      diasSeguidosSemBackup(b.dias) - diasSeguidosSemBackup(a.dias) ||
      a.controle.rotulo.localeCompare(b.controle.rotulo, 'pt-BR'),
  );
  return (
    <ul aria-label="Backups do Control iD" className={estilos.controles}>
      {emOrdem.map((controle) => {
        const seguidos = diasSeguidosSemBackup(controle.dias);
        return (
          <li key={controle.controle.id} className={estilos.controle}>
            <Link to="/ativos/$id" params={{ id: controle.controle.id }} className={estilos.nome}>
              {controle.controle.rotulo}
            </Link>
            <span className={estilos.rostos}>{textoDosRostos(controle.ultimo?.rostos)}</span>
            <span className={estilos.dias} data-sem-backup={seguidos > 0 || undefined}>
              {textoDosDias(seguidos)}
            </span>
            <FaixaDeDias
              rotulo={`Backups de ${controle.controle.rotulo}`}
              dias={controle.dias}
              oQue="backup"
            />
          </li>
        );
      })}
    </ul>
  );
}
