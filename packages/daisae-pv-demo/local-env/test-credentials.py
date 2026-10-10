"""Key lifecycle tests without writing any test secrets to OS credentials."""
from credentials import get_key, CredentialError
import base64

class MemoryCredentials:
    def __init__(self, value=None):
        self.value, self.writes = value, 0
    def read(self): return self.value
    def create(self, value):
        self.writes += 1
        self.value = value

backend = MemoryCredentials()
first = get_key(backend, True)
assert len(base64.b64decode(first)) == 32
assert get_key(backend, True) == first
assert get_key(backend, False) == first
assert backend.writes == 1
# A new plugin runtime wraps the same durable OS credential; no version namespace.
reinstalled = MemoryCredentials(backend.value)
assert get_key(reinstalled, True) == first and reinstalled.writes == 0
for value in (b'bad', b'AAAA', b''):
    broken = MemoryCredentials(value)
    try:
        get_key(broken, True)
        raise AssertionError('Corrupt key silently replaced')
    except CredentialError: pass
    assert broken.writes == 0 and broken.value == value
missing = MemoryCredentials()
try:
    get_key(missing, False)
    raise AssertionError('Missing key silently replaced')
except CredentialError: pass
assert missing.writes == 0
class Denied(MemoryCredentials):
    def read(self): raise CredentialError('denied')
denied = Denied()
try:
    get_key(denied, True)
    raise AssertionError('Denied credentials treated as missing')
except CredentialError: pass
assert denied.writes == 0
print('PASS: random key creation, stable reinstall reuse, no accumulation, no replacement on missing/corrupt/denied credentials.')
