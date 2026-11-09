// As Minhas reservas e os Pedidos (spec modulo-salas, "Minhas reservas e convites" e "Pedidos e
// cadastro"; change salas-de-reuniao, design, decisão 6): cada reserva num cartão, com a sala, o
// dia, o horário, o assunto e a situação em texto. A pedida mostra as respostas e "Cancelar"; o
// convite, "Aceitar" e "Recusar"; o pedido, "Aprovar" e "Recusar", com o motivo.
import { ROTULOS_DAS_RESPOSTAS, ROTULOS_DAS_SITUACOES_DA_RESERVA } from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeTexto,
  Dialogo,
  EstadoVazio,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import {
  CHAVE_DAS_SALAS,
  diaEmTexto,
  hora,
  type ReservaDeSala,
  TOM_DA_RESERVA,
  useMinhasReservas,
  usePedidos,
} from './consultas.ts';
import estilos from './Salas.module.css';

const TEXTO_DA_MINHA_RESPOSTA = {
  'sem-resposta': 'Você ainda não respondeu',
  aceitou: 'Você aceitou',
  recusou: 'Você recusou',
} as const;

/** Uma ação da reserva, com o retorno e a releitura das telas das salas. */
function useAcaoDaReserva() {
  const api = useApi();
  const consultas = useQueryClient();
  const [ocupada, definirOcupada] = useState<string | null>(null);
  async function agir(
    id: string,
    acao: 'aprovacao' | 'cancelamento' | 'resposta-aceitou' | 'resposta-recusou',
    retorno: string,
  ) {
    definirOcupada(`${id}-${acao}`);
    const resultado = await pedir(() => {
      const caminho = { params: { path: { id } } };
      switch (acao) {
        case 'aprovacao':
          return api.POST('/salas/reservas/{id}/aprovacao', caminho);
        case 'cancelamento':
          return api.POST('/salas/reservas/{id}/cancelamento', caminho);
        case 'resposta-aceitou':
          return api.POST('/salas/reservas/{id}/resposta', {
            ...caminho,
            body: { resposta: 'aceitou' },
          });
        case 'resposta-recusou':
          return api.POST('/salas/reservas/{id}/resposta', {
            ...caminho,
            body: { resposta: 'recusou' },
          });
      }
    }, 'mudar a reserva');
    definirOcupada(null);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: retorno });
    await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SALAS });
  }
  return { agir, ocupada };
}

/** "Recusar" o pedido, com o diálogo do motivo. */
function RecusarPedido({ reserva }: { reserva: ReservaDeSala }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [motivo, definirMotivo] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  return (
    <Dialogo
      gatilho={<Botao nivel="destrutivo">Recusar</Botao>}
      titulo={`Recusar a reserva ${reserva.assunto}?`}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="destrutivo"
            carregando={enviando}
            rotuloCarregando="Recusando"
            onPress={async () => {
              if (motivo.trim() === '') {
                definirErro('Informe o motivo.');
                return;
              }
              definirEnviando(true);
              const resultado = await pedir(
                () =>
                  api.POST('/salas/reservas/{id}/recusa', {
                    params: { path: { id: reserva.id } },
                    body: { motivo },
                  }),
                'recusar a reserva',
              );
              definirEnviando(false);
              if ('erro' in resultado) {
                definirErro(resultado.erro);
                return;
              }
              fechar();
              avisar({ situacao: 'sucesso', titulo: 'Reserva recusada.' });
              await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SALAS });
            }}
          >
            Recusar
          </Botao>
        </>
      )}
    >
      <CampoDeTexto
        rotulo="Motivo"
        obrigatorio
        descricao="Quem pediu recebe o motivo na notificação."
        value={motivo}
        onChange={(valor) => {
          definirMotivo(valor);
          definirErro(null);
        }}
        erro={erro ?? undefined}
      />
    </Dialogo>
  );
}

