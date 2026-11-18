// Os "Campos do tipo" do chamado aberto (spec modulo-chamados, "Chamado aberto" e "Formulário que
// se preenche"; change chamados-da-ti, design, "A linha do tempo, os campos do tipo e as seções
// guardadas (tarefa 5.14)"; mockup m04): a peça do formulário com o `quem` do chamado, a contagem
// na cabeça da seção e a gravação: a escolha na hora, e o texto, o número e a data ao sair do campo
// ou quando a tela fecha. A escolha que esconde um campo com arquivo pede a confirmação antes.
import { contagemDasRespostas } from '@grafite/domain';
import { avisar } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { CHAVE_DOS_CHAMADOS, type FichaDoChamado } from '../consultas.ts';
import type { EstadoDoFormulario } from '../formulario/estado.ts';
import { FormularioQueSePreenche } from '../formulario/FormularioQueSePreenche.tsx';
import {
  type ConfirmacaoDosAnexos,
  campoQueMudou,
  confirmacaoDosAnexos,
  estadoDaFicha,
  gravaNaHora,
  pedidoDosCampos,
  respostasGravadas,
  separarARecusa,
  textoDaContagem,
} from './campos.ts';
import { SecaoDoLado } from './SecaoDoLado.tsx';

export interface PropsDosCamposDoTipo {
  ficha: FichaDoChamado;
  /** Quem atende os locais do chamado, fora do resolvido (`preencheOsCampos`). */
  preenche: boolean;
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
}

/** A escolha que esconde um campo com arquivo, à espera do "Mudar". */
interface Pergunta extends ConfirmacaoDosAnexos {
  depois: EstadoDoFormulario;
}

