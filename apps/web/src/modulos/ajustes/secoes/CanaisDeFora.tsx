// Os canais de fora na seção Notificações (spec ajustes-do-sistema, "Seção Notificações", e
// notificacoes, "Aparelhos do push", "Teste dos canais" e "Canais desligados sem configuração";
// change p3c-email-e-push, design, decisões 4, 8 e 9): o grupo "Por e-mail", com o e-mail da
// pessoa, o crítico na hora, o resumo e o teste; e o grupo "No celular", com as severidades, a
// inscrição deste aparelho, os aparelhos da conta e o teste. O motivo de um canal não funcionar
// aparece em texto. Nos padrões da organização, só as escolhas aparecem.
import type { components } from '@grafite/api-client';
import type { ResumoPorEmail } from '@grafite/domain';
import {
  avisar,
  Botao,
  Checkbox,
  ControleSegmentado,
  GrupoDeCheckboxes,
  Interruptor,
  Segmento,
  useDataHora,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAmbienteDoPush } from '../../../notificacoes/ambienteDoPush.tsx';
import {
  cancelarEsteAparelho,
  enderecoDesteAparelho,
  inscreverEsteAparelho,
  type SuporteAoPush,
  suporteAoPush,
} from '../../../notificacoes/push.ts';
import { useAlvoDasPreferencias, useAlvoEhAConta } from '../../../preferencias/alvo.tsx';
import estilos from './Secoes.module.css';

type Canais = components['schemas']['CanaisDaConta'];
type Aparelho = Canais['push']['aparelhos'][number];

export const CHAVE_DOS_CANAIS = ['conta', 'canais'] as const;

const NO_TESTE = 'O ambiente de teste não envia e-mail nem avisos no celular.';

const TEXTOS_DO_EMAIL: Record<Exclude<Canais['email']['situacao'], 'ligado'>, string> = {
  'sem-email':
    'A pessoa da sua conta não tem e-mail. Peça à administração para cadastrar o seu e-mail.',
  'sem-configuracao': 'O envio de e-mail não está configurado neste servidor.',
  'ambiente-de-teste': NO_TESTE,
};

const TEXTOS_DO_PUSH: Record<Exclude<Canais['push']['situacao'], 'ligado'>, string> = {
  'sem-configuracao': 'Os avisos no celular não estão configurados neste servidor.',
  'ambiente-de-teste': NO_TESTE,
};

const TEXTOS_DO_SUPORTE: Record<Exclude<SuporteAoPush, 'ok'>, string> = {
  'sem-push': 'Este navegador não recebe avisos fora da aplicação.',
  'iphone-fora-do-app':
    'No iPhone e no iPad, os avisos chegam com o Grafite instalado na tela de início.',
  bloqueado:
    'Os avisos estão bloqueados neste navegador. Libere as notificações do Grafite nas configurações do site.',
};

/** O grupo de um canal, nomeado pelo título dele. */
function GrupoDoCanal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className={estilos.grupoDoCanal}>
      <legend className={estilos.tituloDoCanal}>{titulo}</legend>
      {children}
    </fieldset>
  );
}

/** As escolhas do e-mail: o crítico na hora e o resumo das outras. */
function EscolhasDoEmail({ desligadas }: { desligadas: boolean }) {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { emailCritico, resumo } = preferencias.notificacoes;
  return (
    <>
      <Interruptor
        data-foco="email-do-critico"
        isSelected={emailCritico}
        isDisabled={desligadas}
        onChange={(ligado) => mudar('notificacoes', { emailCritico: ligado })}
        descricao="Cada notificação crítica vai por e-mail assim que chega."
      >
        Crítico na hora
      </Interruptor>
      <ControleSegmentado
        rotulo="Resumo das outras"
        data-foco="resumo-por-email"
        value={resumo}
        isDisabled={desligadas}
        onChange={(valor) => mudar('notificacoes', { resumo: valor as ResumoPorEmail })}
        descricao="As não lidas que não foram por e-mail vão num e-mail só, às 8h."
      >
        <Segmento value="desligado">Desligado</Segmento>
        <Segmento value="diario">Diário, às 8h</Segmento>
      </ControleSegmentado>
    </>
  );
}

