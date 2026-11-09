## ADDED Requirements

### Requirement: Versão desempacotada presa por um instante

Ao dar o nome final à pasta da versão desempacotada, o comando SHALL tentar de novo enquanto o Windows disser que a pasta está presa, por até 10 s somadas as esperas. Depois disso, ou com outro erro, ele SHALL falhar com o motivo do sistema, sem mudar o que está instalado.

#### Scenario: Antivírus conferindo a versão nova
- **WHEN** o antivírus segura um arquivo da versão recém-desempacotada por um instante
- **THEN** a versão ganha o nome final, e a instalação ou a atualização segue
