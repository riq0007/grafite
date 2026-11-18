// O campo Anexo do formulário que se preenche (change chamados-da-ti, design, decisões 10 e 21):
// cada arquivo vai na hora, um a um, pelo `POST /chamados/anexos`, antes da gravação, que os toma.
// A lista mostra cada arquivo com o nome, o tamanho, o download e "Tirar", e os que ainda vão, com
// o progresso ou "Na fila". Até 5; os escolhidos a mais ficam de fora, com o nome. Na prévia, o
// arquivo não é enviado: entra na resposta só no navegador.
import type { components } from '@grafite/api-client';
import { type CampoDoFormulario, MAXIMO_DE_ANEXOS } from '@grafite/domain';
import {
  BarraDeProgresso,
  Botao,
  FORMATOS_DE_ARQUIVO,
  formatarTamanho,
  Icone,
  recusaAntesDoEnvio,
} from '@grafite/ui';
import { FileText, Paperclip } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { enderecoDoAnexo, recusaDoArquivo, recusaDoLimite, separarPeloLimite } from './anexos.ts';
import { type AnexoCitado, descricaoDoCampo, type QuemPreenche } from './estado.ts';
import estilos from './Formulario.module.css';
import { Recusa } from './Recusa.tsx';

type AnexoEnviado = components['schemas']['AnexoEnviado'];

export interface PropsDosAnexosDoCampo {
  campo: CampoDoFormulario;
  /** Os arquivos da resposta, na ordem. */
  ids: readonly string[];
  anexos: ReadonlyMap<string, AnexoCitado>;
  editavel: boolean;
  quem: QuemPreenche;
  /** O número do chamado aberto, de onde baixam os arquivos dele. */
  numero?: number;
  erro?: string;
  /** O arquivo que entrou: o enviado, ou o da prévia, que só está no navegador. */
  aoAnexar: (id: string, anexo: AnexoCitado) => void;
  aoTirar: (id: string) => void;
}

/** O arquivo que ainda vai, na ordem da escolha. */
interface Pendente {
  chave: number;
  arquivo: File;
}

/** A recusa de um arquivo, com a chave da lista: dois arquivos podem ter a mesma recusa. */
interface RecusaDoEnvio {
  chave: number;
  texto: string;
}

