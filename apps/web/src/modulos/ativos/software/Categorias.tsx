// As categorias da base de software (spec distribuicao-de-software, "Tela da base"; change
// software-por-pacote, design, decisão 3), numa gaveta, para quem administra o software: criar,
// renomear, ordenar e remover a que não tem pacotes. Cada ação grava na hora.
import { avisar, Botao, BotaoDeIcone, CampoDeTexto, Gaveta } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import estilos from './Categorias.module.css';
import { CHAVE_DO_SOFTWARE, useCategorias } from './consultas.ts';
import { plural } from './formatos.ts';

export function Categorias({ aoFechar }: { aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const categorias = useCategorias();
  const [nova, definirNova] = useState('');
  const [erroDaNova, definirErroDaNova] = useState<string | undefined>();
  const [renomeando, definirRenomeando] = useState<{
    id: string;
    nome: string;
    erro?: string;
  } | null>(null);
  const [ocupado, definirOcupado] = useState(false);
  const lista = categorias.data?.categorias ?? [];

  async function gravar<T>(
    pedido: () => Promise<{ data?: T; error?: unknown; response: Response }>,
    acao: string,
  ) {
    definirOcupado(true);
    const resultado = await pedir(pedido, acao);
    definirOcupado(false);
    if (!('erro' in resultado)) await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
    return resultado;
  }

  async function criar() {
    const resultado = await gravar(
      () => api.POST('/software/categorias', { body: { nome: nova } }),
      'criar a categoria',
    );
    if ('erro' in resultado) {
      definirErroDaNova(recusaDe<'nome'>(resultado).campos?.nome ?? resultado.erro);
      return;
    }
    definirErroDaNova(undefined);
    definirNova('');
    avisar({ situacao: 'sucesso', titulo: 'Categoria criada.' });
  }

  async function renomear() {
    if (!renomeando) return;
    const { id, nome } = renomeando;
    const resultado = await gravar(
      () => api.PATCH('/software/categorias/{id}', { params: { path: { id } }, body: { nome } }),
      'renomear a categoria',
    );
    if ('erro' in resultado) {
      definirRenomeando({
        id,
        nome,
        erro: recusaDe<'nome'>(resultado).campos?.nome ?? resultado.erro,
      });
      return;
    }
    definirRenomeando(null);
    avisar({ situacao: 'sucesso', titulo: 'Categoria renomeada.' });
  }

  async function mover(indice: number, passo: -1 | 1) {
    const ids = lista.map(({ id }) => id);
    const [movida] = ids.splice(indice, 1);
    if (!movida) return;
    ids.splice(indice + passo, 0, movida);
    const resultado = await gravar(
      () => api.PUT('/software/categorias/ordem', { body: { ids } }),
      'ordenar as categorias',
    );
    if ('erro' in resultado) avisar({ situacao: 'critico', titulo: resultado.erro });
  }

  async function remover(id: string, nome: string) {
    const resultado = await gravar(
      () => api.DELETE('/software/categorias/{id}', { params: { path: { id } } }),
      'remover a categoria',
    );
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `Categoria ${nome} removida.` });
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Categorias"
    >
      <div className={estilos.categorias}>
        <p className={estilos.nota}>
          As abas da base seguem esta ordem. O pacote sem categoria aparece só em Todos.
        </p>
        <ol className={estilos.lista} aria-label="Categorias da base">
          {lista.map((categoria, indice) => (
            <li key={categoria.id} className={estilos.categoria}>
              {renomeando?.id === categoria.id ? (
                <form
                  className={estilos.renomear}
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    void renomear();
                  }}
                >
                  <CampoDeTexto
                    rotulo={`Novo nome de ${categoria.nome}`}
                    value={renomeando.nome}
                    onChange={(nome) => definirRenomeando({ id: categoria.id, nome })}
                    erro={renomeando.erro}
                    autoFocus
                  />
                  <Botao onPress={() => definirRenomeando(null)}>Cancelar</Botao>
                  <Botao type="submit" nivel="primario" carregando={ocupado}>
                    Salvar
                  </Botao>
                </form>
              ) : (
                <>
                  <span className={estilos.nome}>
                    <b>{categoria.nome}</b>
                    <span className={estilos.quantos}>
                      {categoria.pacotes > 0
                        ? plural(categoria.pacotes, 'pacote', 'pacotes')
                        : 'Sem pacotes'}
                    </span>
                  </span>
                  <span className={estilos.acoes}>
                    <BotaoDeIcone
                      icone={ArrowUp}
                      rotulo={`Subir ${categoria.nome}`}
                      isDisabled={indice === 0 || ocupado}
                      onPress={() => void mover(indice, -1)}
                    />
                    <BotaoDeIcone
                      icone={ArrowDown}
                      rotulo={`Descer ${categoria.nome}`}
                      isDisabled={indice === lista.length - 1 || ocupado}
                      onPress={() => void mover(indice, 1)}
                    />
                    <Botao
                      nivel="terciario"
                      onPress={() => definirRenomeando({ id: categoria.id, nome: categoria.nome })}
                    >
                      Renomear
                    </Botao>
                    <Botao
                      nivel="terciario"
                      isDisabled={categoria.pacotes > 0 || ocupado}
                      onPress={() => void remover(categoria.id, categoria.nome)}
                    >
                      Remover
                    </Botao>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
        {lista.some(({ pacotes }) => pacotes > 0) && (
          <p className={estilos.nota}>
            A categoria com pacotes só sai depois que os pacotes forem para outra.
          </p>
        )}
        <form
          className={estilos.nova}
          onSubmit={(evento) => {
            evento.preventDefault();
            void criar();
          }}
        >
          <CampoDeTexto
            rotulo="Nova categoria"
            value={nova}
            onChange={definirNova}
            erro={erroDaNova}
            descricao="Até 40 caracteres. Entra no fim da ordem."
          />
          <Botao type="submit" icone={Plus} carregando={ocupado} isDisabled={!nova.trim()}>
            Criar
          </Botao>
        </form>
      </div>
    </Gaveta>
  );
}
