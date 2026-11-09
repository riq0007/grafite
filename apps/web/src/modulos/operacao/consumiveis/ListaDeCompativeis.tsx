import type { components } from '@grafite/api-client';
import {
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  rendimentoEscrito,
} from '@grafite/domain';
import { Botao } from '@grafite/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpFromLine } from 'lucide-react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { quantidadeEscrita } from '../estoque/apresentacao.ts';
import estilos from '../Operacao.module.css';

export type ConsumivelCompativel = components['schemas']['ConsumivelCompativel'];

/** O tipo e a cor em texto, como "Toner · Preto". */
export const tipoECor = ({ tipo, cor }: Pick<ConsumivelCompativel, 'tipo' | 'cor'>) =>
  [ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[tipo], cor ? ROTULOS_DAS_CORES_DE_CONSUMIVEL[cor] : null]
    .filter(Boolean)
    .join(' · ');

/**
 * Os consumíveis compatíveis de um modelo (spec consumiveis, "Quem vê e quem edita os
 * consumíveis"), na ficha do modelo e na do ativo: o código, o nome, o tipo, a cor e o
 * rendimento de cada um. O código leva à ficha do consumível só para quem vê os consumíveis. Na
 * ficha do ativo, cada um traz o saldo nos locais que a conta vê, para quem vê o estoque, e
 * "Registrar saída", que abre a saída dele para o ativo, para quem movimenta (change p4c-estoque).
 */
export function ListaDeCompativeis({
  compativeis,
  rotulo,
  ativoId,
}: {
  compativeis: readonly ConsumivelCompativel[];
  rotulo?: string;
  /** O ativo da ficha, para quem registra a saída do consumível para ele. */
  ativoId?: string;
}) {
  const { pode } = useAcesso();
  const navegar = useNavigate();
  const abre = pode('consumiveis.ver') || pode('consumiveis.editar');
  const registraSaida = ativoId !== undefined && pode('estoque.movimentar');
  return (
    <ul aria-label={rotulo} className={estilos.itens}>
      {compativeis.map((consumivel) => (
        <li key={consumivel.id} className={estilos.nomeDoItem}>
          {abre ? (
            <Link
              to="/operacao/consumiveis/$id"
              params={{ id: consumivel.id }}
              className={`mono ${estilos.link}`}
            >
              {consumivel.codigo}
            </Link>
          ) : (
            <span className="mono">{consumivel.codigo}</span>
          )}
          {consumivel.nome && <span>{consumivel.nome}</span>}
          <span className={estilos.semValor}>{tipoECor(consumivel)}</span>
          {consumivel.rendimento !== null && (
            <span className={estilos.semValor}>{rendimentoEscrito(consumivel.rendimento)}</span>
          )}
          {consumivel.saldo !== null && (
            <span>
              {consumivel.saldo === 0
                ? 'Sem estoque'
                : `${quantidadeEscrita(consumivel.saldo)} em estoque`}
            </span>
          )}
          {registraSaida && (
            <Botao
              nivel="terciario"
              icone={ArrowUpFromLine}
              aria-label={`Registrar saída do ${consumivel.codigo}`}
              onPress={() =>
                void navegar({
                  to: '/operacao/estoque',
                  search: { lancar: 'saida', consumivel: consumivel.id, ativo: ativoId },
                })
              }
            >
              Registrar saída
            </Botao>
          )}
        </li>
      ))}
    </ul>
  );
}
