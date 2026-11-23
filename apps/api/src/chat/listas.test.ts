// O banco confere os tipos de conversa e as espécies das mensagens do chat com listas próprias,
// porque o @grafite/db não depende do domínio. Elas têm de ser as mesmas do domínio (change
// chat-com-chamados, design, decisão 1), como as dos chamados.
import { ESPECIES_DO_CHAT_NO_BANCO, TIPOS_DE_CONVERSA_NO_BANCO } from '@grafite/db';
import { ESPECIES_DO_CHAT, TIPOS_DE_CONVERSA } from '@grafite/domain';
import { expect, it } from 'vitest';

it('o banco aceita os mesmos tipos de conversa e espécies das mensagens do chat do domínio', () => {
  expect([...TIPOS_DE_CONVERSA_NO_BANCO]).toEqual([...TIPOS_DE_CONVERSA]);
  expect([...ESPECIES_DO_CHAT_NO_BANCO]).toEqual([...ESPECIES_DO_CHAT]);
});
