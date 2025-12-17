#!/usr/bin/env python3
"""Subpath-friendly PHP dev server for E2E harnesses."""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = ROOT / "tests" / ".cache" / "subpath_root"
DOCROOT = CACHE_ROOT / "Heritage" / "public"
PORT = 8016
HOST = "127.0.0.1"
PID_FILE = CACHE_ROOT / "server.pid"
BASE_URL = f"http://{HOST}:{PORT}/Heritage/public/"


@dataclass
class SubpathServer:
    process: subprocess.Popen[str]
    base_url: str

    def stop(self) -> None:
        if self.process.poll() is None:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        if PID_FILE.exists():
            try:
                PID_FILE.unlink()
            except OSError:
                pass

    def __enter__(self) -> "SubpathServer":
        return self

    def __exit__(self, exc_type, exc, tb) -> Optional[bool]:
        self.stop()
        return None


def _kill_pid(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except PermissionError:
        return
    for _ in range(20):
        if _pid_dead(pid):
            return
        time.sleep(0.1)
    try:
        os.kill(pid, signal.SIGKILL)
    except Exception:
        pass


def _pid_dead(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    return False


def _port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, port)) == 0


def _ensure_cache_root() -> None:
    DOCROOT.parent.mkdir(parents=True, exist_ok=True)


def _cleanup_previous_server() -> None:
    if PID_FILE.exists():
        try:
            pid = int(PID_FILE.read_text().strip())
        except (OSError, ValueError):
            PID_FILE.unlink(missing_ok=True)
            return
        _kill_pid(pid)
        PID_FILE.unlink(missing_ok=True)


def _copy_public_tree() -> None:
    if DOCROOT.exists():
        shutil.rmtree(DOCROOT)
    shutil.copytree(ROOT / "public", DOCROOT)


def _wait_for_ready(url: str, timeout: float = 10.0) -> None:
    start = time.time()
    last_error: Exception | None = None
    while time.time() - start < timeout:
        try:
            with urlopen(url):
                return
        except URLError as exc:  # noqa: PERF203
            last_error = exc
            time.sleep(0.25)
            continue
    message = f"Timed out waiting for dev server at {url}"
    if last_error:
        message += f" ({last_error})"
    raise RuntimeError(message)


def start_subpath_server(*, quiet: bool = True) -> SubpathServer:
    _ensure_cache_root()
    _cleanup_previous_server()
    if _port_in_use(HOST, PORT):
        raise RuntimeError(f"Port {HOST}:{PORT} is already in use.")

    _copy_public_tree()

    args: List[str] = [
        "php",
        "-S",
        f"{HOST}:{PORT}",
        "-t",
        str(CACHE_ROOT),
    ]
    stdout_target = subprocess.DEVNULL if quiet else subprocess.PIPE
    stderr_target = subprocess.DEVNULL if quiet else subprocess.STDOUT

    process = subprocess.Popen(
        args,
        cwd=ROOT,
        stdout=stdout_target,
        stderr=stderr_target,
        text=True,
    )
    PID_FILE.write_text(str(process.pid), encoding="utf-8")

    _wait_for_ready(BASE_URL)
    return SubpathServer(process=process, base_url=BASE_URL)


def _stream_output(stream: Iterable[str], label: str) -> None:
    for line in stream:
        sys.stdout.write(f"[{label}] {line}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Run a PHP dev server under /Heritage/public/")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Start the server, optionally run a command, then stop.",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Optional command to run while the server is up (requires --once).",
    )
    args = parser.parse_args(argv)

    try:
        with start_subpath_server(quiet=False) as server:
            print(f"Subpath server ready at {server.base_url}")
            if args.once:
                if args.command:
                    cmd = [arg for arg in args.command if arg]
                    result = subprocess.run(cmd, cwd=ROOT)
                    return result.returncode
                return 0

            try:
                if server.process.stdout:
                    _stream_output(server.process.stdout, "php")
            except KeyboardInterrupt:
                return 0
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"{exc}\n")
        return 1
    finally:
        if PID_FILE.exists():
            PID_FILE.unlink(missing_ok=True)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
