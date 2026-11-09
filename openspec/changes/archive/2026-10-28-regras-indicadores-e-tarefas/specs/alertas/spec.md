## ADDED Requirements

### Requirement: Exceções da regra

Uma regra de uma condição dos ativos SHALL poder ter até 50 exceções. Cada exceção SHALL ter:
- onde vale: um tipo de ativo, um modelo, um ativo ou um local com os locais de baixo;
- o efeito: "Não alertar", em qualquer condição dos ativos, ou "Outro limite", só na regra do Nível do toner, com o limite e a folga dela.

Na avaliação, cada ativo do escopo SHALL seguir a exceção mais específica que o alcança: a do ativo, depois a do modelo, a do tipo e, por último, a do local mais fundo. Sem exceção, o ativo SHALL seguir a regra.
- O ativo com "Não alertar" SHALL ficar fora da regra, e o alerta aberto dele SHALL terminar como o da regra que deixou de valer.
- O ativo com "Outro limite" SHALL abrir e recuperar o alerta pelo limite e pela folga da exceção.

A regra do Coletor sem contato SHALL NOT ter exceções. A gravação SHALL recusar o que não confere, com a mensagem na exceção:

| O que não confere | Mensagem |
|---|---|
| exceção sem o lugar | "Escolha onde vale a exceção." |
| tipo, modelo, ativo ou local que falta ou está inativo | as mensagens do escopo da regra |
| duas exceções no mesmo lugar | "Já existe uma exceção nesse lugar." |
| "Outro limite" fora da regra do toner | "Outro limite só vale na regra do toner." |
| limite ou folga fora dos limites | as mensagens do limite e da folga da regra |
| mais de 50 exceções | "Use até 50 exceções na regra." |
| exceção na regra do coletor | "A regra do coletor não tem exceções." |

#### Scenario: Modelo que acaba antes
- **WHEN** a regra "Toner em 10% ou menos" tem a exceção "Outro limite" de 20% no modelo HP M404, e o toner de uma M404 chega a 18%
- **THEN** o alerta do toner abre para essa impressora, e as dos outros modelos continuam no limite de 10%

#### Scenario: Local sem o alerta de offline
- **WHEN** a regra "Ativo offline" tem a exceção "Não alertar" no local Laboratório, e um computador do laboratório fica offline
- **THEN** nenhum alerta abre para ele

#### Scenario: Ativo vence o local
- **WHEN** a regra do toner tem "Não alertar" no local Laboratório e "Outro limite" de 30% numa impressora desse local
- **THEN** a impressora segue o limite de 30%
