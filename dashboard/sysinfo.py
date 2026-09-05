#!/usr/bin/env python3
"""Tiny system-info daemon for the dashboard (stdlib only).

Serves on 127.0.0.1:8890:
  GET /system/status — battery, cpu, storage, uptime, battery history
  GET /system/report — per-service report: running, pids, cpu %, mem, http check
"""
import atexit
import json
import os
import shutil
import socket
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8890
HERE = os.path.dirname(os.path.abspath(__file__))
HIST_FILE = os.path.join(HERE, "battery_history.json")
LOG_FILE = os.path.normpath(os.path.join(HERE, "..", "logs", "events.log"))
MAX_LOG_BYTES = 200_000
SAMPLE_FILE = os.path.join(HERE, "samples.jsonl")
SAMPLE_MAX = 2880  # ~24h a cada 30s
HIST_MAX = 480
SAMPLE_EVERY = 30

PSU = "/sys/class/power_supply"


def read(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return None


def num(path):
    v = read(path)
    try:
        return int(v) if v is not None else None
    except ValueError:
        return None


def battery():
    base = None
    for name in ("battery", "bms"):
        p = os.path.join(PSU, name)
        if os.path.isdir(p):
            base = p
            break
    if not base:
        return {"pct": None, "status": "unknown", "charging": False}
    pct = num(os.path.join(base, "capacity"))
    status = read(os.path.join(base, "status")) or "unknown"
    ac = num(os.path.join(PSU, "ac", "online")) or 0
    usb = num(os.path.join(PSU, "usb", "online")) or 0
    charging = status.lower() in ("charging", "full") or bool(ac or usb)
    v = num(os.path.join(base, "voltage_now"))
    c = num(os.path.join(base, "current_now"))
    t = num(os.path.join(base, "temp"))
    if t is not None and t >= 100:  # tenths of Celsius (e.g. 320 -> 32.0)
        t = round(t / 10.0, 1)
    power = None
    if v is not None and c is not None:
        power = round(abs(v / 1e6) * abs(c / 1e6), 2)
    return {
        "pct": pct,
        "status": status,
        "charging": charging,
        "voltage_v": round(v / 1e6, 2) if v is not None else None,
        "current_ma": round(abs(c) / 1000.0, 0) if c is not None else None,
        "power_w": power,
        "temp_c": t,
        "health": read(os.path.join(base, "health")),
        "tech": read(os.path.join(base, "technology")),
    }


def storage():
    out, seen = [], set()
    for mount in ("/", "/data", "/home"):
        if not os.path.isdir(mount):
            continue
        try:
            st = os.stat(mount)
        except OSError:
            continue
        if st.st_dev in seen:
            continue
        seen.add(st.st_dev)
        try:
            u = shutil.disk_usage(mount)
        except OSError:
            continue
        pct = round(u.used / u.total * 100, 1) if u.total else 0
        out.append({
            "mount": mount,
            "total_gb": round(u.total / 1e9, 1),
            "used_gb": round(u.used / 1e9, 1),
            "free_gb": round(u.free / 1e9, 1),
            "pct": pct,
        })
    return out


def uptime_s():
    try:
        with open("/proc/uptime") as f:
            return int(float(f.read().split()[0]))
    except OSError:
        return None


CPU_HIST_MAX = 120
_cpu_prev = None
_cpu_hist = []


def cpu():
    """CPU usage % from /proc/stat delta + loadavg (in-memory history)."""
    global _cpu_prev, _cpu_hist
    pct = None
    try:
        with open("/proc/stat") as f:
            parts = f.readline().split()[1:]
        vals = [int(x) for x in parts]
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
        total = sum(vals)
        if _cpu_prev is not None:
            dt = total - _cpu_prev[0]
            di = idle - _cpu_prev[1]
            if dt > 0:
                pct = round((1 - di / dt) * 100, 1)
        _cpu_prev = (total, idle)
    except (OSError, ValueError, IndexError):
        pass
    try:
        load1, load5, load15 = os.getloadavg()
    except OSError:
        load1 = load5 = load15 = None
    now = int(time.time())
    if pct is not None:
        _cpu_hist.append([now, pct])
        del _cpu_hist[:-CPU_HIST_MAX]
    return {
        "pct": pct,
        "cores": os.cpu_count(),
        "load1": round(load1, 2) if load1 is not None else None,
        "load5": round(load5, 2) if load5 is not None else None,
        "load15": round(load15, 2) if load15 is not None else None,
        "history": list(_cpu_hist),
    }


try:
    HERTZ = os.sysconf("SC_CLK_TCK")
except (AttributeError, ValueError, OSError):
    HERTZ = 100

SKIP_COMM = {"bash", "sh", "dash", "grep", "pkill", "pgrep"}
_proc_prev = {}  # pid -> (proc_jiffies, total_jiffies)


def mem_info():
    total = avail = None
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    total = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    avail = int(line.split()[1])
    except OSError:
        pass
    return total, avail


def proc_snapshot():
    """{pid: {comm, cmd, jiff, start, rss_kb}} for all processes."""
    out = {}
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(os.path.join("/proc", pid, "stat")) as f:
                data = f.read()
            l, r = data.find("("), data.rfind(")")
            comm = data[l + 1:r]
            rest = data[r + 2:].split()
            jiff = int(rest[11]) + int(rest[12])
            start = int(rest[19])
        except (OSError, ValueError, IndexError):
            continue
        try:
            with open(os.path.join("/proc", pid, "cmdline"), "rb") as f:
                cmd = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
        except OSError:
            cmd = ""
        rss = None
        try:
            with open(os.path.join("/proc", pid, "status")) as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        rss = int(line.split()[1])
                        break
        except (OSError, ValueError):
            pass
        out[int(pid)] = {"comm": comm, "cmd": cmd, "jiff": jiff, "start": start, "rss": rss}
    return out


def total_jiffies():
    try:
        with open("/proc/stat") as f:
            return sum(int(x) for x in f.readline().split()[1:])
    except (OSError, ValueError):
        return 0


def match_pids(snap, pattern):
    """Match by comm name or by executable/arg basename (ignores .sh wrappers)."""
    res = []
    for pid, p in snap.items():
        if p["comm"] in SKIP_COMM:
            continue
        if pattern == p["comm"]:
            res.append(pid)
            continue
        for tok in p["cmd"].split(" "):
            base = tok.rsplit("/", 1)[-1]
            if base == pattern and not base.endswith(".sh"):
                res.append(pid)
                break
    return res


def load_services():
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "services.json")) as f:
            return json.load(f).get("services", [])
    except (OSError, ValueError):
        return []


