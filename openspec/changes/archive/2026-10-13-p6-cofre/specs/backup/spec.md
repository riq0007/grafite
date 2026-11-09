## MODIFIED Requirements

### Requirement: Chaves fora do backup

O backup SHALL NOT incluir a configuração dos ambientes nem as chaves dela, como a chave que cifra as chaves dos apps autenticadores e a chave mestra do cofre. Depois de uma troca da chave do cofre, os backups feitos antes dela SHALL abrir os segredos só com a chave anterior, que o runbook manda guardar com eles. O runbook SHALL dizer como guardar essas chaves à parte. Sem elas, um backup restaurado SHALL perder só o que elas cifram, e o resto dos dados SHALL continuar legível.

#### Scenario: Backup sem a chave
- **WHEN** alguém tem só os arquivos de um backup
- **THEN** ele não tem a chave dos dois passos nem as senhas dos bancos, que ficam só na configuração do servidor

#### Scenario: Backup de antes da troca da chave do cofre
- **WHEN** a produção é restaurada de um backup feito antes da última troca da chave do cofre
- **THEN** os segredos abrem com a chave anterior na configuração, como o runbook manda, e, sem ela, só os valores dos segredos ficam ilegíveis
