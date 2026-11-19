// "Trocar o ativo" e "Ligar um ativo" do chamado aberto (spec chamados, "Ativo ligado e campos da
// TI"; change chamados-da-ti, design, "A coluna da direita, a pessoa e o ativo (tarefa 5.13)"): o
// diálogo busca como o campo Ativo do formulário, com "Mais opções de busca" (tarefa 5.30), tem
// "Tirar o ativo" e manda a versão do chamado; as recusas ficam nele, no campo quando são do ativo.
import { Botao, Dialogo, MensagemDoPasso } from '@grafite/ui';
import { ArrowLeftRight, Link2 } from 'lucide-react';
import { useState } from 'react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import type { ContaDoSeletor } from '../../administracao/seletores/SeletorDeConta.tsx';
import type { FichaDoChamado } from '../consultas.ts';
import { rotuloDoAtivoCitado } from '../formulario/estado.ts';
import { useAcoesDoChamadoAberto } from './acoes.ts';
import { EscolhaDoAtivo } from './EscolhaDoAtivo.tsx';
import estilos from './Lado.module.css';

export function TrocarOAtivo({ ficha }: { ficha: FichaDoChamado }) {
  const { pode } = useAcesso();
  const acoes = useAcoesDoChamadoAberto();
  const { numero, versao, ativo, pessoa } = ficha;
  const [aberto, definirAberto] = useState(false);
  const [escolhido, definirEscolhido] = useState<ContaDoSeletor | null>(null);
  const [erro, definirErro] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState<'gravar' | 'tirar' | null>(null);
  const atual = ativo ? { id: ativo.id, rotulo: rotuloDoAtivoCitado(ativo) } : null;
  const veOsAtivos = pode('ativos.ver');

  const mudarAberto = (abrir: boolean) => {
    if (enviando) return;
    if (abrir) {
      definirEscolhido(atual);
      definirErro(null);
      definirFalha(null);
    }
    definirAberto(abrir);
  };

  const gravar = async (novo: string | null, como: 'gravar' | 'tirar') => {
    if (enviando) return;
    // O mesmo ativo não muda nada: o diálogo só fecha.
    if (novo !== null && novo === ativo?.id) {
      definirAberto(false);
      return;
    }
    definirEnviando(como);
    const recusa = await acoes.trocarAtivo(numero, versao, novo, ativo !== null);
    definirEnviando(null);
    if (!recusa) {
      definirAberto(false);
      return;
    }
    if (recusa.doCampo && veOsAtivos) {
      definirErro(recusa.erro);
      return;
    }
    definirFalha(recusa.erro);
    definirTentativa((anterior) => anterior + 1);
  };

  return (
    <Dialogo
      gatilho={
        <Botao icone={ativo ? ArrowLeftRight : Link2}>
          {ativo ? 'Trocar o ativo' : 'Ligar um ativo'}
        </Botao>
      }
      titulo={ativo ? `Trocar o ativo do #${numero}` : `Ligar um ativo ao #${numero}`}
      aberto={aberto}
      aoMudarAberto={mudarAberto}
      acoes={(fechar) => (
        <>
          <Botao isDisabled={enviando !== null} onPress={fechar}>
            Cancelar
          </Botao>
          {ativo && (
            <Botao
              carregando={enviando === 'tirar'}
              rotuloCarregando="Tirando o ativo"
              isDisabled={enviando === 'gravar'}
              onPress={() => void gravar(null, 'tirar')}
            >
              Tirar o ativo
            </Botao>
          )}
          {veOsAtivos && (
            <Botao
              nivel="primario"
              carregando={enviando === 'gravar'}
              rotuloCarregando={ativo ? 'Trocando' : 'Ligando'}
              isDisabled={escolhido === null || enviando === 'tirar'}
              onPress={() => {
                if (escolhido) void gravar(escolhido.id, 'gravar');
              }}
            >
              {ativo ? 'Trocar' : 'Ligar'}
            </Botao>
          )}
        </>
      )}
    >
      <div className={estilos.formulario}>
        {veOsAtivos ? (
          <EscolhaDoAtivo
            valor={escolhido}
            aoMudar={(novo) => {
              definirEscolhido(novo);
              definirErro(null);
            }}
            pessoa={{ id: pessoa.id, nome: pessoa.nome }}
            descricao={`Os locais do chamado passam a ser o local de trabalho de ${pessoa.nome} na abertura e o do ativo.`}
            erro={erro ?? undefined}
          />
        ) : (
          <p className={estilos.informacao}>Você não vê os ativos.</p>
        )}
        <MensagemDoPasso texto={falha} chave={tentativa} />
      </div>
    </Dialogo>
  );
}
