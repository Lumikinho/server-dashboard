# Servidor Lumiko

Um servidor pessoal em ARM64 (aarch64) com dashboard de monitoramento + gerenciador de
serviços por trás de um único Caddy. Acesso externo via **Tailscale Funnel** (HTTPS).

## Topologia

```
            🌐 Internet (https://server.tail380a9e.ts.net)
                          │  Tailscale Funnel (HTTPS)
                     ┌────▼─────┐
                     │  Caddy   │  :8888  (HTTP local; auto_https off)
                     └────┬─────┘
        ┌─────────────────┼──────────────────────┐
        │                 │                      │
   serve o frontend   proxy reverso        /system/* → sysinfo
   + services.json   para os serviços       (telemetria do dashboard)
   + logos/
        │
   rotas → localhost:PORT
        ├─ /jellyfin/   → Jellyfin     :8096
        ├─ /codeserver/ → Code-Server  :8080
        ├─ /ai/         → OpenCode     :4096
        └─ /files/      → Filebrowser  :8083
```

Componentes internos (somente em `127.0.0.1`, nunca expostos pelo Caddy):

| Componente   | Porta | Função                                          |
| ------------ | ----- | ----------------------------------------------- |
| `sysinfo.py` | 8890  | Status do sistema: bateria, CPU, armazenamento, relatório |
| `manager.py` | 8891  | CRUD de serviços, gera bloco do Caddyfile, recarrega o Caddy |
| Filebrowser  | 8083  | Gerenciador de arquivos (rota `/files`)          |

## Frontends (monorepo React + TypeScript)

Tudo em `web/` (npm workspaces). Os dois apps compartilham a biblioteca `@server/ui`
(API client, tema, toasts, ícones, hook de economia) com os mesmos estilos.

```
web/
├── packages/ui/          # biblioteca compartilhada (TS puro, sem build próprio)
└── apps/
    ├── dashboard/        # painel de monitoramento (bateria, CPU, disco,
    │                     # ecossistema, relatório, dock) → dashboard/dist
    └── manager/          # CRUD dos serviços, manutenção e desativar rotas
                          # → manager/dist
```

Comandos (na raiz de `web/`):

```bash
npm install        # uma vez
npm run typecheck  # typecheck dos 3 workspaces
npm run build      # gera dashboard/dist e manager/dist (deploy automático)
npm run dev        # dev server (usar com o Caddy como proxy, se quiser)
```

O Caddyfile serve o build de `dashboard/dist`, com `handle` dedicados para
`/services.json`, `/logos/*` e `/assets/*` (estes ficam fora da região gerenciada e
não são tocados pelo manager).

## Relatório com descoberta automática

O `sysinfo.py` monta o relatório com:

1. os serviços configurados em `dashboard/services.json`;
2. componentes de infra (Caddy e Sysinfo);
3. **descoberta automática** de outros listeners TCP (`/proc/net/tcp`), ex.: o Manager.

Entrada descoberta recebe `"discovered": true` no JSON e aparece marcada no dashboard.

## Gerenciador de serviços (`manager.py`)

Roda só em `127.0.0.1:8891` (sem rota no Caddy). Endpoints:

| Método | Rota                  | Ação                                        |
| ------ | --------------------- | ------------------------------------------- |
| GET    | `/api/services`       | Lista os serviços                           |
| POST   | `/api/services`       | Cria serviço (multipart, com ícone opcional)|
| PUT    | `/api/services/<i>`   | Atualiza                                     |
| PATCH  | `/api/services/<i>`   | `{"maintenance": bool}` e/ou `{"enabled": bool}` |
| DELETE | `/api/services/<i>`   | Remove (só gerenciados)                      |
| GET    | `/api/presets`        | Presets de ícone                             |
| GET    | `/api/check`          | Status HTTP de cada rota                     |
| POST   | `/api/reload`         | Recarrega o Caddy                            |

Cada serviço pode estar em **manutenção** (Caddy responde 503) ou **desativado**
(a rota some do Caddyfile e vira 404).

## Operação

```bash
./scripts/start.sh   # sobe sysinfo + manager + filebrowser + caddy
```

Logs em `logs/`. A senha do filebrowser fica em `/home/lumiko/filebrowser/admin_password`
(perm 600, fora do repositório).

## Segurança

- `manager` e **filebrowser** escutam apenas em `127.0.0.1`; o acesso acontece via
  rota do Caddy (`/files`) e o manager não tem rota pública.
- Nenhum segredo é versionado: `.gitignore` cobre bancos, senhas, logs, estado em
  runtime e `services.json`.