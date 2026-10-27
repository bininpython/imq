# IMIQ - Inspeção

Sistema de fechamento de inspeções por turno da Laminação a Frio Central.

## Funcionalidades

- entrada por turno TN, TM ou TT com um toque, sem PIN ou senha (sessão anônima do Supabase);
- checklist dos equipamentos e registro de desvios;
- pesquisa de equipamentos e códigos de defeito;
- nome do inspetor responsável em cada fechamento;
- evidências em foto e vídeo armazenadas no Supabase Storage;
- histórico de relatórios com exportação em PDF e CSV;
- fotos incorporadas ao PDF do fechamento;
- banco de dados protegido por autenticação e políticas RLS.

## Arquitetura

- Next.js/Vinext, React e TypeScript;
- Supabase Auth, Postgres e Storage;
- Vercel para a publicação principal;
- GitHub para versionamento e integração contínua.

Os identificadores internos legados do banco (`imq_*`) foram preservados para manter compatibilidade com os relatórios e evidências existentes. A identidade exibida ao usuário é **IMIQ - Inspeção**.

## Verificação

```bash
npm ci
npm run lint
npm test
```

O comando de testes executa o build de produção e as verificações automatizadas.

---

## Modo local (ativo)

Por enquanto o app roda **sem Supabase** (`LOCAL_MODE = true` em `lib/imq-supabase.ts`): basta tocar no turno para entrar. Relatórios e evidências ficam no IndexedDB **do navegador usado** — não são compartilhados entre computadores e se perdem se os dados do site forem apagados. Exporte PDF/CSV dos fechamentos importantes.

Para voltar ao Supabase, configure o projeto conforme a seção abaixo e troque `LOCAL_MODE` para `false`.

## Acesso sem PIN — configuração do Supabase

1. Em **Authentication > Sign In / Providers**, ative **Allow anonymous sign-ins**.
2. No **SQL Editor**, execute `supabase/remove_pin_shift_access.sql`. O script não apaga dados.
3. Publique a aplicação.

Ao tocar no turno, o app cria uma sessão anônima marcada com o turno. Quem entra como TN vê todo o histórico do TN, inclusive os relatórios antigos. Sem PIN, qualquer pessoa com o endereço do app pode entrar em qualquer turno; restrinja o acesso ao endereço se necessário.

---

developed by Abner Lucas
