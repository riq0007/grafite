// A comparação com o controle e a restauração na web (spec comparacao-e-restauracao-do-control-id;
// change p5b-comparacao-e-restauracao, design, decisão 7): os botões nas ações do backup, conforme a
// permissão, o diálogo da restauração com o destino, as categorias, o aviso e o código do app, e as
// operações recentes do controle, com o resultado por categoria em texto.
import {
  avisar,
  Botao,
  CampoDeTexto,
  Checkbox,
  Dialogo,
  GrupoDeCheckboxes,
  RotuloDeSituacao,
  Selecao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { GitCompare, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from './Backups.module.css';
import {
  type BackupDoControlId,
  CHAVE_DOS_BACKUPS,
  useControles,
  useOperacoesDoControle,
} from './consultas.ts';
import { SITUACOES_NA_TELA } from './situacoes.ts';
import { textoDaCategoria } from './textos.ts';

const CATEGORIAS = [
  { id: 'users', rotulo: 'Usuários' },
  { id: 'groups', rotulo: 'Grupos' },
  { id: 'user_groups', rotulo: 'Usuários dos grupos' },
  { id: 'time_zones', rotulo: 'Horários' },
  { id: 'time_spans', rotulo: 'Intervalos dos horários' },
  { id: 'access_rules', rotulo: 'Regras de acesso' },
  { id: 'group_access_rules', rotulo: 'Regras dos grupos' },
  { id: 'access_rule_time_zones', rotulo: 'Horários das regras' },
  { id: 'cards', rotulo: 'Cartões' },
  { id: 'templates', rotulo: 'Biometria' },
  { id: 'face_images', rotulo: 'Fotos' },
] as const;

/** O "Comparar com o controle" do backup. */
function CompararComOControle({ backup }: { backup: BackupDoControlId }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [pedindo, definirPedindo] = useState(false);
  return (
    <Botao
      nivel="terciario"
      icone={GitCompare}
      carregando={pedindo}
      rotuloCarregando="Pondo na fila"
      onPress={async () => {
        definirPedindo(true);
        const resultado = await pedir(
          () =>
            api.POST('/controlid/backups/{id}/operacoes', {
              params: { path: { id: backup.id } },
              body: { tipo: 'comparacao', ativo: backup.controle.id },
            }),
          'pedir a comparação',
        );
        definirPedindo(false);
        if ('erro' in resultado) {
          avisar({ situacao: 'critico', titulo: resultado.erro });
          return;
        }
        avisar({
          situacao: 'sucesso',
          titulo: 'Comparação na fila. O resultado aparece na seção Backups do controle.',
        });
        await consultas.invalidateQueries({ queryKey: CHAVE_DOS_BACKUPS });
      }}
    >
      Comparar com o controle
    </Botao>
  );
}

/** O "Restaurar…" do backup: o destino, as categorias, o aviso e o código do app. */
function RestaurarBackup({ backup }: { backup: BackupDoControlId }) {
  const api = useApi();
  const consultas = useQueryClient();
  const controles = useControles();
  const [destino, definirDestino] = useState<string>(backup.controle.id);
  const [categorias, definirCategorias] = useState<string[]>(CATEGORIAS.map(({ id }) => id));
  const [codigo, definirCodigo] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  const opcoes = (controles.data?.controles ?? []).map((controle) => ({
    id: controle.id,
    rotulo: [controle.patrimonio, controle.rotulo].filter(Boolean).join(' · '),
  }));
  return (
    <Dialogo
      gatilho={
        <Botao nivel="terciario" icone={RotateCcw}>
          Restaurar…
        </Botao>
      }
      titulo="Restaurar este backup num controle"
      alerta
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="destrutivo"
            carregando={enviando}
            rotuloCarregando="Pondo na fila"
            isDisabled={categorias.length === 0}
            onPress={async () => {
              definirEnviando(true);
              definirErro(null);
              const resultado = await pedir(
                () =>
                  api.POST('/controlid/backups/{id}/operacoes', {
                    params: { path: { id: backup.id } },
                    body: {
                      tipo: 'restauracao',
                      ativo: destino,
                      categorias,
                      codigo: codigo.trim(),
                    },
                  }),
                'pedir a restauração',
              );
              definirEnviando(false);
              if ('erro' in resultado) {
                definirErro(resultado.erro);
                return;
              }
              fechar();
              avisar({
                situacao: resultado.dados.aviso ? 'atencao' : 'sucesso',
                titulo: resultado.dados.aviso ?? 'Restauração na fila.',
              });
              await consultas.invalidateQueries({ queryKey: CHAVE_DOS_BACKUPS });
            }}
          >
            Restaurar
          </Botao>
        </>
      )}
    >
      <div className={estilos.conteudo}>
        <p>
          A restauração cria no controle o que falta. O que já existe nele, pelo mesmo id, fica como
          está.
        </p>
        <Selecao
          rotulo="Controle de destino"
          opcoes={opcoes}
          selectedKey={destino}
          onSelectionChange={(chave) => definirDestino(String(chave))}
        />
        <GrupoDeCheckboxes
          rotulo="O que restaurar"
          value={categorias}
          onChange={definirCategorias}
          erro={categorias.length === 0 ? 'Escolha pelo menos uma parte.' : undefined}
        >
          {CATEGORIAS.map((categoria) => (
            <Checkbox key={categoria.id} value={categoria.id}>
              {categoria.rotulo}
            </Checkbox>
          ))}
        </GrupoDeCheckboxes>
        <CampoDeTexto
          rotulo="Código do app autenticador"
          descricao="A restauração muda o controle: confirme com o código de 6 dígitos do app."
          inputMode="numeric"
          autoComplete="one-time-code"
          value={codigo}
          onChange={definirCodigo}
          erro={erro ?? undefined}
        />
      </div>
    </Dialogo>
  );
}

