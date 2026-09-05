#!/usr/bin/env python3
"""Caddy service manager (local only).

Listens on 127.0.0.1:8891 (NOT exposed through Caddy).
Manages the dock icons (dashboard/services.json) and the reverse-proxy
rules in the Caddyfile (the block between the "gerenciado" markers),
then reloads Caddy via its admin API.

Endpoints:
  GET  /                  — admin UI (index.html)
  GET  /api/services      — list services
  POST /api/services      — add service (multipart/form-data)
  PUT  /api/services/<i>  — update service <i>
  DELETE /api/services/<i> — delete service <i>
  GET  /api/presets       — list available preset icons
  POST /api/reload        — reload Caddy config
"""
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8891
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.normpath(os.path.join(HERE, ".."))
CFG = os.path.join(BASE, "Caddyfile")
SVCS = os.path.join(BASE, "dashboard", "services.json")
DASH_CFG = os.path.join(BASE, "dashboard", "dashboard-config.json")
LOGOS = os.path.join(BASE, "dashboard", "logos")
INDEX = os.path.join(HERE, "index.html")
DIST = os.path.join(HERE, "dist")

MANAGED_START = "# >>> gerenciado pelo caddy-manager :: não edite manualmente"
MANAGED_END = "# <<< fim gerenciado"

MAX_UPLOAD = 2 * 1024 * 1024  # 2 MB
ALLOWED_EXT = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}

_LOCK = threading.Lock()


def slugify(name):
    s = re.sub(r"[\s_]+", "-", name.strip().lower())
    s = re.sub(r"[^a-z0-9.-]", "", s)
    return s or "servico"


# ---------------- persistence ----------------

def load_services():
    try:
        with open(SVCS) as f:
            data = json.load(f)
        return list(data.get("services", []))
    except (OSError, ValueError):
        return []


def save_services(services):
    tmp = SVCS + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"services": services}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, SVCS)


# ---------------- dashboard config ----------------

SHOW_KEYS = ("battery", "cpu", "storage", "report", "dock", "todo")


def default_config():
    return {
        "theme": "dark",
        "accent": "#00a4dc",
        "show": {k: True for k in SHOW_KEYS},
        "widgets": [],
    }


def normalize_config(cfg):
    if not isinstance(cfg, dict):
        raise ValueError("configuração inválida")
    theme = cfg.get("theme")
    accent = str(cfg.get("accent") or "")
    show = cfg.get("show") if isinstance(cfg.get("show"), dict) else {}
    out = {
        "theme": theme if theme in ("dark", "light") else "dark",
        "accent": accent if re.fullmatch(r"#[0-9a-fA-F]{6}", accent) else "#00a4dc",
        "show": {k: bool(show.get(k, True)) for k in SHOW_KEYS},
        "widgets": [],
    }
    widgets = []
    for w in (cfg.get("widgets") or []):
        if not isinstance(w, dict) or w.get("type") != "todo":
            continue
        items = []
        for it in (w.get("items") or []):
            if not isinstance(it, dict):
                continue
            items.append({
                "id": str(it.get("id") or ("i%d" % (len(items) + 1))),
                "text": str(it.get("text") or "")[:200],
                "done": bool(it.get("done")),
            })
        wid = str(w.get("id") or "")
        if not wid:
            wid = "todo-%d" % (len(widgets) + 1 + int(time.time()) % 1000)
        widgets.append({
            "id": wid,
            "type": "todo",
            "title": str(w.get("title") or "Tarefas")[:60],
            "show": bool(w.get("show", True)),
            "items": items,
        })
    out["widgets"] = widgets
    return out


def load_config():
    try:
        with open(DASH_CFG) as f:
            return normalize_config(json.load(f))
    except (OSError, ValueError):
        return default_config()


def save_config(cfg):
    tmp = DASH_CFG + ".tmp"
    with open(tmp, "w") as f:
        json.dump(normalize_config(cfg), f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, DASH_CFG)


def read_caddyfile():
    try:
        with open(CFG) as f:
            return f.read()
    except OSError:
        return ""


def unmanaged_routes(cfg):
    """Routes defined OUTSIDE the managed markers (hand-written / legacy)."""
    start = cfg.find(MANAGED_START)
    end = cfg.find(MANAGED_END)
    cleaned = cfg
    if start != -1 and end != -1 and end > start + len(MANAGED_START):
        cleaned = cfg[:start] + cfg[end + len(MANAGED_END):]
    return _routes_in(cleaned) | _redir_routes(cleaned)


