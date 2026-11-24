import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const meta=JSON.parse(readFileSync(join(root,'metadata.pt-BR.json'),'utf8'));
const checks={
  appName:meta.appName==='Stream Now',
  legalPublisher:typeof meta.publisherLegalName==='string'&&!meta.publisherLegalName.startsWith('REQUIRED'),
  support:typeof meta.supportEmail==='string'&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(meta.supportEmail),
  privacyPolicy:typeof meta.privacyPolicyUrl==='string'&&meta.privacyPolicyUrl.startsWith('https://'),
  terms:typeof meta.termsOfUseUrl==='string'&&meta.termsOfUseUrl.startsWith('https://'),
  supportUrl:typeof meta.supportUrl==='string'&&meta.supportUrl.startsWith('https://'),
  channelRights:meta.channelLicenseStatus==='VERIFIED_FOR_DISTRIBUTION',
  realScreenshots:meta.screenshots==='REAL_DEVICE_VERIFIED',
  sellerSamsung:typeof meta.sellerAccountIds?.samsung==='string'&&!meta.sellerAccountIds.samsung.startsWith('NOT_'),
  sellerLg:typeof meta.sellerAccountIds?.lg==='string'&&!meta.sellerAccountIds.lg.startsWith('NOT_'),
};
let failures=0;
for(const [name,ok] of Object.entries(checks)){console.log((ok?'PASS':'BLOCK')+' '+name);if(!ok)failures++;}
console.log(failures?'BLOCKED: '+failures+' requisitos de publicação faltando.':'Metadados mínimos preenchidos; revisão das lojas ainda necessária.');
if(failures)process.exitCode=1;
