"""Başarılı Next derlemesini kaynak, ortam ve BUILD_ID ile eşler."""
from pathlib import Path
import hashlib
import json

RECEIPT = '.adhd-build-receipt.json'
BUILD_ENV = ('API_ORIGIN', 'UI_E2E_CHECKS', 'UI_E2E_BUILD', 'NODE_ENV', 'NODE_OPTIONS', 'SITE_URL', 'SITE_INDEXING', 'VERCEL_ENV', 'UI_E2E_BUILD_ENGINE', 'UI_E2E_PROFILE')


def build_key(ui: Path, fingerprint: str, env: dict) -> dict:
    # Yerel ortam ve derlemeyi etkileyen değerlerin yalnız özeti alınır, içeriği saklanmaz.
    inputs = {name: env.get(name) for name in BUILD_ENV}
    inputs.update({name: value for name, value in env.items() if name.startswith('NEXT_PUBLIC_')})
    inputs.update({name: value for name, value in env.items() if name.startswith('LEGAL_')})
    encoded = json.dumps(inputs, sort_keys=True, separators=(',', ':')).encode()
    mode = env.get('NODE_ENV') or 'production'
    local_env = {name: hashlib.sha256((ui / name).read_bytes()).hexdigest()
                 for name in sorted({'.env', '.env.local', f'.env.{mode}', f'.env.{mode}.local'})
                 if (ui / name).is_file()}
    return {'version': 1, 'fingerprint': fingerprint,
            'environmentHash': hashlib.sha256(encoded).hexdigest(), 'localEnvHashes': local_env}


def can_reuse(build: Path, key: dict) -> bool:
    try:
        build_id = (build / 'BUILD_ID').read_text(encoding='utf-8').strip()
        receipt = json.loads((build / RECEIPT).read_text(encoding='utf-8'))
        return bool(build_id) and receipt == {'key': key, 'buildId': build_id}
    except (OSError, ValueError):
        return False


def invalidate(build: Path) -> None:
    (build / RECEIPT).unlink(missing_ok=True)


def record_success(build: Path, key: dict) -> None:
    build_id = (build / 'BUILD_ID').read_text(encoding='utf-8').strip()
    if not build_id:
        raise RuntimeError('A successful production build must have a BUILD_ID')
    # Yalnız başarılı derlemeden sonra çağrılır. Bu yazı sırasında çökme olursa önbellek geçersizdir.
    (build / RECEIPT).write_text(json.dumps({'key': key, 'buildId': build_id}), encoding='utf-8')