def http_ok(route):
    try:
        req = urllib.request.Request("http://127.0.0.1:8888" + route, method="GET")
        with urllib.request.urlopen(req, timeout=4) as r:
            return 200 <= r.status < 500
    except Exception:
        return False


DISCOVER_SKIP = {2019}  # admin API do próprio Caddy (mesmo processo da porta 8888)


def discover_listeners():
    """TCP listeners (estado LISTEN) de /proc/net/tcp(+6) com o pid dono,
    resolvido pelo inode do socket nos fds de cada processo."""
    # inode -> pid
    inodes = {}
    for ent in os.listdir("/proc"):
        if not ent.isdigit():
            continue
        fdp = os.path.join("/proc", ent, "fd")
        try:
            fds = os.listdir(fdp)
        except OSError:
            continue
        for fd in fds:
            try:
                link = os.readlink(os.path.join(fdp, fd))
            except OSError:
                continue
            if link.startswith("socket:["):
                inodes[link[8:-1]] = int(ent)

    listeners = {}
    for netf in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            with open(netf) as f:
                for line in f.readlines()[1:]:
                    parts = line.split()
                    if len(parts) < 10 or parts[3] != "0A":
                        continue
                    port = int(parts[1].split(":")[1], 16)
                    if port == 0:
                        continue
                    pid = inodes.get(parts[9])
                    if pid:
                        listeners.setdefault(port, pid)
        except OSError:
            continue

    out = []
    for port in sorted(listeners):
        pid = int(listeners[port])
        spid = str(pid)
        comm = "?"
        cmd = ""
        try:
            with open(os.path.join("/proc", spid, "comm")) as f:
                comm = f.read().strip().replace("\x00", "")
            with open(os.path.join("/proc", spid, "cmdline"), "rb") as f:
                cmd = f.read().decode("utf-8", "replace").replace("\x00", " ")
        except OSError:
            pass
        base = comm
        for tok in cmd.split(" "):
            tok = tok.rstrip("/")
            if not tok or "/" not in tok:
                continue
            b = tok.rsplit("/", 1)[-1]
            if b and not b.endswith(".sh"):
                base = b
                break
        out.append({"pid": pid, "port": port, "comm": comm, "cmd": cmd, "base": base})
    return out


