import {
  type CorDeConsumivel,
  type EntregaDoItem,
  MENSAGEM_SEM_COMPATIVEL,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  validarEntrega,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  Checkbox,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  Icone,
  MensagemDoPasso,
  Radio,
  Selecao,
} from '@grafite/ui';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useBuscarFornecedores } from '../../administracao/fornecedores/escolha.ts';
import { recusaDe } from '../../administracao/recusa.ts';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { CHAVE_DO_ESTOQUE } from '../estoque/consultas.ts';
import estilosDaOperacao from '../Operacao.module.css';
import { resumoDaSolicitacao } from './acoes.ts';
import { referenciaDoAtivo } from './apresentacao.ts';
import { CHAVE_DAS_SOLICITACOES, type Solicitacao } from './consultas.ts';
import { opcoesDaImpressora, opcoesDosSaldosParaEntrega } from './escolhas.ts';
import estilos from './Solicitacoes.module.css';

type Origem = EntregaDoItem['origem'];

/** Um item pendente do toner, com a impressora dele. */
interface ItemPendente {
  id: string;
  impressora: Solicitacao['impressoras'][number]['ativo'];
  cor: CorDeConsumivel;
  quantidade: number;
  consumivel: { id: string; codigo: string; nome: string | null } | null;
}

/** O que a pessoa escolheu num item; o que ela não mudou fica no padrão. */
interface EscolhaDoItem {
  entregar: boolean;
  origem: Origem;
  /** Sem escolha, o consumível do item. */
  consumivel?: string | null;
  /** Sem escolha, o local de maior saldo. */
  local?: string | null;
  /** Sem escolha, o fornecedor do pedido. */
  fornecedor?: ContaDoSeletor | null;
}

const nomeDoConsumivel = ({ codigo, nome }: { codigo: string; nome: string | null }) =>
  [codigo, nome].filter(Boolean).join(' · ');

/** "PAT-00412: 1 Preto", como a lista resume o item. */
const nomeDoItem = ({ impressora, quantidade, cor }: ItemPendente) =>
  `${referenciaDoAtivo(impressora)}: ${quantidade} ${ROTULOS_DAS_CORES_DE_CONSUMIVEL[cor]}`;

/**
 * A entrega do toner (spec solicitacoes, "Entrega do toner"; spec modulo-operacao, "Formulários
 * das solicitações"): os itens pendentes, todos escolhidos, cada um "Do estoque", com o consumível e
 * o local de origem de maior saldo entre os que a conta movimenta, ou "Pelo fornecedor", com o do
 * pedido. Com o pedido ao fornecedor, ou para quem não movimenta o estoque, os itens já vêm pelo
 * fornecedor. A entrega é uma só: a recusa de um item fica no campo dele, e nada é entregue.
 */
