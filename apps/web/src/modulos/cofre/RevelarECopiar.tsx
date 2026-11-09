import {
  Botao,
  CampoDeTexto,
  copiarParaAreaDeTransferencia,
  Dialogo,
  MensagemDoPasso,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { Parte } from '../administracao/Parte.tsx';
import estilos from './Cofre.module.css';
import { CHAVE_DA_LIBERACAO, type FichaDoSegredo, useLiberacao } from './consultas.ts';

type Pedido = 'revelacao' | 'copia';

/** Quanto tempo o valor revelado fica na tela. */
const VALOR_NA_TELA = 30_000;

const ACAO: Record<Pedido, string> = { revelacao: 'revelar o segredo', copia: 'copiar o segredo' };

/**
 * Revelar e copiar na ficha (spec modulo-cofre, "Revelar e copiar na tela"; design do P6, decisão
 * 12). Com o cofre fechado, a ação pede o código do app e continua sozinha depois dele. O valor
 * revelado vive só neste componente: some depois de 30 segundos ou ao sair da ficha, e nunca vai
 * para o cache das consultas. Copiar põe o valor na área de transferência sem mostrá-lo.
 */
export function RevelarECopiar({ segredo }: { segredo: FichaDoSegredo }) {
  const api = useApi();
  const consultas = useQueryClient();
  const liberacao = useLiberacao();
  const { formatarHora } = useDataHora();
  const [valor, definirValor] = useState<string | null>(null);
  const [copiado, definirCopiado] = useState(false);
  const [emAndamento, definirEmAndamento] = useState<Pedido | null>(null);
  const [aguardando, definirAguardando] = useState<Pedido | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [, redesenhar] = useReducer((vezes: number) => vezes + 1, 0);

  // O valor sai da tela depois de 30 segundos.
  useEffect(() => {
    if (valor === null) return;
    const espera = setTimeout(() => definirValor(null), VALOR_NA_TELA);
    return () => clearTimeout(espera);
  }, [valor]);

  // A liberação acaba no horário dela: a tela redesenha e deixa de dizer "liberado".
  const ate = liberacao.data?.liberadoAte ? new Date(liberacao.data.liberadoAte) : null;
  const fimDaLiberacao = ate?.getTime() ?? null;
  useEffect(() => {
    if (fimDaLiberacao === null) return;
    const falta = fimDaLiberacao - Date.now();
    if (falta <= 0) return;
    const espera = setTimeout(redesenhar, falta + 1);
    return () => clearTimeout(espera);
  }, [fimDaLiberacao]);
  const liberado = ate !== null && ate.getTime() > Date.now();

  async function executar(pedido: Pedido) {
    definirFalha(null);
    definirEmAndamento(pedido);
    try {
      const naFicha = { params: { path: { id: segredo.id } } };
      const resultado = await pedir(
        () =>
          pedido === 'revelacao'
            ? api.POST('/cofre/segredos/{id}/revelacao', naFicha)
            : api.POST('/cofre/segredos/{id}/copia', naFicha),
        ACAO[pedido],
      );
      if ('erro' in resultado) {
        if (resultado.codigo === 'cofre-fechado') {
          consultas.setQueryData(CHAVE_DA_LIBERACAO, { liberadoAte: null });
          definirAguardando(pedido);
          return;
        }
        // O segredo que não abre é um problema da configuração do servidor: a frase diz qual.
        definirFalha(
          resultado.codigo === 'segredo-nao-abre'
            ? (resultado.problema?.detail ?? resultado.erro)
            : resultado.erro,
        );
        definirTentativa((atual) => atual + 1);
        return;
      }
      if (pedido === 'revelacao') {
        definirValor(resultado.dados.valor);
        return;
      }
      try {
        await copiarParaAreaDeTransferencia(resultado.dados.valor);
        definirCopiado(true);
      } catch {
        definirFalha('Não foi possível copiar. Revele o valor e copie.');
        definirTentativa((atual) => atual + 1);
      }
    } finally {
      definirEmAndamento(null);
    }
  }

  const botaoDeCopiar = (
    <Botao
      icone={copiado ? Check : Copy}
      carregando={emAndamento === 'copia'}
      rotuloCarregando="Copiando"
      onPress={() => void executar('copia')}
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </Botao>
  );

  return (
    <Parte titulo="Valor">
      {liberado && ate && (
        <p className={estilos.informacao}>Cofre liberado até {formatarHora(ate)}</p>
      )}
      {valor !== null && <p className={estilos.valor}>{valor}</p>}
      <div className={estilos.acoes}>
        {valor === null ? (
          <Botao
            icone={Eye}
            carregando={emAndamento === 'revelacao'}
            rotuloCarregando="Revelando"
            onPress={() => void executar('revelacao')}
          >
            Revelar
          </Botao>
        ) : (
          <Botao icone={EyeOff} onPress={() => definirValor(null)}>
            Ocultar
          </Botao>
        )}
        {botaoDeCopiar}
      </div>
      {/* "Copiado." só para o leitor de tela, que não ouve a troca do nome do botão. */}
      <p role="status" className={estilos.somenteLeitor}>
        {copiado ? 'Copiado.' : null}
      </p>
      <MensagemDoPasso texto={falha} chave={tentativa} />
      <PedidoDoCodigo
        aberto={aguardando !== null}
        aoCancelar={() => definirAguardando(null)}
        aoLiberar={(liberadoAte) => {
          consultas.setQueryData(CHAVE_DA_LIBERACAO, { liberadoAte });
          const pedido = aguardando;
          definirAguardando(null);
          if (pedido) void executar(pedido);
        }}
      />
    </Parte>
  );
}

/**
 * O pedido do código do app, que libera o cofre nesta sessão por 5 minutos. O código de
 * recuperação não serve: a API recusa, e o texto dela aparece aqui.
 */
function PedidoDoCodigo({
  aberto,
  aoCancelar,
  aoLiberar,
}: {
  aberto: boolean;
  aoCancelar: () => void;
  aoLiberar: (liberadoAte: string) => void;
}) {
  const api = useApi();
  const [codigo, definirCodigo] = useState('');
  const [erro, definirErro] = useState<string | undefined>();
  const [enviando, definirEnviando] = useState(false);
  const limpar = () => {
    definirCodigo('');
    definirErro(undefined);
  };

  async function confirmar() {
    if (codigo.trim() === '') return definirErro('Informe o código.');
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () => api.POST('/cofre/liberacao', { body: { codigo } }),
        'liberar o cofre',
      );
      if ('erro' in resultado) {
        definirErro(resultado.erro);
        return;
      }
      limpar();
      if (resultado.dados.liberadoAte) aoLiberar(resultado.dados.liberadoAte);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo="Confirme o código do app"
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        if (abrir) return;
        limpar();
        aoCancelar();
      }}
      acoes={() => (
        <>
          <Botao
            onPress={() => {
              limpar();
              aoCancelar();
            }}
          >
            Cancelar
          </Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Confirmando"
            onPress={() => void confirmar()}
          >
            Confirmar
          </Botao>
        </>
      )}
    >
      <p className={estilos.informacao}>
        Revelar e copiar ficam liberados por 5 minutos nesta sessão.
      </p>
      <CampoDeTexto
        rotulo="Código do app"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={codigo}
        onChange={(novo) => {
          definirCodigo(novo);
          definirErro(undefined);
        }}
        erro={erro}
      />
    </Dialogo>
  );
}
