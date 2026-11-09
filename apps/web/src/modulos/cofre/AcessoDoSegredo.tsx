import { avisar, Botao, BuscaComSugestoes, MensagemDoPasso } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { Parte } from '../administracao/Parte.tsx';
import estilos from './Cofre.module.css';
import { aplicarSegredo, type FichaDoSegredo, useTitulares } from './consultas.ts';

type Titular = NonNullable<FichaDoSegredo['acesso']>[number];

const TIPOS: Record<Titular['tipo'], string> = { conta: 'Conta', grupo: 'Grupo', perfil: 'Perfil' };

const chave = ({ tipo, id }: Pick<Titular, 'tipo' | 'id'>) => `${tipo}:${id}`;

/**
 * O acesso na ficha (spec modulo-cofre, "Acesso na ficha"), só para quem administra o cofre: a
 * quem o segredo está liberado, pelo nome, com "Retirar" em cada um e a busca que inclui uma conta,
 * um grupo ou um perfil ativos. Cada mudança salva a lista inteira.
 */
export function AcessoDoSegredo({ segredo }: { segredo: FichaDoSegredo }) {
  const api = useApi();
  const consultas = useQueryClient();
  const titulares = useTitulares();
  const [escolhido, definirEscolhido] = useState<string | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const atuais = segredo.acesso ?? [];

  const opcoes = [
    ...(titulares.data?.contas.map((conta) => ({
      id: chave({ tipo: 'conta', id: conta.id }),
      rotulo: `Conta ${conta.nome}`,
    })) ?? []),
    ...(titulares.data?.grupos.map((grupo) => ({
      id: chave({ tipo: 'grupo', id: grupo.id }),
      rotulo: `Grupo ${grupo.nome}`,
    })) ?? []),
    ...(titulares.data?.perfis.map((perfil) => ({
      id: chave({ tipo: 'perfil', id: perfil.id }),
      rotulo: `Perfil ${perfil.nome}`,
    })) ?? []),
  ].filter((opcao) => !atuais.some((titular) => chave(titular) === opcao.id));

  const salvar = async (lista: Pick<Titular, 'tipo' | 'id'>[]) => {
    definirSalvando(true);
    definirFalha(null);
    try {
      const resultado = await pedir(
        () =>
          api.PUT('/cofre/segredos/{id}/acesso', {
            params: { path: { id: segredo.id } },
            body: { titulares: lista.map(({ tipo, id }) => ({ tipo, id })) },
          }),
        'salvar o acesso',
      );
      if ('erro' in resultado) {
        definirFalha(resultado.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await aplicarSegredo(consultas, resultado.dados);
      definirEscolhido(null);
      avisar({ situacao: 'sucesso', titulo: 'Acesso salvo.' });
    } finally {
      definirSalvando(false);
    }
  };

  const incluir = () => {
    if (!escolhido) return;
    const [tipo, id] = escolhido.split(':') as [Titular['tipo'], string];
    void salvar([...atuais, { tipo, id }]);
  };

  return (
    <Parte titulo="Acesso">
      <p className={estilos.informacao}>
        Quem está no acesso revela e copia o valor, com o cofre liberado pelo código do app.
      </p>
      {atuais.length === 0 ? (
        <p className={estilos.semValor}>Ninguém tem acesso a este segredo.</p>
      ) : (
        <ul className={estilos.lista} aria-label="Titulares do acesso">
          {atuais.map((titular) => (
            <li key={chave(titular)} className={estilos.acoes}>
              <span>{titular.nome}</span>
              <span className={estilos.semValor}>{TIPOS[titular.tipo]}</span>
              <Botao
                nivel="terciario"
                aria-label={`Retirar ${titular.nome} do acesso`}
                isDisabled={salvando}
                onPress={() =>
                  void salvar(atuais.filter((outro) => chave(outro) !== chave(titular)))
                }
              >
                Retirar
              </Botao>
            </li>
          ))}
        </ul>
      )}
      <div className={estilos.filtros}>
        <BuscaComSugestoes
          rotulo="Incluir no acesso"
          isDisabled={!titulares.data}
          descricao="Uma conta, um grupo ou um perfil, em qualquer local."
          sugestoes={opcoes}
          aceitaTextoLivre={false}
          selectedKey={escolhido}
          onSelectionChange={(selecionado) =>
            definirEscolhido(selecionado === null ? null : String(selecionado))
          }
        />
        <Botao
          onPress={incluir}
          isDisabled={!escolhido}
          carregando={salvando}
          rotuloCarregando="Salvando"
        >
          Incluir
        </Botao>
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Parte>
  );
}
