// node tests/test-heart-rate.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = path.join(__dirname,'../lib/smartTools/heartRateBLE.ts');
const compiled = ts.transpileModule(fs.readFileSync(source,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
const m = {exports:{}};
vm.runInNewContext(compiled,{module:m,exports:m.exports});
const decode = m.exports.decodeHeartRateMeasurement;
assert.equal(decode(Buffer.from([0,72]).toString('base64')),72);
assert.equal(decode(Buffer.from([1,150,0]).toString('base64')),150);
assert.equal(decode(Buffer.from([0,251]).toString('base64')),null);
assert.equal(decode(Buffer.from([1,150]).toString('base64')),null);
assert.equal(decode('invalid$'),null);
console.log('PASS: standard BLE 8-bit / 16-bit heart-rate payloads and invalid readings');
