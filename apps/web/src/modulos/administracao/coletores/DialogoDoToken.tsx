import { Botao, Dialogo, TextoParaCopiar } from '@grafite/ui';
import estilos from '../Administracao.module.css';

/**
 * O token do coletor, mostrado uma vez só, no cadastro e na troca (spec modulo-administracao,
 * "Tela de coletores"), com "Copiar" e o aviso de que ele não aparece de novo. Fechado, o token sai
 * da tela.
 */
export function DialogoDoToken({
  nome,
  token,
  aoFechar,
}: {
  nome: string;
  token: string | null;
  aoFechar: () => void;
}) {
  return (
    <Dialogo
      titulo={`Token do ${nome}`}
      aberto={token !== null}
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      acoes={(fechar) => (
        <Botao nivel="primario" onPress={fechar}>
          Fechar
        </Botao>
      )}
    >
      <p className={estilos.informacao}>
        Ponha o token na configuração do coletor, em GRAFITE_COLETOR_TOKEN, e reinicie o serviço.
      </p>
      {token && <TextoParaCopiar rotulo="Token" valor={token} />}
      <p className={estilos.informacao}>Copie o token agora: ele não aparece de novo.</p>
    </Dialogo>
  );
}
