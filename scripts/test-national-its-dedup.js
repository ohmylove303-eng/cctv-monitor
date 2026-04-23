const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadBuildNationalItsDedupKey() {
    const filePath = path.resolve(__dirname, '../lib/national-its.ts');
    const source = fs.readFileSync(filePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: filePath,
    });

    const exports = {};
    const module = { exports };
    const evaluator = new Function('exports', 'module', transpiled.outputText);
    evaluator(exports, module);
    return module.exports.buildNationalItsDedupKey;
}

function dedupe(items, buildKey) {
    return Array.from(new Map(items.map((item) => [buildKey(item), item])).values());
}

function run() {
    const buildKey = loadBuildNationalItsDedupKey();

    const duplicateNameDifferentCoord = [
        {
            cctvname: '[제2외곽순환선] 북청라대교',
            coordx: 126.621015569,
            coordy: 37.544503388,
            cctvurl: 'https://cctvsec.ktict.co.kr/2727/a',
        },
        {
            cctvname: '[제2외곽순환선] 북청라대교',
            coordx: 126.622043716,
            coordy: 37.578949895,
            cctvurl: 'https://cctvsec.ktict.co.kr/2729/b',
        },
    ];

    const exactDuplicates = [
        {
            cctvname: '[경인선] 부평',
            coordx: 126.7,
            coordy: 37.5,
            cctvurl: 'https://same.example/stream.m3u8',
        },
        {
            cctvname: '[경인선] 부평',
            coordx: 126.7,
            coordy: 37.5,
            cctvurl: 'https://same.example/stream.m3u8',
        },
    ];

    const explicitIdVariants = [
        {
            id: 'ITS-001',
            cctvname: '[영동선] 군자교',
            coordx: 126.8,
            coordy: 37.4,
            cctvurl: 'https://example.com/1.m3u8',
        },
        {
            id: 'ITS-001',
            cctvname: '[영동선] 군자교',
            coordx: 126.81,
            coordy: 37.41,
            cctvurl: 'https://example.com/2.m3u8',
        },
    ];

    const coordKey = buildKey(duplicateNameDifferentCoord[0]);
    const coordKey2 = buildKey(duplicateNameDifferentCoord[1]);
    assert.notEqual(coordKey, coordKey2, 'same-name cameras with different coordinates must not collapse');

    const dedupedDifferentCoord = dedupe(duplicateNameDifferentCoord, buildKey);
    assert.equal(dedupedDifferentCoord.length, 2, 'same-name cameras with different coordinates should both survive');

    const dedupedExact = dedupe(exactDuplicates, buildKey);
    assert.equal(dedupedExact.length, 1, 'truly identical items should still dedupe');

    const dedupedByExplicitId = dedupe(explicitIdVariants, buildKey);
    assert.equal(dedupedByExplicitId.length, 1, 'explicit IDs should stay the strongest dedupe key');

    console.log('ok - national ITS dedup regression checks passed');
}

run();
