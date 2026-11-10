import { textoDoPrazo } from '@grafite/domain';
import { avisar, Botao, ListaDeDados, useDataHora } from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { Confirmacao } from '../Confirmacao.tsx';
import { MudarOPrazo } from '../confianca/PrazoDaConfianca.tsx';
import { Parte, useFocoNoTitulo } from '../Parte.tsx';
import type { Conta } from './ContaDaPessoa.tsx';
import type { Ficha } from './ficha.ts';

/** A chave dos aparelhos confiáveis de uma conta nas consultas. */
export const chaveDosAparelhos = (contaId: string) => ['aparelhos-da-conta', contaId] as const;

/**
 * Os aparelhos confiáveis da conta de outra pessoa (spec administracao-de-pessoas, "Aparelhos
 * confiáveis pela administração"; change aparelho-confiavel, design, decisão 6): o prazo que vale
 * para a conta e de onde ele vem, com "Mudar…", e cada aparelho com o dispositivo, o IP, desde
 * quando é confiável, o último uso e até quando vale, com "Esquecer todos os aparelhos".
 */
export function AparelhosDaConta({ pessoa, conta }: { pessoa: Ficha; conta: Conta }) {
  const api = useApi();
  const consultas = useQueryClient();
  const { formatarHorario } = useDataHora();
  const aparelhos = useQuery({
    queryKey: chaveDosAparelhos(conta.id),
    queryFn: () =>
      consultar(
        () => api.GET('/contas/{id}/aparelhos', { params: { path: { id: conta.id } } }),
        'carregar os aparelhos confiáveis',
      ),
  });

  // Esquecidos os aparelhos, o botão some com eles: o foco vai ao título.
  const { titulo, pedirFoco } = useFocoNoTitulo(aparelhos.data);

  const parte = (conteudo: ReactNode) => (
    <Parte titulo="Aparelhos confiáveis" refDoTitulo={titulo}>
      {conteudo}
    </Parte>
  );
  if (aparelhos.isPending) {
    return parte(
      <p role="status" className={estilos.informacao}>
        Carregando os aparelhos confiáveis…
      </p>,
    );
  }
  if (aparelhos.isError) {
    return parte(
      <div className={estilos.falha}>
        <p role="alert" className={estilos.informacao}>
          {aparelhos.error.message}
        </p>
        <Botao onPress={() => void aparelhos.refetch()}>Tentar de novo</Botao>
      </div>,
    );
  }

  const { prazo, diasDaConta, aparelhos: lista } = aparelhos.data;
  return parte(
    <>
      <div className={estilos.prazoDaConfianca}>
        <ListaDeDados itens={[{ rotulo: 'Prazo da confiança', valor: textoDoPrazo(prazo) }]} />
        <MudarOPrazo
          titulo={`Prazo da confiança da conta de ${pessoa.nome}`}
          valor={diasDaConta}
          seguir="Seguir o perfil ou a organização"
          salvar={async (dias) => {
            const resultado = await pedir(
              () =>
                api.PUT('/contas/{id}/prazo-da-confianca', {
                  params: { path: { id: conta.id } },
                  body: { dias },
                }),
              'mudar o prazo da confiança',
            );
            if ('erro' in resultado) return resultado;
            consultas.setQueryData(chaveDosAparelhos(conta.id), {
              ...aparelhos.data,
              ...resultado.dados,
            });
            return { ok: true };
          }}
        />
      </div>
      {lista.length === 0 ? (
        <p className={estilos.informacao}>Nenhum aparelho confiável.</p>
      ) : (
        <ul aria-label="Aparelhos confiáveis" className={estilos.sessoes}>
          {lista.map((aparelho) => (
            <li key={aparelho.id} className={estilos.sessao}>
              <p className={estilos.dispositivo}>{aparelho.dispositivo}</p>
              <ListaDeDados
                itens={[
                  { rotulo: 'Endereço IP', valor: aparelho.ip ?? 'Desconhecido' },
                  {
                    rotulo: 'Confiável desde',
                    valor: formatarHorario(new Date(aparelho.criadoEm)),
                  },
                  { rotulo: 'Último uso', valor: formatarHorario(new Date(aparelho.usadoEm)) },
                  { rotulo: 'Vale até', valor: formatarHorario(new Date(aparelho.valeAte)) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <div className={estilos.acoes}>
          <Confirmacao
            acao="Esquecer todos os aparelhos"
            titulo={`Esquecer todos os aparelhos de ${pessoa.nome}?`}
            confirmar="Esquecer os aparelhos"
            confirmando="Esquecendo"
            fazer={async () => {
              const resultado = await pedir(
                () => api.DELETE('/contas/{id}/aparelhos', { params: { path: { id: conta.id } } }),
                'esquecer os aparelhos',
              );
              if ('erro' in resultado) return resultado;
              pedirFoco();
              await consultas.invalidateQueries({ queryKey: chaveDosAparelhos(conta.id) });
              avisar({ situacao: 'sucesso', titulo: 'Aparelhos esquecidos.' });
              return { ok: true };
            }}
          >
            <p className={estilos.informacao}>
              As entradas seguintes da pessoa pedem o código em qualquer navegador. As sessões
              abertas continuam.
            </p>
          </Confirmacao>
        </div>
      )}
    </>,
  );
}
