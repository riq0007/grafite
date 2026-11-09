## Context

S5, com apoio de P1. O protocolo e a lista de softwares já existem. O parser lê fabricante e modelo, mas eles não são aproveitados; o IP é guardado no agente, sem campo próprio no ativo. O recebimento liga por série ou hostname e só altera ativos existentes.

## Goals / Non-Goals

Permitir que a TI escolha uma vez o tipo e o local de entrada e receba os computadores inventariados sem cadastrar cada um. Mostrar os dados técnicos disponíveis e preservar o cadastro administrativo. A entrada depende de GLPI Agent instalado, endereço da organização e confiança TLS; não é uma descoberta de qualquer PC que entrou na rede.

## Decisions

1. Configuração própria, uma por organização, com tipo e local opcionais e FKs compostas. Tipo nulo desliga o cadastro. `coletores.administrar` lê e grava, com auditoria; só tipos ativos com `hardware.inventario` e locais ativos são aceitos. Não se cria um tipo genérico automaticamente.
2. Somente inventário completo com hostname informado pode criar ativo. CONTACT e inventário parcial não criam. Antes, procurar pela série e depois pelo hostname; séries genéricas de BIOS, como `To be filled by O.E.M.`, não identificam uma máquina e são ignoradas nessa busca. Correspondência ambígua ou com cadastro inativo exige revisão e não cria duplicata. Uma trava transacional por organização serializa a ligação/cadastro dos agentes ainda sem ativo; reenvios e agentes reinstalados reutilizam o cadastro. A ligação manual continua prevalecendo.
3. Cadastro pelo `gravarAtivo`, com ator de sistema, origem agente e local configurado somente na criação. Campos obrigatórios não conhecidos impedem a criação, sem inventar valores; o inventário continua recebido e um aviso explica a pendência. Usar savepoint para manter o recebimento mesmo se o cadastro for recusado. Tipos ou locais inativados suspendem novas criações.
4. Fabricante e modelo válidos são encontrados/criados no catálogo do tipo, por nomes normalizados, com auditoria. Modelo existente no ativo é preservado; modelo inativo não é reativado. IP/MAC/UUID/usuário/última inicialização entram na capacidade de hardware com origem e trava. IP é o do inventário, não o IP do proxy; ignorar IPv4 inválido, loopback, endereço zero e APIPA. Atualizar IP no CONTACT enquanto não há endereço confiável do inventário.
5. Formulário simples na Administração para tipo e local; tabela ganha IP e último contato. Reutilizar campos e seleções do design system. Mostrar a regra de cadastro e o requisito de agente configurado. Patrimônio, responsável, comentários e local administrativo não são deduzidos do inventário.

## Risks / Trade-offs

Escolher o mesmo tipo para a entrada dá um local previsível aos novos ativos; classificação mais específica pode ser feita depois. Campos obrigatórios ou identidades conflitantes podem manter o agente sem ativo para revisão. Várias interfaces de rede exigem preferência pelo IPv4 principal do agente quando válido; sem ele, usar o primeiro IPv4 utilizável das interfaces, sem inferir local ou responsável.

## Migration Plan

Configuração nova começa desligada, preservando organizações existentes. Atualizar API e web juntas; escolher tipo/local na Administração e aguardar novo inventário completo. Desligar a configuração impede novas criações, mantendo atualizações dos ativos ligados. Nenhuma alteração automática na produção nesta sessão.

## Open Questions

Nenhuma necessária para a implementação; as escolhas de tipo e local ficam disponíveis para a TI no produto.
