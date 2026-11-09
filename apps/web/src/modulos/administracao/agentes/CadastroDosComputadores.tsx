import { avisar, Botao, Selecao } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Administracao.module.css';
import { SeletorDeLocal } from '../seletores/SeletorDeLocal.tsx';
import { type CadastroDosAgentes, CHAVE_DO_CADASTRO, useCadastroDosAgentes } from './consultas.ts';

export function CadastroDosComputadores() {
  const configuracao = useCadastroDosAgentes();
  return (
    <section className={estilos.parte} aria-labelledby="cadastro-dos-computadores">
      <h2 id="cadastro-dos-computadores" className={estilos.tituloDaParte}>
        Cadastro automático de computadores
      </h2>
      <p className={estilos.informacao}>
        Escolha um tipo e salve para habilitar o cadastro. Para máquinas que já aparecem como Sem
        ativo, aguarde o próximo inventário ou force o envio pelo GLPI Agent. A série e o hostname
        ajudam a aproveitar cadastros existentes.
      </p>
      {configuracao.isPending && <p role="status">Carregando configuração…</p>}
      {configuracao.isError && (
        <div className={estilos.falha}>
          <p>{configuracao.error.message}</p>
          <Botao onPress={() => void configuracao.refetch()}>Tentar carregar a configuração</Botao>
        </div>
      )}
      {configuracao.data && (
        <FormularioDoCadastro
          key={`${configuracao.data.tipoId}:${configuracao.data.localId}`}
          configuracao={configuracao.data}
        />
      )}
    </section>
  );
}

function FormularioDoCadastro({ configuracao }: { configuracao: CadastroDosAgentes }) {
  const api = useApi();
  const { pode } = useAcesso();
  const consultas = useQueryClient();
  const [tipoId, definirTipo] = useState(configuracao.tipoId);
  const [localId, definirLocal] = useState(configuracao.localId);
  const [enviando, definirEnviando] = useState(false);
  const [falha, definirFalha] = useState<FalhaDoPedido | null>(null);
  const mudou = tipoId !== configuracao.tipoId || localId !== configuracao.localId;
  const tipos = configuracao.tipos.map((tipo) => ({ id: tipo.id, rotulo: tipo.nome }));
  if (tipoId && !tipos.some((tipo) => tipo.id === tipoId))
    tipos.push({ id: tipoId, rotulo: 'Tipo indisponível — escolha outro' });

  async function salvar() {
    if (enviando) return;
    definirEnviando(true);
    definirFalha(null);
    const resultado = await pedir(
      () =>
        api.PUT('/agentes/cadastro', {
          body: { tipoId, localId: tipoId ? localId : null },
        }),
      'salvar o cadastro automático',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      definirFalha(resultado);
      return;
    }
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_CADASTRO });
    avisar({ situacao: 'sucesso', titulo: 'Configuração do cadastro salva.' });
  }

  return (
    <form
      className={estilos.parte}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void salvar();
      }}
    >
      <div className={estilos.camposDoCadastroDosAgentes}>
        <Selecao
          rotulo="Tipo para novos computadores"
          opcoes={[{ id: 'desligado', rotulo: 'Não cadastrar automaticamente' }, ...tipos]}
          selectedKey={tipoId ?? 'desligado'}
          isDisabled={enviando}
          descricao="Tipos ativos com Inventário de hardware."
          erro={falha?.problema?.campos?.tipoId}
          onSelectionChange={(chave) => {
            const tipo = chave == null || chave === 'desligado' ? null : String(chave);
            definirTipo(tipo);
            if (!tipo) definirLocal(null);
            definirFalha(null);
          }}
        />
        <SeletorDeLocal
          rotulo="Local de entrada"
          valor={localId}
          desabilitado={!tipoId || enviando}
          placeholder={localId ? 'Local indisponível' : 'Sem local definido'}
          limpavel
          descricao="Aplicado somente a novos computadores."
          erro={falha?.problema?.campos?.localId}
          aoMudar={(local) => {
            definirLocal(local);
            definirFalha(null);
          }}
        />
      </div>
      {configuracao.tipos.length === 0 && (
        <p className={estilos.informacao}>
          {pode('catalogo.administrar') ? (
            <>
              Em{' '}
              <Link to="/gestao/catalogo/tipos" className={estilos.link}>
                Tipos de ativo
              </Link>
              , edite ou crie um tipo ativo de computador e habilite a capacidade Inventário de
              hardware. Depois volte aqui para escolher o tipo e salvar.
            </>
          ) : (
            'Peça a quem administra o catálogo para habilitar Inventário de hardware em um tipo ativo de computador.'
          )}
        </p>
      )}
      {falha && (
        <p role="alert" className={estilos.falha}>
          {falha.erro}
        </p>
      )}
      <div className={estilos.acoes}>
        <Botao type="submit" isDisabled={!mudou} carregando={enviando} rotuloCarregando="Salvando">
          Salvar cadastro automático
        </Botao>
      </div>
    </form>
  );
}
