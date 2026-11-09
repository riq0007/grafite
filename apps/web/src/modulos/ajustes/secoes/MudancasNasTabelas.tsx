// As mudanças da conta nas tabelas, na seção Tabelas dos Ajustes (spec ajustes-do-sistema, "Seção
// Tabelas"; design do visoes-da-conta, decisão 6): em quantas visões a conta tem mudanças
// guardadas, e "Restaurar as minhas mudanças nas tabelas", que as apaga todas depois da
// confirmação. Some sem mudanças e não pergunta pelas tabelas que a conta não vê ou cujo módulo
// está desligado.
import { TABELAS_COM_VISOES } from '@grafite/domain';
import { avisar } from '@grafite/ui';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useServidor } from '../../../sessao/useSessao.tsx';
import { chaveDasVisoes, consultaDasVisoes } from '../../../tabelas/visoes.ts';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import estilos from './Secoes.module.css';

const emVisoes = (quantas: number) => (quantas === 1 ? '1 visão' : `${quantas} visões`);

export function MudancasNasTabelas() {
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const desligados = useServidor()?.modulosDesligados ?? [];
  const tabelas = TABELAS_COM_VISOES.filter(
    (tabela) => pode(tabela.permissao) && !desligados.includes(tabela.modulo),
  );
  const listas = useQueries({
    queries: tabelas.map((tabela) => consultaDasVisoes(api, tabela.id)),
  });
  const comMudancas = tabelas.filter(
    (_, indice) => (listas[indice]?.data?.mudancas?.length ?? 0) > 0,
  );
  const quantas = listas.reduce((soma, lista) => soma + (lista.data?.mudancas?.length ?? 0), 0);
  if (quantas === 0) return null;

  async function restaurar() {
    for (const tabela of comMudancas) {
      const resultado = await pedir(
        () => api.DELETE('/visoes/mudancas', { params: { query: { tabela: tabela.id } } }),
        'restaurar as mudanças nas tabelas',
      );
      if ('erro' in resultado) return { erro: resultado.erro };
      void consultas.invalidateQueries({ queryKey: chaveDasVisoes(tabela.id) });
    }
    avisar({ situacao: 'sucesso', titulo: 'Mudanças nas tabelas restauradas.' });
    return { ok: true as const };
  }

  return (
    <div className={estilos.grupoDeOpcoes}>
      <p className={estilos.rotuloDaInformacao}>Suas mudanças</p>
      <p className={estilos.informacao}>Suas mudanças estão guardadas em {emVisoes(quantas)}.</p>
      <div>
        <Confirmacao
          acao="Restaurar as minhas mudanças nas tabelas"
          titulo="Restaurar as suas mudanças nas tabelas?"
          confirmar="Restaurar"
          confirmando="Restaurando"
          nivelDoGatilho="secundario"
          fazer={restaurar}
        >
          <p>
            {quantas === 1
              ? 'A visão volta a abrir como está salva.'
              : `As ${quantas} visões voltam a abrir como estão salvas.`}
          </p>
        </Confirmacao>
      </div>
    </div>
  );
}
