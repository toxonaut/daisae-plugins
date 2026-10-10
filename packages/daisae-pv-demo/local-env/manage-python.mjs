#!/usr/bin/env node
import {installEnvironment,listEnvironments,uninstallEnvironment,installFramework} from './python-environments.mjs';
const [action,raw='{}']=process.argv.slice(2);
try{
 const args=JSON.parse(raw);
 const operations={install:installEnvironment,list:listEnvironments,uninstall:uninstallEnvironment,framework:installFramework};
 if(!operations[action])throw Error('Usage: node manage-python.mjs install|list|uninstall|framework [JSON arguments]');
 console.log(JSON.stringify(await operations[action](args),null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
