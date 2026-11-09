// O comparador de backups do Control iD (spec comparacao-e-restauracao-do-control-id, "Comparador
// de backups"; change p5b-comparacao-e-restauracao, design, decisão 7): dois lados, cada um um
// backup do histórico ou um arquivo enviado (o ZIP do Grafite ou do PMG, ou o CSV do controle), e o
// resultado das pessoas e dos cartões: os idênticos, os divergentes com os campos lado a lado e os
// que estão só de um lado.
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  EscolhaDeArquivo,
  EstadoVazio,
  GrupoDeRadios,
  Radio,
  Selecao,
  useDataHora,
} from '@grafite/ui';
import { GitCompare } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from './Backups.module.css';
import { type ComparacaoDeBackups, useBackups } from './consultas.ts';

type Lado = { backup: string } | { arquivo: string };

/** Um lado do comparador: um backup do histórico ou um arquivo enviado. */
function EscolhaDoLado({
  titulo,
  aoMudar,
}: {
  titulo: string;
  aoMudar: (lado: Lado | null) => void;
}) {
  const api = useApi();
  const backups = useBackups('sucesso');
  const { formatarDataEHora } = useDataHora();
  const [origem, definirOrigem] = useState<'backup' | 'arquivo'>('backup');
  const [backup, definirBackup] = useState<string | null>(null);
  const [arquivo, definirArquivo] = useState<{ nome: string; resumo: string } | null>(null);
  const [progresso, definirProgresso] = useState<number | null>(null);
  const [erro, definirErro] = useState<string | null>(null);
  const opcoes = backups.itens
    .filter((item) => item.temArquivo)
    .map((item) => ({
      id: item.id,
      rotulo: `${item.controle.patrimonio ?? item.controle.rotulo} · ${formatarDataEHora(new Date(item.pedidoEm))}`,
    }));

  async function enviar(escolhido: File) {
    definirErro(null);
    definirProgresso(0);
    const resultado = await pedir(
      () =>
        api.enviarArquivo<{ id: string; nome: string; pessoas: number; cartoes: number }>(
          `/controlid/comparador/arquivos?nome=${encodeURIComponent(escolhido.name)}`,
          escolhido,
          definirProgresso,
          'POST',
        ),
      'enviar o arquivo',
    );
    definirProgresso(null);
    if ('erro' in resultado) {
      definirErro(resultado.erro);
      aoMudar(null);
      return;
    }
    const { id, nome, pessoas, cartoes } = resultado.dados;
    definirArquivo({ nome, resumo: `${pessoas} pessoas e ${cartoes} cartões` });
    aoMudar({ arquivo: id });
  }

  return (
    <section className={estilos.secao} aria-label={titulo}>
      <p className={estilos.momento}>{titulo}</p>
      <GrupoDeRadios
        rotulo="De onde vem"
        value={origem}
        onChange={(valor) => {
          definirOrigem(valor as 'backup' | 'arquivo');
          aoMudar(null);
        }}
      >
        <Radio value="backup">Um backup do histórico</Radio>
        <Radio value="arquivo">Um arquivo: ZIP de backup ou CSV do controle</Radio>
      </GrupoDeRadios>
      {origem === 'backup' ? (
        <Selecao
          rotulo="Backup"
          opcoes={opcoes}
          selectedKey={backup}
          onSelectionChange={(chave) => {
            definirBackup(String(chave));
            aoMudar({ backup: String(chave) });
          }}
        />
      ) : (
        <>
          <EscolhaDeArquivo
            rotulo="Arquivo"
            formatos={['.zip', '.csv']}
            limite={512 * 1024 * 1024}
            progresso={progresso}
            erro={erro}
            aoEscolher={(escolhido) => void enviar(escolhido)}
          />
          {arquivo && <p className={estilos.nota}>{`${arquivo.nome}: ${arquivo.resumo}`}</p>}
        </>
      )}
    </section>
  );
}

/** O resultado de uma tabela: as contagens e as listas. */
function ResultadoDaTabela({
  tabela,
  nomes,
}: {
  tabela: ComparacaoDeBackups['tabelas'][number];
  nomes: { a: string; b: string };
}) {
  return (
    <section className={estilos.secao} aria-label={tabela.rotulo}>
      <p className={estilos.momento}>{tabela.rotulo}</p>
      <p className={estilos.detalhe}>
        {`${tabela.identicos} idênticos · ${tabela.divergentes.length} divergentes · ${tabela.soEmA.length} só em A · ${tabela.soEmB.length} só em B`}
      </p>
      {tabela.divergentes.length > 0 && (
        <ul className={estilos.linhas} aria-label={`${tabela.rotulo} divergentes`}>
          {tabela.divergentes.map((registro) => (
            <li key={registro.id} className={`${estilos.linha} ${estilos.semFoto}`}>
              <div>
                <p className={estilos.titulo}>{registro.nome}</p>
                <dl className={estilos.dados}>
                  {registro.campos.map((campo) => (
                    <div key={campo.campo}>
                      <dt>{campo.campo}</dt>
                      <dd>{`${nomes.a}: ${campo.a || 'vazio'} · ${nomes.b}: ${campo.b || 'vazio'}`}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(['soEmA', 'soEmB'] as const).map((lado) =>
        tabela[lado].length > 0 ? (
          <p key={lado} className={estilos.detalhe}>
            {`Só em ${lado === 'soEmA' ? 'A' : 'B'}: ${tabela[lado].map((registro) => registro.nome).join(', ')}`}
          </p>
        ) : null,
      )}
    </section>
  );
}

/** A tela "Comparar backups" do menu Control iD. */
export function CompararBackups() {
  const api = useApi();
  const [a, definirA] = useState<Lado | null>(null);
  const [b, definirB] = useState<Lado | null>(null);
  const [comparando, definirComparando] = useState(false);
  const [resultado, definirResultado] = useState<ComparacaoDeBackups | null>(null);

  async function comparar() {
    if (!a || !b) return;
    definirComparando(true);
    const feito = await pedir(
      () => api.POST('/controlid/comparador', { body: { a, b } }),
      'comparar os backups',
    );
    definirComparando(false);
    if ('erro' in feito) {
      avisar({ situacao: 'critico', titulo: feito.erro });
      return;
    }
    definirResultado(feito.dados);
  }

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Comparar backups"
        acoes={
          <Botao
            nivel="primario"
            icone={GitCompare}
            isDisabled={!a || !b}
            carregando={comparando}
            rotuloCarregando="Comparando"
            onPress={() => void comparar()}
          >
            Comparar
          </Botao>
        }
      />
      <p className={estilos.nota}>
        Compara as pessoas e os cartões de dois lados, pelo id. A senha e o sal ficam de fora.
      </p>
      <div className={estilos.lados}>
        <EscolhaDoLado titulo="Lado A" aoMudar={definirA} />
        <EscolhaDoLado titulo="Lado B" aoMudar={definirB} />
      </div>
      {resultado ? (
        <div className={estilos.conteudo}>
          <p className={estilos.detalhe}>{`A: ${resultado.a} · B: ${resultado.b}`}</p>
          {resultado.tabelas.map((tabela) => (
            <ResultadoDaTabela key={tabela.tabela} tabela={tabela} nomes={{ a: 'A', b: 'B' }} />
          ))}
        </div>
      ) : (
        <EstadoVazio
          titulo="Escolha os dois lados e compare."
          descricao="Cada lado pode ser um backup do histórico ou um arquivo enviado: o ZIP do Grafite ou do PMG, ou o CSV exportado pelo próprio controle."
        />
      )}
    </div>
  );
}
