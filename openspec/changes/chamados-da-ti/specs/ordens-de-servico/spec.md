## ADDED Requirements

### Requirement: OS pelo chamado

Num chamado em aberto, com o ativo ligado e de um tipo que pode virar OS (spec chamados e spec tipos-de-chamado), quem atende o chamado e as OS no local do ativo SHALL poder abrir a OS do chamado. A OS SHALL nascer:
- com o ativo do chamado, ou com outro que quem abre escolhe, num local onde atende as OS, sem mudar o ativo do chamado;
- com o problema que começa com o título do chamado e as respostas do formulário dele, que quem abre pode corrigir antes;
- Aberta ou, se quem abre escolhe, já Em atendimento, Aguardando peça ou Aguardando fornecedor, com o fornecedor e o número da OS nele, pelas regras da mudança da situação (requisito "Situação e histórico da OS").

A OS SHALL ficar ligada ao chamado e mostrar "Do chamado #1042" a quem vê a OS, com o link só para quem vê o chamado. Com o módulo Chamados desligado, a OS SHALL NOT mostrar o chamado. Cada chamado SHALL ter uma OS só.

A OS do chamado SHALL seguir as regras de toda OS. Resolver ou encerrar a OS SHALL NOT mudar o chamado, que mostra a situação da OS a quem vê as OS.

As recusas SHALL ser:
- "O chamado #1042 já tem a OS 12.";
- "O chamado #1042 não tem um ativo ligado.";
- "O tipo Acesso e senha não vira OS.";
- "O chamado #1042 está resolvido.".

#### Scenario: Impressora vira OS
- **WHEN** Diego usa "Virar OS" no #1042, de Impressora, ligado à PAT-00139, e abre a OS com o problema "Impressora manchando"
- **THEN** a OS nasce Aberta na PAT-00139, ligada ao #1042, o #1042 mostra "OS 13 · Aberta" e continua Em atendimento, e a conversa ganha "Virou a OS 13"

#### Scenario: OS que nasce no fornecedor
- **WHEN** Diego vira o #1042 em OS em "Aguardando fornecedor", com o fornecedor Tonerlab e o número A-778
- **THEN** a OS 13 nasce Aguardando fornecedor, o histórico dela tem "Aberta" e "Aguardando fornecedor" no mesmo instante, e o #1042 mostra "OS 13 · Aguardando fornecedor"

#### Scenario: OS noutro ativo
- **WHEN** Diego vira o #1042, ligado à PAT-00139, em OS na PAT-00200
- **THEN** a OS 13 nasce na PAT-00200, e o #1042 continua com a PAT-00139 e mostra "OS 13 · Aberta · PAT-00200"

#### Scenario: Segunda OS do chamado
- **WHEN** alguém tenta abrir outra OS para o #1042, que já tem a OS 13
- **THEN** a abertura é recusada com "O chamado #1042 já tem a OS 13."
