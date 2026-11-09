// As configurações pelo painel (spec painel-da-operacao, "Configurações no painel"): o e-mail, com o
// envio de teste, o backup, o certificado, os endereços e as contas, pelos mesmos comandos de
// operação. Os valores atuais vêm da instalação; os segredos, como a senha do e-mail e o token do
// DNS, não voltam para a página, que só diz se eles estão configurados. A senha e o token são
// pedidos pelo comando, no diálogo, sem aparecer. O formato de cada valor é o comando que confere.
import {
  Botao,
  CampoDeTexto,
  ControleSegmentado,
  GrupoDeRadios,
  Radio,
  Segmento,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useId, useState } from 'react';
import type { ApiDoPainel, ConfiguracoesDoServidor } from '../api/tipos.ts';
import { useTarefas } from '../tarefas/pedirTarefa.tsx';
import estilos from './Configuracoes.module.css';

function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={estilos.cartao} aria-label={titulo}>
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

function Email({ config }: { config: ConfiguracoesDoServidor }) {
  const { pedir, emAndamento } = useTarefas();
  const [smtp, setSmtp] = useState(config.email.smtp ?? '');
  const [remetente, setRemetente] = useState(config.email.remetente ?? '');
  const [para, setPara] = useState('');
  const ocupado = emAndamento !== null;
  return (
    <Cartao titulo="E-mail">
      <CampoDeTexto
        rotulo="Endereço do servidor de e-mail"
        descricao="Como smtp://grafite@smtp.empresa.com.br:587. Só com o usuário, o comando pede a senha sem mostrá-la."
        value={smtp}
        onChange={setSmtp}
      />
      <CampoDeTexto
        rotulo="Remetente"
        descricao="Como Grafite <grafite@empresa.com.br>."
        value={remetente}
        onChange={setRemetente}
      />
      <p className={estilos.nota}>
        {config.email.senhaConfigurada
          ? 'A senha está configurada e não aparece aqui.'
          : 'Sem senha configurada.'}
      </p>
      <div className={estilos.acoes}>
        <Botao
          nivel="primario"
          isDisabled={ocupado || smtp.trim() === '' || remetente.trim() === ''}
          onPress={() => void pedir('email-configurar', { smtp, remetente })}
        >
          Gravar o e-mail
        </Botao>
      </div>
      <div className={estilos.linha}>
        <CampoDeTexto rotulo="E-mail que recebe o teste" value={para} onChange={setPara} />
        <Botao
          isDisabled={ocupado || para.trim() === ''}
          onPress={() => void pedir('email-testar', { para })}
        >
          Mandar o e-mail de teste
        </Botao>
      </div>
    </Cartao>
  );
}

function Backup({ config }: { config: ConfiguracoesDoServidor }) {
  const { pedir, emAndamento } = useTarefas();
  const [destinos, setDestinos] = useState(config.backup.destinos);
  const [novo, setNovo] = useState('');
  const [janela, setJanela] = useState(config.backup.janela);
  const [retencao, setRetencao] = useState(config.backup.retencao);
  const [teste, setTeste] = useState(config.backup.teste);
  const idDaDica = useId();
  const acrescentar = () => {
    const destino = novo.trim();
    if (destino !== '' && !destinos.includes(destino)) setDestinos([...destinos, destino]);
    setNovo('');
  };
  return (
    <Cartao titulo="Backup">
      <ul className={estilos.lista}>
        {destinos.map((destino) => (
          <li key={destino} className={estilos.item}>
            <span className={estilos.mono}>{destino}</span>
            <Botao
              aria-label={`Tirar o destino ${destino}`}
              isDisabled={destinos.length === 1}
              onPress={() => setDestinos(destinos.filter((item) => item !== destino))}
            >
              Tirar
            </Botao>
          </li>
        ))}
      </ul>
      <div className={estilos.linha}>
        <CampoDeTexto
          rotulo="Destino novo"
          aria-describedby={idDaDica}
          value={novo}
          onChange={setNovo}
        />
        <Botao isDisabled={novo.trim() === ''} onPress={acrescentar}>
          Acrescentar o destino
        </Botao>
      </div>
      <p id={idDaDica} className={estilos.nota}>
        Uma pasta completa, como D:\Backups ou \\servidor\compartilhamento, que já exista.
      </p>
      <CampoDeTexto
        rotulo="Janela do horário"
        descricao="HH:MM-HH:MM, como 00:00-06:00."
        value={janela}
        onChange={setJanela}
      />
      <CampoDeTexto
        rotulo="Retenção"
        descricao="Os diários, os semanais e os mensais guardados, como 7,4,12."
        value={retencao}
        onChange={setRetencao}
      />
      <ControleSegmentado rotulo="Teste de restauração" value={teste} onChange={setTeste}>
        <Segmento value="semanal">Semanal</Segmento>
        <Segmento value="diario">Diário</Segmento>
      </ControleSegmentado>
      <p className={estilos.nota}>
        O comando confere que cada destino existe e grava, guarda a configuração da produção e a
        reinicia com saúde.
      </p>
      <div className={estilos.acoes}>
        <Botao
          nivel="primario"
          isDisabled={emAndamento !== null || destinos.length === 0}
          onPress={() =>
            void pedir('backup-configurar', {
              destinos: destinos.join(';'),
              janela,
              retencao,
              teste,
            })
          }
        >
          Gravar o backup
        </Botao>
      </div>
    </Cartao>
  );
}

