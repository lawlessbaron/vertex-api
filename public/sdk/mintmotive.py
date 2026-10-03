"""Mint Motive API client for Python 3.8+. Standard library only.

    from mintmotive import MintMotive
    mm = MintMotive(key=os.environ["MINT_KEY"])
    f = mm.engine_generate({"kind": "bin", "format": "stl", "params": {"gridX": 2, "gridY": 1}})
    open(f["name"], "wb").write(f["bytes"])

Every call raises MintMotiveError(status, message, request_id) when the API says no.
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

__version__ = "1.0.0"


class MintMotiveError(Exception):
    def __init__(self, status, message, request_id=None):
        super().__init__(message)
        self.status, self.request_id = status, request_id


class MintMotive:
    def __init__(self, key=None, base="https://api.mintmotive.com.au", timeout=120):
        self.key, self.base, self.timeout = key, base.rstrip("/"), timeout

    # ---- plumbing
    def _raw(self, method, path, body=None, ctype=None):
        headers = {"User-Agent": f"mintmotive-python/{__version__}"}
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
        if ctype:
            headers["Content-Type"] = ctype
        req = urllib.request.Request(self.base + path, data=body, headers=headers, method=method)
        try:
            return urllib.request.urlopen(req, timeout=self.timeout)
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode()).get("error") or f"HTTP {e.code}"
            except Exception:
                msg = f"HTTP {e.code}"
            raise MintMotiveError(e.code, msg, e.headers.get("X-Request-Id")) from None

    def _get(self, path):
        return json.loads(self._raw("GET", path).read().decode())

    def _post(self, path, obj):
        return json.loads(self._raw("POST", path, json.dumps(obj).encode(), "application/json").read().decode())

    @staticmethod
    def _qs(ctx):
        return urllib.parse.urlencode({k: (",".join(map(str, v)) if isinstance(v, (list, tuple)) else v) for k, v in (ctx or {}).items() if v is not None})

    # ---- Engine API
    def engine_info(self):
        return self._get("/engine/v1")

    def engine_kinds(self):
        return self._get("/engine/v1/kinds")

    def engine_parts(self, spec):
        return self._post("/engine/v1/parts", spec)

    def engine_generate(self, spec):
        """→ {"bytes", "name", "serial", "parts"}"""
        r = self._raw("POST", "/engine/v1/generate", json.dumps(spec).encode(), "application/json")
        m = re.search(r'filename="([^"]+)"', r.headers.get("Content-Disposition", ""))
        return {"bytes": r.read(), "name": m.group(1) if m else f"{spec.get('kind')}.{spec.get('format', '3mf')}",
                "serial": r.headers.get("X-Vertex-Serial"), "parts": [p for p in (r.headers.get("X-Vertex-Parts") or "").split(",") if p]}

    # ---- Tracer API
    def trace_photo(self, photo_bytes, paper="a4", every=2.0, timeout=180):
        """A photo → the finished job (tools with outlines in mm), polling until done."""
        job = json.loads(self._raw("POST", f"/trace/v1/jobs?paper={urllib.parse.quote(paper)}", photo_bytes, "application/octet-stream").read().decode())
        t0 = time.time()
        while True:
            j = self._get(job["check"])
            if j["status"] == "failed":
                raise MintMotiveError(422, j.get("error", "The trace failed."))
            if j["status"] != "running":
                return j
            if time.time() - t0 > timeout:
                raise MintMotiveError(408, "The trace took too long.")
            time.sleep(every)

    def trace_bin(self, job_id, fmt="stl", clearance=1, depth=20, finger=22):
        r = self._raw("GET", f"/trace/v1/jobs/{job_id}/bin?format={fmt}&clearance={clearance}&depth={depth}&finger={finger}")
        return {"bytes": r.read(), "serial": r.headers.get("X-Vertex-Serial")}

    # ---- Print AI API
    def ai_check_settings(self, settings, context=None):
        """settings: a dict of slicer settings, or G-code text."""
        if isinstance(settings, str):
            return json.loads(self._raw("POST", f"/ai/v1/check/settings?{self._qs(context)}", settings.encode(), "text/plain").read().decode())
        return self._post("/ai/v1/check/settings", {"settings": settings, "context": context or {}})

    def ai_check_model(self, model, context=None):
        """model: STL or 3MF bytes, or {"kind", "params"} for an engine model."""
        if isinstance(model, (bytes, bytearray)):
            return json.loads(self._raw("POST", f"/ai/v1/check/model?{self._qs(context)}", bytes(model), "application/octet-stream").read().decode())
        return self._post("/ai/v1/check/model", {**model, "context": context or {}})

    def ai_diagnose_photo(self, photo_bytes, context=None):
        return json.loads(self._raw("POST", f"/ai/v1/diagnose/photo?{self._qs(context)}", photo_bytes, "application/octet-stream").read().decode())

    def ai_outcome(self, job, result, **extra):
        return self._post("/ai/v1/outcomes", {"job": job, "result": result, **extra})

    def ai_apply(self, settings_bytes, name, fixes):
        """Write fixes ([{"setting", "to"}, ...]) into a .ini, .json or .3mf settings file. Returns (bytes, applied, missing)."""
        q = urllib.parse.urlencode({"name": name, "fixes": json.dumps(fixes)})
        r = self._raw("POST", f"/ai/v1/apply?{q}", settings_bytes, "application/octet-stream")
        split = lambda h: [x for x in (r.headers.get(h) or "").split(",") if x]
        return r.read(), split("X-Fixes-Applied"), split("X-Fixes-Missing")

    def ai_recipes(self):
        return self._get("/ai/v1/recipes")["recipes"]

    def ai_apply_to_recipe(self, recipe_id, settings_bytes, name, fixes):
        q = urllib.parse.urlencode({"name": name, "fixes": json.dumps(fixes)})
        return json.loads(self._raw("POST", f"/ai/v1/recipes/{urllib.parse.quote(recipe_id)}/apply?{q}", settings_bytes, "application/octet-stream").read().decode())
