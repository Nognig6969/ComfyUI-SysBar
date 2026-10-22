"""
ComfyUI-SysBar
Top-bar system monitor: CPU, RAM, GPU util, VRAM, GPU temp, disk usage + I/O,
version info. CPU temp is shown only if the OS exposes it (rare on Windows).
"""
import os
import platform
import shutil
import subprocess
import sys
import threading
import time

from aiohttp import web
from server import PromptServer

try:
    import psutil
except Exception:  # pragma: no cover
    psutil = None

try:
    import pynvml
except Exception:
    pynvml = None

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

_lock = threading.Lock()
_nvml_ok = False
_nvml_handles = []
_last_io = {"t": None, "r": 0, "w": 0}
_versions = None

if psutil:
    psutil.cpu_percent(interval=None)  # prime the counter


def _init_nvml():
    global _nvml_ok, _nvml_handles
    if pynvml is None:
        return
    try:
        pynvml.nvmlInit()
        n = pynvml.nvmlDeviceGetCount()
        _nvml_handles = [pynvml.nvmlDeviceGetHandleByIndex(i) for i in range(n)]
        _nvml_ok = n > 0
    except Exception as e:
        print(f"[SysBar] NVML unavailable ({e}); falling back to nvidia-smi")


_init_nvml()


def _decode(v):
    return v.decode() if isinstance(v, bytes) else v


def _gpus_nvml():
    out = []
    for i, h in enumerate(_nvml_handles):
        try:
            name = _decode(pynvml.nvmlDeviceGetName(h))
            util = pynvml.nvmlDeviceGetUtilizationRates(h).gpu
            mem = pynvml.nvmlDeviceGetMemoryInfo(h)
            try:
                temp = pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                temp = None
            out.append({"index": i, "name": name, "util": util,
                        "vram_used": mem.used, "vram_total": mem.total, "temp": temp})
        except Exception:
            pass
    return out


def _gpus_smi():
    exe = shutil.which("nvidia-smi")
    if not exe:
        return []
    try:
        flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
        r = subprocess.run(
            [exe, "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3, creationflags=flags)
        out = []
        for line in r.stdout.strip().splitlines():
            p = [x.strip() for x in line.split(",")]
            if len(p) < 6:
                continue
            def num(x):
                try:
                    return float(x)
                except ValueError:
                    return None
            out.append({"index": int(p[0]), "name": p[1], "util": num(p[2]),
                        "vram_used": (num(p[3]) or 0) * 1024 * 1024,
                        "vram_total": (num(p[4]) or 0) * 1024 * 1024,
                        "temp": num(p[5])})
        return out
    except Exception:
        return []


def _cpu_temp():
    if not psutil or not hasattr(psutil, "sensors_temperatures"):
        return None  # Windows: psutil has no temperature support
    try:
        temps = psutil.sensors_temperatures()
    except Exception:
        return None
    for key in ("coretemp", "k10temp", "zenpower", "cpu_thermal", "cpu-thermal"):
        if key in temps and temps[key]:
            vals = [t.current for t in temps[key] if t.current]
            if vals:
                return max(vals)
    return None


def _disk():
    try:
        import folder_paths
        path = folder_paths.get_output_directory()
    except Exception:
        path = os.path.abspath(os.sep)
    d = {"path": os.path.splitdrive(os.path.abspath(path))[0] or "/",
         "used": 0, "total": 0, "read": 0.0, "write": 0.0}
    try:
        u = psutil.disk_usage(path)
        d["used"], d["total"] = u.used, u.total
    except Exception:
        pass
    try:
        io = psutil.disk_io_counters()
        now = time.time()
        with _lock:
            if _last_io["t"] is not None and io:
                dt = max(now - _last_io["t"], 1e-3)
                d["read"] = max(io.read_bytes - _last_io["r"], 0) / dt
                d["write"] = max(io.write_bytes - _last_io["w"], 0) / dt
            if io:
                _last_io.update(t=now, r=io.read_bytes, w=io.write_bytes)
    except Exception:
        pass
    return d


def _get_versions():
    global _versions
    if _versions:
        return _versions
    v = {"python": platform.python_version(), "torch": None, "cuda": None, "comfyui": None}
    try:
        import torch
        v["torch"] = torch.__version__.split("+")[0]
        v["cuda"] = torch.version.cuda
    except Exception:
        pass
    try:
        from comfyui_version import __version__ as cv
        v["comfyui"] = cv
    except Exception:
        pass
    _versions = v
    return v


def collect():
    data = {"t": time.time(), "cpu": None, "cpu_temp": None, "ram": None,
            "gpus": [], "disk": None, "versions": _get_versions()}
    if psutil:
        data["cpu"] = psutil.cpu_percent(interval=None)
        data["cpu_temp"] = _cpu_temp()
        vm = psutil.virtual_memory()
        data["ram"] = {"used": vm.total - vm.available, "total": vm.total, "percent": vm.percent}
        data["disk"] = _disk()
    data["gpus"] = _gpus_nvml() if _nvml_ok else _gpus_smi()
    return data


@PromptServer.instance.routes.get("/sysbar/stats")
async def sysbar_stats(request):
    return web.json_response(collect())
