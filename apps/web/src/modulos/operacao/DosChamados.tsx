// Os chamados da OS e da solicitação (spec ordens-de-servico, "OS pelo chamado"; spec solicitacoes,
// "Solicitação pelo chamado"; change chamados-da-ti, design, "Os chamados na OS e na solicitação
// (tarefa 5.27)"): "Do chamado #1042" ou "Dos chamados #1040 e #1042", na linha do cabeçalho da
// ficha, com o link de cada um para quem o vê.
import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';
import estilos from './Operacao.module.css';

/** Um chamado ligado à OS ou à solicitação, com o `abrir` de quem vê o chamado. */
export interface ChamadoLigado {
  numero: number;
  abrir: boolean;
}

/**
 * Os chamados em ordem, juntos pela vírgula e, o último, pelo "e". O número é o link para o chamado
 * só quando a conta o vê; sem nenhum chamado, nada.
 */
export function DosChamados({ chamados }: { chamados: readonly ChamadoLigado[] }) {
  const emOrdem = [...chamados].sort((um, outro) => um.numero - outro.numero);
  const ultimo = emOrdem.length - 1;
  if (ultimo < 0) return null;
  return (
    <>
      {ultimo === 0 ? 'Do chamado ' : 'Dos chamados '}
      {emOrdem.map(({ numero, abrir }, indice) => (
        <Fragment key={numero}>
          {indice === 0 ? '' : indice === ultimo ? ' e ' : ', '}
          {abrir ? (
            <Link
              to="/chamados/$numero"
              params={{ numero: String(numero) }}
              // O nome diz o que o link abre, para a lista de links do leitor de tela.
              aria-label={`Chamado #${numero}`}
              className={estilos.link}
            >
              {`#${numero}`}
            </Link>
          ) : (
            `#${numero}`
          )}
        </Fragment>
      ))}
    </>
  );
}
