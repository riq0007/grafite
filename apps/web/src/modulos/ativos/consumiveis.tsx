// Os consumíveis compatíveis na ficha do ativo (spec cadastro-de-ativos, "Consumíveis compatíveis na
// ficha do ativo"; change p4b-consumiveis, design, decisões 5 e 6): o painel do cartão da capacidade
// `consumiveis.compatibilidade`, com os compatíveis do modelo do ativo, que a ficha traz só com a
// capacidade no tipo e o Operação ligado. Cada um traz o saldo do estoque e, para quem movimenta,
// "Registrar saída" para o ativo (change p4c-estoque, design, decisão 7).
import {
  type ConsumivelCompativel,
  ListaDeCompativeis,
} from '../operacao/consumiveis/ListaDeCompativeis.tsx';
import estilos from './Ativos.module.css';

export function ConsumiveisNaFicha({
  compativeis,
  temModelo,
  ativoId,
}: {
  compativeis: readonly ConsumivelCompativel[];
  temModelo: boolean;
  ativoId: string;
}) {
  if (!temModelo) {
    return (
      <p className={estilos.informacao}>
        Escolha o modelo do ativo para ver os consumíveis compatíveis.
      </p>
    );
  }
  if (compativeis.length === 0) {
    return <p className={estilos.informacao}>Nenhum consumível compatível com o modelo.</p>;
  }
  return (
    <ListaDeCompativeis
      compativeis={compativeis}
      rotulo="Consumíveis compatíveis"
      ativoId={ativoId}
    />
  );
}
