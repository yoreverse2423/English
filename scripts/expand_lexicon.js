#!/usr/bin/env node
/* 用 morphology.js 展开 words.js 与 data/progress.json 里的自定义词。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const morph = require(path.join(root, 'morphology.js'));
require(path.join(root, 'morph-table.js'));

const write = process.argv.indexOf('--write') !== -1;
const BUCKETS = ['n', 'v', 'adj', 'adv'];

function loadWords() {
  const text = fs.readFileSync(path.join(root, 'words.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(text, context);
  return { text: text, words: context.window.WORDS };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expandEntry(word) {
  morph.expandWord(word);
  morph.syncForms(word);
  return word;
}

function stable(word) {
  const again = clone(word);
  expandEntry(again);
  return JSON.stringify(again.wf) === JSON.stringify(word.wf) &&
    JSON.stringify(again.forms || null) === JSON.stringify(word.forms || null);
}

function badFragment(lemma, token) {
  const low = String(token || '').toLowerCase();
  if (!low || low === lemma) return false;
  let prefix = '';
  if (lemma.indexOf('adj') === 0) prefix = 'adj';
  else if (lemma.indexOf('adv') === 0) prefix = 'adv';
  else if (lemma.indexOf('n') === 0) prefix = 'n';
  else if (lemma.indexOf('v') === 0) prefix = 'v';
  if (!prefix) return false;
  if (lemma.slice(prefix.length) === low) return true;
  if (low.length >= 4 && lemma.slice(prefix.length).indexOf(low) === 0 && (prefix + low) === lemma.slice(0, prefix.length + low.length) && prefix + low !== low) {
    // token 仍是被裁掉前缀的词干，而不是另一个完整单词。
    return low.length + prefix.length <= lemma.length + 1 && !morph.paradigm;
  }
  return false;
}

function reorder(word) {
  const order = ['id', 'w', 'ph', 'pos', 'cn', 'col', 'ex', 'book', 'unit', 'tag', 'phSrc', 'forms', 'wf', 'freq'];
  const out = {};
  order.forEach(function (key) {
    if (word[key] !== undefined && word[key] !== null) out[key] = word[key];
  });
  Object.keys(word).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(out, key) && word[key] != null) out[key] = word[key];
  });
  if (out.forms && !out.forms.length) delete out.forms;
  return out;
}

function protectedEqual(before, after) {
  const keys = ['id', 'w', 'ph', 'pos', 'cn', 'col', 'ex', 'book', 'unit', 'tag', 'freq', 'phSrc'];
  return keys.every(function (key) {
    return JSON.stringify(before[key] === undefined ? null : before[key]) ===
      JSON.stringify(after[key] === undefined ? null : after[key]);
  });
}

function bucketCount(words, kind) {
  let n = 0;
  words.forEach(function (word) {
    const list = word.wf && word.wf[kind];
    if (list && list.length) n += 1;
  });
  return n;
}

function main() {
  const loaded = loadWords();
  const original = loaded.words.map(clone);
  const words = loaded.words;
  let unstable = 0;
  let protectedDrift = 0;
  const fragments = [];
  words.forEach(function (word, index) {
    expandEntry(word);
    if (!stable(word)) unstable += 1;
    if (!protectedEqual(original[index], word)) protectedDrift += 1;
    const lemma = String(word.w || '').toLowerCase();
    BUCKETS.forEach(function (kind) {
      (word.wf[kind] || []).forEach(function (token) {
        const low = String(token).toLowerCase();
        let prefix = '';
        if (lemma.indexOf('adj') === 0) prefix = 'adj';
        else if (lemma.indexOf('adv') === 0) prefix = 'adv';
        else if (lemma.indexOf('n') === 0) prefix = 'n';
        else if (lemma.indexOf('v') === 0) prefix = 'v';
        if (prefix && low === lemma.slice(prefix.length)) fragments.push(word.w + ' ' + kind + ' ' + token);
      });
    });
  });

  const samples = ['exchange', 'help', 'analyse', 'analysis', 'advance', 'advertise', 'adjust', 'narrow', 'visa', 'view', 'volunteer', 'freeze', 'organise', 'study', 'run', 'good', 'child', 'be', 'go', 'beautiful', 'big', 'happy', 'information', 'accompany', 'nation', 'normal', 'defend'];
  console.log('words', words.length, 'unstable', unstable, 'protectedDrift', protectedDrift, 'fragments', fragments.length);
  if (fragments.length) console.log(fragments.slice(0, 30));
  BUCKETS.forEach(function (kind) {
    const before = original.filter(function (word) { return word.wf && word.wf[kind] && word.wf[kind].length > 1; }).length;
    const after = words.filter(function (word) { return word.wf && word.wf[kind] && word.wf[kind].length > 1; }).length;
    console.log(kind, 'buckets>1', before, '->', after, 'nonempty', bucketCount(words, kind));
  });
  samples.forEach(function (name) {
    const word = words.find(function (item) { return String(item.w).toLowerCase() === name; });
    if (!word) {
      console.log('\n' + name, '(not in lexicon)');
      console.log(morph.paradigm(name, 'v'), morph.paradigm(name, 'n'), morph.paradigm(name, 'adj'));
      return;
    }
    console.log('\n' + word.w, word.pos);
    console.log(JSON.stringify(word.wf));
  });

  // 自定义词抽查：过去式必须能从规则/表里得到。
  ['go', 'be', 'child', 'good', 'study', 'stop', 'city', 'knife', 'sheep', 'happy', 'big'].forEach(function (name) {
    const fake = { w: name, pos: name === 'child' || name === 'city' || name === 'knife' || name === 'sheep' ? 'n.' : (name === 'good' || name === 'happy' || name === 'big' ? 'adj.' : 'v.'), cn: '', wf: { n: [], v: [], adj: [], adv: [] } };
    if (name === 'study' || name === 'go') fake.pos = 'v. / n.';
    if (name === 'be') fake.pos = 'v.';
    expandEntry(fake);
    console.log('FAKE', name, JSON.stringify(fake.wf));
  });

  if (unstable || protectedDrift || fragments.length) {
    console.error('expansion checks failed');
    process.exit(1);
  }

  if (!write) {
    console.log('dry-run only');
    return;
  }

  const rewritten = words.map(reorder);
  const text = loaded.text;
  const start = text.indexOf('window.WORDS=');
  const remapAt = text.indexOf(';\nwindow.WORD_REMAP=');
  let header = text.slice(0, start);
  header = header.replace(
    'wf 为 n/v/adj/adv 词形，freq 为高考频次（高/中/低）',
    'wf 为 n/v/adj/adv 全部真实词形（屈折+派生），freq 为高考频次（高/中/低）'
  );
  const next = header + 'window.WORDS=' + JSON.stringify(rewritten) + text.slice(remapAt);
  fs.writeFileSync(path.join(root, 'words.js'), next);

  const progressPath = path.join(root, 'data', 'progress.json');
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const custom = progress.data && progress.data.customWords;
  if (Array.isArray(custom)) {
    custom.forEach(expandEntry);
  }
  let dumped = JSON.stringify(progress, null, 2);
  if (!dumped.endsWith('\n')) dumped += '\n';
  fs.writeFileSync(progressPath, dumped);
  console.log('wrote words.js and progress.json');
}

main();
