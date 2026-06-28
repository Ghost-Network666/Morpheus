import subprocess
import json
import platform
from typing import Optional


def get_tailscale_ip() -> Optional[str]:
    try:
        result = subprocess.run(
            ["tailscale", "ip", "--4"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return None


def get_tailscale_hostname() -> Optional[str]:
    try:
        result = subprocess.run(
            ["tailscale", "status", "--json"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            self_node = data.get("Self", {})
            dns_name = self_node.get("DNSName", "")
            if dns_name:
                return dns_name.rstrip(".")
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return None


def get_tailscale_url(port: int) -> Optional[str]:
    hostname = get_tailscale_hostname()
    if hostname:
        return f"http://{hostname}:{port}"
    ip = get_tailscale_ip()
    if ip:
        return f"http://{ip}:{port}"
    return None
