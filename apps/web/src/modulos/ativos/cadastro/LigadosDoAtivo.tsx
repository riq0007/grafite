import type { components } from '@grafite/api-client';
import {
  avisar,
  Botao,
  Dialogo,
  EstadoVazio,
  MensagemDoPasso,
  MiniaturaDeAtivo,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { Parte, useFocoNoTitulo } from '../../administracao/Parte.tsx';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import estilos from '../Ativos.module.css';
import {
  CHAVE_DOS_LIGADOS,
  chaveDoAtivo,
  type FichaDoAtivo as Ficha,
  type LigadosDoAtivo as Ligados,
  useLigados,
} from '../consultas.ts';
import { imagensDoAtivo } from './imagens.ts';
import { situacaoDoAtivo } from './situacao.ts';

type AtivoLigado = components['schemas']['AtivoLigado'];

const FORA_DO_ACESSO = 'Ativo fora do seu acesso';

const rotuloDoLigado = (ativo: AtivoLigado) =>
  'foraDoAcesso' in ativo ? FORA_DO_ACESSO : ativo.rotulo;

/**
 * A aba Ligados da ficha (spec ligacoes-de-ativos): um grupo para cada campo do tipo ativo que
 * aponta para este, pelo nome do lado de lá, com até 100 ativos, e o "Ligado a", com as ligações
 * livres, que quem edita os dois ativos faz e desfaz. O ativo que a conta não vê aparece sem o nome
 * e sem abrir a ficha. A consulta é a do título da aba, e os eventos dos ativos a atualizam.
 */
export function LigadosDoAtivo({ ficha }: { ficha: Ficha }) {
  const ligados = useLigados(ficha.id);
  const { titulo, pedirFoco } = useFocoNoTitulo(ligados.data);

  if (ligados.isPending) {
    return (
      <p role="status" className={estilos.contagem}>
        Carregando os ativos ligados…
      </p>
    );
  }
  if (ligados.isError) {
    return (
      <EstadoVazio
        titulo={ligados.error.message}
        acao={<Botao onPress={() => void ligados.refetch()}>Tentar de novo</Botao>}
      />
    );
  }

  const { porCampos, livres, permite } = ligados.data;
  if (porCampos.length === 0 && livres.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum ativo ligado."
        acao={permite.ligar ? <LigarAOutroAtivo ficha={ficha} ligados={ligados.data} /> : undefined}
      />
    );
  }
  return (
    <div className={estilos.dadosDoAtivo}>
      {porCampos.map((grupo) => (
        <Parte
          key={grupo.campo.id}
          titulo={grupo.campo.ladoDeLa ?? `Pelo campo ${grupo.campo.rotulo}`}
        >
          <ul className={estilos.itens}>
            {grupo.ativos.map((ativo, posicao) => (
              <ItemLigado key={'id' in ativo ? ativo.id : `fora-${posicao}`} ativo={ativo} />
            ))}
          </ul>
          {grupo.total > grupo.ativos.length && (
            <p className={estilos.contagem}>
              {`Mostrando ${grupo.ativos.length.toLocaleString('pt-BR')} de ${grupo.total.toLocaleString('pt-BR')}.`}
            </p>
          )}
        </Parte>
      ))}
      {(livres.length > 0 || permite.ligar) && (
        <Parte titulo="Ligado a" refDoTitulo={titulo}>
          {livres.length === 0 ? (
            <p className={estilos.informacao}>Nenhuma ligação livre.</p>
          ) : (
            <ul className={estilos.itens}>
              {livres.map((ligacao) => (
                <ItemLigado
                  key={ligacao.id}
                  ativo={ligacao.outro}
                  acao={
                    ligacao.permite.desfazer && (
                      <DesfazerLigacao
                        ficha={ficha}
                        ligacaoId={ligacao.id}
                        outro={rotuloDoLigado(ligacao.outro)}
                        antes={pedirFoco}
                      />
                    )
                  }
                />
              ))}
            </ul>
          )}
          {permite.ligar && (
            <div className={estilos.acoes}>
              <LigarAOutroAtivo ficha={ficha} ligados={ligados.data} />
            </div>
          )}
        </Parte>
      )}
    </div>
  );
}

/**
 * Um ativo ligado: a miniatura, o nome, que abre a ficha dele, a situação, e o tipo, o patrimônio e
 * o local; fora do acesso, só o aviso.
 */
