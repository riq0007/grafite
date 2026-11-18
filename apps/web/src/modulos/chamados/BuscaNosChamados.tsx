// O "Buscar nos chamados" dos cabeçalhos do Início, de "Quem está com o quê" e dos Prazos (spec
// modulo-chamados, "Busca dos chamados"; change chamados-da-ti, design, "O chamado aberto, o
// cabeçalho"): a busca do sistema só com os chamados, para quem já está nas telas deles. A partir
// de 2 caracteres, depois da pausa dos provedores, ela pede a busca do provedor dos chamados e mostra
// os resultados embaixo; o escolhido abre o chamado.
import { BuscaComResultados } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useApi } from '../../api/useApi.tsx';
import { criarExecutor, type EstadoDoProvedor } from '../../busca/provedores.ts';
import type { ResultadoDoProvedor } from '../tipos.ts';
import { provedorDosChamados } from './busca.ts';
import estilos from './Pecas.module.css';

/** O aviso da lista no lugar dos resultados, ou nenhum, com eles ou sem a busca. */
function avisoDaBusca(estado: EstadoDoProvedor<ResultadoDoProvedor[]>): string | null {
  switch (estado.tipo) {
    case 'ocioso':
      return null;
    case 'buscando':
      return 'Buscando…';
    case 'erro':
      return `Não foi possível buscar em ${provedorDosChamados.grupo} agora.`;
    case 'pronto':
      return estado.resultados.length === 0 ? `Nenhum chamado com “${estado.termo}”.` : null;
  }
}

export function BuscaNosChamados() {
  const api = useApi();
  const navegar = useNavigate();
  const [termo, definirTermo] = useState('');
  const [estado, definirEstado] = useState<EstadoDoProvedor<ResultadoDoProvedor[]>>({
    tipo: 'ocioso',
  });
  const [executor] = useState(() =>
    criarExecutor(
      async (texto, sinal) => {
        const achados = await provedorDosChamados.buscar(texto, sinal, api);
        return Array.isArray(achados) ? achados : achados.itens;
      },
      { aoMudar: definirEstado },
    ),
  );
  useEffect(() => () => executor.parar(), [executor]);

  const resultados = estado.tipo === 'pronto' ? estado.resultados : [];
  return (
    <BuscaComResultados
      rotulo="Buscar nos chamados"
      className={estilos.buscaNosChamados}
      termo={termo}
      aoMudarTermo={(novo) => {
        definirTermo(novo);
        executor.pedir(novo);
      }}
      resultados={resultados.map(({ id, rotulo, caminho }) => ({
        id,
        rotulo,
        ...(caminho !== undefined && { detalhe: caminho }),
      }))}
      aviso={avisoDaBusca(estado)}
      aoEscolher={(id) => {
        const escolhido = resultados.find((resultado) => resultado.id === id);
        if (escolhido) void navegar({ href: escolhido.destino });
      }}
    />
  );
}
