// O passo Pacote do assistente da distribuição (change software-por-pacote, design, decisão 10): os
// pacotes ativos da base, com a busca pelo nome, para escolher o que instalar.
import { normalizarTexto } from '@grafite/domain';
import { CabecalhoDaPagina, CampoDeTexto, EstadoVazio, GrupoDeRadios, Radio } from '@grafite/ui';
import { useState } from 'react';
import estilos from './Assistente.module.css';
import type { PacoteNaBase } from './consultas.ts';
import { nomeComVersao, tipoETamanho } from './formatos.ts';
import { IconeDoPacote } from './Pecas.tsx';

export function PassoDoPacote({
  pacotes,
  carregando,
  falha,
  escolhido,
  aoEscolher,
}: {
  /** Os pacotes ativos da base. */
  pacotes: readonly PacoteNaBase[];
  carregando: boolean;
  falha: string | null;
  escolhido: string | null;
  aoEscolher: (id: string) => void;
}) {
  const [busca, definirBusca] = useState('');
  const termo = normalizarTexto(busca.trim());
  const vistos = pacotes.filter((pacote) => !termo || normalizarTexto(pacote.nome).includes(termo));
  return (
    <>
      <CabecalhoDaPagina
        titulo="Qual pacote distribuir?"
        detalhe="Só os pacotes ativos da base entram numa distribuição."
      />
      <div className={estilos.ferramentas}>
        <CampoDeTexto
          rotulo="Procurar na base"
          type="search"
          value={busca}
          onChange={definirBusca}
          autoComplete="off"
          className={estilos.filtro}
        />
      </div>
      {carregando ? (
        <p role="status" className={estilos.nota}>
          Carregando a base de pacotes…
        </p>
      ) : falha ? (
        <EstadoVazio titulo={falha} />
      ) : pacotes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum pacote ativo na base."
          descricao="Cadastre o pacote na base para distribuir."
        />
      ) : vistos.length === 0 ? (
        <p role="status" className={estilos.nota}>
          Nenhum pacote ativo com esse nome.
        </p>
      ) : (
        <GrupoDeRadios
          rotulo="Pacotes ativos"
          value={escolhido}
          onChange={aoEscolher}
          className={estilos.pacotes}
        >
          {vistos.map((pacote) => (
            <Radio key={pacote.id} value={pacote.id} className={estilos.opcaoDoPacote}>
              <IconeDoPacote nome={pacote.nome} />
              <span className={estilos.textoDoPacote}>
                <b>{nomeComVersao(pacote)}</b>
                <span>
                  {[tipoETamanho(pacote), pacote.categoria?.nome].filter(Boolean).join(' · ')}
                </span>
              </span>
            </Radio>
          ))}
        </GrupoDeRadios>
      )}
    </>
  );
}