function Certificado({ config }: { config: ConfiguracoesDoServidor }) {
  const { pedir, emAndamento } = useTarefas();
  const atual = config.certificado;
  const [modo, setModo] = useState<string>(atual.modo);
  const [ac, setAc] = useState<string>(atual.modo === 'interno' ? atual.ac : 'caddy');
  const [email, setEmail] = useState(atual.modo === 'publico' ? atual.email : '');
  const [certificado, setCertificado] = useState(
    atual.modo === 'interno' && atual.ac === 'empresa' ? atual.certificado : '',
  );
  const [chave, setChave] = useState(
    atual.modo === 'interno' && atual.ac === 'empresa' ? atual.chave : '',
  );
  const campos: Record<string, string> =
    modo === 'publico'
      ? { modo, email }
      : ac === 'empresa'
        ? { modo, ac, certificado, chave }
        : { modo, ac };
  return (
    <Cartao titulo="Certificado">
      <ControleSegmentado rotulo="Modo" value={modo} onChange={setModo}>
        <Segmento value="interno">Interno</Segmento>
        <Segmento value="publico">Público</Segmento>
      </ControleSegmentado>
      {modo === 'publico' ? (
        <>
          <CampoDeTexto
            rotulo="E-mail da conta do Let's Encrypt"
            value={email}
            onChange={setEmail}
          />
          <p className={estilos.nota}>
            {config.certificado.tokenConfigurado
              ? 'O token do DNS está configurado e não aparece aqui. O comando pede o token de novo, sem mostrá-lo.'
              : 'O comando pede o token da Cloudflare, sem mostrá-lo.'}
          </p>
        </>
      ) : (
        <>
          <ControleSegmentado rotulo="AC" value={ac} onChange={setAc}>
            <Segmento value="caddy">Do próprio proxy</Segmento>
            <Segmento value="empresa">Da empresa</Segmento>
          </ControleSegmentado>
          {ac === 'empresa' && (
            <>
              <CampoDeTexto
                rotulo="Arquivo do certificado"
                value={certificado}
                onChange={setCertificado}
              />
              <CampoDeTexto rotulo="Arquivo da chave" value={chave} onChange={setChave} />
            </>
          )}
        </>
      )}
      <div className={estilos.acoes}>
        <Botao
          nivel="primario"
          isDisabled={emAndamento !== null}
          onPress={() => void pedir('certificado-configurar', campos)}
        >
          Gravar o certificado
        </Botao>
      </div>
    </Cartao>
  );
}

