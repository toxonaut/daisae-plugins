import importlib.util, tempfile, json, os
from pathlib import Path
spec=importlib.util.spec_from_file_location('env_store',Path(__file__).with_name('store.py'))
store=importlib.util.module_from_spec(spec);spec.loader.exec_module(store)
from dotenv import dotenv_values
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);path=root/'.env'
    def read():return store.main({'action':'read','directory':temp})
    def save(snapshot,rows):return store.main({'action':'save','directory':temp,'revision':snapshot['revision'],'rows':rows})
    def row(name,value):return {'name':name,'value':value,'assigned':True}
    a=read();assert not a['exists']
    b=save(a,[row('TOKEN',"quotes' \\\" and spaces # $VAR\nnext"),row('EMPTY','')])
    assert dotenv_values(path,interpolate=False)['TOKEN']==b['rows'][0]['value']
    if os.name != 'nt': assert path.stat().st_mode & 0o777==0o600
    path.write_text('# keep this comment\nexport KEEP="same" # retained inline comment\n\nCHANGE=old\nDUP=first\nDUP=last\nUNASSIGNED\n')
    a=read();rows=a['rows'];next(r for r in rows if r['name']=='CHANGE')['value']='new';next(r for r in rows if r['name']=='DUP')['value']='edited'
    b=save(a,rows)
    assert '# keep this comment\nexport KEEP="same" # retained inline comment' in path.read_text()
    assert 'UNASSIGNED\n' in path.read_text()
    assert path.read_text().count('DUP=')==1
    b=save(b,[r for r in b['rows'] if r['name']!='CHANGE']);assert 'CHANGE=' not in path.read_text()
    path.write_text(path.read_text()+'EXTERNAL=yes\n')
    try:save(b,[]);raise AssertionError('lost update')
    except ValueError:pass
    assert 'EXTERNAL=yes' in path.read_text()
    a=read()
    for invalid in [[row('A','1'),row('A','2')],[row('BAD-NAME','x')],[row('A','\x00')]]:
        try:save(a,invalid);raise AssertionError('invalid input accepted')
        except ValueError:pass
    path.write_text('BAD LINE !\n')
    try:save(read(),[]);raise AssertionError('invalid syntax accepted')
    except ValueError:pass
    path.unlink();target=root/'other';target.write_text('SAFE=yes');path.symlink_to(target)
    try:read();raise AssertionError('symlink accepted')
    except (OSError,ValueError):pass
    assert target.read_text()=='SAFE=yes'
print('PASS: create, round-trip special/multiline values, mode 0600, comment preservation, duplicate normalization, delete, revision conflicts, validation and symlink rejection.')