/** As severidades que vão para o push, em todos os aparelhos da conta. */
function EscolhasDoPush({ desligadas }: { desligadas: boolean }) {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { pushCritico, pushAtencao, pushInformacao } = preferencias.notificacoes;
  const escolhidas = [
    ...(pushCritico ? ['critico'] : []),
    ...(pushAtencao ? ['atencao'] : []),
    ...(pushInformacao ? ['info'] : []),
  ];
  return (
    <GrupoDeCheckboxes
      rotulo="Severidades no celular"
      data-foco="avisos-no-celular"
      value={escolhidas}
      isDisabled={desligadas}
      onChange={(valores) =>
        mudar('notificacoes', {
          pushCritico: valores.includes('critico'),
          pushAtencao: valores.includes('atencao'),
          pushInformacao: valores.includes('info'),
        })
      }
      descricao="Os avisos chegam pelo sistema do aparelho, mesmo com o Grafite fechado. Com o Foco ligado, só o Crítico vai para o celular."
    >
      <Checkbox value="critico">Crítico</Checkbox>
      <Checkbox value="atencao">Atenção</Checkbox>
      <Checkbox value="info">Informação</Checkbox>
    </GrupoDeCheckboxes>
  );
}

export function CanaisDeFora() {
  const daConta = useAlvoEhAConta();
  if (daConta) return <CanaisDaConta />;
  return (
    <>
      <GrupoDoCanal titulo="Por e-mail">
        <EscolhasDoEmail desligadas={false} />
      </GrupoDoCanal>
      <GrupoDoCanal titulo="No celular">
        <EscolhasDoPush desligadas={false} />
      </GrupoDoCanal>
    </>
  );
}

