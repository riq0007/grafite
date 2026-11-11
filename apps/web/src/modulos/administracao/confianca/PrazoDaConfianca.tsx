// O prazo da confiança nos aparelhos na administração (specs perfis-e-grupos e
// administracao-de-pessoas; change aparelho-confiavel, design, decisão 6): o mesmo campo na
// organização, no perfil e na conta, com a escolha entre seguir o nível de cima, pedir o código em
// toda entrada ou um número de dias, num diálogo que diz o efeito antes de salvar.
import { MENSAGENS_DA_CONFIANCA, prazoValido, textoDosDias } from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeTexto,
  Dialogo,
  GrupoDeRadios,
  MensagemDoPasso,
  Radio,
} from '@grafite/ui';
import { useState } from 'react';
import estilos from '../Administracao.module.css';

/** O prazo depois de "Confiança nos aparelhos:": os dias, "em toda entrada" ou o que ele segue. */
export function textoDoPrazoCurto(dias: number | null, seguindo = 'segue a organização'): string {
  if (dias === null) return seguindo;
  return dias === 0 ? 'em toda entrada' : textoDosDias(dias);
}

/** O prazo numa célula de lista: os dias, "Em toda entrada" ou o travessão de quem segue. */
export function textoDoPrazoNaLista(dias: number | null): string {
  if (dias === null) return '—';
  return dias === 0 ? 'Em toda entrada' : textoDosDias(dias);
}

export const EFEITO_DA_MUDANCA =
  'Reduzir o prazo, ou pedir o código sempre, vale já na entrada seguinte de cada conta.';

type Escolha = 'seguir' | 'sempre' | 'dias';

export interface PropsDoPrazo {
  /** O título do diálogo, como "Prazo da confiança da organização". */
  titulo: string;
  /** O prazo gravado: `null` segue o nível de cima. */
  valor: number | null;
  /** O texto de seguir o nível de cima, como "Seguir a organização"; sem ele, não há o que seguir. */
  seguir?: string;
  /** Grava o prazo escolhido; o diálogo fecha com o retorno "Prazo da confiança alterado.". */
  salvar: (dias: number | null) => Promise<{ ok: true } | { erro: string }>;
}

/** "Mudar…" e o diálogo do prazo, com o efeito da mudança antes de salvar. */
export function MudarOPrazo({ titulo, valor, seguir, salvar }: PropsDoPrazo) {
  const escolhaDe = (atual: number | null): Escolha =>
    atual === null ? (seguir ? 'seguir' : 'dias') : atual === 0 ? 'sempre' : 'dias';
  const [aberto, definirAberto] = useState(false);
  const [escolha, definirEscolha] = useState<Escolha>(() => escolhaDe(valor));
  const [dias, definirDias] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [salvando, definirSalvando] = useState(false);

  function mudarAberto(abrir: boolean) {
    if (abrir) {
      // O diálogo abre com o que está gravado.
      definirEscolha(escolhaDe(valor));
      definirDias(valor !== null && valor > 0 ? String(valor) : '');
      definirErro(null);
      definirFalha(null);
    }
    definirAberto(abrir);
  }

  async function confirmar() {
    let novo: number | null = null;
    if (escolha === 'sempre') novo = 0;
    else if (escolha === 'dias') {
      const numero = Number(dias.trim());
      if (dias.trim() === '' || !prazoValido(numero)) {
        definirErro(MENSAGENS_DA_CONFIANCA.prazo);
        return;
      }
      novo = numero;
    }
    definirSalvando(true);
    const resultado = await salvar(novo);
    definirSalvando(false);
    if ('erro' in resultado) {
      definirFalha(resultado.erro);
      definirTentativa((anterior) => anterior + 1);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: 'Prazo da confiança alterado.' });
    definirAberto(false);
  }

  return (
    <Dialogo
      gatilho={<Botao nivel="terciario">Mudar…</Botao>}
      titulo={titulo}
      aberto={aberto}
      aoMudarAberto={mudarAberto}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={salvando}
            rotuloCarregando="Salvando"
            onPress={() => void confirmar()}
          >
            Salvar
          </Botao>
        </>
      )}
    >
      <div className={estilos.formularioDoPrazo}>
        <GrupoDeRadios
          rotulo="Prazo"
          value={escolha}
          onChange={(nova) => {
            definirEscolha(nova as Escolha);
            definirErro(null);
          }}
        >
          {seguir && <Radio value="seguir">{seguir}</Radio>}
          <Radio value="sempre">Pedir o código em toda entrada</Radio>
          <Radio value="dias">Um número de dias</Radio>
        </GrupoDeRadios>
        {escolha === 'dias' && (
          <CampoDeTexto
            rotulo="Dias"
            inputMode="numeric"
            value={dias}
            onChange={(texto) => {
              definirDias(texto);
              definirErro(null);
            }}
            erro={erro ?? undefined}
          />
        )}
        <p className={estilos.informacao}>{EFEITO_DA_MUDANCA}</p>
        <MensagemDoPasso texto={falha} chave={tentativa} />
      </div>
    </Dialogo>
  );
}
