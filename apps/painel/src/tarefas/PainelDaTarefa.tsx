// O painel da tarefa (spec painel-da-operacao, "Tarefas do painel pelos mesmos comandos"): o que o
// comando escreve aparece ao vivo, as perguntas e as confirmações viram um diálogo, a senha é
// digitada sem aparecer, e o fim diz o resultado: o sucesso, ou a mensagem da falha. Fechar o
// diálogo sem responder cancela a tarefa, como o Ctrl+C.
import { Botao, CampoDeSenha, CampoDeTexto, Dialogo, RotuloDeSituacao } from '@grafite/ui';
import { useEffect, useState } from 'react';
import type { Andamento, PerguntaDaTarefa } from './andamento.ts';
import estilos from './PainelDaTarefa.module.css';

const TITULO = { texto: 'Pergunta', segredo: 'Senha', confirmacao: 'Confirmação' } as const;

function DialogoDaPergunta({
  pergunta,
  responder,
  cancelar,
}: {
  pergunta: PerguntaDaTarefa;
  responder: (resposta: string) => void;
  cancelar: () => void;
}) {
  const [resposta, setResposta] = useState(pergunta.padrao ?? '');
  const enviar = () => responder(resposta);
  return (
    <Dialogo
      titulo={TITULO[pergunta.modo]}
      aberto
      aoMudarAberto={(aberto) => {
        if (!aberto) cancelar();
      }}
      acoes={
        <>
          <Botao onPress={cancelar}>Cancelar a tarefa</Botao>
          <Botao nivel="primario" onPress={enviar}>
            {pergunta.modo === 'confirmacao' ? 'Confirmar' : 'Responder'}
          </Botao>
        </>
      }
    >
      <form
        className={estilos.formulario}
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar();
        }}
      >
        <p>{pergunta.texto}</p>
        {pergunta.modo === 'confirmacao' && (
          <p>
            Digite <strong className={estilos.mono}>{pergunta.esperado}</strong> para continuar.
          </p>
        )}
        {pergunta.modo === 'segredo' ? (
          <CampoDeSenha
            rotulo="Senha"
            autoComplete="current-password"
            value={resposta}
            onChange={setResposta}
            autoFocus
          />
        ) : (
          <CampoDeTexto
            rotulo={pergunta.modo === 'confirmacao' ? 'Texto da confirmação' : 'Resposta'}
            value={resposta}
            onChange={setResposta}
            autoFocus
          />
        )}
      </form>
    </Dialogo>
  );
}

export function PainelDaTarefa({
  andamento,
  responder,
  cancelar,
  fechar,
}: {
  andamento: Andamento;
  responder: (id: string, resposta: string) => void;
  cancelar: () => void;
  fechar: () => void;
}) {
  const { tarefa, rodando, linhas, pergunta, fim, recusa } = andamento;
  // Com uma tarefa rodando, a página avisa antes de fechar: fechar não para o comando, mas tira a
  // pessoa do andamento e das perguntas dele.
  useEffect(() => {
    if (!rodando) return;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [rodando]);

  if (tarefa === null && recusa === null) return null;
  return (
    <section className={estilos.painel} aria-label="Andamento da tarefa">
      {recusa !== null && (
        <p role="alert" className={estilos.recusa}>
          {recusa}
        </p>
      )}
      {tarefa !== null && (
        <>
          <div className={estilos.cabecalho}>
            <h2>{tarefa}</h2>
            {rodando ? (
              <RotuloDeSituacao situacao="info">Rodando</RotuloDeSituacao>
            ) : fim?.codigo === 0 ? (
              <RotuloDeSituacao situacao="sucesso">Pronta</RotuloDeSituacao>
            ) : (
              <RotuloDeSituacao situacao="critico">Não terminou</RotuloDeSituacao>
            )}
            <div className={estilos.acoes}>
              {rodando ? (
                <Botao onPress={cancelar}>Cancelar a tarefa</Botao>
              ) : (
                <Botao onPress={fechar}>Fechar</Botao>
              )}
            </div>
          </div>
          {rodando && (
            <p className={estilos.nota}>Enquanto "{tarefa}" roda, as outras ações esperam.</p>
          )}
          <ol className={estilos.linhas} aria-live="polite">
            {linhas.map((linha) => (
              <li key={linha.numero} className={linha.erro ? estilos.erro : undefined}>
                {linha.erro && <span className={estilos.marca}>Erro: </span>}
                {linha.texto}
              </li>
            ))}
          </ol>
          {fim !== null && <p className={estilos.resultado}>{fim.resultado}</p>}
        </>
      )}
      {pergunta !== null && (
        <DialogoDaPergunta
          key={pergunta.id}
          pergunta={pergunta}
          responder={(resposta) => responder(pergunta.id, resposta)}
          cancelar={cancelar}
        />
      )}
    </section>
  );
}