/** Os canais da conta da sessão: o que cada um tem, os aparelhos e os testes. */
function CanaisDaConta() {
  const api = useApi();
  const consultas = useQueryClient();
  const ambiente = useAmbienteDoPush();
  const { formatarData } = useDataHora();
  const canais = useQuery({
    queryKey: CHAVE_DOS_CANAIS,
    queryFn: ({ signal }) =>
      consultar(() => api.GET('/conta/canais', { signal }), 'carregar o e-mail e os avisos'),
  });
  const [suporte, definirSuporte] = useState(() => suporteAoPush(ambiente));
  const [ocupado, definirOcupado] = useState<string | null>(null);
  // O endereço da inscrição deste aparelho, que marca "Este aparelho", lido de novo a cada leitura
  // dos canais.
  const deste =
    useQuery({
      queryKey: [...CHAVE_DOS_CANAIS, 'deste-aparelho', canais.dataUpdatedAt],
      queryFn: () => enderecoDesteAparelho(ambiente),
    }).data ?? null;

  const reler = () => consultas.invalidateQueries({ queryKey: CHAVE_DOS_CANAIS });

  const email = canais.data?.email;
  const push = canais.data?.push;
  const emailLigado = email?.situacao === 'ligado';
  const pushLigado = push?.situacao === 'ligado';
  const aparelhos = pushLigado ? (push?.aparelhos ?? []) : [];
  const esteInscrito = deste !== null && aparelhos.some(({ endpoint }) => endpoint === deste);

  async function fazer(chave: string, acao: () => Promise<void>) {
    definirOcupado(chave);
    try {
      await acao();
    } catch (erro) {
      avisar({ situacao: 'critico', titulo: (erro as Error).message });
    } finally {
      definirOcupado(null);
    }
  }

  const receber = () =>
    fazer('receber', async () => {
      if (!push?.chavePublica) return;
      const resultado = await inscreverEsteAparelho(ambiente, push.chavePublica, async (corpo) => {
        const gravado = await pedir(
          () => api.POST('/conta/push', { body: corpo }),
          'inscrever o aparelho',
        );
        if ('erro' in gravado) throw new Error(gravado.erro);
      });
      definirSuporte(suporteAoPush(ambiente));
      if (resultado === 'inscrito') await reler();
    });

  const tirar = (aparelho: Aparelho) =>
    fazer(aparelho.id, async () => {
      const tirado = await pedir(
        () => api.DELETE('/conta/push/{id}', { params: { path: { id: aparelho.id } } }),
        'tirar o aparelho',
      );
      if ('erro' in tirado) throw new Error(tirado.erro);
      if (aparelho.endpoint === deste) await cancelarEsteAparelho(ambiente);
      await reler();
    });

  const testarEmail = () =>
    fazer('teste-do-email', async () => {
      const resultado = await pedir(
        () => api.POST('/conta/canais/email/teste'),
        'mandar o e-mail de teste',
      );
      if ('erro' in resultado) throw new Error(resultado.erro);
      avisar({
        situacao: 'sucesso',
        titulo: `E-mail de teste enviado para ${resultado.dados.endereco}.`,
      });
    });

  const testarPush = () =>
    fazer('teste-do-push', async () => {
      const resultado = await pedir(
        () => api.POST('/conta/canais/push/teste'),
        'mandar o aviso de teste',
      );
      if ('erro' in resultado) throw new Error(resultado.erro);
      const quantos = resultado.dados.aparelhos;
      avisar({
        situacao: 'sucesso',
        titulo: `Aviso de teste enviado para ${quantos} ${quantos === 1 ? 'aparelho' : 'aparelhos'}.`,
      });
      await reler();
    });

  // Enquanto o servidor não diz o que cada canal tem, os grupos aparecem com o motivo em texto e
  // os ajustes desligados.
  const falha = canais.isError ? canais.error.message : null;
  const situacaoDaLeitura = canais.isPending ? 'Carregando o e-mail e os avisos…' : falha;

  const textoDoEmail =
    situacaoDaLeitura ??
    (email?.situacao === 'ligado'
      ? `As notificações vão para ${email.endereco}.`
      : TEXTOS_DO_EMAIL[email?.situacao ?? 'sem-configuracao']);
  const textoDoPush =
    situacaoDaLeitura ??
    (push?.situacao !== 'ligado'
      ? TEXTOS_DO_PUSH[
          push?.situacao === 'ambiente-de-teste' ? 'ambiente-de-teste' : 'sem-configuracao'
        ]
      : suporte !== 'ok'
        ? TEXTOS_DO_SUPORTE[suporte]
        : esteInscrito
          ? 'Este aparelho recebe os avisos.'
          : 'Este aparelho ainda não recebe os avisos.');

  return (
    <>
      <GrupoDoCanal titulo="Por e-mail">
        <p role={canais.isPending ? 'status' : undefined} className={estilos.informacao}>
          {textoDoEmail}
        </p>
        {falha && (
          <div>
            <Botao onPress={() => void canais.refetch()}>Tentar de novo</Botao>
          </div>
        )}
        <EscolhasDoEmail desligadas={!emailLigado} />
        {emailLigado && (
          <div className={estilos.acoesDaParte}>
            <Botao
              carregando={ocupado === 'teste-do-email'}
              rotuloCarregando="Mandando"
              onPress={testarEmail}
            >
              Mandar um e-mail de teste
            </Botao>
          </div>
        )}
      </GrupoDoCanal>

      <GrupoDoCanal titulo="No celular">
        <p className={estilos.informacao}>{textoDoPush}</p>
        <EscolhasDoPush desligadas={!pushLigado} />
        {aparelhos.length > 0 && (
          <ul aria-label="Aparelhos que recebem os avisos" className={estilos.sessoes}>
            {aparelhos.map((aparelho) => (
              <li key={aparelho.id} className={estilos.sessao}>
                <p className={estilos.cabecalhoDaSessao}>
                  <strong id={`aparelho-${aparelho.id}`}>{aparelho.aparelho}</strong>
                  {aparelho.endpoint === deste && (
                    <span className={estilos.marca}>Este aparelho</span>
                  )}
                </p>
                <p className={estilos.informacao}>
                  Desde {formatarData(new Date(aparelho.criadaEm))}
                </p>
                <div>
                  <Botao
                    aria-describedby={`aparelho-${aparelho.id}`}
                    carregando={ocupado === aparelho.id}
                    rotuloCarregando="Tirando"
                    onPress={() => tirar(aparelho)}
                  >
                    Tirar
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pushLigado && (
          <div className={estilos.acoesDaParte}>
            {suporte === 'ok' && !esteInscrito && (
              <Botao
                carregando={ocupado === 'receber'}
                rotuloCarregando="Inscrevendo"
                onPress={receber}
              >
                Receber neste aparelho
              </Botao>
            )}
            {aparelhos.length > 0 && (
              <Botao
                carregando={ocupado === 'teste-do-push'}
                rotuloCarregando="Mandando"
                onPress={testarPush}
              >
                Mandar um aviso de teste
              </Botao>
            )}
          </div>
        )}
      </GrupoDoCanal>
    </>
  );
}
