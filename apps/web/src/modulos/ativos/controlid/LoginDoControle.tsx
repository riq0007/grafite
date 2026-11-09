// O login do controle escolhido na ficha (spec saude-do-control-id, "Login escolhido na ficha do
// controle"; change login-de-cada-controle, design, decisão 5): o diálogo lê, ao abrir, os logins
// que servem e o próprio do controle, e salvar grava a escolha no cofre, avisa e atualiza a ficha e
// a lista dos ativos. A recusa aparece no diálogo, que fica aberto.
import { avisar, Botao, Dialogo, type OpcaoDeSelecao, Selecao } from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { CHAVE_DOS_ATIVOS, chaveDoAtivo } from '../consultas.ts';

/** A primeira opção: o login do tipo, ou nenhum, quando o tipo não tem login. */
const DO_TIPO = 'do-tipo';

const chaveDaEscolha = (ativoId: string) => ['login-do-controle', ativoId] as const;

export function EscolherLoginDoControle({ ativoId }: { ativoId: string }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [aberto, definirAberto] = useState(false);
  // A escolha feita no diálogo; sem ela, vale o login próprio do controle, ou a primeira opção.
  const [escolhido, definirEscolhido] = useState<string | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const escolha = useQuery({
    queryKey: chaveDaEscolha(ativoId),
    queryFn: () =>
      consultar(
        () => api.GET('/cofre/controles/{id}/login', { params: { path: { id: ativoId } } }),
        'carregar os logins do controle',
      ),
    enabled: aberto,
  });
  const opcoes: OpcaoDeSelecao[] = escolha.data
    ? [
        { id: DO_TIPO, rotulo: escolha.data.tipoTemLogin ? 'Login do tipo' : 'Nenhum' },
        ...escolha.data.logins.map(({ id, nome }) => ({ id, rotulo: nome })),
      ]
    : [];
  const selecionado = escolhido ?? escolha.data?.proprio ?? DO_TIPO;

  const mudarAberto = (abrir: boolean) => {
    definirAberto(abrir);
    definirEscolhido(null);
    definirErro(null);
  };

  return (
    <Dialogo
      gatilho={<Botao>Escolher login</Botao>}
      titulo="Login do controle"
      aberto={aberto}
      aoMudarAberto={mudarAberto}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={salvando}
            rotuloCarregando="Salvando"
            isDisabled={!escolha.data}
            onPress={async () => {
              definirSalvando(true);
              definirErro(null);
              const resultado = await pedir(
                () =>
                  api.PUT('/cofre/controles/{id}/login', {
                    params: { path: { id: ativoId } },
                    body: { segredoId: selecionado === DO_TIPO ? null : selecionado },
                  }),
                'salvar o login do controle',
              );
              definirSalvando(false);
              if ('erro' in resultado) {
                definirErro(resultado.problema?.campos?.segredoId ?? resultado.erro);
                return;
              }
              consultas.setQueryData(chaveDaEscolha(ativoId), resultado.dados);
              fechar();
              avisar({ situacao: 'sucesso', titulo: 'Login do controle salvo.' });
              await Promise.all([
                consultas.invalidateQueries({ queryKey: chaveDoAtivo(ativoId) }),
                consultas.invalidateQueries({ queryKey: CHAVE_DOS_ATIVOS }),
              ]);
            }}
          >
            Salvar
          </Botao>
        </>
      )}
    >
      <Selecao
        rotulo="Login deste controle"
        descricao={
          escolha.error?.message ??
          'O coletor usa o login novo na próxima configuração, em até 5 minutos.'
        }
        opcoes={opcoes}
        placeholder={escolha.isPending ? 'Carregando os logins' : 'Selecione'}
        selectedKey={escolha.data ? selecionado : null}
        isDisabled={!escolha.data}
        onSelectionChange={(chave) => {
          definirEscolhido(String(chave));
          definirErro(null);
        }}
        erro={erro ?? undefined}
      />
    </Dialogo>
  );
}
