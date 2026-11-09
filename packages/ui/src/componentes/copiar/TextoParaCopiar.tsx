import { Check, Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Group } from 'react-aria-components';
import { Botao } from '../botao/Botao.tsx';
import { copiarParaAreaDeTransferencia } from './copiar.ts';
import estilos from './TextoParaCopiar.module.css';

export interface PropsDoTextoParaCopiar {
  /** O que é o valor, como "Senha temporária": nomeia o grupo para o leitor de tela. */
  rotulo: string;
  /** O que vai para a área de transferência e, sem `children`, o que aparece. */
  valor: string;
  /** O que aparece quando o navegador não deixa copiar. */
  falhou?: string;
  copiar?: (texto: string) => Promise<void>;
  /** O valor mostrado de outro jeito, como a chave em grupos de 4 ou os códigos numa lista. */
  children?: ReactNode;
  className?: string;
}

/**
 * Um valor em JetBrains Mono com o botão "Copiar", que passa a dizer "Copiado" depois de copiar.
 * Com outro valor, volta a dizer "Copiar".
 */
export function TextoParaCopiar({
  rotulo,
  valor,
  falhou = 'Não foi possível copiar. Selecione o texto e copie.',
  copiar = copiarParaAreaDeTransferencia,
  children,
  className,
}: PropsDoTextoParaCopiar) {
  // A situação vale para o valor que estava à vista ao copiar.
  const [copia, definirCopia] = useState<{ valor: string; deuCerto: boolean } | null>(null);
  const situacao = copia?.valor === valor ? (copia.deuCerto ? 'copiado' : 'falhou') : null;

  return (
    <Group aria-label={rotulo} className={[estilos.texto, className].filter(Boolean).join(' ')}>
      <div className={estilos.valor}>{children ?? valor}</div>
      <div className={estilos.acao}>
        <Botao
          nivel="secundario"
          icone={situacao === 'copiado' ? Check : Copy}
          onPress={async () => {
            try {
              await copiar(valor);
              definirCopia({ valor, deuCerto: true });
            } catch {
              definirCopia({ valor, deuCerto: false });
            }
          }}
        >
          {situacao === 'copiado' ? 'Copiado' : 'Copiar'}
        </Botao>
        {/* "Copiado." só para o leitor de tela, que não ouve a troca do nome do botão; a falha
            fica à vista, porque pede uma ação. */}
        <p role="status" className={situacao === 'falhou' ? estilos.falha : estilos.somenteLeitor}>
          {situacao === 'copiado' ? 'Copiado.' : situacao === 'falhou' ? falhou : null}
        </p>
      </div>
    </Group>
  );
}