def _routes_in(text):
    out = set()
    for m in re.finditer(r"handle_path\s+(\S+?)\s*\{", text):
        out.add(m.group(1))
    for m in re.finditer(r"handle\s+([^\s{]+)\s*\{", text):
        out.add(m.group(1))
    return {r[:-2] if r.endswith("/*") else r for r in out}


def _redir_routes(text):
    return {m.group(1) for m in re.finditer(r"redir\s+(\S+)\s+", text)}


def _fill(template, route, port):
    return (template.replace("{{route}}", route.rstrip("/"))
                    .replace("{{port}}", str(port)))


MAINT_HTML = ('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
              '<meta name="viewport" content="width=device-width,initial-scale=1">'
              '<title>__NAME__ · Em manutenção</title>'
              '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;'
              'justify-content:center;background:#0a0a0f;color:#e0e0e0;'
              'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
              'text-align:center}h1{font-size:1.4rem;margin:.8rem 0 .3rem;color:#fff}'
              'p{color:#888;font-size:.9rem}</style></head>'
              '<body><div style="padding:2rem"><div style="font-size:3rem">&#128736;</div>'
              '<h1>__NAME__</h1><p>Em manutenção — voltamos em breve.</p></div></body></html>')


def _maintenance_respond(name):
    html = MAINT_HTML.replace("__NAME__", (name or "Serviço")).replace("`", "'")
    return "respond `%s` 503" % html


def _maintenance_blocks(route, name):
    return [
        "\thandle_path %s/* {" % route,
        "\t\t" + _maintenance_respond(name),
        "\t}",
        "",
        "\tredir %s %s/" % (route, route),
        "",
    ]


def _maintenance_extra(blk, name):
    m = re.match(r"^\s*(handle\S*)\s+(\S+)\s*\{", blk)
    if not m:
        return []
    return [
        "\t%s %s {" % (m.group(1), m.group(2)),
        "\t\t" + _maintenance_respond(name),
        "\t}",
        "",
    ]


def build_managed_block(services):
    lines = []
    for s in services:
        if not s.get("managed", True):
            continue
        if s.get("enabled", True) is False:
            continue
        route = str(s.get("route", "")).rstrip("/")
        if not route.strip("/"):
            continue
        try:
            port = int(s.get("port"))
        except (TypeError, ValueError):
            continue
        if s.get("maintenance"):
            lines += _maintenance_blocks(route, s.get("name")) + \
                [ln for blk in (s.get("extra_handles") or [])
                 for ln in _maintenance_extra(blk, s.get("name"))]
            continue
        extra_headers = s.get("extra_headers") or []
        lines.append("\thandle_path %s/* {" % route)
        if extra_headers:
            lines += ["\t\treverse_proxy localhost:%d {" % port]
            for h in extra_headers:
                lines.append("\t\t\t" + _fill(h, route, port))
            lines.append("\t\t}")
        else:
            lines.append("\t\treverse_proxy localhost:%d" % port)
        lines += ["\t}", "", "\tredir %s %s/" % (route, route)]
        for blk in s.get("extra_handles") or []:
            for ln in _fill(blk, route, port).strip("\n").split("\n"):
                lines.append("\t" + ln if ln else "")
            lines.append("")
    block = "\t" + MANAGED_START + "\n" + "\n".join(lines) + "\t" + MANAGED_END + "\n"
    return block


def update_caddyfile(services):
    cfg = read_caddyfile()
    if not cfg:
        raise RuntimeError("Caddyfile não encontrado: %s" % CFG)
    block = build_managed_block(services)
    if MANAGED_START in cfg and MANAGED_END in cfg:
        start = cfg.rfind("\n", 0, cfg.index(MANAGED_START)) + 1
        end = cfg.index(MANAGED_END)
        nxt = cfg.find("\n", end)
        nxt = len(cfg) if nxt == -1 else nxt + 1
        new_cfg = cfg[:start] + block + cfg[nxt:]
    else:
        lines = cfg.splitlines(keepends=True)
        anchor = next((i for i, l in enumerate(lines)
                       if l.lstrip().startswith("root *")), None)
        if anchor is None:
            raise RuntimeError("Não achei a linha `root *` no Caddyfile para inserir os blocos gerenciados.")
        if not lines[anchor].startswith("\t") and not lines[anchor].startswith(" "):
            block = block.lstrip("\t")
        lines.insert(anchor, block)
        new_cfg = "".join(lines)
    tmp = CFG + ".tmp"
    with open(tmp, "w") as f:
        f.write(new_cfg)
    os.replace(tmp, CFG)
    return new_cfg


