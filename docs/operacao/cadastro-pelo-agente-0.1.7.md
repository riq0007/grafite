# Cadastro de computadores pelo agente

O cadastro saiu primeiro na pré-release **Versão 0.1.7 NÃO VERIFICADA**, só com o pacote para Windows e sem o CI. Ele entra conferido pelo CI na versão 0.1.10, com os pacotes para Windows e para Linux com o Docker.

Depois de atualizar a API e a web, abra **Administração → Agentes → Cadastro automático de computadores**. Escolha um tipo ativo com Inventário de hardware, o local de entrada opcional e salve. A configuração começa desligada para preservar o cadastro atual de cada organização. A atualização aplica as migrations `0053_cadastro_dos_agentes` e `0054_pendencia_do_cadastro_do_agente`.

Quando chegar o primeiro inventário completo de um computador com agente configurado, o Grafite liga um ativo correspondente ou cria um novo. A série e o hostname evitam duplicação em reenvios e reinstalações; identidades em conflito ficam para revisão. O catálogo aproveita fabricante e modelo, e a ficha recebe IP, MAC, UUID, último usuário, inicialização, hardware, sistema e softwares quando presentes. Patrimônio, responsável e local de ativos existentes continuam definidos pela TI.

O cadastro depende do envio do GLPI Agent; conectar um computador sem agente à rede não dispara inventário. Para configurar os computadores do domínio e validar o serviço, siga [Inventário pelo GLPI Agent](agente-glpi.md). Para atualizar o servidor, siga o [runbook](runbook.md).

Verificação local da 0.1.7: 86 testes selecionados do domínio, 29 de integração GLPI com PostgreSQL temporário, 6 da tela e um teste em navegador real. Os testes cobrem reenvio, concorrência, séries genéricas, ativos e modelos inativos, travas, isolamento e configuração persistida. Foram conferidos tipos, contrato, OpenSpec, formatação, compilação da web e painel da operação. A execução ampla de integração não foi concluída. Na 0.1.10, ela rodou inteira: a única falha era o teste das capacidades, que ainda contava os oito campos de antes do Inventário de hardware, e foi corrigida com a ponta a ponta do catálogo.
