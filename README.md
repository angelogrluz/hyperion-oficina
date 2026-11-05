# Hyperion Car Lab

Gestão de uma oficina de reparação automóvel em Portugal: clientes, viaturas, ordens de reparação, orçamentos, stock, compras a fornecedores e agenda.

A interface está em português europeu. A faturação certificada **não está implementada** — a lei exige software certificado pela Autoridade Tributária. O botão **Faturar** envia a ordem concluída a um adaptador. Nesta versão o adaptador é uma simulação no lugar da Moloni e o número devolvido não tem validade fiscal.

## Entrar na demonstração

- E-mail: `admin@hyperioncarlab.pt`
- Palavra-passe: `oficina`

Os dados de exemplo incluem clientes, viaturas, artigos, compras, ordens e marcações de novembro de 2026.

## Correr localmente

Requisitos: Node.js 22.

```bash
npm install
npm run setup
npm run dev
```

A aplicação fica em [http://127.0.0.1:43123](http://127.0.0.1:43123).

`npm run setup` cria a base SQLite em `data/hyperion.db`, aplica as migrações e carrega a demonstração se ainda não existir um utilizador. Para recomeçar do zero:

```bash
npm run db:reset
```

Produção local:

```bash
npm run build
npm start
```

Variáveis opcionais (há valores de demonstração se faltarem):

```bash
DATABASE_URL="file:./data/hyperion.db"
AUTH_SECRET="uma-chave-longa"
INVOICE_PROVIDER="mock-moloni"
```

`INVOICE_PROVIDER=moloni` seleciona o adaptador real, que recusa a emissão até existirem credenciais e a ligação certificada.

`PLATE_PROVIDER=mock` (omissão) simula a consulta de matrícula. `PLATE_PROVIDER=matricula-api` reserva o adaptador pago e exige `PLATE_API_URL` e `PLATE_API_KEY`.

## Site estático para GitHub Pages

```bash
npm run build:pages
```

Gera `browser/dist` com base `/hyperion-oficina/` e o zip `/opt/cursor/artifacts/hyperion-oficina.zip` (`index.html` na raiz e `.nojekyll`). Publique o conteúdo do zip em `https://angelogrluz.github.io/hyperion-oficina/`. Os dados ficam no IndexedDB deste browser. No menu do utilizador há **Repor dados de demonstração**. O mesmo login de demonstração funciona sem servidor. A versão Next.js com SQLite mantém-se com `npm run dev`.

## Docker

```bash
docker build -t hyperion-car-lab .
docker run --rm -p 43123:43123 -v hyperion-data:/app/data hyperion-car-lab
```

A base SQLite vive no volume `/app/data`. Sem volume, os dados desaparecem quando o contentor para.

## O que a versão 1 faz

- **Clientes** com nome, NIF (dígito de controlo), telefone, e-mail e morada.
- **Viaturas** com matrícula `AA-00-AA`, marca, modelo, versão, ano, motor, combustível, VIN e km, ligadas a um cliente. O botão **Procurar** junto à matrícula preenche esses dados. A consulta está simulada (`PLATE_PROVIDER=mock`); o adaptador `matricula-api` fica reservado para uma API paga portuguesa (`PLATE_API_URL` e `PLATE_API_KEY`).
- **Ordens de reparação** com entrada e saída, km, problema, mão de obra (horas × preço/hora) e peças. Estados: aberta, em curso, concluída, faturada. Impressão e PDF.
- **Orçamentos** com a mesma estrutura, conversíveis numa ordem.
- **Artigos**: referência e descrição em maiúsculas, família, custo, margem e PVP calculado. IVA 23%. Margem de 40%, 30% nos óleos e 0% na eco taxa.
- **Fornecedores e compras**: grelha por teclado. A linha nova herda data, fornecedor, documento, número e pagamento. A quantidade não é herdada. Gravar atualiza stock e custo médio. Uma linha de óleo pode acrescentar ECOLUB a 0,09 € por litro.
- **Agenda** mensal, com a semana a começar à segunda-feira.
- **Painel** com ordens por fechar, faturação e margem do mês, e stock no mínimo ou abaixo.

O stock das ordens de reparação não é descontado. Só as compras o alteram, para além de um acerto manual na ficha do artigo.

## Testes

```bash
npm test
```

Cobre matrícula, NIF, PVP, ECOLUB, custo médio, totais com IVA e a herança das linhas de compra.