export function CamposDoTipo({ ficha, preenche, aberta, aoMudarAberta }: PropsDosCamposDoTipo) {
  const api = useApi();
  const consultas = useQueryClient();
  const base = useMemo(() => estadoDaFicha(ficha), [ficha]);
  /** O estado com a mudança da conta, até a ficha relida chegar; nulo, vale o da ficha. */
  const [mudado, definirMudado] = useState<EstadoDoFormulario | null>(null);
  const [erros, definirErros] = useState<Readonly<Record<string, string>>>({});
  const [pergunta, definirPergunta] = useState<Pergunta | null>(null);
  const estado = mudado ?? base;

  // O que a gravação lê sem esperar o React: o estado de agora, os campos mudados e ainda não
  // mandados, os recusados, que ficam na tela até a conta mudá-los, as respostas que a API tem,
  // pelo que a tela sabe, e os pedidos em andamento.
  const atual = useRef(estado);
  atual.current = estado;
  const mudados = useRef(new Set<string>());
  const recusados = useRef(new Set<string>());
  const salvas = useRef(base.respostas);
  const enviando = useRef(0);

  // A ficha relida volta a valer quando nada fica para gravar nem para corrigir.
  useEffect(() => {
    if (enviando.current > 0) return;
    salvas.current = base.respostas;
    if (mudados.current.size === 0 && recusados.current.size === 0) definirMudado(null);
  }, [base]);

  const gravar = async () => {
    const pedido = pedidoDosCampos(salvas.current, atual.current.respostas, mudados.current);
    mudados.current = new Set();
    if (Object.keys(pedido).length === 0) return;
    enviando.current += 1;
    const resultado = await pedir(
      () =>
        api.PATCH('/chamados/{numero}/campos', {
          params: { path: { numero: ficha.numero } },
          body: { respostas: pedido },
        }),
      'gravar os campos do chamado',
    );
    enviando.current -= 1;
    void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS });
    if (!('erro' in resultado)) {
      salvas.current = respostasGravadas(salvas.current, pedido);
      return;
    }
    const doCampo = resultado.problema?.campos ?? {};
    if (Object.keys(doCampo).length > 0) {
      // A recusa fica no campo, com a resposta da conta, para ela corrigir, e o campo fica fora
      // dos próximos pedidos até ela mudá-lo (`separarARecusa`).
      const separados = separarARecusa(pedido, doCampo);
      for (const id of separados.recusados) recusados.current.add(id);
      for (const id of separados.deVolta) mudados.current.add(id);
      definirErros((anteriores) => ({ ...anteriores, ...doCampo }));
      return;
    }
    // A recusa que não é de um campo, como o chamado resolvido por outra conta: a ficha relida vale.
    avisar({ situacao: 'critico', titulo: resultado.erro });
    recusados.current.clear();
    definirErros({});
    if (enviando.current === 0) definirMudado(null);
  };

  // O foco que sai de um campo grava o que mudou; dentro do mesmo campo, como entre as partes da
  // data, ainda não. A tela que fecha grava o que ficou: o texto que a conta ainda não deixou.
  const gravarAgora = useRef(gravar);
  gravarAgora.current = gravar;
  const campos = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elemento = campos.current;
    if (!elemento) return;
    const aoSairDoFoco = (evento: FocusEvent) => {
      const deOnde =
        evento.target instanceof Element ? evento.target.closest('[data-campo]') : null;
      const paraOnde = evento.relatedTarget instanceof Element ? evento.relatedTarget : null;
      if (deOnde && paraOnde && deOnde.contains(paraOnde)) return;
      void gravarAgora.current();
    };
    elemento.addEventListener('focusout', aoSairDoFoco);
    return () => {
      elemento.removeEventListener('focusout', aoSairDoFoco);
      void gravarAgora.current();
    };
  }, []);

  /** Aplica a mudança: a escolha grava na hora; o texto, o número e a data esperam sair do campo. */
  const aplicar = (antes: EstadoDoFormulario, depois: EstadoDoFormulario) => {
    const campo = campoQueMudou(ficha.formulario, antes.respostas, depois.respostas);
    atual.current = depois;
    definirMudado(depois);
    if (!campo) return;
    mudados.current.add(campo.id);
    recusados.current.delete(campo.id);
    // A recusa do campo que mudou, e a geral, saem com a mudança.
    definirErros((anteriores) =>
      Object.fromEntries(
        Object.entries(anteriores).filter(
          ([chave]) => chave !== `campos.${campo.id}` && chave !== 'formulario',
        ),
      ),
    );
    if (gravaNaHora(campo.tipo)) void gravar();
  };

  const aoMudar = (mudar: (anterior: EstadoDoFormulario) => EstadoDoFormulario) => {
    const antes = atual.current;
    const depois = mudar(antes);
    const confirmacao = confirmacaoDosAnexos(ficha.formulario, antes.respostas, depois.respostas);
    if (confirmacao) definirPergunta({ ...confirmacao, depois });
    else aplicar(antes, depois);
  };

  const pessoa = useMemo(
    () => ({ id: ficha.pessoa.id, nome: ficha.pessoa.nome }),
    [ficha.pessoa.id, ficha.pessoa.nome],
  );
  const contagem = textoDaContagem(contagemDasRespostas(ficha.formulario, estado.respostas));
  return (
    <SecaoDoLado
      titulo="Campos do tipo"
      resumo={contagem}
      aberta={aberta}
      aoMudarAberta={aoMudarAberta}
    >
      <div ref={campos}>
        <FormularioQueSePreenche
          formulario={ficha.formulario}
          estado={estado}
          aoMudar={aoMudar}
          quem="chamado"
          pessoa={pessoa}
          numero={ficha.numero}
          soLeitura={!preenche}
          erros={erros}
        />
      </div>
      {pergunta && (
        <Confirmacao
          acao="Mudar"
          titulo={pergunta.titulo}
          confirmando="Mudando"
          aberta
          aoFechar={() => definirPergunta(null)}
          fazer={async () => {
            aplicar(atual.current, pergunta.depois);
            return { ok: true };
          }}
        >
          <p>{pergunta.texto}</p>
        </Confirmacao>
      )}
    </SecaoDoLado>
  );
}
