## ADDED Requirements

### Requirement: Resposta por ver

Cada participante que tem a resposta nova num chamado SHALL ter também a resposta por ver: as mensagens da resposta nova escritas depois da última vez em que ele abriu a conversa daquele chamado, no chat de qualquer aparelho ou na aba. Abrir a conversa SHALL gravar a abertura, por conta e chamado, e SHALL tirar a resposta por ver. A resposta nova SHALL seguir como está, até ele responder, escolher, reabrir, avaliar ou marcar como vista. Tudo o que tira a resposta nova SHALL tirar também a resposta por ver.

A abertura SHALL ser gravada só quando a conversa aparece na tela, e não quando ela é lida em segundo plano. A gravação SHALL mandar o evento à pessoa, para as telas e a aba dela se atualizarem, quando tira a resposta por ver.

#### Scenario: Vista sem responder
- **WHEN** Ana responde o #1041 às 09:21, e Fernanda Rocha abre a conversa às 10:12 sem responder
- **THEN** o #1041 deixa de ter a resposta por ver, e continua com a resposta nova

#### Scenario: Outra resposta depois de vista
- **WHEN** Ana escreve de novo no #1041 às 10:20, depois da abertura das 10:12
- **THEN** o #1041 volta a ter a resposta por ver, com a mensagem das 10:20
