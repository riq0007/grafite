import { avisar, Botao, CampoDeTexto, Dialogo, MensagemDoPasso } from '@grafite/ui';
import { useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { Confirmacao } from '../Confirmacao.tsx';
import type { Ficha } from './ficha.ts';

/** Põe na ficha a pessoa como a API a devolveu. */
export type AplicarNaPessoa = (pessoa: Ficha) => void;

/**
 * As ações sobre a pessoa, ao lado do título da ficha (spec administracao-de-pessoas): "Reativar"
 * e, separadas e confirmadas, "Inativar" e "Anonimizar", conforme a API permite.
 */
export function AcoesDaPessoa({ pessoa, aplicar }: { pessoa: Ficha; aplicar: AplicarNaPessoa }) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const { permite } = pessoa;
  if (!permite.reativar && !permite.inativar && !permite.anonimizar) return null;
  const naPessoa = { params: { path: { id: pessoa.id } } };

  async function reativar() {
    definirReativando(true);
    definirFalha(null);
    const resultado = await pedir(
      () => api.POST('/pessoas/{id}/reativacao', naPessoa),
      'reativar a pessoa',
    );
    definirReativando(false);
    if ('erro' in resultado) {
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
      return;
    }
    aplicar(resultado.dados);
    avisar({
      situacao: 'sucesso',
      titulo: 'Pessoa reativada.',
      ...(resultado.dados.conta?.situacao === 'inativa' && {
        descricao: 'A conta continua inativa até ser reativada na aba Acesso.',
      }),
    });
  }

  /** Uma ação confirmada: a pessoa como ficou vai para a ficha. */
  const confirmada =
    (fazer: () => Promise<{ dados: Ficha } | FalhaDoPedido>, aviso: string) => async () => {
      const resultado = await fazer();
      if ('erro' in resultado) return resultado;
      aplicar(resultado.dados);
      avisar({ situacao: 'sucesso', titulo: aviso });
      return { ok: true } as const;
    };

  return (
    <div className={estilos.acoesDaPessoa}>
      <div className={estilos.gruposDeAcoes}>
        {permite.reativar && (
          <Botao carregando={reativando} rotuloCarregando="Reativando" onPress={reativar}>
            Reativar
          </Botao>
        )}
        {(permite.inativar || permite.anonimizar) && (
          <div className={estilos.acoes}>
            {permite.inativar && (
              <Confirmacao
                acao="Inativar"
                titulo={`Inativar ${pessoa.nome}?`}
                confirmar="Inativar a pessoa"
                confirmando="Inativando"
                fazer={confirmada(
                  () =>
                    pedir(
                      () => api.POST('/pessoas/{id}/inativacao', naPessoa),
                      'inativar a pessoa',
                    ),
                  'Pessoa inativada.',
                )}
              >
                <p className={estilos.informacao}>
                  {pessoa.conta &&
                    'A conta da pessoa também fica inativa, e as sessões abertas terminam. '}
                  Os dados continuam registrados, e a pessoa pode ser reativada.
                </p>
              </Confirmacao>
            )}
            {permite.anonimizar && (
              <AnonimizarPessoa
                pessoa={pessoa}
                fazer={confirmada(
                  () =>
                    pedir(
                      () => api.POST('/pessoas/{id}/anonimizacao', naPessoa),
                      'anonimizar a pessoa',
                    ),
                  'Pessoa anonimizada.',
                )}
              />
            )}
          </div>
        )}
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}

/**
 * Anonimizar, sem volta (spec modulo-administracao): a confirmação diz o que é apagado e o que
 * fica, e só libera "Anonimizar" depois que o nome da pessoa é digitado.
 */
function AnonimizarPessoa({
  pessoa,
  fazer,
}: {
  pessoa: Ficha;
  fazer: () => Promise<{ ok: true } | { erro: string }>;
}) {
  const [aberto, definirAberto] = useState(false);
  const [nome, definirNome] = useState('');
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const liberado = nome.trim() === pessoa.nome;

  async function anonimizar(fechar: () => void) {
    if (!liberado) return;
    definirEnviando(true);
    definirFalha(null);
    try {
      const resultado = await fazer();
      if ('ok' in resultado) return fechar();
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Dialogo
      alerta
      titulo={`Anonimizar ${pessoa.nome}?`}
      gatilho={<Botao nivel="destrutivo">Anonimizar</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        definirNome('');
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="destrutivo"
            isDisabled={!liberado}
            carregando={enviando}
            rotuloCarregando="Anonimizando"
            onPress={() => anonimizar(fechar)}
          >
            Anonimizar
          </Botao>
        </>
      )}
    >
      <p className={estilos.informacao}>Não dá para desfazer. É apagado:</p>
      <ul className={estilos.listaDeTexto}>
        <li>o nome, trocado por “Pessoa anonimizada” e um código;</li>
        <li>o e-mail, a matrícula, o local de trabalho e o telefone;</li>
        {pessoa.conta && (
          <>
            <li>o usuário e a senha da conta, e o usuário fica livre para outra pessoa;</li>
            <li>a verificação em dois passos e os códigos de recuperação;</li>
            <li>o IP e o dispositivo das sessões e as tentativas de entrada;</li>
            <li>os perfis e os grupos da conta, que se encerram.</li>
          </>
        )}
      </ul>
      <p className={estilos.informacao}>Fica:</p>
      <ul className={estilos.listaDeTexto}>
        <li>os registros da auditoria que citam a pessoa, com o nome anonimizado.</li>
      </ul>
      <CampoDeTexto
        rotulo="Para confirmar, digite o nome da pessoa"
        descricao={`Digite: ${pessoa.nome}`}
        autoComplete="off"
        value={nome}
        onChange={definirNome}
      />
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}
