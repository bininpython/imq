# IMIQ - Inspeção

Sistema de fechamento de inspeções por turno da Laminação a Frio Central.

## Funcionalidades

- seleção de turno TN, TM e TT sem PIN ou senha, com sessão anônima do Supabase;
- checklist dos equipamentos e registro de desvios;
- pesquisa de equipamentos e códigos de defeito;
- nome do inspetor responsável em cada fechamento;
- evidências em foto e vídeo armazenadas no Supabase Storage;
- histórico de relatórios com exportação em PDF e CSV;
- fotos incorporadas ao PDF do fechamento;
- relatórios e evidências restritos ao proprietário da sessão por políticas RLS.

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

developed by Abner Lucas

## Remoção do PIN — implantação

1. No projeto Supabase, habilite **Authentication > Providers > Anonymous Sign-Ins**.
2. Execute o script `supabase/remove_pin_shift_access.sql` no SQL Editor **antes** de publicar a interface nova. Ele atualiza a função de fechamento e remove a tabela de contas por turno; não apaga relatórios ou evidências.
3. Publique a aplicação. Na primeira entrada, escolha TN, TM ou TT. Ao trocar turno, a sessão e o histórico do dispositivo são preservados.

**Atenção à operação:** sem PIN, qualquer pessoa com acesso ao endereço do app pode iniciar uma sessão e criar os próprios fechamentos, informando o turno que desejar. Não existe verificação da identidade do inspetor. Os registros continuam isolados por `owner_id`; não ficam automaticamente compartilhados entre navegadores ou dispositivos. Se os dados do navegador forem apagados, a sessão anônima e o acesso aos seus registros não poderão ser recuperados por essa interface, embora permaneçam no banco.

**Relatórios antigos:** continuam associados às contas anteriores e não aparecem em uma nova sessão anônima. Se precisar migrar ou consolidar o histórico, faça isso em um fluxo administrativo específico, com backup, preservando evidências e integridade dos dados.

**Desativação definitiva dos PINs antigos:** depois de assegurar o acesso necessário ao histórico, revogue ou bloqueie o login das antigas contas `tn@imq.app`, `tm@imq.app` e `tt@imq.app` no Supabase Auth. **Não exclua os usuários**: a exclusão em cascata removeria relatórios vinculados a eles.

Recomenda-se proteção adicional no acesso à aplicação (por exemplo, rede interna ou acesso corporativo), além de controles antiabuso para novos cadastros anônimos.