def reload_caddy():
    try:
        r = subprocess.run(
            ["caddy", "reload", "--config", CFG, "--adapter", "caddyfile"],
            capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        return False, "binário `caddy` não encontrado no PATH"
    except subprocess.TimeoutExpired:
        return False, "tempo esgotado ao recarregar o Caddy"
    if r.returncode == 0:
        return True, "Caddy recarregado com sucesso"
    return False, (r.stderr or r.stdout).strip()


def http_ok(route):
    try:
        req = urllib.request.Request("http://127.0.0.1:8888" + route, method="GET")
        with urllib.request.urlopen(req, timeout=4) as resp:
            return 200 <= resp.status < 500
    except Exception:
        return False


# ---------------- icons ----------------

def safe_svg(content):
    """Minimal SVG sanitization: block scripts and dangerous attributes."""
    text = content.decode("utf-8", errors="replace")
    lower = text.lower()
    if "<script" in lower or "onload=" in lower or "javascript:" in lower:
        raise ValueError("SVG contém script e foi recusado por segurança")
    text = re.sub(r"<script.*?</script>", "", text, flags=re.S | re.I)
    text = re.sub(r"\son[a-z]+\s*=\s*\"[^\"]*\"", "", text, flags=re.I)
    text = re.sub(r"\son[a-z]+\s*=\s*'[^']*'", "", text, flags=re.I)
    if "<svg" in lower and "viewbox" not in lower:
        text = re.sub(r"(<svg[^>]*?)(>)", r'\1 viewBox="0 0 512 512"\2', text, count=1,
                      flags=re.I)
    return text.encode("utf-8")


def looks_like_image(data, ext):
    if ext == ".svg":
        return b"<svg" in data[:512].lower()
    magic = {
        ".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff",
        ".webp": b"RIFF", ".gif": b"GIF8",
    }
    if ext not in magic:
        return True  # .avif etc: deixar o navegador decidir
    return data[:8].startswith(magic[ext])


def save_icon(mode, name, fields, files, old_logo=None):
    if mode == "codigo":
        mode = "code"
    slug = slugify(name)
    logo = old_logo
    if mode == "preset":
        preset = re.sub(r"[^a-zA-Z0-9_.-]", "", (fields.get("icon_preset") or ""))
        if not preset or not os.path.isfile(os.path.join(LOGOS, "presets", preset)):
            raise ValueError("preset de ícone inválido")
        logo = "logos/presets/" + preset
    elif mode in ("upload", "url", "code"):
        if mode == "upload":
            f = files.get("icon_file")
            if not f:
                raise ValueError("nenhum arquivo de ícone enviado")
            data = f.getvalue()
            ext = os.path.splitext(f.name or "")[1].lower()
            ext_msg = ext or "desconhecido"
            if ext not in ALLOWED_EXT:
                raise ValueError("formato não suportado (%s); use SVG, PNG, JPG, WebP ou GIF" % ext_msg)
            if len(data) > MAX_UPLOAD:
                raise ValueError("arquivo grande demais (> 2 MB)")
            if ext == ".svg":
                data = safe_svg(data)
            elif not looks_like_image(data, ext):
                raise ValueError("o arquivo não parece ser uma imagem %s" % ext_msg)
        elif mode == "url":
            url = (fields.get("icon_url") or "").strip()
            if not url.lower().startswith(("http://", "https://")):
                raise ValueError("URL de ícone inválida")
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "caddy-manager"})
                with urllib.request.urlopen(req, timeout=15) as r:
                    data = r.read(MAX_UPLOAD + 1)
            except Exception as e:
                raise ValueError("falha ao baixar o ícone: %s" % e)
            if len(data) > MAX_UPLOAD:
                raise ValueError("ícone baixado é grande demais (> 2 MB)")
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].lower()
            ext = {".svg": ".svg", "image/png": ".png", "image/jpeg": ".jpg",
                   "image/webp": ".webp", "image/gif": ".gif"}.get(ctype)
            if ext is None:
                ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
            if ext not in ALLOWED_EXT:
                ext = ".png"
            if ext == ".svg":
                data = safe_svg(data)
            elif not looks_like_image(data, ext):
                raise ValueError("o conteúdo baixado não parece uma imagem")
        else:  # code
            code = (fields.get("icon_code") or "").strip()
            if "<svg" not in code.lower():
                raise ValueError("código SVG inválido")
            data = safe_svg(code.encode("utf-8"))
            ext = ".svg"

        n = slug + "-" + uuid.uuid4().hex[:6] + ext
        path = os.path.join(LOGOS, n)
        with open(path, "wb") as fh:
            fh.write(data)
        logo = "logos/" + n
        _cleanup_logo(old_logo)
    return logo


