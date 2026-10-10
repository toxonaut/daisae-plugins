"""Short-lived cross-process locks shared by the store and credential bootstrap."""
import os
import stat
import time
from contextlib import contextmanager


def open_regular(path, flags, mode=0o600):
    # Windows lacks O_NOFOLLOW. Reject reparse points as well as ordinary symlinks.
    def check():
        try:
            info = os.lstat(path)
        except FileNotFoundError:
            return
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('Linked files are not supported for environment storage.')
    check()
    fd = os.open(path, flags | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0), mode)
    try:
        check()
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('Environment storage requires regular files.')
        return fd
    except BaseException:
        os.close(fd)
        raise


@contextmanager
def file_lock(path, timeout=15):
    fd = open_regular(path, os.O_CREAT | os.O_RDWR)
    with os.fdopen(fd, 'r+b') as lock:
        if os.fstat(lock.fileno()).st_size == 0:
            lock.write(b'\0')
            lock.flush()
        deadline = time.monotonic() + timeout
        while True:
            try:
                lock.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise ValueError('Environment storage is busy. Try again.') from None
                time.sleep(0.05)
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