function Enderecos({ config }: { config: ConfiguracoesDoServidor }) {
  const { pedir, emAndamento } = useTarefas();
  const [novo, setNovo] = useState('');
  const idDaDica = useId();
  const ocupado = emAndamento !== null;
  return (
    <Cartao titulo="Endereços">
      <table className={estilos.tabela}>
        <thead>
          <tr>
            <th scope="col">Produção</th>
            <th scope="col">Teste</th>
            <th scope="col">
              <span className={estilos.semTexto}>Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {config.enderecos.producao.map((endereco) => (
            <tr key={endereco}>
              <th scope="row" className={estilos.mono}>
                {endereco}
              </th>
              <td className={estilos.mono}>{config.enderecos.mapaDoTeste[endereco] ?? ''}</td>
              <td>
                <Botao
                  aria-label={`Tirar o endereço ${endereco}`}
                  isDisabled={ocupado || config.enderecos.producao.length === 1}
                  onPress={() => void pedir('enderecos-tirar', { endereco })}
                >
                  Tirar
                </Botao>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={estilos.linha}>
        <CampoDeTexto
          rotulo="Endereço novo da produção"
          aria-describedby={idDaDica}
          value={novo}
          onChange={setNovo}
        />
        <Botao
          isDisabled={ocupado || novo.trim() === ''}
          onPress={() => void pedir('enderecos-acrescentar', { endereco: novo.trim() })}
        >
          Acrescentar o endereço
        </Botao>
      </div>
      <p id={idDaDica} className={estilos.nota}>
        O comando pergunta o endereço do teste, propõe um, e diz para cadastrar os dois no DNS.
      </p>
    </Cartao>
  );
}

/** O endereço da organização que opera o servidor no ambiente, que os formulários das contas propõem. */
function enderecoDaOrganizacao(config: ConfiguracoesDoServidor, ambiente: string): string {
  const operadora = config.organizacaoOperadora ?? config.enderecos.producao[0] ?? '';
  return ambiente === 'teste' ? (config.enderecos.mapaDoTeste[operadora] ?? '') : operadora;
}

function CriarConta({ config }: { config: ConfiguracoesDoServidor }) {
  const { pedir, emAndamento } = useTarefas();
  const [ambiente, setAmbiente] = useState('producao');
  const [endereco, setEndereco] = useState(enderecoDaOrganizacao(config, 'producao'));
  const [pessoa, setPessoa] = useState('');
  const [usuario, setUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [administrador, setAdministrador] = useState('não');
  return (
    <Cartao titulo="Criar uma conta">
      <ControleSegmentado
        rotulo="Ambiente"
        value={ambiente}
        onChange={(valor) => {
          setAmbiente(valor);
          setEndereco(enderecoDaOrganizacao(config, valor));
        }}
      >
        <Segmento value="producao">Produção</Segmento>
        <Segmento value="teste">Teste</Segmento>
      </ControleSegmentado>
      <CampoDeTexto rotulo="Endereço da organização" value={endereco} onChange={setEndereco} />
      <CampoDeTexto rotulo="Nome da pessoa" value={pessoa} onChange={setPessoa} />
      <CampoDeTexto rotulo="Usuário da conta" value={usuario} onChange={setUsuario} />
      <CampoDeTexto rotulo="E-mail da pessoa (opcional)" value={email} onChange={setEmail} />
      <GrupoDeRadios rotulo="Perfil" value={administrador} onChange={setAdministrador}>
        <Radio value="não">Conta sem perfil</Radio>
        <Radio value="sim">Administradora</Radio>
      </GrupoDeRadios>
      <p className={estilos.nota}>
        A senha temporária aparece uma vez, no andamento: entregue-a à pessoa.
      </p>
      <div className={estilos.acoes}>
        <Botao
          nivel="primario"
          isDisabled={emAndamento !== null || pessoa.trim() === '' || usuario.trim() === ''}
          onPress={() =>
            void pedir('conta-criar', { ambiente, endereco, pessoa, usuario, email, administrador })
          }
        >
          Criar a conta
        </Botao>
      </div>
    </Cartao>
  );
}

function RedefinirAcesso({ config }: { config: ConfiguracoesDoServidor }) {
  const { pedir, emAndamento } = useTarefas();
  const [ambiente, setAmbiente] = useState('producao');
  const [endereco, setEndereco] = useState(enderecoDaOrganizacao(config, 'producao'));
  const [usuario, setUsuario] = useState('');
  const [doisPassos, setDoisPassos] = useState('não');
  return (
    <Cartao titulo="Redefinir um acesso">
      <ControleSegmentado
        rotulo="Ambiente"
        value={ambiente}
        onChange={(valor) => {
          setAmbiente(valor);
          setEndereco(enderecoDaOrganizacao(config, valor));
        }}
      >
        <Segmento value="producao">Produção</Segmento>
        <Segmento value="teste">Teste</Segmento>
      </ControleSegmentado>
      <CampoDeTexto rotulo="Endereço da organização" value={endereco} onChange={setEndereco} />
      <CampoDeTexto rotulo="Usuário da conta" value={usuario} onChange={setUsuario} />
      <ControleSegmentado
        rotulo="Verificação em dois passos"
        value={doisPassos}
        onChange={setDoisPassos}
      >
        <Segmento value="não">Manter</Segmento>
        <Segmento value="sim">Remover</Segmento>
      </ControleSegmentado>
      <div className={estilos.acoes}>
        <Botao
          nivel="primario"
          isDisabled={emAndamento !== null || usuario.trim() === ''}
          onPress={() => void pedir('conta-redefinir', { ambiente, endereco, usuario, doisPassos })}
        >
          Redefinir o acesso
        </Botao>
      </div>
    </Cartao>
  );
}

export function Configuracoes({ api }: { api: ApiDoPainel }) {
  const config = useQuery({ queryKey: ['configuracoes'], queryFn: () => api.configuracoes() });
  if (config.isPending) return <p className={estilos.nota}>Lendo as configurações.</p>;
  if (config.isError) return <p role="alert">{config.error.message}</p>;
  return (
    <div className={estilos.tela}>
      <Email config={config.data} />
      <Backup config={config.data} />
      <Certificado config={config.data} />
      <Enderecos config={config.data} />
      <CriarConta config={config.data} />
      <RedefinirAcesso config={config.data} />
    </div>
  );
}
