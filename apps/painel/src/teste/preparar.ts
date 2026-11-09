// Nenhum teste da página fala com a rede: cada um usa a API do painel em memória, com o servidor de
// mentira. O findBy e o waitFor esperam até 10 s pela tela, como na web.
import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 10_000 });
