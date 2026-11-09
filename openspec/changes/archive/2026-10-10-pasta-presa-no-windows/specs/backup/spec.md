## ADDED Requirements

### Requirement: Pasta do backup presa por um instante

No Windows, o antivírus e o indexador abrem os arquivos que o backup acabou de gravar. Ao dar o nome final à pasta do backup, no primeiro destino e nos outros, a produção SHALL tentar de novo enquanto o sistema disser que a pasta está presa, por até 10 s somadas as esperas. Depois disso, ou com outro erro, o backup SHALL falhar com o motivo do sistema, como as outras falhas.

#### Scenario: Antivírus conferindo o dump
- **WHEN** o antivírus segura o dump recém-gravado por um instante, e o nome final é recusado na primeira tentativa
- **THEN** o backup espera, dá o nome final à pasta e conta como feito

#### Scenario: Pasta presa de verdade
- **WHEN** a pasta continua presa depois de 10 s de esperas
- **THEN** o backup falha com o motivo do sistema
