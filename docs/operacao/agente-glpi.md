# Inventário pelo GLPI Agent

O Grafite recebe o inventário enviado pelo GLPI Agent; ele não busca o inventário no servidor GLPI. Cada endereço em `server` é um destino independente. O agente primeiro envia PROLOG, passa para CONTACT e executa INVENTORY. O Grafite pede novo contato a cada 24 horas. Um inventário com menos de 48 horas aparece como “Em dia”.

1. Em Administração → Agentes do GLPI, gere o endereço uma vez e guarde-o como credencial. Acrescente-o ao `server` existente, separado por vírgula. No Windows de 64 bits, a chave habitual é `HKLM\SOFTWARE\GLPI-Agent`; o agente de 32 bits pode usar `HKLM\SOFTWARE\WOW6432Node\GLPI-Agent`.
2. Garanta que a máquina resolve o nome do Grafite pelo DNS interno e alcança a porta 443.
3. Garanta a confiança no certificado HTTPS antes de enviar o inventário. DNS interno não torna o certificado confiável. Use a CA fornecida pelo administrador do servidor. Com inspeção HTTPS, confira também a CA aprovada do antivírus/proxy. Não importe automaticamente um certificado obtido de uma conexão não validada.
4. Para a raiz do proxy, use **Computador Local → Autoridades de Certificação Raiz Confiáveis**, acessível pelo `certlm.msc`, ou distribua a raiz por GPO. Confira a confiança na conta do serviço. Alternativamente, configure `ca-cert-file` (REG_SZ) com o caminho absoluto de um PEM contendo as CAs aprovadas necessárias aos destinos HTTPS. O arquivo precisa ser legível pelo serviço. Mantenha `no-ssl-check=0`.
5. Reinicie o serviço `glpi-agent` após mudar a configuração. O serviço segue o próximo horário programado. Para testar pelo próprio serviço, abra `http://localhost:62354/` na estação e use **Force an inventory** quando a interface local estiver ativa. Para uma execução manual, use PowerShell elevado:

```powershell
& 'C:\Program Files\GLPI-Agent\glpi-agent.bat' --force --tasks=inventory
```

O inventário pode levar minutos, principalmente se consultas WMI demorarem. Cada destino executa sua coleta. Para isolar o Grafite em um teste, use `--server` com o endereço dele; a opção vale apenas nessa execução. Para forçar um inventário completo de um agente que já envia parciais, acrescente `--full-inventory-postpone=0`. Consulte `C:\Program Files\GLPI-Agent\logs\glpi-agent.log` e oculte o token antes de compartilhar linhas do log.

## Cadastrar novos computadores

1. Em **Gestão de ativos → Catálogo → Tipos**, edite ou crie um tipo ativo de computador e habilite a capacidade **Inventário de hardware**. Depois, em **Administração → Agentes → Cadastro automático de computadores**, escolha esse tipo.
2. Escolha o local de entrada na árvore, se houver, e salve. O seletor permite pesquisar pelo caminho completo e remover o local. O cadastro começa desligado em cada organização.
3. Configure o GLPI Agent nos computadores com o endereço do Grafite e a raiz aprovada. Em máquinas de domínio, a TI pode distribuir a raiz e o valor `server` por GPO, mantendo os destinos separados por vírgula.

O Grafite procura um ativo por série válida e depois por hostname. Se encontrar um único ativo ativo, aproveita o cadastro. Com a opção ligada, um inventário completo com hostname ou um parcial que informa o tipo `Computer` e o hostname pode criar o computador no tipo e local escolhidos. Os dados ausentes no parcial entram conforme chegam nos próximos envios. Séries genéricas de BIOS não identificam a máquina. Correspondências ambíguas, ativos inativos e campos obrigatórios ausentes ficam para revisão.

Uma máquina que já aparecia como **Sem ativo** pode ser cadastrada no próximo inventário. A coluna **Ativo** mostra o motivo quando o servidor registra uma pendência. Na estação Windows, antecipe um inventário completo com o comando PowerShell abaixo. Depois confira se **Último inventário** atualizou e veja o resultado na coluna **Ativo**.

```powershell
& 'C:\Program Files\GLPI-Agent\glpi-agent.bat' --force --tasks=inventory --full-inventory-postpone=0
```

Na lista de agentes, **Último contato** confirma a comunicação; **Último inventário** confirma o envio dos dados. Antes do inventário, o IP pode ser o endereço da conexão; depois, o IP do inventário tem preferência. A ficha mostra fabricante e modelo, IP, MAC, UUID, último usuário informado, última inicialização, hardware e sistema quando enviados. A aba **Softwares** mostra os programas recebidos. Campos travados e manuais são preservados. O usuário informado não altera o responsável, e a configuração de local vale só para novos cadastros.

## Diagnóstico

| Resultado | O que conferir |
|---|---|
| `certificate verify failed` | Falha antes da API: cadeia da CA, validade, nome do certificado e inspeção HTTPS. Gerar outro endereço não resolve. |
| 404 / endereço desconhecido | Host ligado à organização e caminho completo `/api/agentes/glpi/<token>`. |
| 403 | Token antigo/desligado ou de outra organização. Gerar outro invalida o anterior em todas as máquinas. |
| 400 ou 415 | Formato do protocolo e versão da API. PROLOG XML, CONTACT e INVENTORY são suportados. Abrir o endereço no navegador não simula um inventário. |
| “Sem inventário” | CONTACT chegou, mas INVENTORY ainda não concluiu. Confira erros e tarefas desativadas no agente. |
| “Sem ativo” | Confira se o cadastro automático está ligado e se o tipo/local continuam ativos. Em caso de identidade ambígua, cadastro inativo ou dados obrigatórios faltando, revise e use “Ligar”. |

Um caso comum: a estação reconhece o endereço do Grafite, mas falha na validação do certificado antes do PROLOG, porque a inspeção HTTPS de um antivírus apresenta uma cadeia que a máquina não confia. Depois de confiar na cadeia aprovada pela TI, o Grafite responde ao PROLOG e o agente passa à coleta. Confirme também a execução automática pelo serviço, e não só a manual. Se a coleta local tiver timeouts do WMI, confira o serviço WMI da estação.

Referência: [configuração oficial do GLPI Agent](https://glpi-agent.readthedocs.io/en/1.21/configuration.html).
