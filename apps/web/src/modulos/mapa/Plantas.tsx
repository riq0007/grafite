// As plantas do mapa (spec mapa-da-planta, "Plantas da organização"; change p7-mapa-da-planta,
// design, decisão 6): os cartões das plantas, com as medidas e o que veio do arquivo, e a "Nova
// planta", que envia o DXF ou o modelo do PMG. Uma planta que falhou ou foi inativada diz isso em
// texto.
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeTexto,
  EscolhaDeArquivo,
  EstadoVazio,
  Gaveta,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { CHAVE_DO_MAPA, type PlantaDoMapa, usePlantas } from './consultas.ts';
import estilos from './Mapa.module.css';

const SITUACOES = {
  convertendo: { texto: 'Convertendo', tom: 'info' },
  ativa: { texto: 'Ativa', tom: 'sucesso' },
  falhou: { texto: 'Falhou', tom: 'critico' },
  inativa: { texto: 'Inativa', tom: 'neutra' },
} as const;

/** A gaveta da planta nova: o nome e o arquivo. */
function NovaPlanta({ aoFechar }: { aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [nome, definirNome] = useState('');
  const [arquivo, definirArquivo] = useState<File | null>(null);
  // Fora do envio, sem valor: para a escolha de arquivo, `null` é o envio sem progresso conhecido.
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);

  async function enviar() {
    if (!arquivo) return;
    definirErro(null);
    definirProgresso(0);
    const resultado = await pedir(
      () =>
        api.enviarArquivo<PlantaDoMapa>(
          `/mapa/plantas?nome=${encodeURIComponent(nome.trim())}&fonte=${encodeURIComponent(arquivo.name)}`,
          arquivo,
          definirProgresso,
          'POST',
        ),
      'cadastrar a planta',
    );
    definirProgresso(undefined);
    if ('erro' in resultado) {
      definirErro(resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `Planta ${resultado.dados.nome} cadastrada.` });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_MAPA });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Nova planta"
    >
      <div className={estilos.tela}>
        <CampoDeTexto rotulo="Nome" obrigatorio value={nome} onChange={definirNome} />
        <EscolhaDeArquivo
          rotulo="Arquivo"
          descricao="O desenho em DXF, convertido no servidor, ou o modelo da planta do PMG, em JSON."
          formatos={['.dxf', '.json']}
          limite={300 * 1024 * 1024}
          progresso={progresso}
          erro={erro}
          aoEscolher={definirArquivo}
        />
        {arquivo && <p className={estilos.nota}>{arquivo.name}</p>}
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            isDisabled={!arquivo || nome.trim() === ''}
            carregando={progresso !== undefined}
            rotuloCarregando="Enviando e convertendo"
            onPress={() => void enviar()}
          >
            Cadastrar planta
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/** A tela das plantas do mapa. */
export function Plantas() {
  const plantas = usePlantas();
  const [nova, definirNova] = useState(false);
  const podeEditar = plantas.data?.podeEditar ?? false;
  const lista = plantas.data?.plantas ?? [];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Mapa"
        acoes={
          podeEditar && (
            <Botao nivel="primario" icone={Plus} onPress={() => definirNova(true)}>
              Nova planta
            </Botao>
          )
        }
      />
      {plantas.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando as plantas…
        </p>
      ) : plantas.isError ? (
        <EstadoVazio
          titulo={plantas.error.message}
          acao={<Botao onPress={() => void plantas.refetch()}>Tentar de novo</Botao>}
        />
      ) : lista.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma planta ainda."
          descricao={
            podeEditar
              ? 'Cadastre a planta pelo desenho em DXF ou pelo modelo do PMG, em Nova planta.'
              : 'Quem cuida do mapa cadastra a planta pelo desenho da empresa.'
          }
        />
      ) : (
        <ul className={estilos.plantas} aria-label="Plantas">
          {lista.map((planta) => (
            <li key={planta.id} className={estilos.planta}>
              <p className={estilos.nomeDaPlanta}>
                {planta.situacao === 'ativa' ? (
                  <Link to="/mapa/$id" params={{ id: planta.id }}>
                    {planta.nome}
                  </Link>
                ) : (
                  planta.nome
                )}
              </p>
              <div className={estilos.acoes}>
                <RotuloDeSituacao situacao={SITUACOES[planta.situacao].tom}>
                  {SITUACOES[planta.situacao].texto}
                </RotuloDeSituacao>
                {planta.local && <span className={estilos.nota}>{planta.local.caminho}</span>}
              </div>
              {planta.largura !== null && planta.profundidade !== null && (
                <p className={estilos.nota}>
                  {`${Math.round(planta.largura)} × ${Math.round(planta.profundidade)} m`}
                  {planta.contagens
                    ? ` · ${planta.contagens.segmentos.toLocaleString('pt-BR')} linhas · ${planta.contagens.rotulos.toLocaleString('pt-BR')} textos`
                    : ''}
                </p>
              )}
              {planta.erro && <p className={estilos.nota}>{planta.erro}</p>}
            </li>
          ))}
        </ul>
      )}
      {nova && <NovaPlanta aoFechar={() => definirNova(false)} />}
    </div>
  );
}
