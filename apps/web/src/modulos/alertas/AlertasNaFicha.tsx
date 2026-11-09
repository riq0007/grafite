// O bloco Alertas na ficha do ativo (spec modulo-alertas, "Alertas na ficha do ativo"; change
// p3a-regras-e-alertas, design, decisão 11): entra pela relação do módulo com o alvo `ativo`, só
// para quem vê os alertas no local do ativo. Mostra os alertas abertos dele, com as ações de quem
// pode tratá-los, o caminho para os resolvidos e o silêncio, com o silenciar e o retomar.
import { ROTULOS_DAS_SEVERIDADES } from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeData,
  CampoDeTexto,
  Carimbo,
  Dialogo,
  GrupoDeRadios,
  idadeRelativa,
  LinhaDeCampos,
  MensagemDoPasso,
  Radio,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { itensDasPaginas } from '../../api/consultas.ts';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { useAgora } from '../../casca/status/useAgora.ts';
import { AcoesDoAlerta } from './AcoesDoAlerta.tsx';
import estilos from './Alertas.module.css';
import {
  type AlertaNaLista,
  CHAVE_DO_SILENCIO,
  CHAVE_DOS_ALERTAS,
  useAlertas,
  useSilencio,
} from './consultas.ts';
import { momentoDoSilencio } from './silencio.ts';

/** O alerta na ficha: a severidade, o texto, há quanto tempo e a situação, com as ações. */
function AlertaDoAtivo({ alerta, agora }: { alerta: AlertaNaLista; agora: Date }) {
  const { formatarHora } = useDataHora();
  const situacao = alerta.adiado
    ? `Adiado até ${formatarHora(new Date(alerta.adiado.ate))}`
    : alerta.reconhecido
      ? `Reconhecido por ${alerta.reconhecido.nome}`
      : 'Aberto';
  return (
    <li className={estilos.alertaDoAtivo}>
      <RotuloDeSituacao situacao={alerta.severidade}>
        {ROTULOS_DAS_SEVERIDADES[alerta.severidade]}
      </RotuloDeSituacao>
      <span className={estilos.textoDoAlerta}>{alerta.texto}</span>
      <time className="mono" dateTime={alerta.abertoEm}>
        {idadeRelativa(new Date(alerta.abertoEm), agora)}
      </time>
      <span className={estilos.situacaoNaFicha}>{situacao}</span>
      {alerta.permite.tratar && <AcoesDoAlerta alerta={alerta} />}
    </li>
  );
}

