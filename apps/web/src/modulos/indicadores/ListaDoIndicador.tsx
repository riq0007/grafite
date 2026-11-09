// A lista de um indicador (spec indicadores, "Tela dos indicadores"; spec indicadores-da-operacao,
// "Tela dos indicadores da operação"; change p4f-indicadores-da-operacao, design, decisão 10): o que
// passou da meta, até 20 linhas, com "E mais <N>." quando passou disso.
import { Tabela } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import estilos from './Indicadores.module.css';

/**
 * A lista, quando tem linhas. Com os destinos, a linha leva ao dela; sem eles, os links ficam dentro
 * das células, como na linha que cita mais de um registro.
 */
export function ListaDoIndicador({
  rotulo,
  quantos,
  destinos,
  mais,
  children,
}: {
  rotulo: string;
  quantos: number;
  destinos?: Map<string, string>;
  mais: number;
  children: ReactNode;
}) {
  const navegar = useNavigate();
  if (quantos === 0) return null;
  return (
    <>
      <Tabela
        rotulo={rotulo}
        {...(destinos
          ? {
              aoAbrirLinha: (id: string) => {
                const destino = destinos.get(id);
                if (destino) void navegar({ to: destino });
              },
            }
          : {})}
      >
        {children}
      </Tabela>
      {mais > 0 ? <p className={estilos.contagem}>E mais {mais}.</p> : null}
    </>
  );
}
