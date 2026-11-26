# Controle Financeiro — como instalar no celular

O app é um **PWA** (aplicativo web instalável): depois de publicado num endereço `https://`,
você abre esse endereço no celular, toca em "Adicionar à tela inicial", e ele passa a funcionar
como um app comum — com ícone próprio, em tela cheia e **sem precisar de internet**.

> **Seus dados não vão para a internet.** Só os arquivos do app (código) ficam publicados.
> Os lançamentos ficam guardados apenas no aparelho onde você os digita.

## 1. Publicar o app (uma vez só) — GitHub Pages, grátis

1. Crie uma conta em <https://github.com> (se ainda não tiver).
2. Clique em **New repository** (botão verde / "+" no topo).
   - Nome: `financas` (ou o que preferir)
   - Marque **Public** (o GitHub Pages gratuito exige repositório público — só o código fica visível, não seus dados).
   - Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Arraste para lá **todos** os arquivos desta pasta: `index.html`, `styles.css`, `app.js`,
   `manifest.json`, `sw.js` e a pasta `icons`. Clique em **Commit changes**.
5. Vá em **Settings → Pages**. Em *Branch*, escolha `main` e `/ (root)` e clique em **Save**.
6. Aguarde 1–2 minutos. O endereço aparece no topo dessa página, algo como
   `https://SEU-USUARIO.github.io/financas/`.

## 2. Instalar no celular

**Android (Chrome):** abra o endereço → menu **⋮** → **Instalar app** (ou "Adicionar à tela inicial").

**iPhone (Safari):** abra o endereço no **Safari** → botão **Compartilhar** (quadrado com seta) →
**Adicionar à Tela de Início**.

Pronto: o ícone **R$** aparece na tela inicial.

## 3. Cuidados com os dados

- Celular e computador têm dados **separados**. Para levar os dados de um para outro:
  aba **Dados → Exportar backup (JSON)** num aparelho e **Importar backup** no outro.
- Faça backup de vez em quando (ex.: salve o JSON no Google Drive/iCloud).
- Se desinstalar o app ou limpar os dados do navegador, os lançamentos são apagados.

## 4. Rotina de uso

**Escolha UM aparelho principal** (de preferência o celular). Os dados não sincronizam sozinhos entre
celular e computador — se usar os dois, leve os dados com *Dados → Exportar backup* e *Importar backup*.

**Configuração inicial (uma vez):**
1. *Contas* → edite a "Conta principal" (nome do banco e saldo inicial) e cadastre as demais:
   outras contas, investimentos e cartões (com limite, fechamento e vencimento).
2. *Orçamento* → defina o limite mensal de cada categoria de despesa.
3. *Metas* → cadastre seus objetivos.

**Toda semana (10 minutos):**
1. Baixe o OFX de cada conta e cartão no app do banco.
2. *Lançamentos → Escolher arquivo OFX* → confira a conta, os tipos e as categorias → *Importar*.
3. Lance à mão o que não vem no extrato (dinheiro, Pix de terceiros etc.).

**Todo mês:**
1. *Contas → Faturas* de cada cartão → *Pagar fatura* (se não veio pelo OFX da conta corrente).
2. *Painel* → compare gastos × orçamento e ajuste o mês seguinte.
3. Confira se o saldo de cada conta no app bate com o do banco.
4. *Dados → Exportar backup* e guarde o arquivo (Google Drive, e-mail etc.).

## 5. Atualizar o app depois de mudanças

1. Em `sw.js`, aumente a versão (ex.: `financas-v2` → `financas-v3`).
2. Envie os arquivos alterados ao GitHub (Add file → Upload files).
3. No celular, abra o app com internet uma ou duas vezes para ele baixar a nova versão.
   Seus dados são mantidos.