def _cleanup_logo(logo):
    if not logo or not logo.startswith("logos/"):
        return
    if logo.startswith("logos/presets/"):
        return
    path = os.path.join(LOGOS, logo[len("logos/"):])
    name = os.path.basename(path)
    services = load_services()
    if any((s.get("logo") or "") == logo for s in services):
        return
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


# ---------------- validation ----------------

def normalize_route(route):
    route = (route or "").strip()
    if not route.startswith("/"):
        route = "/" + route
    if " " in route:
        raise ValueError("a rota não pode conter espaços")
    if any(c in route for c in "*{}'\"`$"):
        raise ValueError("a rota contém caracteres inválidos")
    if len(route) <= 1:
        raise ValueError("rota inválida (não pode ser a raiz)")
    if not route.endswith("/"):
        route += "/"
    return route


_EXTRA_RE = re.compile(r"^\s*(?:handle|handle_path|route)\s+(\S+)")


def extra_handle_routes(services, skip_idx=None):
    """Bases extra route -> owner name, from each service's extra_handles."""
    out = {}
    for i, s in enumerate(services):
        if i == skip_idx:
            continue
        for blk in s.get("extra_handles") or []:
            m = _EXTRA_RE.search(blk)
            if m:
                out[m.group(1).rstrip("/*")] = s.get("name") or str(i)
    return out


def check_conflicts(services, idx=None, route=None, name=None):
    if name:
        for i, s in enumerate(services):
            if i == idx:
                continue
            if s.get("name", "").strip().lower() == name.strip().lower():
                raise ValueError("já existe um serviço com o nome %r" % name.strip())
    if route:
        wanted = route.rstrip("/")
        mine = None
        if idx is not None and 0 <= idx < len(services):
            mine = services[idx].get("route", "").rstrip("/")
        for i, s in enumerate(services):
            if i == idx:
                continue
            if s.get("route", "").rstrip("/") == wanted:
                raise ValueError("a rota %s já está em uso por %s"
                                 % (route, s.get("name", i)))
        managed = {s.get("route", "").rstrip("/") for i, s in enumerate(services)
                   if i != idx and s.get("managed", True)}
        for r in unmanaged_routes(read_caddyfile()):
            r = r.rstrip("/")
            if r in managed or r == mine:
                continue
            if r == wanted:
                raise ValueError("a rota %s já é usada por uma regra manual do Caddyfile" % route)
        for base, owner in extra_handle_routes(services, idx).items():
            if base == wanted:
                raise ValueError("a rota %s conflita com uma rota extra de %s" % (route, owner))


def validate_port(port):
    try:
        p = int(port)
    except (TypeError, ValueError):
        raise ValueError("porta inválida")
    if not 1 <= p <= 65535:
        raise ValueError("a porta deve estar entre 1 e 65535")
    return p


def normalize_service(fields, files, existing=None, old_logo=None):
    name = (fields.get("name") or "").strip()
    if not name:
        raise ValueError("informe o nome do serviço")
    route = normalize_route(fields.get("route"))
    port = validate_port(fields.get("port"))
    desc = (fields.get("desc") or "").strip()
    mode = fields.get("icon_mode") or "preset"
    preset = fields.get("icon_preset") or "servico.svg"
    maintenance = fields.get("maintenance") in ("1", "true", "on", "yes")
    raw_en = fields.get("enabled")
    enabled = raw_en is None or raw_en in ("1", "true", "on", "yes")

    services = load_services()
    idx = None if existing is None else existing
    check_conflicts(services, idx=idx, route=route, name=name)

    old = services[idx] if idx is not None and 0 <= idx < len(services) else None
    if "enabled" not in fields and old is not None:
        enabled = bool(old.get("enabled", True))
    logo = save_icon(mode, name, fields, files, old_logo=old_logo)

    accent = fields.get("accent") or "auto"
    if accent == "auto":
        accent = _accent_for(port)
    accent_bg = "rgba(%d,%d,%d,0.12)" % _hex_rgb(accent)

    out = {
        "name": name,
        "route": route,
        "logo": logo,
        "desc": desc,
        "accent": accent,
        "accentBg": accent_bg,
        "process": fields.get("process") or slugify(name),
        "port": port,
        "managed": True,
        "maintenance": maintenance,
        "enabled": enabled,
    }
    if old is not None:
        for k in ("extra_headers", "extra_handles"):
            if old.get(k):
                out[k] = old[k]
    return out