export function GavetaDaEntrega({
  solicitacao,
  aoFechar,
}: {
  solicitacao: Solicitacao;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const movimenta = pode('estoque.movimentar');
  const buscarFornecedores = useBuscarFornecedores();
  const doPedido = solicitacao.fornecedor
    ? { id: solicitacao.fornecedor.id, rotulo: solicitacao.fornecedor.nome }
    : null;
  const pendentes: ItemPendente[] = solicitacao.impressoras.flatMap(({ ativo, itens }) =>
    itens
      .filter(({ entrega }) => entrega === null)
      .map((item) => ({
        id: item.id,
        impressora: ativo,
        cor: item.cor,
        quantidade: item.quantidade,
        consumivel: item.consumivel,
      })),
  );
  const [escolhas, definirEscolhas] = useState<Record<string, EscolhaDoItem>>(() =>
    Object.fromEntries(
      pendentes.map(({ id }) => [
        id,
        { entregar: true, origem: doPedido || !movimenta ? 'fornecedor' : 'estoque' },
      ]),
    ),
  );
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  // Os compatíveis de cada impressora, com o saldo, para a escolha do consumível de cada cor.
  const idsDasImpressoras = [...new Set(pendentes.map(({ impressora }) => impressora.id))];
  const impressoras = useQueries({
    queries: idsDasImpressoras.map((id) => opcoesDaImpressora(api, id)),
  });
  const compativeisDe = (item: ItemPendente) =>
    impressoras[idsDasImpressoras.indexOf(item.impressora.id)]?.data?.cores.find(
      ({ cor }) => cor === item.cor,
    )?.compativeis ?? [];

  const escolhaDe = (item: ItemPendente): EscolhaDoItem =>
    escolhas[item.id] ?? { entregar: false, origem: 'fornecedor' };
  const consumivelDe = (item: ItemPendente) => {
    const escolhido = escolhaDe(item).consumivel;
    return escolhido !== undefined ? escolhido : (item.consumivel?.id ?? null);
  };

  // Os saldos de cada consumível escolhido do estoque, nos locais em que a conta movimenta.
  const idsDosConsumiveis = movimenta
    ? [
        ...new Set(
          pendentes
            .filter((item) => escolhaDe(item).entregar && escolhaDe(item).origem === 'estoque')
            .map(consumivelDe)
            .filter((id): id is string => id !== null),
        ),
      ]
    : [];
  const saldos = useQueries({
    queries: idsDosConsumiveis.map((id) => opcoesDosSaldosParaEntrega(api, id)),
  });
  const saldosDe = (consumivel: string | null) =>
    consumivel === null ? undefined : saldos[idsDosConsumiveis.indexOf(consumivel)]?.data;
  const localDe = (item: ItemPendente) => {
    const escolhido = escolhaDe(item).local;
    return escolhido !== undefined
      ? escolhido
      : (saldosDe(consumivelDe(item))?.[0]?.local.id ?? null);
  };
  const fornecedorDe = (item: ItemPendente) => {
    const escolhido = escolhaDe(item).fornecedor;
    return escolhido !== undefined ? escolhido : doPedido;
  };

  const mudar = (item: ItemPendente, mudanca: Partial<EscolhaDoItem>, ...campos: string[]) => {
    definirEscolhas((atuais) => ({ ...atuais, [item.id]: { ...escolhaDe(item), ...mudanca } }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      delete restantes.itens;
      for (const campo of campos) delete restantes[`${item.id}:${campo}`];
      return restantes;
    });
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const escolhidos = pendentes.filter((item) => escolhaDe(item).entregar);
    const entregas: EntregaDoItem[] = escolhidos.map((item) =>
      escolhaDe(item).origem === 'estoque'
        ? { item: item.id, origem: 'estoque', consumivel: consumivelDe(item), local: localDe(item) }
        : {
            item: item.id,
            origem: 'fornecedor',
            fornecedor: fornecedorDe(item)?.id ?? null,
            consumivel: consumivelDe(item),
          },
    );
    // As recusas pelo caminho `entregas.<índice>.<campo>` vão ao item escolhido nessa posição.
    const noItem = (recusas: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(recusas).map(([caminho, motivo]) => {
          const [, indice, campo] = /^entregas\.(\d+)\.(\w+)$/.exec(caminho) ?? [];
          const item = escolhidos[Number(indice)];
          return [item && campo ? `${item.id}:${campo}` : 'itens', motivo];
        }),
      );
    const conferidos = validarEntrega(entregas);
    if (Object.keys(conferidos).length > 0) {
      definirErros(noItem(conferidos));
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/solicitacoes/{numero}/entrega', {
            params: { path: { numero: solicitacao.numero } },
            body: { entregas },
          }),
        'lançar a entrega',
      );
      if ('erro' in resultado) {
        const recusa = recusaDe<string>(resultado);
        if (recusa.campos && Object.keys(recusa.campos).length > 0) {
          definirErros(noItem(recusa.campos as Record<string, string>));
          return;
        }
        definirFalha(recusa.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CHAVE_DAS_SOLICITACOES }),
        consultas.invalidateQueries({ queryKey: CHAVE_DO_ESTOQUE }),
      ]);
      avisar({ situacao: 'sucesso', titulo: 'Entrega lançada.' });
      aoFechar();
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Entrega"
    >
      <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
        <p className={estilosDaOperacao.informacao}>{resumoDaSolicitacao(solicitacao)}</p>
        {erros.itens && (
          <p className={estilos.erroDaImpressora}>
            <Icone icone={CircleAlert} />
            {erros.itens}
          </p>
        )}
        {pendentes.map((item) => {
          const escolha = escolhaDe(item);
          const erroDe = (campo: string) => erros[`${item.id}:${campo}`];
          const compativeis = compativeisDe(item);
          const opcoesDoConsumivel = [
            ...(item.consumivel && !compativeis.some(({ id }) => id === item.consumivel?.id)
              ? [{ id: item.consumivel.id, rotulo: nomeDoConsumivel(item.consumivel) }]
              : []),
            ...compativeis.map((compativel) => ({
              id: compativel.id,
              rotulo: nomeDoConsumivel(compativel),
            })),
          ];
          // Sem o consumível, o estoque não tem de onde sair: a entrega o pede no item.
          const comConsumivel = consumivelDe(item) !== null;
          const saldosDoItem = saldosDe(consumivelDe(item));
          const semSaldo = saldosDoItem !== undefined && saldosDoItem.length === 0;
          // As recusas sem um campo na tela, como o saldo que não basta, ficam no item.
          const naTela = new Set([
            ...(opcoesDoConsumivel.length > 0 ? ['consumivel'] : []),
            ...(escolha.origem === 'estoque' && comConsumivel && !semSaldo ? ['local'] : []),
            ...(escolha.origem === 'fornecedor' ? ['fornecedor'] : []),
          ]);
          const doItem = Object.entries(erros)
            .filter(([chave]) => chave.startsWith(`${item.id}:`))
            .filter(([chave]) => !naTela.has(chave.slice(item.id.length + 1)))
            .map(([, motivo]) => motivo);
          return (
            <fieldset key={item.id} className={estilos.impressora}>
              <legend className={estilos.nomeDaImpressora}>{nomeDoItem(item)}</legend>
              <Checkbox
                isSelected={escolha.entregar}
                onChange={(entregar) => mudar(item, { entregar })}
              >
                Entregar
              </Checkbox>
              {escolha.entregar && (
                <>
                  <GrupoDeRadios
                    rotulo="Origem"
                    orientation="horizontal"
                    value={escolha.origem}
                    onChange={(origem) =>
                      mudar(item, { origem: origem as Origem }, 'local', 'fornecedor')
                    }
                  >
                    <Radio value="estoque" isDisabled={!movimenta}>
                      Do estoque
                    </Radio>
                    <Radio value="fornecedor">Pelo fornecedor</Radio>
                  </GrupoDeRadios>
                  {opcoesDoConsumivel.length > 0 ? (
                    <Selecao
                      rotulo="Consumível"
                      obrigatorio={escolha.origem === 'estoque'}
                      opcoes={opcoesDoConsumivel}
                      selectedKey={consumivelDe(item)}
                      onSelectionChange={(chave) =>
                        mudar(
                          item,
                          { consumivel: chave === null ? null : String(chave), local: undefined },
                          'consumivel',
                          'local',
                        )
                      }
                      erro={erroDe('consumivel')}
                    />
                  ) : (
                    <p className={estilosDaOperacao.informacao}>{MENSAGEM_SEM_COMPATIVEL}</p>
                  )}
                  {escolha.origem === 'estoque' &&
                    comConsumivel &&
                    (semSaldo ? (
                      <p className={estilosDaOperacao.informacao}>
                        Sem saldo nos locais em que você movimenta o estoque.
                      </p>
                    ) : (
                      <Selecao
                        rotulo="Local de origem"
                        obrigatorio
                        opcoes={(saldosDoItem ?? []).map(({ local, saldo }) => ({
                          id: local.id,
                          rotulo: `${local.caminho} · saldo ${saldo.toLocaleString('pt-BR')}`,
                        }))}
                        selectedKey={localDe(item)}
                        onSelectionChange={(chave) =>
                          mudar(item, { local: chave === null ? null : String(chave) }, 'local')
                        }
                        erro={erroDe('local')}
                      />
                    ))}
                  {escolha.origem === 'fornecedor' && (
                    <SeletorDeConta
                      rotulo="Fornecedor"
                      obrigatorio
                      valor={fornecedorDe(item)}
                      aoMudar={(fornecedor) => mudar(item, { fornecedor }, 'fornecedor')}
                      buscar={buscarFornecedores}
                      erro={erroDe('fornecedor')}
                    />
                  )}
                </>
              )}
              {doItem.map((motivo) => (
                <p key={motivo} className={estilos.erroDaImpressora}>
                  <Icone icone={CircleAlert} />
                  {motivo}
                </p>
              ))}
            </fieldset>
          );
        })}
        <MensagemDoPasso texto={falha} chave={tentativa} />
        <div className={estilosDaOperacao.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Lançando">
            Lançar a entrega
          </Botao>
          <Botao nivel="terciario" onPress={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </Formulario>
    </Gaveta>
  );
}
