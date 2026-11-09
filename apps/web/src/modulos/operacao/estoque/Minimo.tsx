import { lerQuantidade, validarMinimo } from '@grafite/domain';
import { avisar, Botao, CampoDeTexto, Formulario, Gaveta, MensagemDoPasso } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import estilosDaOperacao from '../Operacao.module.css';
import { quantidadeEscrita } from './apresentacao.ts';
import { CHAVE_DO_ESTOQUE, type SaldoDoEstoque } from './consultas.ts';

/**
 * O mínimo de um consumível num local, numa gaveta aberta pela linha do estoque (spec estoque,
 * "Mínimo do consumível no local"; spec modulo-operacao, "Lançamento das movimentações"): de 0 a
 * 100.000, em que 0 é sem mínimo, com o retorno "Mínimo salvo.".
 */
export function GavetaDoMinimo({
  saldo,
  aoFechar,
}: {
  saldo: SaldoDoEstoque;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [minimo, definirMinimo] = useState(quantidadeEscrita(saldo.minimo));
  const [erro, definirErro] = useState<string | undefined>(undefined);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const lido = lerQuantidade(minimo);
    const recusa = validarMinimo(lido);
    if (recusa !== null || lido === null) {
      definirErro(recusa ?? undefined);
      campo.current?.focus();
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.PUT('/estoque/minimos/{consumivelId}/{localId}', {
            params: { path: { consumivelId: saldo.consumivel.id, localId: saldo.local.id } },
            body: { minimo: lido },
          }),
        'salvar o mínimo',
      );
      if ('erro' in resultado) {
        const { campos, erro: motivo } = recusaDe<'minimo'>(resultado);
        if (campos?.minimo) {
          definirErro(campos.minimo);
          campo.current?.focus();
          return;
        }
        definirFalha(motivo);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DO_ESTOQUE });
      avisar({ situacao: 'sucesso', titulo: 'Mínimo salvo.' });
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
      titulo="Definir mínimo"
    >
      <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
        <p className={estilosDaOperacao.informacao}>
          {saldo.consumivel.codigo} em {saldo.local.caminho}
        </p>
        <CampoDeTexto
          ref={campo}
          rotulo="Mínimo"
          inputMode="numeric"
          autoComplete="off"
          descricao="Abaixo dele, o consumível aparece em “O que resolver agora”. 0 é sem mínimo."
          value={minimo}
          onChange={(valor) => {
            definirMinimo(valor);
            definirErro(undefined);
          }}
          erro={erro}
        />
        <MensagemDoPasso texto={falha} chave={tentativa} />
        <div className={estilosDaOperacao.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Salvando">
            Salvar
          </Botao>
          <Botao nivel="terciario" onPress={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </Formulario>
    </Gaveta>
  );
}
