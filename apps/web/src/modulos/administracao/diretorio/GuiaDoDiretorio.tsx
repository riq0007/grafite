import { MENSAGENS_DO_DIRETORIO } from '@grafite/domain';
import { Botao, Carimbo, TextoParaCopiar } from '@grafite/ui';
import { useId, useState } from 'react';
import estilos from './GuiaDoDiretorio.module.css';

interface Comando {
  /** O que o comando mostra ou faz: nomeia o grupo para o leitor de tela. */
  para: string;
  comando: string;
}

interface PassoDoGuia {
  titulo: string;
  preencher: string;
  achar: string;
  comandos: readonly Comando[];
}

/**
 * Os sete passos da primeira configuração (spec diretorio-ad, "Tela do diretório"; change
 * guia-do-diretorio, design, decisões 1 e 4), com os comandos que o Windows Server e o AD têm hoje.
 */
export const PASSOS_DO_GUIA: readonly PassoDoGuia[] = [
  {
    titulo: 'A conta de serviço no AD',
    preencher:
      'Crie no AD uma conta só para o Grafite, como svc-grafite, com a senha que não expira. Para buscar e entrar pelo AD, ela não precisa de mais nada. Para gerenciar pelo Grafite, ela precisa das permissões delegadas abaixo.',
    achar:
      'Em Usuários e Computadores do Active Directory, crie a conta numa OU de contas de serviço. Depois, use Delegar controle: na OU das pessoas, "Redefinir senhas de usuário e forçar alteração de senha no próximo logon" e, numa tarefa personalizada dos objetos Usuário, ler e gravar o userAccountControl; na OU dos grupos, "Modificar a associação de um grupo".',
    comandos: [
      { para: 'Usuários e Computadores do Active Directory', comando: 'dsa.msc' },
      {
        para: 'Criar a conta de serviço',
        comando:
          'New-ADUser -Name "svc-grafite" -UserPrincipalName "svc-grafite@empresa.local" -AccountPassword (Read-Host -AsSecureString "Senha") -PasswordNeverExpires $true -Enabled $true',
      },
    ],
  },
  {
    titulo: 'A conta de serviço no Cofre',
    preencher:
      'No Cofre, cadastre um login do tipo Conta de serviço, com o UPN, como svc-grafite@empresa.local, ou o DN no usuário, e a senha da conta. Depois, escolha esse login em "Conta de serviço".',
    achar: 'O UPN e o DN da conta saem do comando abaixo.',
    comandos: [
      {
        para: 'O UPN e o DN da conta de serviço',
        comando: 'Get-ADUser svc-grafite | Select-Object UserPrincipalName, DistinguishedName',
      },
    ],
  },
  {
    titulo: 'O servidor',
    preencher:
      'Em "Servidor", o ldaps:// e o nome completo de um controlador de domínio, como ldaps://dc01.empresa.local. Use o nome que está no certificado do controlador, e não o IP, para a conferência do certificado aceitar. O ldaps:// usa a porta 636, e o ldap://, sem criptografia, a 389.',
    achar:
      'O nltest lista os controladores do domínio, e a variável LOGONSERVER diz qual atendeu a sua entrada no Windows. No servidor do Grafite, o Test-NetConnection confere se a porta 636 responde.',
    comandos: [
      { para: 'Os controladores de domínio', comando: 'nltest /dclist:empresa.local' },
      { para: 'O controlador que atendeu a sua entrada', comando: '$env:LOGONSERVER' },
      {
        para: 'A porta do LDAPS no controlador',
        comando: 'Test-NetConnection dc01.empresa.local -Port 636',
      },
    ],
  },
  {
    titulo: 'A base DN',
    preencher:
      'Em "Base DN", o DN do domínio, como DC=empresa,DC=local, ou o de uma OU, para buscar só nela, como OU=Pessoas,DC=empresa,DC=local.',
    achar:
      'O comando abaixo mostra o DN do domínio. O de uma OU fica nas propriedades dela, na aba Editor de atributos, no distinguishedName; a aba aparece com Exibir › Recursos avançados ligado.',
    comandos: [{ para: 'A base DN do domínio', comando: '(Get-ADDomain).DistinguishedName' }],
  },
  {
    titulo: 'O certificado da AC',
    preencher:
      'Em "Certificado da AC", a raiz da AC da empresa em Base 64, o texto que começa com -----BEGIN CERTIFICATE-----. Ele só é preciso quando o certificado do LDAPS vem da AC da empresa; com um certificado público, deixe o campo em branco. Mantenha "Conferir o certificado do servidor" ligado.',
    achar:
      'Num computador do domínio, abra os certificados do computador, em Autoridades de Certificação Raiz Confiáveis › Certificados, e exporte a AC da empresa em Todas as tarefas › Exportar, no formato X.509 codificado na base 64. Abra o arquivo no Bloco de Notas e copie tudo. No servidor da AC, o certutil exporta a raiz, e o -encode a passa para Base 64.',
    comandos: [
      { para: 'Os certificados do computador', comando: 'certlm.msc' },
      { para: 'Exportar a raiz no servidor da AC', comando: 'certutil -ca.cert raiz-da-ac.cer' },
      {
        para: 'Passar a raiz para Base 64',
        comando: 'certutil -encode raiz-da-ac.cer raiz-da-ac-base64.cer',
      },
    ],
  },
  {
    titulo: 'O atributo do usuário e o filtro das pessoas',
    preencher:
      'Deixe os de fábrica: o sAMAccountName, o login que a pessoa usa no Windows, e o filtro (&(objectCategory=person)(objectClass=user)), que traz só as pessoas. Para limitar a um grupo do AD, acrescente o memberOf ao filtro, como (&(objectCategory=person)(objectClass=user)(memberOf=CN=Grafite,OU=Grupos,DC=empresa,DC=local)).',
    achar: 'O seu login no AD e o DN de um grupo saem dos comandos abaixo.',
    comandos: [
      {
        para: 'O seu login no AD',
        comando: 'Get-ADUser $env:USERNAME | Select-Object SamAccountName, UserPrincipalName',
      },
      { para: 'O DN de um grupo', comando: '(Get-ADGroup "Grafite").DistinguishedName' },
    ],
  },
  {
    titulo: 'O teste, os mapeamentos e a entrada',
    preencher:
      '"Testar a conexão" diz quantos usuários a base tem. Salve, ligue em Mapeamentos cada grupo do AD a um grupo do Grafite e marque "Entrada pelo AD" para quem não tem conta local entrar com o usuário e a senha do AD.',
    achar: `Se o teste disser "${MENSAGENS_DO_DIRETORIO.certificado}", confira o passo 5; "${MENSAGENS_DO_DIRETORIO.contaRecusada}", a senha no Cofre; "${MENSAGENS_DO_DIRETORIO.naoRespondeu}", o nome e a porta do servidor. Os seus grupos no AD saem do comando abaixo.`,
    comandos: [
      {
        para: 'Os seus grupos no AD',
        comando: 'Get-ADPrincipalGroupMembership $env:USERNAME | Select-Object Name',
      },
    ],
  },
];

