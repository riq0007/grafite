import {
  ATRIBUTO_DO_USUARIO_PADRAO,
  FILTRO_DAS_PESSOAS_PADRAO,
  MENSAGENS_DO_DIRETORIO,
} from '@grafite/domain';
import {
  Abas,
  AreaDeTexto,
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeTexto,
  Celula,
  Checkbox,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import {
  CHAVE_DO_DIRETORIO,
  type EstadoDoDiretorio,
  useDiretorio,
  useGruposDoAd,
  useLoginsDoDiretorio,
} from './consultas.ts';
import estilosDoDiretorio from './Diretorio.module.css';
import { GruposDoAd } from './GruposDoAd.tsx';
import { GuiaDoDiretorio } from './GuiaDoDiretorio.tsx';
import { UsuariosDoAd } from './UsuariosDoAd.tsx';

type CampoDaConfiguracao =
  | 'servidor'
  | 'baseDn'
  | 'segredoId'
  | 'atributoDoUsuario'
  | 'filtroDasPessoas'
  | 'acDoServidor';

/**
 * A seção Diretório da Administração (spec diretorio-ad, "Tela do diretório"), em três abas: a
 * Configuração, com o teste da conexão e os mapeamentos; os Usuários e os Grupos do AD. Sem o
 * diretório gravado, as duas últimas dizem isso e levam à Configuração.
 */
export function Diretorio() {
  const estado = useDiretorio();
  const [aba, definirAba] = useState('configuracao');
  const cabecalho = <CabecalhoDaPagina titulo="Diretório (AD)" />;
  if (estado.isPending) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <p role="status" className={estilos.contagem}>
          Carregando o diretório…
        </p>
      </div>
    );
  }
  if (estado.isError) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={estado.error.message}
          acao={<Botao onPress={() => void estado.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  const naoConfigurado = (
    <EstadoVazio
      titulo={MENSAGENS_DO_DIRETORIO.naoConfigurado}
      descricao="Grave o servidor, a base e a conta de serviço para buscar no AD."
      acao={<Botao onPress={() => definirAba('configuracao')}>Configurar o diretório</Botao>}
    />
  );
  const configurado = estado.data.diretorio !== null;
  return (
    <div className={estilos.tela}>
      {cabecalho}
      <Abas
        rotulo="Diretório"
        selecionada={aba}
        aoMudar={definirAba}
        manterMontadas={['configuracao']}
        abas={[
          {
            id: 'configuracao',
            rotulo: 'Configuração',
            conteudo: (
              <>
                <ConfiguracaoDoDiretorio estado={estado.data} />
                {configurado && <MapeamentosDoDiretorio estado={estado.data} />}
              </>
            ),
          },
          {
            id: 'usuarios',
            rotulo: 'Usuários',
            conteudo: configurado ? <UsuariosDoAd estado={estado.data} /> : naoConfigurado,
          },
          {
            id: 'grupos',
            rotulo: 'Grupos',
            conteudo: configurado ? <GruposDoAd /> : naoConfigurado,
          },
        ]}
      />
    </div>
  );
}

/**
 * O formulário do diretório: o servidor, a base, a conta de serviço do Cofre, o atributo do usuário
 * e o filtro, o certificado da AC, a conferência do certificado e a entrada pelo AD. "Testar a
 * conexão" usa o que está na tela, mesmo antes de salvar. O guia da primeira configuração fica ao
 * lado na janela larga e antes do formulário na estreita.
 */
function ConfiguracaoDoDiretorio({ estado }: { estado: EstadoDoDiretorio }) {
  const api = useApi();
  const consultas = useQueryClient();
  const logins = useLoginsDoDiretorio();
  const atual = estado.diretorio;
  const [servidor, definirServidor] = useState(atual?.servidor ?? '');
  const [baseDn, definirBaseDn] = useState(atual?.baseDn ?? '');
  const [segredoId, definirSegredoId] = useState<string | null>(atual?.conta.id ?? null);
  const [atributo, definirAtributo] = useState(
    atual?.atributoDoUsuario ?? ATRIBUTO_DO_USUARIO_PADRAO,
  );
  const [filtro, definirFiltro] = useState(atual?.filtroDasPessoas ?? FILTRO_DAS_PESSOAS_PADRAO);
  const [conferirCertificado, definirConferirCertificado] = useState(
    atual?.conferirCertificado ?? true,
  );
  const [ac, definirAc] = useState(atual?.acDoServidor ?? '');
  const [ligado, definirLigado] = useState(atual?.ligado ?? false);
  const [erros, definirErros] = useState<Partial<Record<CampoDaConfiguracao, string>>>({});
  const [teste, definirTeste] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [ocupado, definirOcupado] = useState<'teste' | 'salvar' | null>(null);

  const pedido = () => ({
    servidor,
    baseDn,
    segredoId,
    atributoDoUsuario: atributo,
    filtroDasPessoas: filtro,
    conferirCertificado,
    acDoServidor: ac.trim() || null,
    ligado,
  });
  const mudou =
    (definir: (valor: string) => void, campo: CampoDaConfiguracao) => (valor: string) => {
      definir(valor);
      definirErros(({ [campo]: _, ...resto }) => resto);
    };

  const opcoes = (logins.data?.logins ?? []).map(({ id, nome }) => ({ id, rotulo: nome }));
  if (atual && !opcoes.some((opcao) => opcao.id === atual.conta.id)) {
    opcoes.push({ id: atual.conta.id, rotulo: atual.conta.nome });
  }

  async function testar() {
    definirOcupado('teste');
    definirTeste(null);
    const resultado = await pedir(
      () => api.POST('/diretorio/teste', { body: pedido() }),
      'testar a conexão',
    );
    definirOcupado(null);
    if ('erro' in resultado) {
      const { campos } = recusaDe<CampoDaConfiguracao>(resultado);
      if (campos) definirErros(campos);
      else definirTeste({ ok: false, mensagem: resultado.erro });
      return;
    }
    definirTeste(resultado.dados);
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    definirOcupado('salvar');
    const resultado = await pedir(
      () => api.PUT('/diretorio', { body: pedido() }),
      'salvar o diretório',
    );
    definirOcupado(null);
    if ('erro' in resultado) {
      const { campos } = recusaDe<CampoDaConfiguracao>(resultado);
      if (campos) definirErros(campos);
      else avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    consultas.setQueryData(CHAVE_DO_DIRETORIO, resultado.dados);
    avisar({ situacao: 'sucesso', titulo: 'Diretório salvo.' });
  }

  return (
    <div className={estilosDoDiretorio.configuracao}>
      <div className={estilosDoDiretorio.colunas}>
        <GuiaDoDiretorio configurado={atual !== null} />
        <section className={estilos.parte} aria-labelledby="configuracao-do-diretorio">
          <h2 id="configuracao-do-diretorio" className={estilos.tituloDaParte}>
            Configuração
          </h2>
          <p className={estilos.informacao}>
            O Grafite entra no AD com a conta de serviço do Cofre. Prefira o ldaps://: a redefinição
            de senha só funciona por ele.
          </p>
          <form className={estilosDoDiretorio.formulario} onSubmit={salvar} noValidate>
            <CampoDeTexto
              rotulo="Servidor"
              descricao="Como ldaps://dc01.empresa.local ou ldap://dc01.empresa.local:389."
              autoComplete="off"
              value={servidor}
              onChange={mudou(definirServidor, 'servidor')}
              erro={erros.servidor}
            />
            <CampoDeTexto
              rotulo="Base DN"
              descricao="Onde o Grafite procura as pessoas e os grupos, como DC=empresa,DC=local."
              autoComplete="off"
              value={baseDn}
              onChange={mudou(definirBaseDn, 'baseDn')}
              erro={erros.baseDn}
            />
            <Selecao
              rotulo="Conta de serviço"
              descricao={
                logins.data?.motivo ??
                'Um login do Cofre do tipo Usuário e senha, Conta administrativa ou Conta de serviço, com o DN ou o UPN no usuário.'
              }
              obrigatorio
              opcoes={opcoes}
              placeholder={logins.isPending ? 'Carregando os logins' : 'Selecione'}
              selectedKey={segredoId}
              onSelectionChange={(chave) => {
                definirSegredoId(String(chave));
                definirErros(({ segredoId: _, ...resto }) => resto);
              }}
              isDisabled={logins.data?.motivo !== null && logins.data?.motivo !== undefined}
              erro={erros.segredoId}
            />
            <CampoDeTexto
              rotulo="Atributo do usuário"
              descricao="O atributo que a pessoa digita na entrada; no AD, o sAMAccountName."
              autoComplete="off"
              value={atributo}
              onChange={mudou(definirAtributo, 'atributoDoUsuario')}
              erro={erros.atributoDoUsuario}
            />
            <CampoDeTexto
              rotulo="Filtro das pessoas"
              autoComplete="off"
              value={filtro}
              onChange={mudou(definirFiltro, 'filtroDasPessoas')}
              erro={erros.filtroDasPessoas}
            />
            <AreaDeTexto
              className={[estilosDoDiretorio.inteiro, estilosDoDiretorio.pem].join(' ')}
              rotulo="Certificado da AC"
              descricao="Opcional. A raiz da AC da empresa em Base 64, quando o certificado do LDAPS vem dela; o passo 5 do guia diz onde achar."
              placeholder="-----BEGIN CERTIFICATE-----"
              autoComplete="off"
              spellCheck="false"
              value={ac}
              onChange={mudou(definirAc, 'acDoServidor')}
              erro={erros.acDoServidor}
            />
            <Checkbox
              className={estilosDoDiretorio.inteiro}
              isSelected={conferirCertificado}
              onChange={definirConferirCertificado}
            >
              Conferir o certificado do servidor
            </Checkbox>
            <Checkbox
              className={estilosDoDiretorio.inteiro}
              isSelected={ligado}
              onChange={definirLigado}
            >
              Entrada pelo AD: quem não tem conta local entra com o usuário e a senha do AD
            </Checkbox>
            {teste && (
              <p
                role="status"
                className={[estilos.informacao, estilosDoDiretorio.inteiro].join(' ')}
              >
                <RotuloDeSituacao situacao={teste.ok ? 'sucesso' : 'atencao'}>
                  {teste.ok ? 'Conexão testada' : 'Falha na conexão'}
                </RotuloDeSituacao>{' '}
                {teste.mensagem}
              </p>
            )}
            <div className={[estilos.acoes, estilosDoDiretorio.inteiro].join(' ')}>
              <Botao
                carregando={ocupado === 'teste'}
                rotuloCarregando="Testando"
                onPress={() => void testar()}
              >
                Testar a conexão
              </Botao>
              <Botao
                nivel="primario"
                type="submit"
                carregando={ocupado === 'salvar'}
                rotuloCarregando="Salvando"
              >
                Salvar
              </Botao>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

/**
 * Os mapeamentos: cada grupo do AD com o grupo do Grafite que ele dá, o "Remover" e a inclusão de
 * um mapeamento novo, com o grupo do AD escolhido pela busca.
 */
function MapeamentosDoDiretorio({ estado }: { estado: EstadoDoDiretorio }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [busca, definirBusca] = useState('');
  const [buscada, definirBuscada] = useState<string | null>(null);
  const gruposDoAd = useGruposDoAd(buscada ?? '', buscada !== null);
  const [grupoDn, definirGrupoDn] = useState<string | null>(null);
  const [grupoId, definirGrupoId] = useState<string | null>(null);
  const [erros, definirErros] = useState<Partial<Record<'grupoDn' | 'grupoId', string>>>({});
  const [ocupado, definirOcupado] = useState<string | null>(null);

  async function mapear() {
    definirOcupado('mapear');
    const resultado = await pedir(
      () =>
        api.POST('/diretorio/mapeamentos', {
          body: { grupoDn: grupoDn ?? '', grupoId: grupoId ?? '' },
        }),
      'mapear o grupo',
    );
    definirOcupado(null);
    if ('erro' in resultado) {
      const { campos } = recusaDe<'grupoDn' | 'grupoId'>(resultado);
      if (campos) definirErros(campos);
      else avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `${resultado.dados.nomeNoAd} mapeado.` });
    definirGrupoDn(null);
    definirGrupoId(null);
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_DIRETORIO });
  }

  async function remover(id: string, nome: string) {
    definirOcupado(id);
    const resultado = await pedir(
      () => api.DELETE('/diretorio/mapeamentos/{id}', { params: { path: { id } } }),
      'remover o mapeamento',
    );
    definirOcupado(null);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `Mapeamento de ${nome} removido.` });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_DIRETORIO });
  }

  return (
    <section className={estilos.parte} aria-labelledby="mapeamentos-do-diretorio">
      <h2 id="mapeamentos-do-diretorio" className={estilos.tituloDaParte}>
        Mapeamentos
      </h2>
      <p className={estilos.informacao}>
        Quem é de um grupo mapeado do AD entra no grupo do Grafite na próxima entrada, com os perfis
        dele. Sem nenhum grupo mapeado, a entrada pelo AD é recusada.
      </p>
      <Tabela rotulo="Mapeamentos">
        <CabecalhoDaTabela>
          <Coluna id="ad" principal>
            Grupo do AD
          </Coluna>
          <Coluna id="grafite">Grupo do Grafite</Coluna>
          <Coluna id="acoes" especie="acoes">
            Ações
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={estado.mapeamentos}
          vazio={<EstadoVazio titulo="Nenhum grupo do AD mapeado." />}
        >
          {(mapeamento) => (
            <Linha id={mapeamento.id}>
              <Celula>{mapeamento.nomeNoAd}</Celula>
              <Celula>{mapeamento.grupo.nome}</Celula>
              <Celula>
                <Botao
                  nivel="terciario"
                  aria-label={`Remover o mapeamento de ${mapeamento.nomeNoAd}`}
                  carregando={ocupado === mapeamento.id}
                  rotuloCarregando="Removendo"
                  onPress={() => void remover(mapeamento.id, mapeamento.nomeNoAd)}
                >
                  Remover
                </Botao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
      <form
        className={estilosDoDiretorio.formulario}
        aria-label="Novo mapeamento"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          definirBuscada(busca.trim());
        }}
      >
        <CampoDeTexto
          rotulo="Buscar o grupo do AD"
          autoComplete="off"
          value={busca}
          onChange={definirBusca}
        />
        <div className={estilos.acoes}>
          <Botao type="submit">Buscar no AD</Botao>
        </div>
        {gruposDoAd.isError && <p className={estilos.falha}>{gruposDoAd.error.message}</p>}
        {gruposDoAd.data && (
          <>
            <Selecao
              rotulo="Grupo do AD"
              opcoes={gruposDoAd.data.grupos.map((grupo) => ({
                id: grupo.dn,
                rotulo: grupo.mapeadoPara
                  ? `${grupo.nome} (já dá ${grupo.mapeadoPara.nome})`
                  : grupo.nome,
              }))}
              placeholder={
                gruposDoAd.data.grupos.length === 0 ? 'Nenhum grupo achado' : 'Selecione'
              }
              selectedKey={grupoDn}
              onSelectionChange={(chave) => definirGrupoDn(String(chave))}
              erro={erros.grupoDn}
            />
            <Selecao
              rotulo="Grupo do Grafite"
              opcoes={estado.grupos.map(({ id, nome }) => ({ id, rotulo: nome }))}
              selectedKey={grupoId}
              onSelectionChange={(chave) => definirGrupoId(String(chave))}
              erro={erros.grupoId}
            />
            <div className={estilos.acoes}>
              <Botao
                nivel="primario"
                isDisabled={!grupoDn || !grupoId}
                carregando={ocupado === 'mapear'}
                rotuloCarregando="Mapeando"
                onPress={() => void mapear()}
              >
                Mapear
              </Botao>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