export function AnexosDoCampo({
  campo,
  ids,
  anexos,
  editavel,
  quem,
  numero,
  erro,
  aoAnexar,
  aoTirar,
}: PropsDosAnexosDoCampo) {
  const api = useApi();
  const id = useId();
  const escolha = useRef<HTMLInputElement>(null);
  const [fila, definirFila] = useState<readonly Pendente[]>([]);
  const [progresso, definirProgresso] = useState<number | null>(null);
  const [recusas, definirRecusas] = useState<readonly RecusaDoEnvio[]>([]);
  // A fila e o envio em andamento ficam fora do estado, para o envio seguinte começar no fim do
  // anterior, sem esperar uma renderização.
  const aEnviar = useRef<Pendente[]>([]);
  const enviando = useRef(false);
  const proximaChave = useRef(0);
  const recusa = (texto: string): RecusaDoEnvio => ({ chave: proximaChave.current++, texto });
  // O envio que acaba responde pela peça de agora: o tipo pode ter mudado no meio da fila.
  const atuais = useRef({ aoAnexar });
  useLayoutEffect(() => {
    atuais.current = { aoAnexar };
  });
  // Desmontado, o envio em curso acaba sem entrar na resposta, e a fila para: o arquivo enviado
  // fica sem dono, para a manutenção (decisão 10).
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  async function enviarAFila() {
    if (enviando.current) return;
    enviando.current = true;
    try {
      for (let atual = aEnviar.current[0]; atual; atual = aEnviar.current[0]) {
        const { arquivo } = atual;
        definirProgresso(0);
        const resultado = await pedir(
          () =>
            api.enviarArquivo<AnexoEnviado>(
              `/chamados/anexos?nome=${encodeURIComponent(arquivo.name)}`,
              arquivo,
              definirProgresso,
              'POST',
            ),
          'enviar o arquivo',
        );
        if (!vivo.current) return;
        aEnviar.current = aEnviar.current.slice(1);
        definirFila(aEnviar.current);
        if ('erro' in resultado) {
          const texto = recusaDoArquivo(arquivo.name, resultado.erro);
          definirRecusas((antes) => [...antes, recusa(texto)]);
        } else {
          const { id: anexoId, nome, bytes } = resultado.dados;
          atuais.current.aoAnexar(anexoId, { nome, bytes, onde: 'sem-dono' });
        }
      }
    } finally {
      // Uma exceção no laço não prende a fila.
      enviando.current = false;
      definirProgresso(null);
    }
  }

  function receber(escolhidos: readonly File[]) {
    const novas: RecusaDoEnvio[] = [];
    const aceitos: File[] = [];
    for (const arquivo of escolhidos) {
      const motivo = recusaAntesDoEnvio(arquivo);
      if (motivo) novas.push(recusa(recusaDoArquivo(arquivo.name, motivo)));
      else aceitos.push(arquivo);
    }
    const { vao, ficam } = separarPeloLimite(ids.length + aEnviar.current.length, aceitos);
    if (ficam.length > 0) novas.push(recusa(recusaDoLimite(ficam.map((arquivo) => arquivo.name))));
    definirRecusas(novas);
    if (quem === 'pessoa') {
      for (const arquivo of vao) {
        aoAnexar(crypto.randomUUID(), {
          nome: arquivo.name,
          bytes: arquivo.size,
          onde: 'no-navegador',
        });
      }
      return;
    }
    if (vao.length === 0) return;
    aEnviar.current = [
      ...aEnviar.current,
      ...vao.map((arquivo) => ({ chave: proximaChave.current++, arquivo })),
    ];
    definirFila(aEnviar.current);
    void enviarAFila();
  }

  const exigido = campo.obrigatorio && !campo.soDaTi;
  const descricao =
    [
      descricaoDoCampo(campo),
      editavel && quem === 'pessoa' && 'Na prévia, o arquivo não é enviado.',
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  const cabeMais = editavel && ids.length + fila.length < MAXIMO_DE_ANEXOS;
  const vazio = ids.length === 0 && fila.length === 0;
  return (
    <fieldset
      aria-labelledby={`${id}-rotulo`}
      aria-describedby={descricao ? `${id}-descricao` : undefined}
      className={estilos.anexos}
    >
      <span id={`${id}-rotulo`} className={estilos.rotulo} data-parte="rotulo">
        {campo.rotulo}
        {/* O grupo não anuncia a obrigatoriedade pelo controle: a marca é lida com o nome. */}
        {editavel && exigido && (
          <>
            {' '}
            <span className={estilos.obrigatorio}>obrigatório</span>
          </>
        )}
      </span>
      {vazio && !editavel && (
        <p className={estilos.resposta} data-vazia="">
          Sem resposta
        </p>
      )}
      {!vazio && (
        <ul className={estilos.arquivos}>
          {ids.map((anexoId) => {
            const anexo = anexos.get(anexoId);
            const nome = anexo?.nome ?? 'Arquivo';
            const endereco = enderecoDoAnexo(anexoId, anexo, numero);
            return (
              <li key={anexoId} className={estilos.arquivo}>
                <Icone icone={FileText} />
                <span className={estilos.nome} title={nome}>
                  {nome}
                </span>
                {anexo && <span className={estilos.tamanho}>{formatarTamanho(anexo.bytes)}</span>}
                {endereco && (
                  <a
                    href={endereco}
                    download={nome}
                    aria-label={`Baixar ${nome}`}
                    className={estilos.baixar}
                  >
                    Baixar
                  </a>
                )}
                {editavel && (
                  <Botao
                    nivel="terciario"
                    aria-label={`Tirar ${nome}`}
                    onPress={() => aoTirar(anexoId)}
                  >
                    Tirar
                  </Botao>
                )}
              </li>
            );
          })}
          {fila.map(({ chave, arquivo }, posicao) => (
            <li key={`na-fila-${chave}`} className={estilos.arquivo}>
              <Icone icone={FileText} />
              <span className={estilos.nome} title={arquivo.name}>
                {arquivo.name}
              </span>
              {posicao === 0 ? (
                <BarraDeProgresso
                  rotulo={`Enviando ${arquivo.name}`}
                  valor={progresso ?? undefined}
                  className={estilos.progresso}
                />
              ) : (
                <span className={estilos.tamanho}>Na fila</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {cabeMais && (
        <div className={estilos.acoes}>
          <input
            ref={escolha}
            type="file"
            multiple
            hidden
            accept={FORMATOS_DE_ARQUIVO.join(',')}
            onChange={(evento) => {
              receber([...(evento.target.files ?? [])]);
              // O mesmo arquivo pode ser escolhido de novo, depois de tirado.
              evento.target.value = '';
            }}
          />
          <Botao icone={Paperclip} onPress={() => escolha.current?.click()}>
            Anexar arquivos
          </Botao>
        </div>
      )}
      {descricao && (
        <p id={`${id}-descricao`} className={estilos.descricao}>
          {descricao}
        </p>
      )}
      {recusas.map(({ chave, texto }) => (
        <Recusa key={chave} texto={texto} />
      ))}
      {erro && <Recusa texto={erro} />}
    </fieldset>
  );
}