/**
 * O guia da primeira configuração do diretório: aberto enquanto o diretório não foi gravado e
 * fechado depois, com "Mostrar o guia" e "Esconder o guia". Abrir e fechar só muda o estado, sem
 * animação.
 */
export function GuiaDoDiretorio({ configurado }: { configurado: boolean }) {
  const [aberto, definirAberto] = useState(!configurado);
  const titulo = useId();
  const passos = useId();
  return (
    <section className={estilos.guia} aria-labelledby={titulo} data-aberto={aberto}>
      <div className={estilos.cabecalho}>
        <Carimbo id={titulo}>Guia da primeira configuração</Carimbo>
        <Botao
          nivel="terciario"
          aria-expanded={aberto}
          aria-controls={aberto ? passos : undefined}
          onPress={() => definirAberto(!aberto)}
        >
          {aberto ? 'Esconder o guia' : 'Mostrar o guia'}
        </Botao>
      </div>
      {aberto && (
        <>
          <p className={estilos.texto}>
            Os comandos são do PowerShell, num controlador de domínio ou num computador com as
            ferramentas do AD. Troque empresa.local, dc01 e svc-grafite pelos nomes da sua empresa.
          </p>
          <ol id={passos} className={estilos.passos}>
            {PASSOS_DO_GUIA.map((passo) => (
              <li key={passo.titulo} className={estilos.passo}>
                <h3 className={estilos.tituloDoPasso}>{passo.titulo}</h3>
                <dl className={estilos.explicacao}>
                  <dt>O que preencher</dt>
                  <dd>{passo.preencher}</dd>
                  <dt>Onde achar</dt>
                  <dd>{passo.achar}</dd>
                </dl>
                {passo.comandos.map(({ para, comando }) => (
                  <div key={comando} className={estilos.comando}>
                    <span className={estilos.para} aria-hidden="true">
                      {para}
                    </span>
                    <TextoParaCopiar rotulo={para} valor={comando} />
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
