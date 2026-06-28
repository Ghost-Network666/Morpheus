import subprocess
import platform
import json
import asyncio
from typing import AsyncIterator, Optional
import httpx
from app.config import settings


def detect_hardware() -> dict:
    info = {
        "platform": platform.system(),
        "cpu": platform.processor() or platform.machine(),
        "ram_gb": 0,
        "gpu": [],
        "vram_gb": 0,
    }

    try:
        import psutil
        info["ram_gb"] = round(psutil.virtual_memory().total / (1024**3), 1)
    except Exception:
        pass

    # NVIDIA GPU
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                parts = line.split(",")
                if len(parts) >= 2:
                    name = parts[0].strip()
                    vram_mb = int(parts[1].strip())
                    info["gpu"].append({"name": name, "vram_gb": round(vram_mb / 1024, 1), "type": "nvidia"})
                    info["vram_gb"] += vram_mb / 1024
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        pass

    # Apple Silicon
    if platform.system() == "Darwin":
        try:
            result = subprocess.run(
                ["system_profiler", "SPHardwareDataType", "-json"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                hw = data.get("SPHardwareDataType", [{}])[0]
                chip = hw.get("chip_type", hw.get("cpu_type", ""))
                if "Apple" in chip:
                    info["gpu"].append({"name": chip + " (Metal)", "type": "metal", "vram_gb": info["ram_gb"] * 0.5})
                    info["vram_gb"] = info["ram_gb"] * 0.5
        except Exception:
            pass

    return info


def recommend_models(hardware: dict) -> list[dict]:
    ram = hardware.get("ram_gb", 0)
    vram = hardware.get("vram_gb", 0)
    effective = max(ram * 0.6, vram)

    recommendations = []

    if effective >= 64:
        recommendations.append({"model": "llama3.1:70b", "reason": "High-end setup — best quality", "size_gb": 40})
    if effective >= 24:
        recommendations.append({"model": "llama3.1:32b", "reason": "Strong reasoning, fast on 24GB+", "size_gb": 19})
    if effective >= 12:
        recommendations.append({"model": "llama3.2:11b", "reason": "Balanced quality/speed", "size_gb": 7})
    if effective >= 6:
        recommendations.append({"model": "llama3.2:3b", "reason": "Fast, good for coding and chat", "size_gb": 2})
    if effective >= 3:
        recommendations.append({"model": "phi3.5:mini", "reason": "Lightweight, runs on 4GB RAM", "size_gb": 2.2})

    recommendations.append({"model": "nomic-embed-text", "reason": "Required for RAG embeddings", "size_gb": 0.3})

    return recommendations


async def list_models() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{settings.ollama_url}/api/tags")
            if r.status_code == 200:
                return r.json().get("models", [])
    except Exception:
        pass
    return []


async def stream_pull_model(model_name: str) -> AsyncIterator[str]:
    url = f"{settings.ollama_url}/api/pull"
    payload = {"name": model_name, "stream": True}

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, json=payload) as response:
            async for line in response.aiter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        status = data.get("status", "")
                        total = data.get("total", 0)
                        completed = data.get("completed", 0)
                        if total and completed:
                            pct = round(completed / total * 100, 1)
                            yield f"{status} {pct}%\n"
                        elif status:
                            yield f"{status}\n"
                    except json.JSONDecodeError:
                        yield line + "\n"


async def delete_model(model_name: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.delete(f"{settings.ollama_url}/api/delete", json={"name": model_name})
            return r.status_code == 200
    except Exception:
        return False