/** "Silenciar alertas": até uma data e hora, ou até alguém retomar, com o motivo. */
function SilenciarAlertas({ id, nome }: { id: string; nome?: string }) {
  const api = useApi();
  const consultas = useQueryClient();
  const { inicioDoDia } = useDataHora();
  const [aberto, definirAberto] = useState(false);
  const [ate, definirAte] = useState<'momento' | 'retomar'>('momento');
  const [dia, definirDia] = useState<string | null>(null);
  const [hora, definirHora] = useState('18:00');
  const [motivo, definirMotivo] = useState('');
  const [erros, definirErros] = useState<{ ate?: string; motivo?: string }>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  const silenciar = async (fechar: () => void) => {
    definirFalha(null);
    const momento = ate === 'retomar' ? null : momentoDoSilencio(dia, hora, inicioDoDia);
    if (ate === 'momento' && !momento) {
      definirErros({ ate: 'Escolha um momento no futuro, em até um ano.' });
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.PUT('/ativos/{id}/silencio', {
            params: { path: { id } },
            body: { ate: momento ? momento.toISOString() : null, motivo: motivo.trim() || null },
          }),
        'silenciar os alertas',
      );
      if ('erro' in resultado) {
        const campos = resultado.problema?.campos;
        if (campos?.ate || campos?.motivo) {
          definirErros({ ate: campos.ate, motivo: campos.motivo });
          return;
        }
        definirFalha(resultado.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      consultas.setQueryData([...CHAVE_DO_SILENCIO, id], resultado.dados);
      await consultas.invalidateQueries({ queryKey: CHAVE_DOS_ALERTAS });
      avisar({ situacao: 'sucesso', titulo: 'Alertas silenciados.' });
      fechar();
    } finally {
      definirEnviando(false);
    }
  };

  return (
    <Dialogo
      titulo={nome ? `Silenciar os alertas de ${nome}` : 'Silenciar os alertas do ativo'}
      gatilho={<Botao>Silenciar alertas</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        definirErros({});
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Silenciando"
            onPress={() => void silenciar(fechar)}
          >
            Silenciar
          </Botao>
        </>
      )}
    >
      <p className={estilos.informacao}>
        Os alertas do ativo continuam abrindo e se resolvendo, mas saem de "O que resolver agora"
        enquanto ele estiver silenciado.
      </p>
      <GrupoDeRadios
        rotulo="Até"
        value={ate}
        onChange={(valor) => {
          definirAte(valor as 'momento' | 'retomar');
          definirErros({});
        }}
      >
        <Radio value="momento">Uma data e hora</Radio>
        <Radio value="retomar">Até alguém retomar</Radio>
      </GrupoDeRadios>
      {ate === 'momento' && (
        <LinhaDeCampos>
          <CampoDeData
            rotulo="Data"
            valor={dia}
            aoMudar={(novo) => {
              definirDia(novo);
              definirErros({});
            }}
            erro={erros.ate}
          />
          <CampoDeTexto
            rotulo="Hora"
            inputMode="numeric"
            autoComplete="off"
            value={hora}
            onChange={(nova) => {
              definirHora(nova);
              definirErros({});
            }}
          />
        </LinhaDeCampos>
      )}
      <CampoDeTexto
        rotulo="Motivo"
        descricao="Opcional, como “Em manutenção”."
        autoComplete="off"
        value={motivo}
        onChange={(novo) => {
          definirMotivo(novo);
          definirErros({});
        }}
        erro={erros.motivo}
      />
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}

export function AlertasNaFicha({ id, nome }: { id: string; nome?: string }) {
  const api = useApi();
  const consultas = useQueryClient();
  const agora = useAgora();
  const { formatarDataEHora } = useDataHora();
  const silencio = useSilencio(id);
  const alertas = useAlertas({ situacao: 'abertos', ativo: id });
  const [retomando, definirRetomando] = useState(false);

  // Sem os alertas no local do ativo, ou enquanto o servidor não diz, o bloco não aparece.
  if (!silencio.data?.permite.ver) return null;
  const { permite } = silencio.data;
  const atual = silencio.data.silencio;
  const lista = itensDasPaginas(alertas.data);

  const retomar = async () => {
    definirRetomando(true);
    const resultado = await pedir(
      () => api.DELETE('/ativos/{id}/silencio', { params: { path: { id } } }),
      'retomar os alertas',
    );
    definirRetomando(false);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    consultas.setQueryData([...CHAVE_DO_SILENCIO, id], resultado.dados);
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_ALERTAS });
    avisar({ situacao: 'sucesso', titulo: 'Alertas retomados.' });
  };

  return (
    <section aria-labelledby={`alertas-${id}`} className={estilos.blocoDaFicha}>
      <Carimbo id={`alertas-${id}`}>Alertas</Carimbo>
      {alertas.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando os alertas…
        </p>
      ) : alertas.isError && !alertas.data ? (
        <p className={estilos.contagem}>{alertas.error.message}</p>
      ) : lista.length === 0 ? (
        <p className={estilos.contagem}>Nenhum alerta aberto.</p>
      ) : (
        <ul className={estilos.alertasDoAtivo}>
          {lista.map((alerta) => (
            <AlertaDoAtivo key={alerta.id} alerta={alerta} agora={agora} />
          ))}
        </ul>
      )}
      <div className={estilos.acoes}>
        <Link
          to="/alertas/resolvidos"
          search={{ ativo: id, ...(nome ? { nomeDoAtivo: nome } : {}) }}
          className={estilos.link}
        >
          Ver os resolvidos
        </Link>
      </div>
      {atual ? (
        <div className={estilos.silencio}>
          <p className={estilos.informacao}>
            {atual.ate
              ? `Alertas silenciados até ${formatarDataEHora(new Date(atual.ate))}`
              : 'Alertas silenciados até alguém retomar'}
          </p>
          {atual.motivo && <p className={estilos.contagem}>{atual.motivo}</p>}
          {permite.tratar && (
            <Botao carregando={retomando} rotuloCarregando="Retomando" onPress={retomar}>
              Retomar alertas
            </Botao>
          )}
        </div>
      ) : (
        permite.tratar && <SilenciarAlertas id={id} nome={nome} />
      )}
    </section>
  );
}
