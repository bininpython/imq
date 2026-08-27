# IMIQ - Inspeção

Sistema de fechamento de inspeções por turno da Laminação a Frio Central.

## Funcionalidades

- acesso por turno TN, TM e TT com código de seis dígitos;
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

developed by Abner Lucas
