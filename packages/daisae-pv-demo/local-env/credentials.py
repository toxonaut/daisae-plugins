"""Native credential bootstrap. Key material travels only over the private pipe.

Stable identity deliberately excludes the plugin version, cache path and project.
No deletion/rotation is performed on upgrade or uninstall.
"""
import base64
import ctypes as c
import json
import os
from pathlib import Path
import secrets
import sys
from file_lock import file_lock

SERVICE = 'com.daisae.environment'
ACCOUNT = 'environment-master-key-v1'
TARGET = SERVICE + '/' + ACCOUNT


class CredentialError(Exception):
    pass


class MacCredentials:
    def __init__(self):
        self.api = c.CDLL('/System/Library/Frameworks/Security.framework/Security')
        self.api.SecKeychainFindGenericPassword.argtypes = [c.c_void_p, c.c_uint32, c.c_char_p, c.c_uint32, c.c_char_p, c.POINTER(c.c_uint32), c.POINTER(c.c_void_p), c.c_void_p]
        self.api.SecKeychainFindGenericPassword.restype = c.c_int32
        self.api.SecKeychainAddGenericPassword.argtypes = [c.c_void_p, c.c_uint32, c.c_char_p, c.c_uint32, c.c_char_p, c.c_uint32, c.c_void_p, c.c_void_p]
        self.api.SecKeychainAddGenericPassword.restype = c.c_int32
        self.api.SecKeychainItemFreeContent.argtypes = [c.c_void_p, c.c_void_p]
        self.api.SecKeychainItemFreeContent.restype = c.c_int32
        self.service, self.account = SERVICE.encode(), ACCOUNT.encode()

    def read(self):
        length, data = c.c_uint32(), c.c_void_p()
        result = self.api.SecKeychainFindGenericPassword(None, len(self.service), self.service, len(self.account), self.account, c.byref(length), c.byref(data), None)
        if result == -25300:  # errSecItemNotFound only; denied/locked never means absent.
            return None
        if result:
            raise CredentialError('macOS Keychain is locked or access was denied. Allow access and try again.')
        try:
            return c.string_at(data, length.value)
        finally:
            self.api.SecKeychainItemFreeContent(None, data)

    def create(self, value):
        result = self.api.SecKeychainAddGenericPassword(None, len(self.service), self.service, len(self.account), self.account, len(value), value, None)
        if result == -25299:  # Another process won creation; never replace its key.
            return
        if result:
            raise CredentialError('Could not save the encryption key in macOS Keychain.')


class WindowsCredentials:
    def __init__(self):
        from ctypes import wintypes as w
        class Credential(c.Structure):
            _fields_ = [('Flags', w.DWORD), ('Type', w.DWORD), ('TargetName', w.LPWSTR), ('Comment', w.LPWSTR), ('LastWritten', w.FILETIME), ('CredentialBlobSize', w.DWORD), ('CredentialBlob', c.POINTER(c.c_ubyte)), ('Persist', w.DWORD), ('AttributeCount', w.DWORD), ('Attributes', c.c_void_p), ('TargetAlias', w.LPWSTR), ('UserName', w.LPWSTR)]
        self.Credential = Credential
        self.api = c.WinDLL('Advapi32.dll', use_last_error=True)
        self.api.CredReadW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD, c.POINTER(c.POINTER(Credential))]
        self.api.CredReadW.restype = w.BOOL
        self.api.CredWriteW.argtypes = [c.POINTER(Credential), w.DWORD]
        self.api.CredWriteW.restype = w.BOOL
        self.api.CredFree.argtypes = [c.c_void_p]
        self.api.CredFree.restype = None

    def read(self):
        ptr = c.POINTER(self.Credential)()
        if not self.api.CredReadW(TARGET, 1, 0, c.byref(ptr)):
            if c.get_last_error() == 1168:  # ERROR_NOT_FOUND
                return None
            raise CredentialError('Windows Credential Manager is unavailable for this user.')
        try:
            return c.string_at(ptr.contents.CredentialBlob, ptr.contents.CredentialBlobSize)
        finally:
            self.api.CredFree(ptr)

    def create(self, value):
        # The caller holds a per-user OS lock across read/create/read. CredWrite
        # can overwrite, so a second read is mandatory before using it.
        if self.read() is not None:
            return
        blob = (c.c_ubyte * len(value)).from_buffer_copy(value)
        credential = self.Credential()
        credential.Type = 1  # CRED_TYPE_GENERIC
        credential.TargetName = TARGET
        credential.UserName = ACCOUNT
        credential.Comment = 'DAISAE environment encryption key. Retain for reinstallations.'
        credential.CredentialBlobSize = len(value)
        credential.CredentialBlob = blob
        credential.Persist = 2  # CRED_PERSIST_LOCAL_MACHINE, still scoped to this user.
        if not self.api.CredWriteW(c.byref(credential), 0):
            raise CredentialError('Could not save the encryption key in Windows Credential Manager.')


def get_key(backend, create=False):
    value = backend.read()
    if value is None:
        if not create:
            raise CredentialError('The encryption key is missing. Restore the original credential to read existing encrypted values.')
        backend.create(base64.b64encode(secrets.token_bytes(32)))
        value = backend.read()
    try:
        key = base64.b64decode(value, validate=True)
        if len(key) != 32:
            raise ValueError()
    except (ValueError, TypeError):
        raise CredentialError('The stored encryption key is invalid. It has not been replaced.') from None
    return base64.b64encode(key).decode('ascii')


def main(req):
    if req.get('action') not in ('get', 'ensure'):
        raise CredentialError('Unknown credential action.')
    if sys.platform == 'darwin':
        backend = MacCredentials()
        state = Path.home() / 'Library' / 'Application Support' / 'DAISAE' / 'environment'
    elif sys.platform == 'win32':
        if not os.environ.get('LOCALAPPDATA'):
            raise CredentialError('Windows local application data is unavailable.')
        backend = WindowsCredentials()
        state = Path(os.environ['LOCALAPPDATA']) / 'DAISAE' / 'environment'
    else:
        raise CredentialError('Encrypted environments support macOS and Windows. No plaintext fallback is enabled.')
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    with file_lock(state / 'credential.lock'):
        return {'key': get_key(backend, create=req['action'] == 'ensure')}


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, **main(json.load(sys.stdin))}))
    except CredentialError as error:
        print(json.dumps({'ok': False, 'error': str(error)}))
    except Exception:
        print(json.dumps({'ok': False, 'error': 'The native credential store could not complete this request.'}))
