import { FlaskConical } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Marca } from '../brand/Marca.tsx';
import { useEstadoDaChegada } from '../casca/montagem.ts';
import { Icone } from '../icones/Icone.tsx';
import estilos from './Entrada.module.css';

export interface PropsDaTelaDeEntrada {
  /** O nome da organização do endereço; sem ele (endereço desconhecido), só a marca. */
  organizacao?: string;
  /** O passo da vez: as credenciais, o código, a senha nova ou o cadastro dos dois passos. */
  children: ReactNode;
  /** Qual é o passo da vez: depois da primeira troca, cada passo novo aparece por opacidade. */
  passo?: string;
  /** No ambiente de teste, o aviso de que os dados são uma cópia da produção vem acima do passo. */
  ambienteDeTeste?: boolean;
}

/** A tela de entrada: superfície sólida sobre o fundo do tema, sem vidro (ANTISLOP v2). */
export function TelaDeEntrada({
  organizacao,
  children,
  passo,
  ambienteDeTeste = false,
}: PropsDaTelaDeEntrada) {
  // O primeiro passo já nasce no lugar; a partir da primeira troca, o passo novo aparece.
  const [anterior, definirAnterior] = useState(passo);
  const [trocou, definirTrocou] = useState(false);
  if (passo !== anterior) {
    definirAnterior(passo);
    definirTrocou(true);
  }
  // Até a chegada mostrar a entrada, ela espera por baixo, sem receber foco nem ser lida. O passo
  // só se desenha depois, para o foco começar no campo dele.
  const chegada = useEstadoDaChegada();
  const esperando = chegada === 'carregando' || chegada === 'boas-vindas';
  return (
    <main className={estilos.tela} data-tela-de-entrada="" inert={esperando || undefined}>
      <div className={estilos.coluna}>
        <Marca altura={24} />
        {organizacao && <p className={estilos.organizacao}>{organizacao}</p>}
        {ambienteDeTeste && (
          <div className={estilos.ambiente}>
            <p className={estilos.ambienteTitulo}>
              <Icone icone={FlaskConical} />
              Ambiente de teste
            </p>
            <p className={estilos.texto}>
              Os dados são uma cópia da produção. O que mudar aqui não vai para a produção.
            </p>
          </div>
        )}
        <section className={estilos.cartao} data-trocou={trocou || undefined}>
          {esperando ? null : children}
        </section>
      </div>
    </main>
  );
}