def _accent_for(port):
    palette = ["#22c55e", "#00a4dc", "#a855f7", "#f59e0b", "#ef4444",
               "#06b6d4", "#ec4899", "#8b5cf6", "#84cc16", "#f97316"]
    return palette[port % len(palette)]


def _hex_rgb(hexcolor):
    m = re.match(r"#([0-9a-fA-F]{6})$", hexcolor)
    if not m:
        return (128, 128, 128)
    h = m.group(1)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# ---------------- multipart parsing ----------------

def parse_multipart(body, boundary, ctype):
    fields, files = {}, {}
    delim = b"--" + boundary
    for raw in body.split(delim):
        if not raw.strip() or raw.strip() == b"--":
            continue
        head, _, content = raw.partition(b"\r\n\r\n")
        head = head.decode("utf-8", errors="replace")
        if head.strip().endswith("--"):
            continue
        m = re.search(r'name="([^"]+)"', head)
        if not m:
            continue
        key = m.group(1)
        fm = re.search(r'filename="([^"]*)"', head)
        cdisp = re.search(r'Content-Type:\s*([^\r\n]+)', head, re.I)
        if fm:
            files[key] = _Upload(fm.group(1), cdisp.group(1).strip() if cdisp else "", content)
        else:
            fields[key] = content.decode("utf-8", errors="replace").strip()
    return fields, files


class _Upload:
    def __init__(self, name, ctype, data):
        self.name = name
        self.ctype = ctype
        self.data = data

    def getvalue(self):
        return self.data


