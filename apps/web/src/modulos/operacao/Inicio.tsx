// O Início do Operação (spec modulo-operacao, "Início do Operação"; change redesenho-da-interface,
// design, decisão 4): as ações principais em blocos grandes, cada um levando à lista com a gaveta
// da ação aberta, e os atalhos para as listas que a conta vê. Quem não vê nada do Operação lê que
// não tem acesso.
import { CabecalhoDaPagina, Carimbo } from '@grafite/ui';
import { Link, type LinkProps } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  BarChart3,
  ClipboardList,
  Hammer,
  type LucideIcon,
  Monitor,
  Package,
  Printer,
  Warehouse,
} from 'lucide-react';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import estilos from './Operacao.module.css';

interface Destino {
  nome: string;
  descricao: string;
  icone: LucideIcon;
  link: Pick<LinkProps, 'to' | 'search'>;
}

function Cartao({ destino, classe }: { destino: Destino; classe: string | undefined }) {
  const Icone = destino.icone;
  return (
    <li>
      <Link {...destino.link} className={classe}>
        <span className={estilos.iconeDoCartao} aria-hidden="true">
          <Icone size={22} strokeWidth={1.75} />
        </span>
        <span className={estilos.textoDoCartao}>
          <span className={estilos.nomeDoCartao}>{destino.nome}</span>
          <span className={estilos.descricaoDoCartao}>{destino.descricao}</span>
        </span>
      </Link>
    </li>
  );
}

/** O Início do Operação, no endereço do módulo. */
export function InicioDaOperacao() {
  const { pode } = useAcesso();
  const atendeSolicitacoes = pode('solicitacoes.atender');
  const atendeOrdens = pode('ordens.atender');
  const movimentaEstoque = pode('estoque.movimentar');
  const veConsumiveis = pode('consumiveis.ver') || pode('consumiveis.editar');
  const veEstoque = pode('estoque.ver') || movimentaEstoque;
  const veSolicitacoes = pode('solicitacoes.ver') || atendeSolicitacoes;
  const veOrdens = pode('ordens.ver') || atendeOrdens;

  if (!veConsumiveis && !veEstoque && !veSolicitacoes && !veOrdens) {
    return (
      <>
        <CabecalhoDaPagina titulo="Operação" />
        <SemPermissao a="à Operação" />
      </>
    );
  }

  const acoes: Destino[] = [];
  if (atendeSolicitacoes) {
    acoes.push(
      {
        nome: 'Pedido de toner',
        descricao: 'Registra o toner que alguém pediu para uma impressora.',
        icone: Printer,
        link: { to: '/operacao/solicitacoes', search: { nova: 'toner' } },
      },
      {
        nome: 'Conserto',
        descricao: 'Registra o conserto que alguém pediu para um equipamento.',
        icone: Hammer,
        link: { to: '/operacao/solicitacoes', search: { nova: 'conserto' } },
      },
      {
        nome: 'Equipamento',
        descricao: 'Registra o pedido de um equipamento novo ou emprestado.',
        icone: Monitor,
        link: { to: '/operacao/solicitacoes', search: { nova: 'equipamento' } },
      },
    );
  }
  if (atendeOrdens) {
    acoes.push({
      nome: 'Nova ordem de serviço',
      descricao: 'Abre o trabalho da equipe, com o ativo, o local e o prazo.',
      icone: ClipboardList,
      link: { to: '/operacao/ordens', search: { nova: true } },
    });
  }
  if (movimentaEstoque) {
    acoes.push({
      nome: 'Entrada no estoque',
      descricao: 'Lança os consumíveis que chegaram, com a nota e o local.',
      icone: ArrowDownToLine,
      link: { to: '/operacao/estoque', search: { lancar: 'entrada' } },
    });
  }

  const listas: Destino[] = [];
  if (veSolicitacoes) {
    listas.push({
      nome: 'Solicitações',
      descricao: 'Os pedidos de toner, conserto e equipamento.',
      icone: ClipboardList,
      link: { to: '/operacao/solicitacoes' },
    });
  }
  if (veOrdens) {
    listas.push({
      nome: 'Ordens de serviço',
      descricao: 'O trabalho da equipe, do aberto ao concluído.',
      icone: Hammer,
      link: { to: '/operacao/ordens' },
    });
  }
  if (veEstoque) {
    listas.push(
      {
        nome: 'Estoque',
        descricao: 'O saldo de cada consumível em cada local.',
        icone: Warehouse,
        link: { to: '/operacao/estoque' },
      },
      {
        nome: 'Movimentações',
        descricao: 'As entradas, as saídas, as transferências e os ajustes.',
        icone: ArrowRightLeft,
        link: { to: '/operacao/movimentacoes' },
      },
    );
  }
  if (veConsumiveis) {
    listas.push({
      nome: 'Consumíveis',
      descricao: 'Os toners, os cilindros e as peças cadastrados.',
      icone: Package,
      link: { to: '/operacao/consumiveis' },
    });
  }
  if (veOrdens || veEstoque) {
    listas.push({
      nome: 'Indicadores',
      descricao: 'O prazo das OS e as páginas por toner.',
      icone: BarChart3,
      link: { to: '/operacao/indicadores' },
    });
  }

  return (
    <div className={estilos.inicio}>
      <CabecalhoDaPagina titulo="Operação" />
      {acoes.length > 0 && (
        <section className={estilos.secaoDoInicio} aria-labelledby="acoes-da-operacao">
          <Carimbo id="acoes-da-operacao">O que registrar</Carimbo>
          <ul className={estilos.acoesDoInicio}>
            {acoes.map((acao) => (
              <Cartao key={acao.nome} destino={acao} classe={estilos.acaoDoInicio} />
            ))}
          </ul>
        </section>
      )}
      <nav className={estilos.secaoDoInicio} aria-label="Listas do Operação">
        <Carimbo>Listas</Carimbo>
        <ul className={estilos.listasDoInicio}>
          {listas.map((lista) => (
            <Cartao key={lista.nome} destino={lista} classe={estilos.listaDoInicio} />
          ))}
        </ul>
      </nav>
    </div>
  );
}
