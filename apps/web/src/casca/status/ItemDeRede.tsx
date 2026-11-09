import { Icone } from '@grafite/ui';
import { Wifi, WifiOff, WifiSync } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type EstadoDaRede, vigiarARede } from './rede.ts';
import estilos from './Status.module.css';

/**
 * Item de rede da barra: se a aplicação alcança o servidor, pelo ícone e pelo nome acessível; sem
 * conexão, também pelo texto. A região de status anuncia a mudança ao leitor de tela. No celular,
 * o item só entra na barra quando não há conexão.
 */
export function ItemDeRede() {
  const [estado, definirEstado] = useState<EstadoDaRede>('verificando');
  useEffect(() => vigiarARede({ aoMudar: definirEstado }), []);
  const semConexao = estado === 'sem-conexao';
  return (
    <span
      role="status"
      className={estilos.rede}
      data-estado={estado}
      data-essencial={semConexao ? '' : undefined}
    >
      {semConexao ? (
        <>
          <Icone icone={WifiOff} />
          <span>Sem conexão com o servidor</span>
        </>
      ) : estado === 'conectado' ? (
        <Icone icone={Wifi} rotulo="Conectado ao servidor" />
      ) : (
        <Icone icone={WifiSync} rotulo="Conferindo a conexão com o servidor" />
      )}
    </span>
  );
}
