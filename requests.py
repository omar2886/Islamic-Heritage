from __future__ import annotations

import importlib.util
import json as _json
import sys
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib import request as urllib_request

_real_spec = importlib.util.find_spec("requests")
if _real_spec and _real_spec.origin and _real_spec.origin != __file__:
    _real_module = importlib.util.module_from_spec(_real_spec)
    assert _real_spec.loader is not None
    _real_spec.loader.exec_module(_real_module)
    globals().update(_real_module.__dict__)
    sys.modules[__name__] = _real_module
else:

    @dataclass
    class Response:
        _body: bytes
        status_code: int
        headers: Dict[str, str]

        @property
        def status(self) -> int:
            return self.status_code

        def json(self) -> Any:
            return _json.loads(self._body.decode("utf-8"))

        def text(self) -> str:
            return self._body.decode("utf-8")


    def _do_request(
        url: str,
        *,
        method: str,
        data: Optional[bytes] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 10,
    ) -> Response:
        req = urllib_request.Request(url, data=data, headers=headers or {}, method=method)
        with urllib_request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            body = resp.read()
            status = resp.getcode() or 0
            resp_headers = dict(resp.headers.items())
        return Response(body, status, resp_headers)


    def get(url: str, *, timeout: float = 10) -> Response:
        return _do_request(url, method="GET", timeout=timeout)


    def post(url: str, *, json: Optional[Any] = None, timeout: float = 10) -> Response:
        data = None
        headers: Dict[str, str] = {}
        if json is not None:
            data = _json.dumps(json).encode("utf-8")
            headers["Content-Type"] = "application/json"
        return _do_request(url, method="POST", data=data, headers=headers, timeout=timeout)
