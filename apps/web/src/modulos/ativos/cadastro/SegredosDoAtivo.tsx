import { ROTULOS_DOS_TIPOS_DE_SEGREDO } from '@grafite/domain';
import { RotuloDeSituacao } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { Parte } from '../../administracao/Parte.tsx';
import estilos from '../Ativos.module.css';
import type { FichaDoAtivo } from '../consultas.ts';

/**
 * Os segredos do cofre ligados ao ativo (spec cadastro-de-ativos, "Segredos na ficha do ativo"):
 * os que a conta vê no cofre, pelo nome, com o tipo e o identificador, cada um levando à ficha
 * dele no Cofre. Nenhum valor aparece aqui: revelar e copiar ficam na ficha do segredo. Sem
 * segredo que a conta vê, ou sem o Cofre para ela, a seção não aparece.
 */
export function SegredosDoAtivo({ segredos }: { segredos: FichaDoAtivo['segredos'] }) {
  if (!segredos || segredos.length === 0) return null;
  return (
    <Parte titulo="Segredos">
      <ul className={estilos.listaDeSegredos}>
        {segredos.map((segredo) => (
          <li key={segredo.id}>
            <Link to="/cofre/$id" params={{ id: segredo.id }} className={estilos.link}>
              {segredo.nome}
            </Link>
            <span className={estilos.detalheDoSegredo}>
              {[ROTULOS_DOS_TIPOS_DE_SEGREDO[segredo.tipo], segredo.identificador]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {segredo.situacao === 'inativo' && (
              <RotuloDeSituacao situacao="neutra">Inativo</RotuloDeSituacao>
            )}
          </li>
        ))}
      </ul>
    </Parte>
  );
}