def _display_name(base):
    return base.replace(".py", "").replace("-", " ").replace("_", " ").strip().title()


def service_report():
    snap = proc_snapshot()
    total = total_jiffies()
    upt = uptime_s() or 0
    mem_total, mem_avail = mem_info()
    now = int(time.time())
    entries = load_services() + [
        {"name": "Caddy", "route": "/", "process": "caddy", "port": 8888, "infra": True},
        {"name": "Sysinfo", "route": "/system/status", "process": "sysinfo.py", "port": 8890, "infra": True},
    ]
    known_ports = {int(s["port"]) for s in entries if s.get("port")}
    for lst in discover_listeners():
        if lst["port"] in known_ports or lst["port"] in DISCOVER_SKIP:
            continue
        entries.append({
            "name": _display_name(lst["base"]),
            "route": None,
            "port": lst["port"],
            "process": lst["base"],
            "infra": False,
            "discovered": True,
            "exact_pids": [lst["pid"]],
            "cmd": lst["cmd"],
        })
    out = []
    for s in entries:
        pat = s.get("process", "")
        raw_pids = s.get("exact_pids") or (match_pids(snap, pat) if pat else [])
        pids = [p for p in raw_pids if p in snap]
        cpu_sum, mem_kb, oldest = 0.0, 0, None
        cpu_known = False
        for pid in pids:
            p = snap[pid]
            if p["rss"]:
                mem_kb += p["rss"]
            if oldest is None or p["start"] < oldest:
                oldest = p["start"]
            key = (pat, pid)
            prev = _proc_prev.get(key)
            if prev and total > prev[1]:
                cpu_sum += max(0.0, (p["jiff"] - prev[0]) / (total - prev[1]) * 100)
                cpu_known = True
            else:
                age = upt - p["start"] / HERTZ
                if age > 0:
                    cpu_sum += max(0.0, (p["jiff"] / HERTZ) / age * 100)
                    cpu_known = True
            _proc_prev[key] = (p["jiff"], total)
        mem_mb = round(mem_kb / 1024, 1)
        ok = http_ok(s["route"]) if s.get("route") else None
        out.append({
            "name": s.get("name"),
            "route": s.get("route"),
            "port": s.get("port"),
            "infra": bool(s.get("infra", False)),
            "discovered": bool(s.get("discovered", False)),
            "running": bool(pids) or bool(ok),
            "procs": len(pids),
            "pids": sorted(pids),
            "cpu_pct": round(cpu_sum, 1) if cpu_known else None,
            "mem_mb": mem_mb,
            "mem_pct": round(mem_kb / mem_total * 100, 1) if mem_total else None,
            "http_ok": ok,
            "uptime_s": int(max(0, upt - oldest / HERTZ)) if oldest is not None else None,
        })
    return {
        "ts": now,
        "host": socket.gethostname(),
        "battery": battery(),
        "memory": {
            "total_mb": round(mem_total / 1024, 1) if mem_total else None,
            "avail_mb": round(mem_avail / 1024, 1) if mem_avail else None,
        },
        "services": out,
        "disks": storage(),
        "events": read_events(30),
    }


def log_event(msg):
    """Append timestamped line to the general server log (with rotation)."""
    try:
        if os.path.exists(LOG_FILE) and os.path.getsize(LOG_FILE) > MAX_LOG_BYTES:
            try:
                os.replace(LOG_FILE, LOG_FILE + ".1")
            except OSError:
                pass
        with open(LOG_FILE, "a") as f:
            f.write(time.strftime("%Y-%m-%dT%H:%M:%S") + " " + msg + "\n")
    except OSError:
        pass


def read_events(n=30):
    try:
        with open(LOG_FILE) as f:
            return f.read().splitlines()[-n:]
    except OSError:
        return []


