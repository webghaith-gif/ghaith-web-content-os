import fs from 'node:fs';
const app=fs.readFileSync('src/app.tsx','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const failures=[];
if(/<\s*(select|textarea|label|input)\b/.test(app)) failures.push('raw form controls found');
if(/>DarsKit<|children\s*=\s*["']DarsKit/.test(app)) failures.push('app name displayed as in-app heading');
if(pkg.dependencies['@canva/design']!=='2.13.0') failures.push('design SDK is not 2.13.0');
if(pkg.dependencies['@canva/app-ui-kit']!=='5.14.1') failures.push('App UI Kit is not 5.14.1');
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('review static checks passed');