# ---------------- HTTP ----------------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode())

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        if length > MAX_UPLOAD + (1 << 20):
            raise ValueError("requisição grande demais")
        return body

    def do_GET(self):
        try:
            path = self.path.split("?")[0]
            if path in ("/", "/index.html"):
                idx = os.path.join(DIST, "index.html")
                if os.path.isfile(idx):
                    with open(idx, "rb") as fh:
                        self._send(200, fh.read(), "text/html; charset=utf-8")
                    return
                try:
                    with open(INDEX, "rb") as f:
                        self._send(200, f.read(), "text/html; charset=utf-8")
                except OSError:
                    self._json(500, {"error": "index.html não encontrado"})
                return
            if path == "/api/services":
                self._json(200, {"services": load_services()})
                return
            if path == "/api/config":
                self._json(200, {"config": load_config()})
                return
            if path == "/api/presets":
                presets = sorted(os.listdir(os.path.join(LOGOS, "presets")))
                self._json(200, {"presets": presets})
                return
            if path == "/api/check":
                out = {}
                for s in load_services():
                    r = s.get("route")
                    if r:
                        out[r] = http_ok(r)
                self._json(200, out)
                return
            if path.startswith("/logos/"):
                rel = path[len("/logos/"):]
                fpath = os.path.normpath(os.path.join(LOGOS, rel))
                if not fpath.startswith(LOGOS + os.sep) or not os.path.isfile(fpath):
                    self._json(404, {"error": "não encontrado"})
                    return
                ctype = mimetypes.guess_type(fpath)[0] or "application/octet-stream"
                with open(fpath, "rb") as f:
                    self._send(200, f.read(), ctype)
                return
            if path.startswith("/assets/"):
                fpath = os.path.normpath(os.path.join(DIST, path.lstrip("/")))
                if not fpath.startswith(DIST + os.sep) or not os.path.isfile(fpath):
                    self._json(404, {"error": "não encontrado"})
                    return
                ctype = mimetypes.guess_type(fpath)[0] or "application/octet-stream"
                with open(fpath, "rb") as f:
                    self._send(200, f.read(), ctype)
                return
            if path == "/api/reload":
                ok, msg = reload_caddy()
                self._json(200, {"ok": ok, "message": msg})
                return
            self._json(404, {"error": "rota desconhecida"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/services":
            self._mutate(add=True)
            return
        if path == "/api/reload":
            ok, msg = reload_caddy()
            self._json(200, {"ok": ok, "message": msg})
            return
        self._json(404, {"error": "rota desconhecida"})

    def do_PUT(self):
        path = self.path.split("?")[0]
        if path == "/api/config":
            try:
                body = json.loads(self._read_body().decode("utf-8", "replace") or "{}")
            except ValueError:
                self._json(400, {"error": "JSON inválido"})
                return
            try:
                cfg = normalize_config(body)
            except ValueError as e:
                self._json(400, {"error": str(e)})
                return
            with _LOCK:
                save_config(cfg)
            self._json(200, {"ok": True, "message": "Configuração do dashboard salva", "config": cfg})
            return
        m = re.match(r"^/api/services/(\d+)$", path)
        if not m:
            self._json(404, {"error": "rota desconhecida"})
            return
        self._mutate(add=False, idx=int(m.group(1)))

    def do_DELETE(self):
        m = re.match(r"^/api/services/(\d+)$", self.path.split("?")[0])
        if not m:
            self._json(404, {"error": "rota desconhecida"})
            return
        idx = int(m.group(1))
        with _LOCK:
            services = load_services()
            if not 0 <= idx < len(services):
                self._json(404, {"error": "serviço não encontrado"})
                return
            svc = services[idx]
            if not svc.get("managed", True):
                self._json(400, {"error": "serviço %r foi configurado manualmente no Caddyfile; remova o bloco manual e depois apague aqui" % svc["name"]})
                return
            services.pop(idx)
            save_services(services)
            _cleanup_logo(svc.get("logo"))
            try:
                update_caddyfile(services)
            except Exception as e:
                self._json(500, {"error": "serviço removido mas Caddyfile falhou: %s" % e})
                return
            ok, msg = reload_caddy()
            self._json(200, {"ok": ok, "message": msg, "services": services})

    def do_PATCH(self):
        m = re.match(r"^/api/services/(\d+)$", self.path.split("?")[0])
        if not m:
            self._json(404, {"error": "rota desconhecida"})
            return
        idx = int(m.group(1))
        try:
            data = json.loads(self._read_body().decode("utf-8", "replace") or "{}")
        except ValueError:
            self._json(400, {"error": "JSON inválido"})
            return
        keys = [k for k in ("maintenance", "enabled") if k in data]
        if not keys:
            self._json(400, {"error": "campo 'maintenance' ou 'enabled' obrigatório"})
            return
        with _LOCK:
            services = load_services()
            if not 0 <= idx < len(services):
                self._json(404, {"error": "serviço não encontrado"})
                return
            for k in keys:
                services[idx][k] = bool(data.get(k))
            save_services(services)
            try:
                update_caddyfile(services)
            except Exception as e:
                self._json(500, {"error": "salvo, mas Caddyfile falhou: %s" % e})
                return
            ok, msg = reload_caddy()
            self._json(200, {"ok": ok, "message": msg,
                             "services": services})

    def _mutate(self, add, idx=0):
        try:
            self._mutate_inner(add, idx)
        except ValueError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _mutate_inner(self, add, idx=0):
        body = self._read_body()
        ctype = self.headers.get("Content-Type") or ""
        if "multipart/form-data" in ctype:
            boundary = ctype.split("boundary=")[-1].strip().strip('"')
            fields, files = parse_multipart(body, boundary.encode(), ctype)
        else:
            fields = {}
            for k, v in urllib.parse.parse_qsl(body.decode("utf-8", "replace")):
                fields[k] = v
            files = {}
        with _LOCK:
            services = load_services()
            if add:
                new = normalize_service(fields, files)
                services.append(new)
            else:
                if not 0 <= idx < len(services):
                    self._json(404, {"error": "serviço não encontrado"})
                    return
                old = services[idx]
                if not old.get("managed", True):
                    fields.setdefault("route", old.get("route"))
                    fields.setdefault("port", str(old.get("port")))
                new = normalize_service(fields, files, existing=idx, old_logo=old.get("logo"))
                if not old.get("managed", True):
                    new.pop("route", None)
                    new.pop("port", None)
                    new["route"] = old["route"]
                    new["port"] = old["port"]
                    new["managed"] = False
                services[idx] = new
            save_services(services)
            try:
                update_caddyfile(services)
            except Exception as e:
                self._json(500, {"error": "dados salvos, mas o Caddyfile falhou: %s" % e})
                return
            ok, msg = reload_caddy()
            self._json(200, {"ok": ok, "message": msg, "services": services})


def main():
    if not os.path.isfile(DASH_CFG):
        save_config(default_config())
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as e:
        print("erro: %s" % e, file=sys.stderr)
        raise
    print("caddy-manager em http://127.0.0.1:%d (local — fora do Caddy)" % PORT)
    srv.serve_forever()


if __name__ == "__main__":
    main()