def append_sample(rep):
    """Persist periodic snapshot: battery + per-process cpu/mem (for graphs/log)."""
    b = rep.get("battery") or {}
    procs = {}
    for s in rep.get("services", []):
        procs[s["name"]] = {
            "cpu": s["cpu_pct"], "mem": s["mem_mb"],
            "pids": s["pids"], "running": s["running"],
        }
    line = json.dumps({
        "ts": rep["ts"],
        "batt": {k: b.get(k) for k in ("pct", "status", "charging", "temp_c", "voltage_v")},
        "procs": procs,
    }) + "\n"
    append_sample.count = getattr(append_sample, "count", 0) + 1
    try:
        with open(SAMPLE_FILE, "a") as f:
            f.write(line)
        if append_sample.count % 20 == 0:  # trim ocasional (~10min)
            with open(SAMPLE_FILE) as f:
                lines = f.read().splitlines()
            if len(lines) > SAMPLE_MAX + 200:
                with open(SAMPLE_FILE, "w") as f:
                    f.write("\n".join(lines[-SAMPLE_MAX:]) + "\n")
    except OSError:
        pass


def read_samples(limit=200):
    try:
        with open(SAMPLE_FILE) as f:
            lines = f.read().splitlines()[-min(max(limit, 1), 1000):]
        out = []
        for ln in lines:
            try:
                out.append(json.loads(ln))
            except ValueError:
                pass
        return out
    except OSError:
        return []


def monitor():
    """Background watchdog: logs service transitions, battery and disk events."""
    prev, prev_batt, prev_disk = {}, None, {}
    last_sample = 0
    while True:
        time.sleep(15)
        try:
            rep = service_report()
        except Exception as e:
            log_event("monitor erro: %s" % e)
            continue
        if rep["ts"] - last_sample >= SAMPLE_EVERY:
            append_sample(rep)
            last_sample = rep["ts"]
        for s in rep["services"]:
            cur = (bool(s["running"]), bool(s["http_ok"]))
            if s["name"] in prev and prev[s["name"]] != cur:
                state = "online" if cur == (True, True) else ("offline" if cur == (False, False) else "degraded")
                log_event("%s -> %s (running=%s http=%s cpu=%s mem=%sMB)" % (
                    s["name"], state, s["running"], s["http_ok"], s["cpu_pct"], s["mem_mb"]))
            prev[s["name"]] = cur
        b = rep.get("battery") or {}
        if prev_batt is not None:
            if b.get("status") != prev_batt.get("status"):
                log_event("bateria: %s -> %s (%s%%)" % (prev_batt.get("status"), b.get("status"), b.get("pct")))
            if b.get("pct") is not None and b["pct"] <= 20 and (prev_batt.get("pct") or 100) > 20:
                log_event("bateria baixa: %s%%" % b["pct"])
        prev_batt = {"status": b.get("status"), "pct": b.get("pct")}
        for d in rep.get("disks", []):
            m = d["mount"]
            if m in prev_disk and prev_disk[m] != d["pct"] and d["pct"] >= 90:
                log_event("disco %s em %s%% (usado %s/%s GB)" % (m, d["pct"], d["used_gb"], d["total_gb"]))
            prev_disk[m] = d["pct"]


def load_hist():
    try:
        with open(HIST_FILE) as f:
            h = json.load(f)
            return h if isinstance(h, list) else []
    except (OSError, ValueError):
        return []


def save_hist(h):
    try:
        with open(HIST_FILE, "w") as f:
            json.dump(h[-HIST_MAX:], f)
    except OSError:
        pass


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/system/report", "/report"):
            self.send_json(service_report())
            return
        if self.path.startswith("/system/samples") or self.path.startswith("/samples"):
            limit = 200
            if "limit=" in self.path:
                try:
                    limit = int(self.path.split("limit=")[1].split("&")[0])
                except ValueError:
                    pass
            self.send_json({"samples": read_samples(limit)})
            return
        if self.path not in ("/system/status", "/status"):
            self.send_response(404)
            self.end_headers()
            return
        b = battery()
        h = load_hist()
        now = int(time.time())
        if b["pct"] is not None and (not h or now - h[-1][0] >= SAMPLE_EVERY):
            h.append([now, b["pct"]])
            save_hist(h)
        self.send_json({
            "battery": b,
            "cpu": cpu(),
            "storage": storage(),
            "uptime_s": uptime_s(),
            "history": h[-HIST_MAX:],
            "ts": now,
        })


if __name__ == "__main__":
    log_event("sysinfo iniciado (porta %d)" % PORT)
    atexit.register(lambda: log_event("sysinfo parado"))
    threading.Thread(target=monitor, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
