/* 小单词机 · 离线词形展开
   浏览器与 Node 共用：给 wf 补上真实屈折（过去式、过去分词、-ing、三单、复数、比较级），
   并保留已经写在 wf 里的派生词。不联网、不调用模型。
   词典不规则表在 morph-table.js，由 scripts/build_morph_table.py 生成。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XDCMorph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CAP = 10;
  var BUCKETS = ['n', 'v', 'adj', 'adv'];
  var TABLE = Object.create(null);
  var INFLECTION_OF = null;

  // 词典没收录、或需要改写的高优先级范式。值是 lemma 以外的形式。
  var MANUAL = {
    be: { v: ['is', 'am', 'are', 'was', 'were', 'been', 'being'] },
    go: { v: ['goes', 'went', 'gone', 'going'], n: ['goes'] },
    have: { v: ['has', 'had', 'having'] },
    do: { v: ['does', 'did', 'done', 'doing'] },
    child: { n: ['children'] },
    ox: { n: ['oxen'] },
    person: { n: ['people', 'persons'] },
    man: { n: ['men'] },
    woman: { n: ['women'] },
    mouse: { n: ['mice'] },
    louse: { n: ['lice'] },
    foot: { n: ['feet'] },
    tooth: { n: ['teeth'] },
    goose: { n: ['geese'] },
    good: { adj: ['better', 'best'] },
    bad: { adj: ['worse', 'worst'], adv: ['worse', 'worst'] },
    far: {
      adj: ['farther', 'further', 'farthest', 'furthest'],
      adv: ['farther', 'further', 'farthest', 'furthest']
    },
    many: { adj: ['more', 'most'] },
    much: { adj: ['more', 'most'], adv: ['more', 'most'] },
    little: { adj: ['less', 'least', 'littler', 'littlest'], adv: ['less', 'least'] },
    lie: { v: ['lies', 'lied', 'lay', 'lain', 'lying'] },
    succeed: { v: ['succeeds', 'succeeded', 'succeeding'] },
    exceed: { v: ['exceeds', 'exceeded', 'exceeding'] },
    proceed: { v: ['proceeds', 'proceeded', 'proceeding'] },
    precede: { v: ['precedes', 'preceded', 'preceding'] },
    embed: { v: ['embeds', 'embedded', 'embedding'] },
    sheep: { n: [] },
    deer: { n: [] },
    series: { n: [] },
    species: { n: [] },
    offspring: { n: [] },
    aircraft: { n: [] }
  };

  // 规则回退时不要再加 -s 的复数同形 / 已经是复数的词。
  var INVARIANT = {
    sheep: 1, deer: 1, series: 1, species: 1, offspring: 1, aircraft: 1,
    means: 1, headquarters: 1, news: 1, mathematics: 1, physics: 1,
    politics: 1, ethics: 1, gymnastics: 1, children: 1, men: 1, women: 1,
    mice: 1, feet: 1, teeth: 1, geese: 1, oxen: 1, people: 1
  };

  var UNCOUNT = {
    information: 1, advice: 1, homework: 1, knowledge: 1, equipment: 1,
    furniture: 1, luggage: 1, baggage: 1, research: 1, evidence: 1,
    feedback: 1, weather: 1, traffic: 1, poetry: 1, machinery: 1,
    scenery: 1, jewellery: 1, jewelry: 1, clothing: 1, progress: 1,
    stuff: 1, slang: 1, luggage: 1, bread: 1, butter: 1, milk: 1,
    sugar: 1, rice: 1, air: 1, luck: 1, homework: 1, news: 1,
    mathematics: 1, physics: 1, economics: 1, politics: 1
  };

  var O_ES = {
    potato: 1, tomato: 1, hero: 1, echo: 1, veto: 1, torpedo: 1,
    embargo: 1, mosquito: 1, volcano: 1, tornado: 1, cargo: 1
  };

  var F_VES = {
    knife: 1, life: 1, wife: 1, leaf: 1, loaf: 1, thief: 1, wolf: 1,
    half: 1, calf: 1, self: 1, elf: 1, shelf: 1, sheaf: 1
  };

  // 多音节、重音在最后才双写。单音节由规则判断。
  var DOUBLING = {
    prefer: 1, occur: 1, refer: 1, admit: 1, commit: 1, permit: 1, submit: 1,
    emit: 1, omit: 1, forget: 1, regret: 1, control: 1, patrol: 1, excel: 1,
    propel: 1, compel: 1, expel: 1, rebel: 1, confer: 1, defer: 1, transfer: 1,
    infer: 1, abhor: 1, allot: 1, annul: 1, concur: 1, incur: 1, recur: 1,
    deter: 1, equip: 1, kidnap: 1, worship: 1, handicap: 1, hiccup: 1,
    travel: 1, cancel: 1, label: 1, model: 1, fuel: 1, dial: 1, signal: 1,
    quarrel: 1, marvel: 1, program: 1, programme: 1
  };

  var NO_COMPARE = {
    first: 1, second: 1, third: 1, last: 1, next: 1, best: 1, worst: 1,
    only: 1, unique: 1, main: 1, whole: 1, dead: 1, alive: 1, daily: 1,
    weekly: 1, monthly: 1, yearly: 1, other: 1, same: 1, own: 1, real: 1,
    right: 1, wrong: 1, chief: 1, former: 1, latter: 1, inner: 1, outer: 1,
    upper: 1, lower: 1, major: 1, minor: 1, perfect: 1, complete: 1,
    excellent: 1, supreme: 1, ideal: 1, entire: 1, mere: 1, utter: 1,
    principal: 1, primary: 1, fun: 1, else: 1
  };

  function installTable(data) {
    var next = Object.create(null);
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(function (key) {
        next[String(key).toLowerCase()] = data[key];
      });
    }
    TABLE = next;
    INFLECTION_OF = null;
  }

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isSingle(text) {
    return /^[a-z]+(?:'[a-z]+)?$/.test(text);
  }

  function syllableCount(word) {
    var s = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return 0;
    var base = s.replace(/e$/, '');
    var groups = base.match(/[aeiouy]+/g);
    var n = groups ? groups.length : 1;
    if (s.length > 2 && s.slice(-2) === 'le' && !/[aeiouy]/.test(s.charAt(s.length - 3))) n += 1;
    return Math.max(1, n);
  }

  function shouldDouble(word) {
    if (!word || word.length < 3) return false;
    if (!/[^aeiou][aeiouy][^aeiouwxy]$/.test(word)) return false;
    if (DOUBLING[word]) return true;
    return syllableCount(word) === 1;
  }

  function thirdPerson(lemma) {
    if (/(?:[szx]|ch|sh)$/.test(lemma)) return lemma + 'es';
    if (/[^aeiou]y$/.test(lemma)) return lemma.slice(0, -1) + 'ies';
    return lemma + 's';
  }

  function dedupe(list) {
    var out = [];
    var seen = Object.create(null);
    (list || []).forEach(function (item) {
      var text = String(item || '').trim().toLowerCase();
      if (!text || seen[text] || text.length > 60) return;
      if (!isSingle(text)) return;
      seen[text] = 1;
      out.push(text);
    });
    return out;
  }

  function withLemma(lemma, extras) {
    return dedupe([lemma].concat(extras || []));
  }

  function ruleVerb(lemma) {
    if (!isSingle(lemma) || lemma.length < 2) return [lemma];
    // 分词当原形会造出 beinged / amazeded。词典里的真正动词（sing/succeed）走表，不受影响。
    if (/(?:ing|ed)$/.test(lemma) && !knownPos(lemma, 'v')) return [lemma];
    var third;
    var past;
    var ing;
    if (shouldDouble(lemma)) {
      third = thirdPerson(lemma);
      var doubled = lemma + lemma.slice(-1);
      past = doubled + 'ed';
      ing = doubled + 'ing';
    } else if (/(?:[szx]|ch|sh)$/.test(lemma)) {
      third = lemma + 'es';
      past = lemma + 'ed';
      ing = lemma + 'ing';
    } else if (/ie$/.test(lemma)) {
      third = lemma + 's';
      past = lemma + 'd';
      ing = lemma.slice(0, -2) + 'ying';
    } else if (/(?:ee|oe|ye)$/.test(lemma)) {
      third = lemma + 's';
      past = lemma + 'd';
      ing = lemma + 'ing';
    } else if (/[^aeiou]y$/.test(lemma)) {
      var stem = lemma.slice(0, -1);
      third = stem + 'ies';
      past = stem + 'ied';
      ing = stem + 'ying';
    } else if (/[^iyeo]e$/.test(lemma)) {
      var stemE = lemma.slice(0, -1);
      third = stemE + 'es';
      past = stemE + 'ed';
      ing = stemE + 'ing';
    } else {
      third = lemma + 's';
      past = lemma + 'ed';
      ing = lemma + 'ing';
    }
    return dedupe([lemma, third, past, ing]);
  }

  function ruleNoun(lemma) {
    if (!isSingle(lemma) || lemma.length < 2) return [lemma];
    if (INVARIANT[lemma] || UNCOUNT[lemma]) return [lemma];
    // analyses/boxes 本身已经是复数，不再叠一层。
    if (/(?:ies|ves|ses|zes|ches|shes|xes|oes|men)$/.test(lemma) && !knownPos(lemma, 'n')) {
      return [lemma];
    }
    // bowling/clothing 这类 -ing 名词，词典未收成可数时不要编 bowlings。
    if (/ing$/.test(lemma) && !knownPos(lemma, 'n')) return [lemma];
    if (F_VES[lemma]) {
      if (lemma.slice(-2) === 'fe') return dedupe([lemma, lemma.slice(0, -2) + 'ves']);
      return dedupe([lemma, lemma.slice(0, -1) + 'ves']);
    }
    if (O_ES[lemma]) return dedupe([lemma, lemma + 'es']);
    if (/[^aeiou]y$/.test(lemma)) return dedupe([lemma, lemma.slice(0, -1) + 'ies']);
    if (/(?:[szx]|ch|sh)$/.test(lemma)) return dedupe([lemma, lemma + 'es']);
    return dedupe([lemma, lemma + 's']);
  }

  function comparativePair(lemma) {
    if (shouldDouble(lemma)) {
      var doubled = lemma + lemma.slice(-1);
      return [doubled + 'er', doubled + 'est'];
    }
    if (/[^aeiou]y$/.test(lemma)) {
      var stem = lemma.slice(0, -1);
      return [stem + 'ier', stem + 'iest'];
    }
    if (/e$/.test(lemma)) return [lemma + 'r', lemma + 'st'];
    return [lemma + 'er', lemma + 'est'];
  }

  function canCompare(lemma) {
    if (!lemma || NO_COMPARE[lemma]) return false;
    if (/(?:ful|ous|ive|ic|al|ed|ing|ly|ish|less|able|ible|ent|ant|ary|ory|ate)$/.test(lemma) && lemma.length > 4) {
      return false;
    }
    var syl = syllableCount(lemma);
    if (syl <= 1) return true;
    if (syl === 2 && /(?:y|er|le|ow)$/.test(lemma)) return true;
    return false;
  }

  function ruleAdj(lemma) {
    if (!isSingle(lemma)) return [lemma];
    if (!canCompare(lemma)) return [lemma];
    var pair = comparativePair(lemma);
    return dedupe([lemma, pair[0], pair[1]]);
  }

  function ruleAdv(lemma) {
    if (!isSingle(lemma)) return [lemma];
    if (/ly$/.test(lemma)) return [lemma];
    return ruleAdj(lemma);
  }

  function rememberInflection(pos, lemma, forms) {
    (forms || []).forEach(function (form) {
      var text = String(form || '').toLowerCase();
      if (!text || text === lemma) return;
      var key = pos + '\n' + text;
      if (!INFLECTION_OF[key]) INFLECTION_OF[key] = lemma;
    });
  }

  function ensureInflectionIndex() {
    if (INFLECTION_OF) return;
    INFLECTION_OF = Object.create(null);
    function walk(source) {
      Object.keys(source).forEach(function (lemma) {
        var row = source[lemma];
        if (!row) return;
        BUCKETS.forEach(function (pos) {
          if (hasOwn(row, pos)) rememberInflection(pos, lemma, row[pos]);
        });
      });
    }
    walk(MANUAL);
    walk(TABLE);
  }

  function isKnownInflection(lemma, pos) {
    ensureInflectionIndex();
    return !!INFLECTION_OF[pos + '\n' + lemma];
  }

  function paradigm(lemma, pos) {
    var low = String(lemma || '').toLowerCase();
    if (!isSingle(low)) return [];
    var manual = MANUAL[low];
    if (manual && hasOwn(manual, pos)) return withLemma(low, manual[pos]);
    var row = TABLE[low];
    if (row && hasOwn(row, pos)) return withLemma(low, row[pos]);
    // 词典里有这个词，但没有这一词性：不要按规则编造 beered / absurds / bowest。
    if (manual || row) return [low];
    // went / beheld / children 是别的词的屈折，不能再当原形变位。
    if (isKnownInflection(low, pos)) return [low];
    if (pos === 'n') return ruleNoun(low);
    if (pos === 'v') return ruleVerb(low);
    if (pos === 'adj') return ruleAdj(low);
    if (pos === 'adv') return ruleAdv(low);
    return [low];
  }

  function knownPos(lemma, pos) {
    var low = String(lemma || '').toLowerCase();
    if (MANUAL[low] && hasOwn(MANUAL[low], pos)) return true;
    if (TABLE[low] && hasOwn(TABLE[low], pos)) return true;
    return false;
  }

  function sharesStem(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var short = a.length <= b.length ? a : b;
    var longer = a.length <= b.length ? b : a;
    if (short.length >= 3 && longer.indexOf(short) === 0) return true;
    var n = 0;
    var m = Math.min(a.length, b.length);
    while (n < m && a.charAt(n) === b.charAt(n)) n += 1;
    if (n >= 4) return true;
    function leStem(w) {
      return w.length > 3 && w.slice(-2) === 'le' ? w.slice(0, -2) : '';
    }
    var sa = leStem(a);
    var sb = leStem(b);
    if (sa && b.indexOf(sa + 'il') === 0) return true;
    if (sb && a.indexOf(sb + 'il') === 0) return true;
    return false;
  }

  function prefixOf(lemma) {
    if (lemma.indexOf('adj') === 0) return 'adj';
    if (lemma.indexOf('adv') === 0) return 'adv';
    if (lemma.indexOf('n') === 0) return 'n';
    if (lemma.indexOf('v') === 0) return 'v';
    return '';
  }

  // 旧数据曾把以 n/v/adj/adv 开头的词形裁掉前缀（advertisement → ertisement）。
  function restoreToken(lemma, token) {
    var raw = String(token || '').trim();
    if (!raw) return [];
    if (raw.indexOf('/') !== -1) {
      var out = [];
      raw.split('/').forEach(function (part) {
        restoreToken(lemma, part).forEach(function (item) { out.push(item); });
      });
      return out;
    }
    if (/\s/.test(raw)) return [];
    var low = raw.toLowerCase();
    if (!/^[a-z][a-z'\-]*$/.test(low)) {
      if (/^[a-zà-ÿ][a-zà-ÿ'\-]*$/i.test(raw) && raw.length >= 2) return [raw.toLowerCase()];
      return [];
    }
    var prefix = prefixOf(lemma);
    if (!prefix) return [low];
    if (low === lemma || sharesStem(lemma, low)) return [low];
    var restored = prefix + low;
    if (restored === lemma || sharesStem(lemma, restored)) return [restored];
    return [low];
  }

  function keepToken(lemma, token) {
    var t = String(token || '').toLowerCase();
    if (!t || t.length > 60) return false;
    if (!/^[a-z][a-z'\-]*$/.test(t)) return /^[a-zà-ÿ][a-zà-ÿ'\-]*$/i.test(t) && t.length >= 2;
    if (t === lemma) return true;
    if (MANUAL[t] || TABLE[t]) return true;
    if (sharesStem(lemma, t)) return true;
    // 两三个字母里既有 was/led/ran，也有裁坏的 et/isa。裁坏的会在 restore 里补回，
    // 这里留下真实的短屈折；明显的残片（原形去掉 n/v/adj/adv 之后）仍丢掉。
    if (t.length <= 3) {
      var prefix = prefixOf(lemma);
      if (prefix && (prefix + t === lemma || lemma.indexOf(prefix + t) === 0)) return false;
      return t.length >= 2;
    }
    return true;
  }

  function detectPos(entry) {
    var tags = { n: false, v: false, adj: false, adv: false };
    var blob = ((entry && entry.pos) || '') + '\n' + ((entry && entry.cn) || '');
    blob = blob.toLowerCase();
    var re = /(?:^|[^a-z])(modalv|adj|adv|vt|vi|aux|prep|conj|pron|num|abbr|det|na|un|art|int|phr|ph|n|v)\./g;
    var match;
    while ((match = re.exec(blob))) {
      var label = match[1];
      if (label === 'n' || label === 'un') tags.n = true;
      else if (label === 'v' || label === 'vt' || label === 'vi' || label === 'aux' || label === 'modalv') tags.v = true;
      else if (label === 'adj') tags.adj = true;
      else if (label === 'adv') tags.adv = true;
    }
    if (/modal\s*v\./.test(blob)) tags.v = true;
    return tags;
  }

  function isClosedClass(pos) {
    return /(?:^|[^a-z])(abbr|prep|conj|det|num|na|phr|ph|int|art|pron)\./.test(String(pos || '').toLowerCase());
  }

  // 只收常见、确实成词的 -ly。-able/-ary 不做开放规则，避免 availably / accessorily。
  var LY_EXACT = {
    public: 'publicly', true: 'truly', whole: 'wholly', due: 'duly', real: 'really',
    full: 'fully', dull: 'dully',
    possible: 'possibly', impossible: 'impossibly', probable: 'probably',
    capable: 'capably', comfortable: 'comfortably', reasonable: 'reasonably',
    considerable: 'considerably', remarkable: 'remarkably', preferable: 'preferably',
    understandable: 'understandably', visible: 'visibly', responsible: 'responsibly',
    terrible: 'terribly', horrible: 'horribly', miserable: 'miserably',
    flexible: 'flexibly', incredible: 'incredibly', sensible: 'sensibly',
    suitable: 'suitably', valuable: 'valuably', notable: 'notably',
    inevitable: 'inevitably', reliable: 'reliably', agreeable: 'agreeably',
    enjoyable: 'enjoyably', fashionable: 'fashionably', favourable: 'favourably',
    favorable: 'favorably', honourable: 'honourably', honorable: 'honorably',
    acceptable: 'acceptably', comparable: 'comparably',
    necessary: 'necessarily', unnecessary: 'unnecessarily',
    ordinary: 'ordinarily', extraordinary: 'extraordinarily',
    secondary: 'secondarily', primary: 'primarily',
    temporary: 'temporarily', voluntary: 'voluntarily',
    satisfactory: 'satisfactorily', imaginary: 'imaginarily',
    simple: 'simply', gentle: 'gently', single: 'singly', double: 'doubly',
    noble: 'nobly', subtle: 'subtly', humble: 'humbly'
  };

  function lyAdverb(adj, asHead) {
    if (!adj) return '';
    var row = TABLE[adj];
    // 词表里的 ly 已经过 wordfreq，优先用它（globally / helpfully / happily）。
    if (row && row.ly) return row.ly;
    if (LY_EXACT[adj]) return LY_EXACT[adj];
    if (/ly$/.test(adj) || adj.length < 4) return '';
    // 词典里有这个形容词但没有达标的副词：不要编造 corally / femaly。
    if (row || MANUAL[adj]) return '';
    if (NO_COMPARE[adj]) return '';
    // 只有自定义词自己的形容词原形才用安全规则，避免 nervelessly。
    if (!asHead) return '';
    if (hasSuffix(adj, 'ful', 3) || hasSuffix(adj, 'less', 3) || hasSuffix(adj, 'ous', 3)) {
      return adj + 'ly';
    }
    if (/[^aeiou]y$/.test(adj) && adj.length >= 5 && adj.length <= 7 &&
        syllableCount(adj) <= 2 && !/(?:ary|ory|ery|ity)$/.test(adj) && adj !== 'nearby') {
      return adj.slice(0, -1) + 'ily';
    }
    return '';
  }

  function hasSuffix(word, suffix, minStem) {
    return word.length >= suffix.length + minStem && word.slice(-suffix.length) === suffix;
  }

  function pushUnique(list, form) {
    var text = String(form || '').trim().toLowerCase();
    if (!text || text.length > 60 || /\s/.test(text)) return;
    if (!/^[a-z][a-z'\-]*$/.test(text)) return;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].toLowerCase() === text) return;
    }
    list.push(text);
  }

  function expandWord(word) {
    if (!word || typeof word !== 'object') return word;
    var surface = String(word.w || '').trim();
    var lemma = surface.toLowerCase();
    var source = word.wf && typeof word.wf === 'object' ? word.wf : {};
    var restored = { n: [], v: [], adj: [], adv: [] };
    BUCKETS.forEach(function (kind) {
      var list = Array.isArray(source[kind]) ? source[kind] : [];
      list.forEach(function (item) {
        restoreToken(lemma, item).forEach(function (token) {
          if (keepToken(lemma, token)) pushUnique(restored[kind], token);
        });
      });
    });

    var explicit = detectPos(word);
    var tags = {
      n: explicit.n,
      v: explicit.v,
      adj: explicit.adj,
      adv: explicit.adv
    };
    var single = isSingle(lemma);
    var capital = /^[A-Z]/.test(surface);
    var closed = isClosedClass(word.pos);
    var anyExplicit = explicit.n || explicit.v || explicit.adj || explicit.adv;

    if (single && !capital) {
      if (!anyExplicit && !closed) {
        var row = TABLE[lemma] || MANUAL[lemma];
        // 没有词性标注时，只把词典里的名词复数补上，避免把过去式误当成动词原形。
        if (row && hasOwn(row, 'n')) tags.n = true;
      }
      // wf 里已经有原形，说明这条词性是数据里标过的。
      // 若这个原形只是同组另一个词的屈折（being ← be），不能据此再把原形当新词性去变位。
      BUCKETS.forEach(function (kind) {
        var hasLemma = false;
        var generated = false;
        var hasRealInflection = false;
        restored[kind].forEach(function (token) {
          if (token === lemma) hasLemma = true;
          else if (isSingle(token) && paradigm(token, kind).indexOf(lemma) !== -1) generated = true;
        });
        if (hasLemma) {
          restored[kind].forEach(function (token) {
            if (token !== lemma && paradigm(lemma, kind).indexOf(token) !== -1) hasRealInflection = true;
          });
        }
        // 只有原形、没有真实屈折时，不因为旧数据把词丢进某个桶就整栏变位。
        if (hasLemma && !generated && (hasRealInflection || knownPos(lemma, kind))) tags[kind] = true;
      });
    }

    var next = { n: [], v: [], adj: [], adv: [] };
    BUCKETS.forEach(function (kind) {
      var para = [];
      if (single && !capital && tags[kind]) para = paradigm(lemma, kind);
      var paraSet = Object.create(null);
      para.forEach(function (form) { paraSet[form] = 1; });
      var related = [];
      restored[kind].forEach(function (token) {
        if (!isSingle(token) || token === lemma || paraSet[token]) return;
        var produced = false;
        restored[kind].forEach(function (other) {
          if (produced || other === token || !isSingle(other)) return;
          if (paradigm(other, kind).indexOf(token) !== -1) produced = true;
        });
        // found 已经是 find 的过去式，不要再按 found 这个动词展开。
        if (produced) return;
        if (!knownPos(token, kind)) {
          // 词典里有这个词、但没有这一词性时，不要再按规则变位。
          if (TABLE[token] || MANUAL[token]) return;
          if (kind === 'n' && /(?:er|or|ist)$/.test(token) && token.length > 4) {
            ruleNoun(token).forEach(function (form) {
              if (form !== token) related.push(form);
            });
          } else if (kind === 'v' && /(?:ise|ize|ate|ify|en)$/.test(token) && token.length > 4) {
            ruleVerb(token).forEach(function (form) {
              if (form !== token) related.push(form);
            });
          }
          return;
        }
        paradigm(token, kind).forEach(function (form) {
          if (form !== token) related.push(form);
        });
      });
      var merged = [];
      para.forEach(function (form) { pushUnique(merged, form); });
      restored[kind].forEach(function (form) { pushUnique(merged, form); });
      related.forEach(function (form) { pushUnique(merged, form); });
      next[kind] = merged.slice(0, CAP);
    });

    if (single && !capital) {
      var bases = [];
      // 只从明确的形容词原形，或词典确认的形容词，派生 -ly。避免 beerily 这类误伤。
      var posField = String(word.pos || '').toLowerCase();
      var posSaysAdj = /(?:^|[^a-z])adj\./.test(posField);
      if (explicit.adj && (posSaysAdj || knownPos(lemma, 'adj'))) {
        bases.push({ w: lemma, head: true });
      }
      restored.adj.forEach(function (form) {
        if (form === lemma) return;
        if (knownPos(form, 'adj') || /(?:ful|less|ous)$/.test(form) || LY_EXACT[form]) {
          bases.push({ w: form, head: false });
        }
      });
      var lySeen = Object.create(null);
      bases.forEach(function (item) {
        var ly = lyAdverb(item.w, item.head);
        if (!ly || lySeen[ly]) return;
        lySeen[ly] = 1;
        pushUnique(next.adv, ly);
      });
      next.adv = next.adv.slice(0, CAP);
    }

    word.wf = next;
    return word;
  }

  // 把 wf 里除原形以外的形式镜像到 forms，已有音标/释义的条目保留。
  function syncForms(word) {
    if (!word || !word.wf || typeof word.wf !== 'object') return word;
    var base = String(word.w || '').trim().toLowerCase();
    var existing = Array.isArray(word.forms) ? word.forms : [];
    var seen = Object.create(null);
    var forms = [];
    function add(text, meta) {
      var value = String(text || '').trim();
      var key = value.toLowerCase();
      if (!value || !key || key === base || seen[key]) return;
      seen[key] = 1;
      forms.push({
        w: value,
        ph: meta && meta.ph ? String(meta.ph) : '',
        pos: meta && meta.pos ? String(meta.pos) : '',
        cn: meta && meta.cn ? String(meta.cn) : ''
      });
    }
    existing.forEach(function (item) {
      if (!item || !item.w) return;
      add(item.w, item);
    });
    BUCKETS.forEach(function (kind) {
      var list = Array.isArray(word.wf[kind]) ? word.wf[kind] : [];
      list.forEach(function (item) { add(item, null); });
    });
    if (forms.length) word.forms = forms;
    else if (Array.isArray(word.forms) && word.forms.length) word.forms = forms;
    return word;
  }

  return {
    CAP: CAP,
    installTable: installTable,
    expandWord: expandWord,
    syncForms: syncForms,
    paradigm: paradigm,
    restoreToken: restoreToken,
    detectPos: detectPos,
    lyAdverb: lyAdverb
  };
});
