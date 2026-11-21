// A fila dos anexos que vão um a um pelo `POST /chamados/anexos`, antes da gravação que os toma
// (change chamados-da-ti, design, decisões 10 e 21, e "O campo de escrever (tarefa 5.12)"): a do
// campo Anexo do formulário que se preenche e a do campo de escrever do chamado aberto. A caixa do
// chat usa a mesma fila, pelo `POST /chat/anexos` (change chat-com-chamados). Até 5; os escolhidos a
// mais ficam de fora, com o nome. Na prévia, o arquivo não é enviado: entra só no navegador.
import type { components } from '@grafite/api-client';
import { recusaAntesDoEnvio } from '@grafite/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDoArquivo, recusaDoLimite, separarPeloLimite } from './anexos.ts';
import type { AnexoCitado } from './estado.ts';

type AnexoEnviado = components['schemas']['AnexoEnviado'];

/** O arquivo que ainda vai, na ordem da escolha. */
export interface AnexoNaFila {
  chave: number;
  arquivo: File;
}

/** A recusa de um arquivo, com a chave da lista: dois arquivos podem ter a mesma recusa. */
export interface RecusaDoEnvio {
  chave: number;
  texto: string;
}

export interface FilaDeAnexos {
  /** Os que ainda vão, na ordem; o primeiro está indo. */
  fila: readonly AnexoNaFila[];
  /** O progresso do primeiro da fila, ou nulo sem envio. */
  progresso: number | null;
  /** As recusas da última escolha e dos envios dela. */
  recusas: readonly RecusaDoEnvio[];
  /** Os escolhidos: os recusados antes do envio e os a mais ficam de fora, com a recusa. */
  receber: (escolhidos: readonly File[]) => void;
  limparRecusas: () => void;
}

export interface PropsDaFilaDeAnexos {
  /** Os arquivos que já estão na resposta ou na mensagem. */
  ocupados: number;
  /** Na prévia, o arquivo entra só no navegador, sem envio. */
  soNoNavegador: boolean;
  /** O arquivo que entrou: o enviado, ou o da prévia, que só está no navegador. */
  aoAnexar: (id: string, anexo: AnexoCitado) => void;
  /** Para onde o arquivo vai; sem ele, os anexos dos chamados. */
  endereco?: '/chamados/anexos' | '/chat/anexos';
}

export function useFilaDeAnexos({
  ocupados,
  soNoNavegador,
  aoAnexar,
  endereco = '/chamados/anexos',
}: PropsDaFilaDeAnexos): FilaDeAnexos {
  const api = useApi();
  const [fila, definirFila] = useState<readonly AnexoNaFila[]>([]);
  const [progresso, definirProgresso] = useState<number | null>(null);
  const [recusas, definirRecusas] = useState<readonly RecusaDoEnvio[]>([]);
  // A fila e o envio em andamento ficam fora do estado, para o envio seguinte começar no fim do
  // anterior, sem esperar uma renderização.
  const aEnviar = useRef<AnexoNaFila[]>([]);
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
              `${endereco}?nome=${encodeURIComponent(arquivo.name)}`,
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
    const { vao, ficam } = separarPeloLimite(ocupados + aEnviar.current.length, aceitos);
    if (ficam.length > 0) novas.push(recusa(recusaDoLimite(ficam.map((arquivo) => arquivo.name))));
    definirRecusas(novas);
    if (soNoNavegador) {
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

  return { fila, progresso, recusas, receber, limparRecusas: () => definirRecusas([]) };
}