/** As ações de operação de um backup com arquivo, conforme a permissão. */
export function AcoesDeOperacao({ backup }: { backup: BackupDoControlId }) {
  const { pode } = useAcesso();
  if (!backup.temArquivo) return null;
  return (
    <>
      {pode('controlid.backup') && <CompararComOControle backup={backup} />}
      {pode('controlid.restaurar') && <RestaurarBackup backup={backup} />}
    </>
  );
}

/** As operações recentes do controle, na seção Backups da ficha. */
export function OperacoesDoControle({ ativoId }: { ativoId: string }) {
  const operacoes = useOperacoesDoControle(ativoId);
  const { formatarDataEHora } = useDataHora();
  const itens = operacoes.data?.itens ?? [];
  if (itens.length === 0) return null;
  return (
    <section className={estilos.secao} aria-label="Operações no controle">
      <p className={estilos.momento}>Comparações e restaurações</p>
      <ul className={estilos.lista}>
        {itens.map((operacao) => (
          <li key={operacao.id} className={estilos.item}>
            <div className={estilos.quando}>
              <p className={estilos.momento}>
                {operacao.tipo === 'restauracao' ? 'Restauração' : 'Comparação com o controle'}
              </p>
              <div className={estilos.acoes}>
                <RotuloDeSituacao situacao={SITUACOES_NA_TELA[operacao.situacao].tom}>
                  {SITUACOES_NA_TELA[operacao.situacao].texto}
                </RotuloDeSituacao>
                <span className={estilos.detalhe}>
                  {`${formatarDataEHora(new Date(operacao.pedidoEm))}${operacao.pedidoPor ? `, por ${operacao.pedidoPor}` : ''}`}
                </span>
              </div>
            </div>
            <div className={estilos.quando}>
              {operacao.aviso && <p className={estilos.detalhe}>{operacao.aviso}</p>}
              {operacao.erro && <p className={estilos.detalhe}>{operacao.erro}</p>}
              {operacao.resultado.map((categoria) => (
                <p key={String(categoria.categoria)} className={estilos.detalhe}>
                  {textoDaCategoria(operacao.tipo, categoria)}
                </p>
              ))}
            </div>
            <span />
          </li>
        ))}
      </ul>
    </section>
  );
}
