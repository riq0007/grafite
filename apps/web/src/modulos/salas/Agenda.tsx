// A Agenda do dia (spec modulo-salas, "Agenda do dia"; change salas-de-reuniao, design, decisão 6):
// as salas lado a lado, as meias horas das 07:00 às 21:00 e as reservas em blocos na grade, com o
// horário, o assunto, quem pediu e a situação em texto. O horário livre abre a Nova reserva com a
// sala, o dia e a hora. A Nova reserva também abre pelo endereço (`?nova=1`), como a busca a pede.
import { ROTULOS_DAS_SITUACOES_DA_RESERVA } from '@grafite/domain';
import { Botao, CabecalhoDaPagina, EstadoVazio, RotuloDeSituacao } from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import { diaEmTexto, hora, type ReservaDeSala, TOM_DA_RESERVA, useAgenda } from './consultas.ts';
import { type InicioDaReserva, NovaReserva } from './NovaReserva.tsx';
import estilos from './Salas.module.css';

/** As meias horas da faixa, das 07:00 às 20:30. */
const PRIMEIRA_HORA = 7;
const ULTIMA_HORA = 21;
const MEIAS_HORAS = Array.from(
  { length: (ULTIMA_HORA - PRIMEIRA_HORA) * 2 },
  (_, indice) => PRIMEIRA_HORA * 60 + indice * 30,
);

const textoDaMeiaHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/** O dia em `aaaa-mm-dd`, no fuso do navegador. */
const diaIso = (dia: Date) =>
  `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;

/** A linha da grade em que o momento cai, contada a partir da primeira meia hora (a linha 2). */
function linhaDe(momento: Date, dia: Date): number {
  const meiaNoite = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).getTime();
  const minutos = (momento.getTime() - meiaNoite) / 60_000;
  const limitado = Math.min(Math.max(minutos, PRIMEIRA_HORA * 60), ULTIMA_HORA * 60);
  return 2 + Math.round((limitado - PRIMEIRA_HORA * 60) / 30);
}

function BlocoDaReserva({
  reserva,
  dia,
  coluna,
}: {
  reserva: ReservaDeSala;
  dia: Date;
  coluna: number;
}) {
  const inicio = new Date(reserva.inicio);
  const fim = new Date(reserva.fim);
  const primeira = linhaDe(inicio, dia);
  return (
    <article
      className={estilos.bloco}
      data-situacao={reserva.situacao}
      style={{
        gridColumn: coluna,
        gridRow: `${primeira} / ${Math.max(linhaDe(fim, dia), primeira + 1)}`,
      }}
      aria-label={`${hora(inicio)} às ${hora(fim)}, ${reserva.assunto}`}
    >
      <span className={estilos.horarioDoBloco}>
        {hora(inicio)}–{hora(fim)}
      </span>
      <span className={estilos.assuntoDoBloco}>{reserva.assunto}</span>
      <span className={estilos.quemDoBloco}>{reserva.pedidaPor.nome}</span>
      <RotuloDeSituacao situacao={TOM_DA_RESERVA[reserva.situacao]}>
        {ROTULOS_DAS_SITUACOES_DA_RESERVA[reserva.situacao]}
      </RotuloDeSituacao>
    </article>
  );
}

export function Agenda() {
  const { pode } = useAcesso();
  const busca = useSearch({ strict: false }) as { nova?: unknown };
  const navegar = useNavigate();
  const [dia, definirDia] = useState(() => new Date());
  const [nova, definirNova] = useState<InicioDaReserva | null>(null);
  const agenda = useAgenda(dia);
  const pelaBusca = busca.nova === 1 || busca.nova === '1' || busca.nova === true;
  const vista = pode('salas.ver');

  if (!vista) {
    return (
      <>
        <CabecalhoDaPagina titulo="Salas" />
        <SemPermissao a="às salas" />
      </>
    );
  }

  const mudarDia = (dias: number) =>
    definirDia((atual) => new Date(atual.getFullYear(), atual.getMonth(), atual.getDate() + dias));
  const abrirNova = (inicial: Partial<InicioDaReserva> = {}) =>
    definirNova({ salaId: null, dia: diaIso(dia), inicio: '09:00', ...inicial });
  const fecharNova = () => {
    definirNova(null);
    if (pelaBusca) void navegar({ to: '/salas', search: {} });
  };
  const aberta = nova ?? (pelaBusca ? { salaId: null, dia: diaIso(dia), inicio: '09:00' } : null);

  const salasDoDia = agenda.data?.salas ?? [];
  const reservas = agenda.data?.reservas ?? [];

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Agenda das salas"
        acoes={
          <Botao nivel="primario" icone={Plus} onPress={() => abrirNova()}>
            Nova reserva
          </Botao>
        }
      />
      <div className={estilos.navegacaoDoDia}>
        <Botao icone={ChevronLeft} onPress={() => mudarDia(-1)}>
          Dia anterior
        </Botao>
        <Botao onPress={() => definirDia(new Date())}>Hoje</Botao>
        <Botao icone={ChevronRight} onPress={() => mudarDia(1)}>
          Dia seguinte
        </Botao>
        <p className={estilos.diaDaAgenda} aria-live="polite">
          {diaEmTexto(dia)}
        </p>
      </div>
      {agenda.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando a agenda…
        </p>
      ) : agenda.isError ? (
        <EstadoVazio
          titulo={agenda.error.message}
          acao={<Botao onPress={() => void agenda.refetch()}>Tentar de novo</Botao>}
        />
      ) : salasDoDia.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma sala cadastrada."
          descricao={
            pode('salas.administrar')
              ? 'Cadastre as salas de reunião, com o local e a capacidade, para a agenda e os pedidos.'
              : 'Quem administra as salas cadastra as salas de reunião da empresa.'
          }
          acao={
            pode('salas.administrar') ? (
              <Botao onPress={() => void navegar({ to: '/salas/cadastro' })}>
                Abrir o cadastro
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <div className={estilos.areaDaGrade}>
          <section
            className={estilos.grade}
            aria-label={`Agenda das salas, ${diaEmTexto(dia)}`}
            style={{
              gridTemplateColumns: `calc(var(--esp-12) * 1.25) repeat(${salasDoDia.length}, minmax(calc(var(--esp-12) * 4), 1fr))`,
              gridTemplateRows: `auto repeat(${MEIAS_HORAS.length}, var(--altura-linha))`,
            }}
          >
            <div className={estilos.cantoDaGrade} />
            {salasDoDia.map((sala, coluna) => (
              <div
                key={sala.id}
                className={estilos.cabecalhoDaSala}
                style={{ gridColumn: coluna + 2, gridRow: 1 }}
              >
                <span className={estilos.nomeDaSala}>{sala.nome}</span>
                <span className={estilos.nota}>
                  {[sala.local?.caminho, sala.capacidade ? `${sala.capacidade} lugares` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            ))}
            {MEIAS_HORAS.map((minutos, indice) => (
              <span
                key={minutos}
                className={estilos.horaDaGrade}
                style={{ gridColumn: 1, gridRow: indice + 2 }}
              >
                {minutos % 60 === 0 ? textoDaMeiaHora(minutos) : ''}
              </span>
            ))}
            {salasDoDia.map((sala, coluna) =>
              MEIAS_HORAS.map((minutos, indice) => (
                <button
                  key={`${sala.id}-${minutos}`}
                  type="button"
                  className={estilos.horarioLivre}
                  style={{ gridColumn: coluna + 2, gridRow: indice + 2 }}
                  aria-label={`Reservar ${sala.nome} às ${textoDaMeiaHora(minutos)}`}
                  onClick={() => abrirNova({ salaId: sala.id, inicio: textoDaMeiaHora(minutos) })}
                />
              )),
            )}
            {reservas.map((reserva) => {
              const coluna = salasDoDia.findIndex((sala) => sala.id === reserva.sala.id);
              if (coluna < 0) return null;
              return (
                <BlocoDaReserva key={reserva.id} reserva={reserva} dia={dia} coluna={coluna + 2} />
              );
            })}
          </section>
        </div>
      )}
      {aberta && <NovaReserva inicial={aberta} aoFechar={fecharNova} />}
    </div>
  );
}
