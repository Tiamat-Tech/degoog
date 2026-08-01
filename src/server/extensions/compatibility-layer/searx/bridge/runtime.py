import hashlib
import json
from datetime import timedelta

from . import rpc

DEFAULT_USER_AGENT = "Mozilla/5.0"
CACHE_ENVELOPE = "json:"

_user_agent = DEFAULT_USER_AGENT


def encode(value):
    try:
        return CACHE_ENVELOPE + json.dumps(value)
    except (TypeError, ValueError):
        return None


def decode(stored):
    if not isinstance(stored, str) or not stored.startswith(CACHE_ENVELOPE):
        return stored
    try:
        return json.loads(stored[len(CACHE_ENVELOPE):])
    except ValueError:
        return stored


def ttl_seconds(expire):
    if expire is None or isinstance(expire, bool):
        return None
    if isinstance(expire, timedelta):
        return int(expire.total_seconds())
    if isinstance(expire, (int, float)):
        return int(expire)
    return None


def user_agent():
    return _user_agent


def set_agent(value):
    global _user_agent
    if value:
        _user_agent = str(value)


class Logger:
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


class EngineCache:
    def __init__(self, *args, **kwargs):
        self._local = {}

    def get(self, key, default=None):
        if key in self._local:
            return self._local[key]
        try:
            stored = rpc.call({"rpc": "cache", "op": "get", "key": str(key)})
        except Exception:
            return default
        if stored is None:
            return default
        value = decode(stored)
        self._local[key] = value
        return value

    def set(self, key=None, value=None, expire=None, **kwargs):
        if key is None:
            key = kwargs.get("name")
        self._local[key] = value
        stored = encode(value)
        if stored is None:
            return value
        try:
            rpc.call(
                {
                    "rpc": "cache",
                    "op": "set",
                    "key": str(key),
                    "value": stored,
                    "ttl": ttl_seconds(expire),
                }
            )
        except Exception:
            pass
        return value

    def secret_hash(self, value):
        return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]

    def delete(self, key):
        self._local.pop(key, None)


class TraitCustom(dict):
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


class EngineTraits:
    def __init__(self):
        self.languages = {"en": "lang_en"}
        self.regions = {"en-US": "US", "en-GB": "GB"}
        self.all_locale = "US"
        self.custom = TraitCustom({"supported_domains": {"US": "www.google.com", "GB": "www.google.co.uk"}})

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
