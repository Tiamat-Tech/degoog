import functools
import importlib.util
import json
import os
import re
import sys
import traceback
import types
import builtins
from urllib.parse import urlparse

try:
    from lxml import html
except Exception:
    html = None


def _text(node, *args, **kwargs):
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, bytes):
        return node.decode("utf-8", "replace")
    if isinstance(node, list):
        return " ".join(_text(x) for x in node if _text(x)).strip()
    text_content = getattr(node, "text_content", None)
    if callable(text_content):
        return " ".join(str(text_content()).split())
    text = getattr(node, "text", None)
    return " ".join(str(text or "").split())


class EngineResults(list):
    def add(self, result):
        if isinstance(result, list):
            self.extend(result)
        elif result is not None:
            self.append(result)
        return result


class SearxEngineException(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args)
        for key, value in kwargs.items():
            setattr(self, key, value)


class SearxEngineCaptchaException(SearxEngineException):
    pass


class SearxEngineAPIException(SearxEngineException):
    pass


class SearxEngineAccessDeniedException(SearxEngineException):
    pass


class SearxEngineXPathException(SearxEngineException):
    pass


class SearxEngineTooManyRequestsException(SearxEngineException):
    pass


class _ResultMeta(type):
    def __getattr__(cls, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return type(name, (cls,), {})


class _Result(dict, metaclass=_ResultMeta):
    def __init__(self, *args, **kwargs):
        super().__init__()
        for arg in args:
            if isinstance(arg, dict):
                self.update(arg)
        self.update(kwargs)

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc

    def __setattr__(self, key, value):
        self[key] = value


class MainResult(_Result):
    pass


class WeatherAnswer(_Result):
    pass


class KeyValue(_Result):
    pass


class LegacyResult(_Result):
    pass


class Answer(_Result):
    pass


class Translations(_Result):
    pass


class _ResultTypesMeta(type):
    def __getattr__(cls, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return type(name, (_Result,), {})


class _ResultTypes(metaclass=_ResultTypesMeta):
    LegacyResult = LegacyResult
    MainResult = MainResult
    KeyValue = KeyValue
    Answer = Answer
    Translations = Translations
    WeatherAnswer = WeatherAnswer


EngineResults.types = _ResultTypes


_RPC_ID = 0


def _rpc(payload):
    global _RPC_ID
    _RPC_ID += 1
    payload["id"] = _RPC_ID
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()
    line = sys.stdin.readline()
    if not line:
        raise RuntimeError("Degoog bridge closed unexpectedly")
    reply = json.loads(line)
    if not reply.get("ok"):
        raise RuntimeError(reply.get("error") or "Degoog bridge call failed")
    return reply.get("data")


def _bridge_fetch(method, url, *args, **kwargs):
    data = kwargs.get("data") or kwargs.get("content") or kwargs.get("json")
    if data is None and args:
        data = args[0]
    if isinstance(data, (dict, list)):
        data = json.dumps(data)
    if isinstance(data, bytes):
        data = data.decode("utf-8", "replace")
    reply = _rpc(
        {
            "rpc": "fetch",
            "url": str(url),
            "method": method,
            "headers": dict(kwargs.get("headers") or {}),
            "cookies": dict(kwargs.get("cookies") or {}),
            "data": data,
        }
    )
    resp = _Response(reply or {})
    if kwargs.get("raise_for_httperror"):
        _raise_for_httperror(resp)
    return resp


class EngineCache:
    def __init__(self, *args, **kwargs):
        self._local = {}

    def get(self, key, default=None):
        if key in self._local:
            return self._local[key]
        try:
            value = _rpc({"rpc": "cache", "op": "get", "key": str(key)})
        except Exception:
            return default
        if value is None:
            return default
        self._local[key] = value
        return value

    def set(self, key=None, value=None, expire=None, **kwargs):
        if key is None:
            key = kwargs.get("name")
        self._local[key] = value
        try:
            _rpc({"rpc": "cache", "op": "set", "key": str(key), "value": str(value), "ttl": expire})
        except Exception:
            pass
        return value

    def secret_hash(self, value):
        return str(abs(hash(str(value))))

    def delete(self, key):
        self._local.pop(key, None)


class _TraitCustom(dict):
    def __missing__(self, key):
        if key == "supported_domains":
            value = {"US": "www.google.com", "GB": "www.google.co.uk"}
        elif key == "ui_lang":
            value = {"en-US": "en-us", "en-GB": "en-gb", "en": "en-us"}
        elif key == "ceid":
            value = {"en-US": "US:en", "en-GB": "GB:en", "en": "US:en"}
        else:
            value = {}
        self[key] = value
        return value


def _extract_between(text, start, end, default="", *args, **kwargs):
    try:
        i = text.index(start) + len(start)
        j = text.index(end, i)
        return text[i:j]
    except ValueError:
        return default


def _html_to_text(value, *args, **kwargs):
    if html is not None and isinstance(value, str):
        try:
            return _text(html.fromstring(value))
        except Exception:
            pass
    return _text(value)


def _extract_url(value, *args, **kwargs):
    if isinstance(value, list):
        value = value[0] if value else ""
    return _text(value)


def _int_or_zero(value, *args, **kwargs):
    try:
        return int(str(value).replace(",", "").strip())
    except Exception:
        return 0


def _humanize_number(value, *args, **kwargs):
    return str(value)


def _humanize_bytes(value, *args, **kwargs):
    return str(value)


_SETTINGS_STUB = {
    "general": {"debug": False},
    "search": {"safe_search": 0, "default_lang": "en-US"},
    "outgoing": {"request_timeout": 10.0},
    "server": {"secret_key": "degoog"},
    "brand": {},
    "engines": [],
    "categories_as_tabs": {},
    "ui": {},
}


def _format_duration(seconds, *args, **kwargs):
    try:
        total = int(float(seconds))
    except Exception:
        return str(seconds or "")
    hours, rest = divmod(max(total, 0), 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return "%d:%02d:%02d" % (hours, minutes, secs)
    return "%d:%02d" % (minutes, secs)


def _js_obj_to_json(value, *args, **kwargs):
    text = str(value)
    text = re.sub(r"([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', text)
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return text.replace("'", '"')


def _raise_for_httperror(resp):
    status = int(getattr(resp, "status_code", getattr(resp, "status", 0)) or 0)
    if status >= 400:
        raise SearxEngineAPIException(f"HTTP error {status}")


class EngineTraits:
    def __init__(self):
        self.languages = {"en": "lang_en"}
        self.regions = {"en-US": "US", "en-GB": "GB"}
        self.all_locale = "US"
        self.custom = _TraitCustom({"supported_domains": {"US": "www.google.com", "GB": "www.google.co.uk"}})

    def get_language(self, locale, default=None):
        if not locale or locale == "all":
            return default or "lang_en"
        key = str(locale).replace("_", "-")
        return self.languages.get(key) or self.languages.get(key.split("-")[0]) or default or "lang_en"

    def get_region(self, locale, default=None):
        if not locale or locale == "all":
            return default or self.all_locale
        key = str(locale).replace("_", "-")
        return self.regions.get(key) or key.split("-")[-1].upper() or default or self.all_locale


_USER_AGENT = "Mozilla/5.0"


def _set_useragent(value):
    global _USER_AGENT
    if value:
        _USER_AGENT = str(value)


def _install_module(name, module):
    sys.modules[name] = module
    return module


def _install_searx_shims(engines_dir=None):
    searx = _install_module("searx", types.ModuleType("searx"))
    setattr(searx, "__path__", [])
    exceptions = _install_module("searx.exceptions", types.ModuleType("searx.exceptions"))
    setattr(exceptions, "SearxException", SearxEngineException)
    setattr(exceptions, "SearxEngineException", SearxEngineException)
    setattr(exceptions, "SearxEngineCaptchaException", SearxEngineCaptchaException)
    setattr(exceptions, "SearxEngineAPIException", SearxEngineAPIException)
    setattr(exceptions, "SearxEngineAccessDeniedException", SearxEngineAccessDeniedException)
    setattr(exceptions, "SearxEngineXPathException", SearxEngineXPathException)
    setattr(exceptions, "SearxEngineTooManyRequestsException", SearxEngineTooManyRequestsException)

    result_types = _install_module("searx.result_types", types.ModuleType("searx.result_types"))
    setattr(result_types, "EngineResults", EngineResults)
    setattr(result_types, "MainResult", MainResult)
    setattr(result_types, "WeatherAnswer", WeatherAnswer)
    setattr(result_types, "KeyValue", KeyValue)
    setattr(result_types, "LegacyResult", LegacyResult)
    setattr(result_types, "Answer", Answer)
    setattr(result_types, "Translations", Translations)

    utils = _install_module("searx.utils", types.ModuleType("searx.utils"))
    setattr(utils, "extract_text", _text)
    setattr(utils, "eval_xpath", lambda node, xpath, *a, **k: node.xpath(xpath) if hasattr(node, "xpath") else [])
    setattr(utils, "eval_xpath_list", lambda node, xpath, *a, **k: list(getattr(utils, "eval_xpath")(node, xpath)))

    def _xpath_getindex(node, xpath, index=0, default=None):
        try:
            values = utils.eval_xpath(node, xpath)
            return values[index]
        except Exception:
            return default

    setattr(utils, "eval_xpath_getindex", _xpath_getindex)
    setattr(utils, "extract_url", _extract_url)
    setattr(utils, "html_to_text", _html_to_text)
    setattr(utils, "extr", _extract_between)
    setattr(utils, "int_or_zero", _int_or_zero)
    setattr(utils, "humanize_number", _humanize_number)
    setattr(utils, "humanize_bytes", _humanize_bytes)
    setattr(utils, "to_string", lambda value, *a, **k: "" if value is None else str(value))
    setattr(utils, "ecma_unescape", lambda value, *a, **k: str(value))
    setattr(utils, "gen_useragent", lambda *args, **kwargs: _USER_AGENT)
    setattr(utils, "searxng_useragent", lambda *args, **kwargs: _USER_AGENT)
    setattr(utils, "get_embeded_stream_url", lambda url, *a, **k: url)
    setattr(utils, "js_variable_to_python", lambda value, *a, **k: json.loads(value))
    setattr(utils, "get_string_replaces_function", lambda replaces, *a, **k: (lambda value, *aa, **kk: str(value)))
    setattr(utils, "parse_duration_string", lambda value, *a, **k: value)
    setattr(utils, "markdown_to_text", _html_to_text)
    setattr(utils, "remove_pua_from_str", lambda value, *a, **k: str(value))

    locales = _install_module("searx.locales", types.ModuleType("searx.locales"))
    setattr(locales, "language_tag", lambda locale, *a, **k: str(locale).replace("_", "-"))
    setattr(locales, "region_tag", lambda locale, *a, **k: str(locale).replace("_", "-"))
    setattr(locales, "get_official_locales", lambda country, languages=None, regional=True, *a, **k: [f"en-{country}"])
    setattr(locales, "LOCALE_BEST_MATCH", {})
    setattr(locales, "get_engine_locale", lambda locale, traits=None, default=None: (traits or {}).get(locale, default or locale or "en-US") if isinstance(traits, dict) else (default or locale or "en-US"))

    engines = _install_module("searx.engines", types.ModuleType("searx.engines"))
    setattr(engines, "__path__", [engines_dir] if engines_dir else [])
    setattr(engines, "categories", {})
    setattr(engines, "engines", {})
    xpath = _install_module("searx.engines.xpath", types.ModuleType("searx.engines.xpath"))
    setattr(xpath, "extract_text", _text)
    setattr(xpath, "eval_xpath", getattr(utils, "eval_xpath"))
    setattr(xpath, "eval_xpath_list", getattr(utils, "eval_xpath_list"))
    setattr(xpath, "eval_xpath_getindex", getattr(utils, "eval_xpath_getindex"))
    setattr(xpath, "extract_url", _extract_url)

    enginelib = _install_module("searx.enginelib", types.ModuleType("searx.enginelib"))
    traits_mod = _install_module("searx.enginelib.traits", types.ModuleType("searx.enginelib.traits"))
    setattr(traits_mod, "EngineTraits", EngineTraits)
    setattr(enginelib, "EngineCache", EngineCache)

    network = _install_module("searx.network", types.ModuleType("searx.network"))

    for verb in ("get", "post", "put", "patch", "delete", "head", "options"):
        setattr(network, verb, functools.partial(_bridge_fetch, verb.upper()))
    setattr(network, "request", lambda method, url, **kwargs: _bridge_fetch(str(method).upper(), url, **kwargs))
    setattr(network, "raise_for_httperror", _raise_for_httperror)

    data = _install_module("searx.data", types.ModuleType("searx.data"))
    setattr(data, "WIKIDATA_UNITS", {})
    setattr(data, "ENGINE_TRAITS", {})
    setattr(data, "OSM_KEYS_TAGS", {})
    setattr(data, "CURRENCIES", {})

    external_bang = _install_module("searx.external_bang", types.ModuleType("searx.external_bang"))
    setattr(external_bang, "get_bang_url", lambda *args, **kwargs: None)

    external_urls = _install_module("searx.external_urls", types.ModuleType("searx.external_urls"))
    setattr(external_urls, "get_external_url", lambda url_id=None, item_id=None, default=None, *a, **k: default or (str(item_id or "")))
    setattr(external_urls, "get_earth_coordinates_url", lambda *args, **kwargs: "")
    setattr(external_urls, "area_to_osm_zoom", lambda *args, **kwargs: 12)

    extended_types = _install_module("searx.extended_types", types.ModuleType("searx.extended_types"))
    setattr(extended_types, "SXNG_Response", _Response if "_Response" in globals() else object)
    setattr(extended_types, "SXNG_Request", dict)

    flask_babel = _install_module("flask_babel", types.ModuleType("flask_babel"))
    setattr(flask_babel, "gettext", lambda value, *args, **kwargs: str(value))
    setattr(flask_babel, "lazy_gettext", lambda value, *args, **kwargs: str(value))

    isodate = _install_module("isodate", types.ModuleType("isodate"))
    setattr(isodate, "parse_duration", lambda value, *a, **k: value)

    httpx = _install_module("httpx", types.ModuleType("httpx"))
    setattr(httpx, "Client", object)
    setattr(httpx, "AsyncClient", object)
    setattr(httpx, "Response", _Response)
    setattr(httpx, "DigestAuth", object)

    valkey = _install_module("valkey", types.ModuleType("valkey"))
    setattr(valkey, "Valkey", object)

    weather = _install_module("searx.weather", types.ModuleType("searx.weather"))
    class _GeoLocation:
        latitude = 51.0
        longitude = -3.0

        @classmethod
        def by_query(cls, query):
            if not str(query).strip():
                raise ValueError("empty location")
            return cls()

    setattr(weather, "Weather", dict)
    setattr(weather, "GeoLocation", _GeoLocation)
    setattr(weather, "WeatherConditionType", str)

    setattr(utils, "ElementType", object)
    setattr(utils, "format_duration", _format_duration)
    setattr(utils, "js_obj_str_to_json_str", _js_obj_to_json)
    setattr(utils, "js_obj_str_to_python", lambda value, *a, **k: json.loads(_js_obj_to_json(value)))
    setattr(utils, "load_module", lambda *a, **k: types.ModuleType("stub"))
    setattr(utils, "parse_url", lambda value, *a, **k: str(value))
    setattr(utils, "get_node", lambda node, *a, **k: node)
    setattr(utils, "sparql_string_escape", lambda value, *a, **k: str(value).replace('"', '\\"'))
    setattr(utils, "detect_language", lambda *a, **k: None)

    setattr(enginelib, "EngineAbout", dict)
    setattr(enginelib, "Engine", object)
    setattr(traits_mod, "EngineTraitsMap", dict)

    setattr(external_bang, "EXTERNAL_BANGS", {})
    setattr(external_bang, "get_node", lambda *a, **k: (None, None, None))

    setattr(result_types, "Result", _Result)
    setattr(result_types, "Image", _ResultTypes.Image)
    setattr(result_types, "ImageRef", _ResultTypes.ImageRef)
    setattr(result_types, "__path__", [])
    image_types = _install_module("searx.result_types.image", types.ModuleType("searx.result_types.image"))
    setattr(image_types, "Image", _ResultTypes.Image)
    setattr(image_types, "ImageRef", _ResultTypes.ImageRef)
    setattr(result_types, "image", image_types)

    processors = _install_module("searx.search.processors", types.ModuleType("searx.search.processors"))
    search_mod = _install_module("searx.search", types.ModuleType("searx.search"))
    setattr(search_mod, "__path__", [])
    setattr(processors, "__path__", [])
    for stub in ("OnlineParams", "RequestParams", "OnlineDictParams", "OnlineCurrenciesParams"):
        setattr(processors, stub, dict)
    online_dict = _install_module(
        "searx.search.processors.online_dictionary", types.ModuleType("searx.search.processors.online_dictionary")
    )
    setattr(online_dict, "OnlineDictParams", dict)
    setattr(processors, "online_dictionary", online_dict)
    setattr(search_mod, "processors", processors)
    setattr(searx, "search", search_mod)
    setattr(searx, "settings", _SETTINGS_STUB)

    builtins.logger = _Logger()
    builtins.CACHE = EngineCache()
    setattr(searx, "logger", _Logger())
    setattr(searx, "weather", weather)
    setattr(searx, "external_bang", external_bang)
    setattr(searx, "exceptions", exceptions)
    setattr(searx, "result_types", result_types)
    setattr(searx, "utils", utils)
    setattr(searx, "locales", locales)
    setattr(searx, "engines", engines)
    setattr(searx, "enginelib", enginelib)
    setattr(enginelib, "traits", traits_mod)


class _Logger:
    def getChild(self, *args, **kwargs):
        return self

    def debug(self, *args, **kwargs):
        pass

    def info(self, *args, **kwargs):
        pass

    def warning(self, *args, **kwargs):
        pass

    def warn(self, *args, **kwargs):
        pass

    def error(self, *args, **kwargs):
        pass


class _RespUrl:
    def __init__(self, raw):
        parsed = urlparse(raw)
        self.host = parsed.hostname or ""
        self.path = parsed.path or "/"
        self.raw = raw

    def __str__(self):
        return self.raw


class _RequestEcho:
    def __init__(self, raw):
        self.url = _RespUrl(raw.get("url") or "")
        self.method = raw.get("method") or "GET"
        self.headers = raw.get("headers") or {}
        self.content = (raw.get("data") or "").encode("utf-8")


class _Response:
    def __init__(self, raw):
        self.url = _RespUrl(raw.get("url") or "")
        self.status_code = int(raw.get("status") or 0)
        self.status = self.status_code
        self.text = raw.get("text") or ""
        self.content = self.text.encode("utf-8")
        self.headers = raw.get("headers") or {}
        self.cookies = raw.get("cookies") or {}
        self.ok = 200 <= self.status_code < 400
        self.encoding = "utf-8"

    def json(self):
        return json.loads(self.text or "null")

    def raise_for_status(self):
        _raise_for_httperror(self)


def _load_engine(path):
    engines_dir = os.path.dirname(path)
    _install_searx_shims(engines_dir)
    name = "searx.engines." + os.path.splitext(os.path.basename(path))[0]
    spec = importlib.util.spec_from_file_location(name, path)
    if not spec or not spec.loader:
        raise RuntimeError("could not load engine")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    engines_mod = sys.modules.get("searx.engines")
    if engines_mod is not None:
        getattr(engines_mod, "engines", {})[os.path.splitext(os.path.basename(path))[0]] = mod
    if not hasattr(mod, "logger"):
        setattr(mod, "logger", _Logger())
    if not hasattr(mod, "CACHE"):
        setattr(mod, "CACHE", EngineCache())
    if not hasattr(mod, "traits"):
        setattr(mod, "traits", EngineTraits())
    about = getattr(mod, "about", {})
    website = str(about.get("website", "")).rstrip("/") if isinstance(about, dict) else ""
    base = getattr(mod, "base_url", "__missing__")
    if (base is None or base == []) and website:
        setattr(mod, "base_url", website)
    defaults = {
        "wiki_netloc": "en.wikipedia.org",
        "language": "en-US",
        "language_all": False,
        "lang_region": "en-US",
        "brave_category": "search",
        "google_play_category": "apps",
        "ceid": "US:en",
        "play_categ": "apps",
    }
    for key, value in defaults.items():
        if not hasattr(mod, key) or getattr(mod, key) is None:
            setattr(mod, key, value)
    _call_setup(mod, name)
    return mod


def _call_setup(mod, name):
    setup = getattr(mod, "setup", None)
    if not callable(setup):
        return
    try:
        setup({"name": name, "categories": _categories(mod)})
    except Exception:
        pass


def _categories(mod):
    raw = getattr(mod, "categories", None)
    if isinstance(raw, list):
        found = [str(x) for x in raw if str(x).strip()]
        if found:
            return found
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return ["other"]


SEARX_GROUPING_CATEGORY = "web"
SEARX_GENERAL_CATEGORY = "general"


def _types_from_categories(categories):
    mapped = []
    for c in categories:
        v = c.lower()
        if v == SEARX_GROUPING_CATEGORY:
            continue
        if v == SEARX_GENERAL_CATEGORY:
            v = "web"
        if v not in mapped:
            mapped.append(v)
    return mapped or ["web"]


def _discover(path):
    mod = _load_engine(path)
    about = getattr(mod, "about", {}) if isinstance(getattr(mod, "about", {}), dict) else {}
    categories = _categories(mod)
    return {
        "path": path,
        "id": os.path.splitext(os.path.basename(path))[0],
        "name": about.get("name") or os.path.splitext(os.path.basename(path))[0].replace("_", " ").title(),
        "description": about.get("website") or "SearX-compatible Python engine",
        "categories": categories,
        "types": _types_from_categories(categories),
        "paging": bool(getattr(mod, "paging", False)),
        "timeRangeSupport": bool(getattr(mod, "time_range_support", False)),
        "languageSupport": bool(getattr(mod, "language_support", False)),
        "safesearch": bool(getattr(mod, "safesearch", False)),
        "offline": not callable(getattr(mod, "request", None)),
    }


def _base_params(payload):
    query = payload.get("query") or ""
    return {
        "query": query,
        "pageno": int(payload.get("page") or 1),
        "time_range": None if payload.get("timeFilter") in (None, "any") else payload.get("timeFilter"),
        "safesearch": int(payload.get("safesearch") or 0),
        "searxng_locale": payload.get("locale") or "all",
        "language": payload.get("locale") or "en-US",
        "category": payload.get("category") or "general",
        "engine_data": {},
        "data": {},
        "from_lang": "en",
        "to_lang": "en",
        "from": "USD",
        "to": "USD",
        "lang_region": "en-US",
        "language_all": False,
        "wiki_netloc": "en.wikipedia.org",
        "search_urls": {"data:image": "", "http": query if str(query).startswith(("http://", "https://")) else ""},
        "headers": dict(payload.get("headers") or {}),
        "cookies": {},
    }


def _request(payload):
    _set_useragent((payload.get("headers") or {}).get("User-Agent"))
    mod = _load_engine(payload["path"])
    params = _base_params(payload)
    request = getattr(mod, "request", None)
    if not callable(request):
        raise RuntimeError("engine does not export request")
    request(payload.get("query") or "", params)
    data = params.get("data") or params.get("body")
    if isinstance(data, bytes):
        data = data.decode("utf-8", "replace")
    return {
        "url": params.get("url"),
        "method": params.get("method") or "GET",
        "headers": params.get("headers") or {},
        "cookies": params.get("cookies") or {},
        "data": data,
    }


def _normalize_result(item, source):
    if not isinstance(item, dict):
        return None
    if not item.get("url") and not item.get("title"):
        return None
    url = item.get("url") or ""
    title = item.get("title") or url
    snippet = item.get("content") or item.get("snippet") or ""
    out = {"title": str(title), "url": str(url), "snippet": str(snippet), "source": source}
    img = item.get("img_src") or item.get("image_src") or item.get("image") or item.get("imageUrl")
    thumbnail = item.get("thumbnail_src") or item.get("thumbnail") or img
    if thumbnail:
        out["thumbnail"] = str(thumbnail)
    if img:
        out["imageUrl"] = str(img)
    duration = item.get("length") or item.get("duration")
    if duration:
        out["duration"] = str(duration)
    return out


def _search_params(payload):
    params = _base_params(payload)
    echo = payload.get("request") or {}
    params.update({k: v for k, v in echo.items() if v is not None})
    return params


def _response(payload):
    _set_useragent((payload.get("headers") or {}).get("User-Agent"))
    mod = _load_engine(payload["path"])
    response = getattr(mod, "response", None)
    if not callable(response):
        raise RuntimeError("engine does not export response")
    resp = _Response(payload.get("response") or {})
    resp.search_params = _search_params(payload)
    resp.request = _RequestEcho(payload.get("request") or {})
    raw = response(resp)
    source = payload.get("source") or _discover(payload["path"])["name"]
    results = []
    for item in list(raw or []):
        normalized = _normalize_result(item, source)
        if normalized:
            results.append(normalized)
    return {"results": results}


def _discover_all(paths):
    found = []
    for path in paths:
        try:
            found.append(_discover(path))
        except Exception as exc:
            found.append({"path": path, "error": str(exc)})
    return {"engines": found}


def _run(payload):
    action = payload.get("action")
    if action == "discover_all":
        return _discover_all(payload.get("paths") or [])
    if action == "discover":
        return _discover(payload["path"])
    if action == "request":
        return _request(payload)
    if action == "response":
        return _response(payload)
    raise RuntimeError("unknown action")


def _emit(envelope):
    sys.stdout.write(json.dumps(envelope) + "\n")
    sys.stdout.flush()


try:
    _emit({"ok": True, "data": _run(json.loads(sys.stdin.readline() or "{}"))})
except Exception as exc:
    _emit({"ok": False, "error": str(exc) or type(exc).__name__, "trace": traceback.format_exc()})
    sys.exit(1)
