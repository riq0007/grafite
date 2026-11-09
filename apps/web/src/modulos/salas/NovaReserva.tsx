// A Nova reserva (spec modulo-salas, "Nova reserva"; change salas-de-reuniao, design, decisão 6):
// numa gaveta, a sala, o dia, o início e o fim, o assunto, o comentário, os participantes, buscados
// pelo nome, e os itens solicitáveis. A conferência é a do domínio, a mesma da API, e a recusa fica
// no campo; o horário ocupado volta da API no início.
import { type CampoDaReserva, conferirReserva } from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeData,
  CampoDeTexto,
  Checkbox,
  Gaveta,
  GrupoDeCheckboxes,
  LinhaDeCampos,
  MensagemDoPasso,
  Selecao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { useSessao } from '../../sessao/useSessao.tsx';
import { recusaDe } from '../administracao/recusa.ts';
import { SeletorDeConta } from '../administracao/seletores/SeletorDeConta.tsx';
import { CHAVE_DAS_SALAS, useCadastroDasSalas } from './consultas.ts';
import estilos from './Salas.module.css';

/** O começo da reserva, quando ela vem de um horário livre da Agenda. */
export interface InicioDaReserva {
  salaId: string | null;
  /** `aaaa-mm-dd`. */
  dia: string;
  /** `hh:mm`. */
  inicio: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** O momento do dia e da hora no fuso do navegador, em ISO, ou vazio. */
function momentoEm(dia: string, horaEscrita: string): string {
  if (!HORA.test(horaEscrita.trim())) return '';
  const lido = new Date(`${dia}T${horaEscrita.trim()}:00`);
  return Number.isNaN(lido.getTime()) ? '' : lido.toISOString();
}

/** Uma hora depois, para o fim começar com uma reunião de uma hora. */
function umaHoraDepois(inicio: string): string {
  const [horas = 0, minutos = 0] = inicio.split(':').map(Number);
  return `${String(Math.min(horas + 1, 23)).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

export function NovaReserva({
  inicial,
  aoFechar,
}: {
  inicial: InicioDaReserva;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const sessao = useSessao();
  const contaId = sessao.tipo === 'ativa' ? sessao.conta.id : null;
  const cadastro = useCadastroDasSalas();
  const [salaId, definirSalaId] = useState(inicial.salaId);
  const [dia, definirDia] = useState(inicial.dia);
  const [inicio, definirInicio] = useState(inicial.inicio);
  const [fim, definirFim] = useState(umaHoraDepois(inicial.inicio));
  const [assunto, definirAssunto] = useState('');
  const [comentario, definirComentario] = useState('');
  const [participantes, definirParticipantes] = useState<{ id: string; rotulo: string }[]>([]);
  const [itens, definirItens] = useState<string[]>([]);
  const [erros, definirErros] = useState<Partial<Record<CampoDaReserva, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const administra = pode('salas.administrar');

  const buscarContas = useCallback(
    async (texto: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/salas/convidaveis', {
        params: { query: { busca: texto } },
        signal: sinal,
      });
      if (!data) throw new Error(error ? 'Não foi possível buscar as pessoas.' : 'Sem conexão.');
      return {
        itens: data.contas.map((conta) => ({ id: conta.id, rotulo: conta.nome })),
        total: data.contas.length,
      };
    },
    [api],
  );

  const limpar = (...campos: CampoDaReserva[]) =>
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const campo of campos) delete restantes[campo];
      return restantes;
    });

  async function enviar() {
    if (enviando) return;
    definirFalha(null);
    const pedido = {
      salaId: salaId ?? '',
      inicio: momentoEm(dia, inicio),
      fim: momentoEm(dia, fim),
      assunto,
      comentario,
      participantes: participantes.map(({ id }) => id),
      itens,
    };
    const conferida = conferirReserva(pedido, { agora: new Date(), quemPede: contaId ?? '' });
    if (!conferida.ok) {
      definirErros(conferida.erros);
      return;
    }
    definirEnviando(true);
    const resultado = await pedir(
      () =>
        api.POST('/salas/reservas', {
          body: { ...pedido, comentario: comentario.trim() === '' ? null : comentario },
        }),
      'pedir a reserva',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<CampoDaReserva>(resultado);
      if (campos && Object.keys(campos).length > 0) {
        definirErros(campos);
        return;
      }
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo: resultado.dados.situacao === 'aprovada' ? 'Reserva feita.' : 'Reserva pedida.',
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SALAS });
    aoFechar();
  }

  const salasAtivas = (cadastro.data?.salas ?? []).filter((sala) => sala.situacao === 'ativo');
  const itensAtivos = (cadastro.data?.itens ?? []).filter((item) => item.situacao === 'ativo');

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Nova reserva"
    >
      <div className={estilos.formulario}>
        <Selecao
          rotulo="Sala"
          obrigatorio
          placeholder="Escolha a sala"
          opcoes={salasAtivas.map((sala) => ({
            id: sala.id,
            rotulo: sala.capacidade ? `${sala.nome} · ${sala.capacidade} lugares` : sala.nome,
          }))}
          selectedKey={salaId}
          onSelectionChange={(chave) => {
            definirSalaId(chave === null ? null : String(chave));
            limpar('sala');
          }}
          erro={erros.sala}
        />
        <LinhaDeCampos>
          <CampoDeData
            rotulo="Dia"
            obrigatorio
            valor={dia}
            aoMudar={(valor) => {
              if (valor) definirDia(valor);
              limpar('inicio', 'fim');
            }}
          />
          <CampoDeTexto
            rotulo="Início"
            obrigatorio
            descricao="Como 14:00."
            value={inicio}
            onChange={(valor) => {
              definirInicio(valor);
              limpar('inicio', 'fim');
            }}
            erro={erros.inicio}
          />
          <CampoDeTexto
            rotulo="Fim"
            obrigatorio
            descricao="Como 15:00."
            value={fim}
            onChange={(valor) => {
              definirFim(valor);
              limpar('fim');
            }}
            erro={erros.fim}
          />
        </LinhaDeCampos>
        <CampoDeTexto
          rotulo="Assunto"
          obrigatorio
          value={assunto}
          onChange={(valor) => {
            definirAssunto(valor);
            limpar('assunto');
          }}
          erro={erros.assunto}
        />
        <CampoDeTexto
          rotulo="Comentário"
          descricao="Opcional: a pauta, quem vem de fora ou o que a sala precisa ter."
          value={comentario}
          onChange={(valor) => {
            definirComentario(valor);
            limpar('comentario');
          }}
          erro={erros.comentario}
        />
        <div className={estilos.participantes}>
          <SeletorDeConta
            rotulo="Participantes"
            descricao="Busque pelo nome; cada um recebe o convite quando a reserva é aprovada."
            valor={null}
            aoMudar={(conta) => {
              if (conta && !participantes.some(({ id }) => id === conta.id)) {
                definirParticipantes((atuais) => [...atuais, conta]);
              }
              limpar('participantes');
            }}
            buscar={buscarContas}
            erro={erros.participantes}
          />
          {participantes.length > 0 && (
            <ul className={estilos.convidados} aria-label="Participantes convidados">
              {participantes.map((participante) => (
                <li key={participante.id} className={estilos.convidado}>
                  <span>{participante.rotulo}</span>
                  <Botao
                    nivel="terciario"
                    aria-label={`Tirar ${participante.rotulo}`}
                    onPress={() =>
                      definirParticipantes((atuais) =>
                        atuais.filter(({ id }) => id !== participante.id),
                      )
                    }
                  >
                    Tirar
                  </Botao>
                </li>
              ))}
            </ul>
          )}
        </div>
        {itensAtivos.length > 0 && (
          <GrupoDeCheckboxes
            rotulo="Equipamentos"
            descricao="O TI deixa na sala o que a reunião precisa."
            value={itens}
            onChange={(valor) => {
              definirItens(valor);
              limpar('itens');
            }}
            erro={erros.itens}
          >
            {itensAtivos.map((item) => (
              <Checkbox key={item.id} value={item.id}>
                {item.nome}
              </Checkbox>
            ))}
          </GrupoDeCheckboxes>
        )}
        <MensagemDoPasso texto={falha} chave={tentativa} />
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Enviando"
            onPress={() => void enviar()}
          >
            {administra ? 'Reservar' : 'Pedir reserva'}
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}
