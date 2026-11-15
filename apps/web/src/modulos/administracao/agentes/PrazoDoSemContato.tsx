// O prazo do sem contato (spec inventario-pelo-agente, "Agente sem contato"; change
// software-por-pacote, decisão 9): de 1 a 30 dias, com 2 de fábrica, no cabeçalho da tela dos
// agentes, como o prazo da confiança nos Perfis: "Prazo do sem contato: 2 dias", "Mudar…" e o
// diálogo dos dias. No cabeçalho, ele não empurra a lista dos agentes para fora da primeira tela. O
// diálogo manda só o prazo: o tipo e o local gravados ficam como estão, sem os regravar do cache.
import {
  MENSAGEM_DO_PRAZO_DO_SEM_CONTATO,
  prazoDoSemContatoValido,
  textoDosDias,
} from '@grafite/domain';
import { avisar, Botao, CampoDeTexto, Dialogo, MensagemDoPasso } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { CHAVE_DO_CADASTRO, useCadastroDosAgentes } from './consultas.ts';

/** O prazo em vigor e o "Mudar…"; a carga e a falha aparecem no cadastro automático. */
export function PrazoDoSemContato() {
  const configuracao = useCadastroDosAgentes();
  if (!configuracao.data) return null;
  return (
    <div className={estilos.prazoDoSemContato}>
      <p className={estilos.informacao}>
        Prazo do sem contato: {textoDosDias(configuracao.data.diasSemContato)}
      </p>
      <MudarOPrazo gravado={configuracao.data.diasSemContato} />
    </div>
  );
}

function MudarOPrazo({ gravado }: { gravado: number }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [aberto, definirAberto] = useState(false);
  const [dias, definirDias] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [salvando, definirSalvando] = useState(false);

  function mudarAberto(abrir: boolean) {
    if (abrir) {
      // O diálogo abre com o que está gravado.
      definirDias(String(gravado));
      definirErro(null);
      definirFalha(null);
    }
    definirAberto(abrir);
  }

  async function confirmar() {
    if (salvando) return;
    const numero = Number(dias.trim());
    if (dias.trim() === '' || !prazoDoSemContatoValido(numero)) {
      definirErro(MENSAGEM_DO_PRAZO_DO_SEM_CONTATO);
      return;
    }
    definirSalvando(true);
    const resultado = await pedir(
      () => api.PUT('/agentes/cadastro', { body: { diasSemContato: numero } }),
      'salvar o prazo do sem contato',
    );
    definirSalvando(false);
    if ('erro' in resultado) {
      const doCampo = resultado.problema?.campos?.diasSemContato;
      if (doCampo) {
        definirErro(doCampo);
        return;
      }
      definirFalha(resultado.erro);
      definirTentativa((anterior) => anterior + 1);
      return;
    }
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_CADASTRO });
    avisar({ situacao: 'sucesso', titulo: 'Prazo do sem contato salvo.' });
    definirAberto(false);
  }

  return (
    <Dialogo
      gatilho={<Botao nivel="terciario">Mudar…</Botao>}
      titulo="Prazo do sem contato"
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
        <CampoDeTexto
          rotulo="Dias"
          descricao="De 1 a 30; o de fábrica é 2."
          autoComplete="off"
          inputMode="numeric"
          value={dias}
          onChange={(texto) => {
            definirDias(texto);
            definirErro(null);
          }}
          erro={erro ?? undefined}
        />
        <p className={estilos.informacao}>
          Passado o prazo sem falar com o servidor, o agente aparece como Sem contato, e as
          distribuições esperam a máquina voltar.
        </p>
        <MensagemDoPasso texto={falha} chave={tentativa} />
      </div>
    </Dialogo>
  );
}
