// A escolha do ativo no chamado aberto, no "Trocar o ativo" e no "Virar OS" (change chamados-da-ti,
// design, "A busca do ativo com mais opções (tarefa 5.30)"): a busca do campo Ativo do formulário,
// com o detalhe de cada ativo achado, e "Mais opções de busca", na linha do rótulo, com o tipo, o
// local e o responsável. Esconder as opções limpa os filtros, para nada filtrar fora da vista.
import { Selecao } from '@grafite/ui';
import { ListFilter } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { SeletorDeLocal } from '../../administracao/seletores/SeletorDeLocal.tsx';
import { useTipos } from '../../ativos/consultas.ts';
import { useBuscaDaPessoa } from '../formulario/useBuscaDaPessoa.ts';
import { useBuscaDoAtivo } from '../formulario/useBuscaDoAtivo.ts';
import estilos from './EscolhaDoAtivo.module.css';

const SEM_TIPOS: readonly string[] = [];
const QUALQUER_TIPO = 'qualquer';
const ordemDosNomes = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export interface PropsDaEscolhaDoAtivo {
  valor: ContaDoSeletor | null;
  aoMudar: (ativo: ContaDoSeletor | null) => void;
  /** A pessoa do chamado, cujos ativos a lista sugere sem texto e sem filtro. */
  pessoa: { id: string; nome: string };
  descricao?: string;
  erro?: string;
}

export function EscolhaDoAtivo({ valor, aoMudar, pessoa, descricao, erro }: PropsDaEscolhaDoAtivo) {
  const [maisOpcoes, definirMaisOpcoes] = useState(false);
  const [tipo, definirTipo] = useState<string | null>(null);
  const [local, definirLocal] = useState<string | null>(null);
  const [responsavel, definirResponsavel] = useState<ContaDoSeletor | null>(null);
  const filtros = useMemo(
    () => ({ tipo, local, responsavel: responsavel?.id ?? null }),
    [tipo, local, responsavel],
  );
  const { buscar } = useBuscaDoAtivo({ quem: 'chamado', pessoa, tipos: SEM_TIPOS, filtros });
  const { buscar: buscarPessoa } = useBuscaDaPessoa('chamado');
  const tipos = useTipos();
  const opcoesDosTipos = useMemo(
    () => [
      { id: QUALQUER_TIPO, rotulo: 'Qualquer tipo' },
      ...(tipos.data?.tipos ?? [])
        .filter((cada) => cada.situacao === 'ativo')
        .map((cada) => ({ id: cada.id, rotulo: cada.nome }))
        .sort((a, b) => ordemDosNomes.compare(a.rotulo, b.rotulo)),
    ],
    [tipos.data],
  );
  const idDasOpcoes = useId();

  const alternar = () => {
    if (maisOpcoes) {
      definirTipo(null);
      definirLocal(null);
      definirResponsavel(null);
    }
    definirMaisOpcoes(!maisOpcoes);
  };

  return (
    <div className={estilos.escolha}>
      <SeletorDeConta
        rotulo="Ativo"
        valor={valor}
        aoMudar={aoMudar}
        buscar={buscar}
        placeholder="Nome, patrimônio, série ou hostname"
        descricao={descricao}
        erro={erro}
        acaoDoRotulo={{
          texto: maisOpcoes ? 'Esconder as opções de busca' : 'Mais opções de busca',
          icone: ListFilter,
          expandida: maisOpcoes,
          controla: maisOpcoes ? idDasOpcoes : undefined,
          aoPressionar: alternar,
        }}
      />
      {maisOpcoes && (
        <fieldset id={idDasOpcoes} aria-label="Mais opções de busca" className={estilos.opcoes}>
          <Selecao
            rotulo="Tipo"
            opcoes={opcoesDosTipos}
            selectedKey={tipo ?? QUALQUER_TIPO}
            onSelectionChange={(chave) => {
              const escolhido = String(chave);
              definirTipo(escolhido === QUALQUER_TIPO ? null : escolhido);
            }}
          />
          <SeletorDeLocal
            rotulo="Local"
            valor={local}
            aoMudar={definirLocal}
            limpavel
            placeholder="Qualquer local"
            descricao="Com os locais de dentro do escolhido."
          />
          <SeletorDeConta
            rotulo="Responsável"
            valor={responsavel}
            aoMudar={definirResponsavel}
            buscar={buscarPessoa}
            placeholder="Qualquer pessoa"
          />
        </fieldset>
      )}
    </div>
  );
}
