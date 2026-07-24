# OrçaZap

Aplicativo web para criar orçamentos, calcular entrada e saldo, gerar PDF com QR Pix, enviar mensagens pelo WhatsApp e controlar pedidos.

## Recursos

- Dashboard de faturamento, conversão e pedidos
- Cadastro de clientes
- Cadastro de produtos/serviços, preço, custo e margem
- Orçamentos com desconto, entrada e validade
- PDF profissional com QR Code Pix
- Mensagem pronta para WhatsApp
- Orçamento aprovado vira pedido
- Kanban de produção
- Backup e importação em JSON
- PIN local opcional
- PWA instalável e funcionamento offline
- Layout responsivo para celular e computador

## Publicar na Vercel

### Pelo painel da Vercel

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta.
2. Na Vercel, clique em **Add New > Project**.
3. Importe o repositório.
4. Em **Framework Preset**, use **Other**.
5. Não informe comando de build.
6. Diretório de saída: deixe vazio ou use `.`.
7. Clique em **Deploy**.

### Pela CLI

```bash
npm install -g vercel
vercel
vercel --prod
```

## Dados

Esta edição salva os dados em `localStorage`, no navegador do usuário. Use **Configurações > Backup e dados** para exportar o arquivo JSON.

Para uma edição SaaS multiusuário, substitua a camada local por Supabase, Neon ou outro banco disponível no Marketplace da Vercel.