/** Uma reserva num cartão, com as ações que a conta tem nela. */
function CartaoDaReserva({
  reserva,
  modo,
}: {
  reserva: ReservaDeSala;
  modo: 'minhas' | 'pedidos';
}) {
  const { agir, ocupada } = useAcaoDaReserva();
  const inicio = new Date(reserva.inicio);
  const fim = new Date(reserva.fim);
  const convite = reserva.minhaResposta !== null;
  return (
    <li className={estilos.reserva}>
      <div className={estilos.topoDaReserva}>
        <p className={estilos.assuntoDaReserva}>{reserva.assunto}</p>
        <RotuloDeSituacao situacao={TOM_DA_RESERVA[reserva.situacao]}>
          {ROTULOS_DAS_SITUACOES_DA_RESERVA[reserva.situacao]}
        </RotuloDeSituacao>
      </div>
      <p className={estilos.nota}>
        {reserva.sala.nome} · {diaEmTexto(inicio)}, {hora(inicio)} às {hora(fim)} · pedida por{' '}
        {reserva.pedidaPor.nome}
      </p>
      {reserva.comentario && <p className={estilos.comentario}>{reserva.comentario}</p>}
      {reserva.motivo && <p className={estilos.comentario}>Motivo: {reserva.motivo}</p>}
      {reserva.itens.length > 0 && (
        <p className={estilos.nota}>
          Equipamentos: {reserva.itens.map(({ nome }) => nome).join(', ')}
        </p>
      )}
      {reserva.participantes && reserva.participantes.length > 0 && (
        <ul className={estilos.respostas} aria-label={`Participantes de ${reserva.assunto}`}>
          {reserva.participantes.map(({ conta, resposta }) => (
            <li key={conta.id}>
              {conta.nome}: {ROTULOS_DAS_RESPOSTAS[resposta]}
            </li>
          ))}
        </ul>
      )}
      <div className={estilos.acoes}>
        {convite && reserva.minhaResposta && (
          <span className={estilos.nota}>{TEXTO_DA_MINHA_RESPOSTA[reserva.minhaResposta]}</span>
        )}
        {modo === 'minhas' && reserva.permite.responder && (
          <>
            <Botao
              nivel={reserva.minhaResposta === 'aceitou' ? 'secundario' : 'primario'}
              carregando={ocupada === `${reserva.id}-resposta-aceitou`}
              onPress={() => void agir(reserva.id, 'resposta-aceitou', 'Convite aceito.')}
            >
              Aceitar
            </Botao>
            <Botao
              carregando={ocupada === `${reserva.id}-resposta-recusou`}
              onPress={() => void agir(reserva.id, 'resposta-recusou', 'Convite recusado.')}
            >
              Recusar
            </Botao>
          </>
        )}
        {modo === 'pedidos' && reserva.permite.aprovar && (
          <>
            <Botao
              nivel="primario"
              carregando={ocupada === `${reserva.id}-aprovacao`}
              onPress={() => void agir(reserva.id, 'aprovacao', 'Reserva aprovada.')}
            >
              Aprovar
            </Botao>
            <RecusarPedido reserva={reserva} />
          </>
        )}
        {modo === 'minhas' && reserva.permite.cancelar && !convite && (
          <Botao
            nivel="terciario"
            carregando={ocupada === `${reserva.id}-cancelamento`}
            onPress={() => void agir(reserva.id, 'cancelamento', 'Reserva cancelada.')}
          >
            Cancelar a reserva
          </Botao>
        )}
      </div>
    </li>
  );
}

export function MinhasReservas() {
  const { pode } = useAcesso();
  const minhas = useMinhasReservas();
  const navegar = useNavigate();
  if (!pode('salas.ver')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Minhas reservas" />
        <SemPermissao a="às salas" />
      </>
    );
  }
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Minhas reservas" />
      {minhas.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando as reservas…
        </p>
      ) : minhas.isError ? (
        <EstadoVazio
          titulo={minhas.error.message}
          acao={<Botao onPress={() => void minhas.refetch()}>Tentar de novo</Botao>}
        />
      ) : minhas.data.reservas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma reserva nem convite."
          descricao="As reservas que você pedir e as reuniões para as quais for convidado aparecem aqui."
          acao={
            <Botao onPress={() => void navegar({ to: '/salas', search: { nova: 1 } })}>
              Nova reserva
            </Botao>
          }
        />
      ) : (
        <ul className={estilos.reservas} aria-label="Reservas e convites">
          {minhas.data.reservas.map((reserva) => (
            <CartaoDaReserva key={reserva.id} reserva={reserva} modo="minhas" />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Pedidos() {
  const { pode } = useAcesso();
  const pedidos = usePedidos();
  if (!pode('salas.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Pedidos" />
        <SemPermissao a="aos pedidos das salas" />
      </>
    );
  }
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Pedidos de reserva" />
      {pedidos.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando os pedidos…
        </p>
      ) : pedidos.isError ? (
        <EstadoVazio
          titulo={pedidos.error.message}
          acao={<Botao onPress={() => void pedidos.refetch()}>Tentar de novo</Botao>}
        />
      ) : pedidos.data.reservas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum pedido aguardando aprovação."
          descricao="Os pedidos de reserva chegam aqui e na sua central de notificações."
        />
      ) : (
        <ul className={estilos.reservas} aria-label="Pedidos aguardando aprovação">
          {pedidos.data.reservas.map((reserva) => (
            <CartaoDaReserva key={reserva.id} reserva={reserva} modo="pedidos" />
          ))}
        </ul>
      )}
    </div>
  );
}