function ItemLigado({ ativo, acao }: { ativo: AtivoLigado; acao?: ReactNode }) {
  if ('foraDoAcesso' in ativo) {
    return (
      <li className={estilos.item}>
        <span className={estilos.ativoLigado}>
          <MiniaturaDeAtivo tipo="generico" />
          <span className={estilos.semValor}>{FORA_DO_ACESSO}</span>
        </span>
        {acao}
      </li>
    );
  }
  const situacao = situacaoDoAtivo(ativo);
  return (
    <li className={estilos.item}>
      <span className={estilos.ativoLigado}>
        <MiniaturaDeAtivo tipo={ativo.tipo.icone} {...imagensDoAtivo(ativo, 64)} />
        <span className={estilos.textoDoItem}>
          <span className={estilos.nomeDoItem}>
            <Link to="/ativos/$id" params={{ id: ativo.id }} className={estilos.link}>
              {ativo.rotulo}
            </Link>
            <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>
          </span>
          <span className={estilos.detalheDoItem}>
            {[ativo.tipo.nome, ativo.patrimonio, ativo.local?.caminho].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      {acao}
    </li>
  );
}

/** Depois de ligar ou desligar: os ligados dos dois ativos e o histórico deste. */
function useAtualizarLigacoes(ativoId: string) {
  const consultas = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      consultas.invalidateQueries({ queryKey: CHAVE_DOS_LIGADOS }),
      consultas.invalidateQueries({ queryKey: chaveDoAtivo(ativoId) }),
    ]);
  }, [consultas, ativoId]);
}

/**
 * "Ligar a outro ativo": a busca pelo nome, pelo patrimônio, pela série, pelo hostname e pelo
 * modelo, entre os ativos ativos que a conta pode editar, sem este e os já ligados a ele.
 */
function LigarAOutroAtivo({ ficha, ligados }: { ficha: Ficha; ligados: Ligados }) {
  const api = useApi();
  const atualizar = useAtualizarLigacoes(ficha.id);
  const [aberto, definirAberto] = useState(false);
  const [escolhido, definirEscolhido] = useState<ContaDoSeletor | null>(null);
  const [erro, definirErro] = useState<string | undefined>();
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const jaLigados = useMemo(
    () =>
      new Set(
        ligados.livres.flatMap((ligacao) => ('id' in ligacao.outro ? [ligacao.outro.id] : [])),
      ),
    [ligados.livres],
  );
  const buscar = useCallback(
    async (busca: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/ativos', {
        params: { query: { busca, limite: 20 } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      return data.itens
        .filter(
          (ativo) => ativo.id !== ficha.id && ativo.permite.editar && !jaLigados.has(ativo.id),
        )
        .map((ativo) => ({
          id: ativo.id,
          rotulo: ativo.patrimonio ? `${ativo.rotulo} · ${ativo.patrimonio}` : ativo.rotulo,
        }));
    },
    [api, ficha.id, jaLigados],
  );

  async function ligar() {
    definirFalha(null);
    if (!escolhido) return definirErro('Escolha o ativo.');
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/ativos/{id}/ligacoes', {
            params: { path: { id: ficha.id } },
            body: { outroId: escolhido.id },
          }),
        'ligar os ativos',
      );
      if ('erro' in resultado) {
        const noCampo = resultado.problema?.campos?.outroId;
        if (noCampo) definirErro(noCampo);
        else {
          definirFalha(resultado.erro);
          definirTentativa((atual) => atual + 1);
        }
        return;
      }
      definirAberto(false);
      await atualizar();
      avisar({ situacao: 'sucesso', titulo: 'Ativos ligados.' });
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo="Ligar a outro ativo"
      gatilho={<Botao>Ligar a outro ativo</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        if (!abrir) return;
        definirEscolhido(null);
        definirErro(undefined);
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao nivel="primario" carregando={enviando} rotuloCarregando="Ligando" onPress={ligar}>
            Ligar
          </Botao>
        </>
      )}
    >
      <SeletorDeConta
        rotulo="Ativo"
        obrigatorio
        descricao="Busque pelo nome, pelo patrimônio, pela série, pelo hostname ou pelo modelo."
        valor={escolhido}
        aoMudar={(ativo) => {
          definirEscolhido(ativo);
          definirErro(undefined);
        }}
        buscar={buscar}
        erro={erro}
      />
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}

/** "Desfazer ligação", confirmado: a ligação sai das fichas dos dois e fica no histórico. */
function DesfazerLigacao({
  ficha,
  ligacaoId,
  outro,
  antes,
}: {
  ficha: Ficha;
  ligacaoId: string;
  outro: string;
  /** Antes de a ligação sair, para o foco perdido ir ao título do "Ligado a". */
  antes: () => void;
}) {
  const api = useApi();
  const atualizar = useAtualizarLigacoes(ficha.id);
  return (
    <Confirmacao
      acao="Desfazer ligação"
      nomeDoGatilho={`Desfazer a ligação com ${outro}`}
      titulo={`Desfazer a ligação com ${outro}?`}
      confirmando="Desfazendo"
      fazer={async () => {
        const resultado = await pedir(
          () =>
            api.DELETE('/ativos/{id}/ligacoes/{ligacaoId}', {
              params: { path: { id: ficha.id, ligacaoId } },
            }),
          'desfazer a ligação',
        );
        if ('erro' in resultado) return resultado;
        // A lista se relê depois de a confirmação fechar: o foco volta ao botão e, quando a
        // ligação sai, vai ao título do "Ligado a".
        antes();
        void atualizar();
        avisar({ situacao: 'sucesso', titulo: 'Ligação desfeita.' });
        return { ok: true };
      }}
    >
      <p className={estilos.informacao}>
        A ligação sai das fichas dos dois ativos e fica no histórico.
      </p>
    </Confirmacao>
  );
}
