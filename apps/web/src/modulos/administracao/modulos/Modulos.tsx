import type { components } from '@grafite/api-client';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  Dialogo,
  EstadoVazio,
  Interruptor,
  MensagemDoPasso,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useLojaDaSessao } from '../../../sessao/useSessao.tsx';
import estilos from '../Administracao.module.css';

type ModuloDaOrganizacao = components['schemas']['ModulosDaOrganizacao']['modulos'][number];

/** A chave da lista nas consultas, que o evento `modulos.mudaram` invalida. */
export const CHAVE_DOS_MODULOS = ['modulos-da-organizacao'] as const;

/** Sem a chave do módulo: o que se guardava dele sai. */
function sem<T>(registro: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _removido, ...resto } = registro;
  return resto;
}

/**
 * Os módulos opcionais da organização (spec modulo-administracao e modulos-da-organizacao): cada
 * um com o nome, a descrição e o interruptor, que diz em texto se ele está ligado. Ligar vale na
 * hora; desligar pede confirmação. A recusa aparece junto do módulo, e o interruptor volta ao que
 * estava. Depois de cada mudança, a sessão é validada de novo, e a casca de quem mudou já mostra ou
 * tira o módulo; as outras sessões recebem o evento.
 */
export function Modulos() {
  const api = useApi();
  const consultas = useQueryClient();
  const loja = useLojaDaSessao();
  const idDasDescricoes = useId();
  const modulos = useQuery({
    queryKey: CHAVE_DOS_MODULOS,
    queryFn: () => consultar(() => api.GET('/organizacao/modulos'), 'carregar os módulos'),
  });
  /** A situação pedida de cada módulo, que o interruptor mostra enquanto a API responde. */
  const [pedidos, definirPedidos] = useState<Record<string, boolean>>({});
  const [recusas, definirRecusas] = useState<Record<string, { texto: string; vez: number }>>({});
  /** O módulo da confirmação, que fica para o texto enquanto ela fecha. */
  const [desligando, definirDesligando] = useState<ModuloDaOrganizacao | null>(null);
  const [confirmando, definirConfirmando] = useState(false);

  async function mudar(modulo: ModuloDaOrganizacao, ligado: boolean) {
    definirPedidos((atuais) => ({ ...atuais, [modulo.id]: ligado }));
    definirRecusas((atuais) => sem(atuais, modulo.id));
    const resultado = await pedir(
      () =>
        api.PUT('/organizacao/modulos/{id}', {
          params: { path: { id: modulo.id } },
          body: { ligado },
        }),
      ligado ? 'ligar o módulo' : 'desligar o módulo',
    );
    if ('erro' in resultado) {
      definirPedidos((atuais) => sem(atuais, modulo.id));
      definirRecusas((atuais) => ({
        ...atuais,
        [modulo.id]: { texto: resultado.erro, vez: (atuais[modulo.id]?.vez ?? 0) + 1 },
      }));
      return;
    }
    consultas.setQueryData(CHAVE_DOS_MODULOS, resultado.dados);
    definirPedidos((atuais) => sem(atuais, modulo.id));
    avisar({ situacao: 'sucesso', titulo: ligado ? 'Módulo ligado.' : 'Módulo desligado.' });
    // A casca de quem mudou mostra ou tira o módulo agora, sem esperar o evento.
    await loja.validar();
  }

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Módulos" />
      <p className={estilos.informacao}>
        Um módulo desligado some do dock e da busca de todos, e os dados dele ficam guardados.
      </p>
      {modulos.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando os módulos…
        </p>
      ) : modulos.isError && !modulos.data ? (
        <EstadoVazio
          titulo={modulos.error.message}
          acao={<Botao onPress={() => void modulos.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <ul aria-label="Módulos opcionais" className={estilos.modulosOpcionais}>
          {modulos.data.modulos.map((modulo) => {
            const ligado = pedidos[modulo.id] ?? modulo.ligado;
            const recusa = recusas[modulo.id];
            const idDaDescricao = `${idDasDescricoes}-${modulo.id}`;
            return (
              <li key={modulo.id} className={estilos.moduloOpcional}>
                <Interruptor
                  isSelected={ligado}
                  aria-describedby={idDaDescricao}
                  onChange={(ligar) => {
                    // Um pedido por vez: o próximo espera a resposta do anterior.
                    if (modulo.id in pedidos) return;
                    if (ligar) return void mudar(modulo, true);
                    definirDesligando(modulo);
                    definirConfirmando(true);
                  }}
                >
                  <span className={estilos.nomeDoModulo}>{modulo.nome}</span>{' '}
                  <span className={estilos.situacaoDoModulo}>
                    {ligado ? 'Ligado' : 'Desligado'}
                  </span>
                </Interruptor>
                <p id={idDaDescricao} className={estilos.textoDaParte}>
                  {modulo.descricao}
                </p>
                <MensagemDoPasso texto={recusa?.texto ?? null} chave={recusa?.vez ?? 0} />
              </li>
            );
          })}
        </ul>
      )}
      <Dialogo
        alerta
        titulo={`Desligar o módulo ${desligando?.nome ?? ''}?`}
        aberto={confirmando}
        aoMudarAberto={definirConfirmando}
        acoes={(fechar) => (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao
              nivel="destrutivo"
              onPress={() => {
                fechar();
                if (desligando) void mudar(desligando, false);
              }}
            >
              Desligar o módulo
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          O módulo {desligando?.nome} some do dock e da busca de todos, e os dados dele ficam
          guardados. Ligar de novo traz tudo como estava.
        </p>
      </Dialogo>
    </div>
  );
}
