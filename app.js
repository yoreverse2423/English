/* =========================================================
   小单词机 · 纯静态背单词应用
   数据保存在 localStorage（key: bcz_vocab_v1）
   ========================================================= */

(function () {
  'use strict';

  /* ---------- 常量 ---------- */

  const STORAGE_KEY = 'bcz_vocab_v1';
  // 令牌单独存放，不进入学习数据、备份文件或仓库。
  const GITHUB_TOKEN_KEY = 'bcz_github_token';
  const GITHUB_SYNC_PREFS_KEY = 'bcz_github_sync_prefs';
  const GITHUB_REPO = 'yoreverse2423/English';
  const GITHUB_PROGRESS_PATH = 'data/progress.json';
  const GITHUB_AUTO_UPLOAD_GAP = 10 * 60 * 1000;
  const DEEPSEEK_KEY = 'bcz_deepseek_key';
  const DEEPSEEK_PREFS_KEY = 'bcz_deepseek_prefs';
  const READING_HISTORY_KEY = 'bcz_reading_history';
  const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
  const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
  const READING_WORD_CAP = 50;
  const READING_HISTORY_LIMIT = 20;
  // 阅读生词补全：收录全部未收录词，按首次出现顺序分批请求，每批最多 18 个。
  const OOV_ENRICH_BATCH = 18;
  // 纯功能词不补全，避免把冠词、代词、助动词等塞进词库。
  const OOV_STOP_WORDS = new Set([
    'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'is', 'are',
    'was', 'were', 'be', 'been', 'being', 'am', 'it', 'its', 'as', 'by', 'with', 'from',
    'that', 'this', 'these', 'those', 'he', 'she', 'they', 'we', 'you', 'i', 'his', 'her',
    'their', 'our', 'your', 'not', 'no', 'yes', 'do', 'does', 'did', 'done', 'have', 'has',
    'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall', 'than',
    'then', 'so', 'if', 'me', 'my', 'mine', 'him', 'them', 'us', 'who', 'whom', 'whose',
    'which', 'what', 'when', 'where', 'why', 'how', 'there', 'here', 'some', 'any', 'all',
    'each', 'both', 'either', 'neither', 'another', 'other', 'such', 'every', 'very', 'too',
    'just', 'only', 'also', 'still', 'yet', 'ever', 'never', 'always', 'often', 'sometimes',
    'usually', 'really', 'quite', 'rather', 'almost', 'enough', 'again', 'up', 'down', 'out',
    'off', 'over', 'under', 'about', 'into', 'onto', 'upon', 'within', 'without', 'through',
    'across', 'against', 'among', 'around', 'between', 'during', 'before', 'after', 'while',
    'because', 'though', 'although', 'unless', 'until', 'since', 'whether',
    "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't",
    "hadn't", "won't", "can't", "couldn't", "shouldn't", "wouldn't", "mustn't", "needn't",
    "i'm", "i've", "i'll", "i'd", "you're", "you've", "you'll", "you'd", "he's", "he'd",
    "she's", "she'd", "it's", "it'd", "we're", "we've", "we'll", "we'd", "they're", "they've",
    "they'll", "they'd", "that's", "there's", "what's", "who's", "let's"
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    dailyNew: 20,
    autoPronounce: true
  });

  // 艾宾浩斯 6 个阶段对应的复习间隔：1、2、4、7、15、30 天。
  const STAGE_INTERVALS = [
    1 * 24 * 60 * 60 * 1000,
    2 * 24 * 60 * 60 * 1000,
    4 * 24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
    15 * 24 * 60 * 60 * 1000,
    30 * 24 * 60 * 60 * 1000
  ];
  const STAGE_COUNT = STAGE_INTERVALS.length;
  const FIVE_MINUTES = 5 * 60 * 1000;
  const MAX_DAILY_NEW = 200;
  const BROWSE_PAGE_SIZE = 50;
  const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
  const ROUTES = ['home', 'study', 'browse', 'review', 'reading', 'stats', 'settings', 'books'];
  const PAGE_TITLES = {
    home: '小单词机 · 背单词',
    study: '学习 · 小单词机',
    browse: '词表 · 小单词机',
    review: '复习 · 小单词机',
    reading: '每日阅读 · 小单词机',
    stats: '统计 · 小单词机',
    settings: '设置 · 小单词机',
    books: '选择词书 · 小单词机'
  };

  // 自定义词统一放进虚拟的“自定义”册，方便和内置词书一起选择。
  const CUSTOM_BOOK_ID = 'custom';
  const CUSTOM_BOOK_NAME = '自定义';
  const CUSTOM_UNIT_ID = 'custom-unit';
  const CUSTOM_UNIT_TITLE = '自定义词';
  // 未保存过选择时的默认单元：必修第一册 Welcome Unit。
  const DEFAULT_UNIT_ID = 'compulsory-1-u0';

  const ICON_PATHS = {
    'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
    flame: '<path d="M12.4 2.7c.8 3-.6 4.4-2 6-1.3 1.4-2.6 3-2.6 5.3a5.7 5.7 0 0 0 11.4 0c0-2.7-1.5-4.8-3-6.5-.3 1.1-.8 1.9-1.7 2.4.2-2.8-.4-5.3-2.1-7.2Z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/><path d="M8 7.5h8"/>',
    sliders: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    speaker: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/>',
    eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>',
    'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-3.2 3.9"/><path d="M6.3 6.5C3.9 8.3 2.5 12 2.5 12S6 18 12 18a10 10 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 4h16"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.2"/><path d="M20 4v7h-7"/>',
    'chevron-right': '<path d="m9 5 7 7-7 7"/>',
    chart: '<path d="M4 20V11"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M22 20H2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/>',
    read: '<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M15 3.5V7h4"/><path d="M8.5 11h7"/><path d="M8.5 14.5h7"/><path d="M8.5 18h4"/>'
  };

  /* ---------- DOM ---------- */

  const appEl = document.getElementById('app');
  const views = {
    home: document.getElementById('view-home'),
    study: document.getElementById('view-study'),
    browse: document.getElementById('view-browse'),
    review: document.getElementById('view-review'),
    stats: document.getElementById('view-stats'),
    reading: document.getElementById('view-reading'),
    settings: document.getElementById('view-settings'),
    books: document.getElementById('view-books')
  };
  const tabbarEl = document.getElementById('tabbar');
  const toastEl = document.getElementById('toast');
  const importInput = document.getElementById('import-backup-input');

  /* ---------- 运行时状态 ---------- */

  let storageEnabled = true;
  let storageWarned = false;
  let initialToast = '';
  let state = loadState();
  let activeWordsCache = null;
  let activeWordMap = null;
  let currentRoute = '';
  let session = null;
  let studyLocked = false;
  let reviewSession = null;
  // 只背不考核的浏览状态；不会写回任何复习进度。
  let reviewBrowse = null;
  // 听力听写是可选巩固，同样不写回艾宾浩斯进度。
  let reviewListen = null;
  let browseQuery = '';
  let browseFilter = 'all';
  let browseFreqFilter = 'all';
  let browseBookFilter = 'all';
  let browseUnitFilter = 'all';
  let browseLimit = BROWSE_PAGE_SIZE;
  let expandedBooks = null;
  let toastTimer = null;
  let activeAudio = null;
  let githubSyncInFlight = false;
  let githubSyncStatus = { state: 'idle', message: '' };
  let githubSyncPrefs = loadGithubSyncPrefs();
  let readingBusy = false;
  let readingPhase = '';
  let readingError = '';
  let readingLookup = '';
  let readingActiveId = '';
  // 阅读生词补全的后台状态；不阻塞文章显示。
  let readingEnrichBusy = false;
  let readingEnrichPassage = '';
  let readingEnrichPending = '';
  // 阅读查词索引：覆盖全部词条与 forms，查词不再受词书选择影响。
  let readingWordIndex = null;

  /* ---------- 基础工具 ---------- */

  function icon(name, size) {
    const sizeValue = size || 18;
    const paths = ICON_PATHS[name] || '';
    return (
      '<svg class="icon" width="' + sizeValue + '" height="' + sizeValue +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths + '</svg>'
    );
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.round(number);
  }

  function toTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function toText(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
      return value.map(toText).filter(Boolean).join('；');
    }
    return '';
  }

  function formatPhonetic(value) {
    const text = toText(value);
    if (!text) return '';
    if (/^[\/\[].*[\/\]]$/.test(text)) return text;
    return '/' + text.replace(/^\/|\/$/g, '') + '/';
  }

  // 词形以 wf 为主：n. helper · v. help · adj. helpful · adv. helpfully。
  // 旧数据没有 wf 时，回退到 forms 的紧凑展示。
  const WF_LABELS = { n: 'n.', v: 'v.', adj: 'adj.', adv: 'adv.' };
  function formsLineHtml(word) {
    const wf = word && word.wf && typeof word.wf === 'object' ? word.wf : null;
    if (wf) {
      const parts = [];
      ['n', 'v', 'adj', 'adv'].forEach(function (kind) {
        const list = Array.isArray(wf[kind]) ? wf[kind].filter(Boolean) : [];
        if (!list.length) return;
        parts.push(WF_LABELS[kind] + ' ' + list.join(' / '));
      });
      if (parts.length) {
        return '<p class="word-forms">词形：' + escapeHtml(parts.join(' · ')) + '</p>';
      }
    }
    const forms = word && Array.isArray(word.forms) ? word.forms.filter(function (form) {
      return form && form.w;
    }) : [];
    if (!forms.length) return '';
    const shown = forms.slice(0, 4).map(function (form) {
      return escapeHtml([form.w, form.pos, form.cn].filter(Boolean).join(' '));
    });
    const suffix = forms.length > shown.length ? ' …' : '';
    return '<p class="word-forms">变形：' + shown.join(' · ') + suffix + '</p>';
  }


  function getDayKey(value) {
    const date = value instanceof Date ? value : new Date(value === undefined ? Date.now() : value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function getDateLabel(date) {
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 · 周' + WEEKDAY_NAMES[date.getDay()];
  }

  function formatRelativeTime(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '马上';
    const minutes = Math.max(1, Math.ceil(milliseconds / 60000));
    if (minutes < 60) return minutes + ' 分钟后';
    const hours = Math.round(milliseconds / 3600000);
    if (hours < 24) return hours + ' 小时后';
    const days = Math.round(milliseconds / 86400000);
    return days + ' 天后';
  }

  /* ---------- 数据规范化 ---------- */

  function defaultState() {
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      progress: Object.create(null),
      daily: Object.create(null),
      customWords: [],
      // null 表示从未保存过选择，使用默认单元；空数组表示用户主动一个都不选。
      selectedUnits: null
    };
  }

  function sanitizeSettings(raw) {
    const settings = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== 'object') return settings;

    if (raw.dailyNew !== undefined) {
      const dailyNew = toInteger(raw.dailyNew, DEFAULT_SETTINGS.dailyNew);
      settings.dailyNew = clamp(dailyNew, 0, MAX_DAILY_NEW);
    }
    if (typeof raw.autoPronounce === 'boolean') {
      settings.autoPronounce = raw.autoPronounce;
    }
    return settings;
  }

  // 部分词库会把词性同时写进释义（如 pos: "n."、cn: "n. 交换……"）；
  // 展示时只保留词性徽标，避免同一个词性出现两次。
  function stripDuplicatePos(meaning, pos) {
    if (!meaning || !pos) return meaning;
    const lowerMeaning = meaning.toLowerCase();
    const lowerPos = pos.trim().toLowerCase();
    if (!lowerPos || !lowerMeaning.startsWith(lowerPos)) return meaning;
    if (!/\s/.test(meaning.charAt(pos.trim().length))) return meaning;
    const rest = meaning.slice(pos.trim().length).trim();
    return rest || meaning;
  }

  // 从 window.BOOKS 中查单元所属的册，用于补齐缺失的 book / tag。
  function findUnitMeta(unitId) {
    if (!unitId) return null;
    const books = Array.isArray(window.BOOKS) ? window.BOOKS : [];
    for (let i = 0; i < books.length; i += 1) {
      const book = books[i];
      if (!book || !Array.isArray(book.units)) continue;
      for (let j = 0; j < book.units.length; j += 1) {
        const unit = book.units[j];
        if (!unit || toText(unit.id) !== unitId) continue;
        return {
          bookId: toText(book.id),
          bookName: toText(book.name) || toText(book.id),
          unitId: unitId,
          unitTitle: toText(unit.title) || unitId
        };
      }
    }
    return null;
  }

  function findBookName(bookId) {
    if (!bookId) return '';
    const books = Array.isArray(window.BOOKS) ? window.BOOKS : [];
    for (let i = 0; i < books.length; i += 1) {
      if (books[i] && toText(books[i].id) === bookId) {
        return toText(books[i].name) || bookId;
      }
    }
    return bookId;
  }

  function normalizeWord(raw, fallbackTag) {
    if (!raw || typeof raw !== 'object') return null;

    const word = toText(raw.w).replace(/\s+/g, ' ');
    if (!word) return null;
    const pos = toText(raw.pos);
    const meaning = stripDuplicatePos(toText(raw.cn), pos);

    const col = [];
    if (Array.isArray(raw.col)) {
      raw.col.forEach(function (item) {
        if (typeof item === 'string') {
          const parts = item.split('|');
          const en = toText(parts[0]);
          if (en) col.push({ en: en, cn: toText(parts[1] || '') });
          return;
        }
        if (!item || typeof item !== 'object') return;
        const en = toText(item.en);
        const cn = toText(item.cn);
        if (en || cn) col.push({ en: en, cn: cn });
      });
    } else if (typeof raw.col === 'string') {
      raw.col.split(/[;\n；]/).forEach(function (item) {
        const text = toText(item);
        if (text) col.push({ en: text, cn: '' });
      });
    }

    // ex 为 null 或缺失时保留空对象，展示层据此隐藏例句区块。
    let example = { en: '', cn: '' };
    if (raw.ex && typeof raw.ex === 'object') {
      example = {
        en: toText(raw.ex.en),
        cn: toText(raw.ex.cn)
      };
    } else if (typeof raw.ex === 'string') {
      example = { en: toText(raw.ex), cn: '' };
    }

    let unit = toText(raw.unit);
    let book = toText(raw.book);
    const unitMeta = findUnitMeta(unit);
    if (!book && unitMeta) book = unitMeta.bookId;

    let tag = toText(raw.tag);
    if (!tag && unitMeta) tag = unitMeta.bookName + ' · ' + unitMeta.unitTitle;
    if (!tag && book) tag = findBookName(book);
    if (!tag) tag = fallbackTag || '未分类';

    // forms 只是展示用的挂靠变形，不参与学习/复习队列。
    const forms = [];
    if (Array.isArray(raw.forms)) {
      raw.forms.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        const formWord = toText(item.w);
        if (!formWord) return;
        forms.push({
          w: formWord,
          ph: toText(item.ph),
          pos: toText(item.pos),
          cn: toText(item.cn)
        });
      });
    }

    // wf 是结构化词形：n / v / adj / adv 四类，缺字段或空数组都安全。
    const wf = { n: [], v: [], adj: [], adv: [] };
    if (raw.wf && typeof raw.wf === 'object') {
      ['n', 'v', 'adj', 'adv'].forEach(function (kind) {
        const list = Array.isArray(raw.wf[kind]) ? raw.wf[kind] : [];
        const seen = new Set();
        list.forEach(function (item) {
          const formWord = toText(item).replace(/\s+/g, ' ').slice(0, 60);
          const key = formWord.toLowerCase();
          if (!formWord || seen.has(key) || wf[kind].length >= 10) return;
          seen.add(key);
          wf[kind].push(formWord);
        });
      });
    }

    const rawFreq = toText(raw.freq);
    const freq = rawFreq === '高' || rawFreq === '中' || rawFreq === '低' ? rawFreq : '';

    return {
      id: toText(raw.id),
      w: word,
      ph: toText(raw.ph),
      pos: pos,
      cn: meaning,
      col: col.slice(0, 5),
      ex: example,
      forms: forms,
      wf: wf,
      freq: freq,
      tag: tag,
      book: book,
      unit: unit
    };
  }

  function wordKey(wordOrText) {
    const raw = wordOrText && typeof wordOrText === 'object' ? wordOrText.w : wordOrText;
    const text = toText(raw);
    if (!text) return '';
    return (typeof text.normalize === 'function' ? text.normalize('NFKC') : text).toLowerCase();
  }

  // 自定义词的 id 由单词本身稳定生成，因此旧数据中“以单词为键”的进度也能迁移过来。
  function normalizeCustomWord(raw) {
    const word = normalizeWord(raw, CUSTOM_BOOK_NAME);
    if (!word) return null;
    const key = wordKey(word);
    if (!key) return null;
    word.id = 'custom:' + key;
    word.book = CUSTOM_BOOK_ID;
    word.unit = CUSTOM_UNIT_ID;
    word.tag = CUSTOM_BOOK_NAME;
    return word;
  }

  function sanitizeCustomWords(raw) {
    if (!Array.isArray(raw)) return [];
    const result = [];
    const seen = new Set();
    raw.forEach(function (item) {
      const word = normalizeCustomWord(item);
      if (!word) return;
      const key = wordKey(word);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(word);
    });
    return result;
  }

  function sanitizeProgress(raw) {
    const result = Object.create(null);
    if (!raw || typeof raw !== 'object') return result;

    Object.keys(raw).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
      const item = raw[key];
      if (!item || typeof item !== 'object') return;

      // 旧版本最多有 8 个阶段；超过 6 的旧进度安全收敛到第 6 阶段。
      const stage = clamp(toInteger(item.stage, 0), 0, STAGE_COUNT);
      const learnedAt = toTimestamp(item.learnedAt);
      const lastReviewedAt = toTimestamp(item.lastReviewedAt);
      let masteredAt = toTimestamp(item.masteredAt);
      if (!masteredAt && (item.mastered === true || item.mastered === 1)) {
        masteredAt = lastReviewedAt || learnedAt || Date.now();
      }
      const nextReviewAt = masteredAt ? 0 : toTimestamp(item.nextReviewAt);

      const lastResult = item.lastResult === 'known' || item.lastResult === 'fuzzy' || item.lastResult === 'unknown'
        ? item.lastResult
        : null;

      result[key] = {
        stage: masteredAt ? STAGE_COUNT : stage,
        nextReviewAt: nextReviewAt,
        learnedAt: learnedAt,
        lastReviewedAt: lastReviewedAt,
        masteredAt: masteredAt || null,
        reviews: Math.max(0, toInteger(item.reviews, 0)),
        lapses: Math.max(0, toInteger(item.lapses, 0)),
        lastResult: lastResult
      };
    });
    return result;
  }

  function sanitizeDaily(raw) {
    const result = Object.create(null);
    if (!raw || typeof raw !== 'object') return result;

    Object.keys(raw).forEach(function (key) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      const item = raw[key];
      if (!item || typeof item !== 'object') return;
      result[key] = {
        learned: Math.max(0, toInteger(item.learned, 0)),
        reviewed: Math.max(0, toInteger(item.reviewed, 0))
      };
    });
    return result;
  }

  function sanitizeSelectedUnits(raw) {
    if (!Array.isArray(raw)) return null;
    const result = [];
    const seen = new Set();
    raw.forEach(function (item) {
      const id = toText(item);
      if (!id || seen.has(id)) return;
      seen.add(id);
      result.push(id);
    });
    return result;
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('备份内容不是有效的对象');
    }

    return {
      version: 1,
      settings: sanitizeSettings(raw.settings),
      progress: sanitizeProgress(raw.progress),
      daily: sanitizeDaily(raw.daily),
      customWords: sanitizeCustomWords(raw.customWords),
      selectedUnits: sanitizeSelectedUnits(raw.selectedUnits)
    };
  }

  /* ---------- 本地存储 ---------- */

  function loadState() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageEnabled = false;
      initialToast = '浏览器禁用了本地存储，学习记录将无法长期保存。';
      return defaultState();
    }

    if (!raw) return defaultState();

    try {
      return sanitizeState(JSON.parse(raw));
    } catch (error) {
      initialToast = '本地学习数据读取失败，已使用一份新的记录。';
      console.warn('读取本地学习数据失败：', error);
      return defaultState();
    }
  }

  function saveState() {
    if (!storageEnabled) {
      if (!storageWarned) {
        storageWarned = true;
        showToast('无法写入本地存储，当前学习记录只保留在本页。', 'error');
      }
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      storageWarned = true;
      console.warn('保存学习数据失败：', error);
      showToast('保存失败，请检查浏览器存储空间。', 'error');
    }
  }

  /* ---------- 词库 ---------- */

  function invalidateWordCache() {
    activeWordsCache = null;
    activeWordMap = null;
    readingWordIndex = null;
  }

  function getWordData() {
    if (activeWordsCache && activeWordMap) {
      return { words: activeWordsCache, map: activeWordMap };
    }

    const words = [];
    const map = new Map();

    // 以 id 为唯一键；同一个单词出现在不同单元时会是两条独立记录。
    function addWord(normalized, fallbackId) {
      if (!normalized) return;
      const id = normalized.id || fallbackId;
      if (!id || map.has(id)) return;
      normalized.id = id;
      normalized.key = id;
      words.push(normalized);
      map.set(id, normalized);
    }

    const builtinWords = Array.isArray(window.WORDS) ? window.WORDS : [];
    builtinWords.forEach(function (raw, index) {
      const normalized = normalizeWord(raw, '');
      if (!normalized) return;
      addWord(normalized, 'builtin-' + index + ':' + (wordKey(normalized) || 'word'));
    });
    state.customWords.forEach(function (raw) {
      addWord(normalizeCustomWord(raw), '');
    });

    activeWordsCache = words;
    activeWordMap = map;
    return { words: words, map: map };
  }

  function getActiveWords() {
    return getWordData().words;
  }

  function getProgress(word) {
    if (!word) return null;
    const key = word.key || word.id;
    return key && state.progress[key] ? state.progress[key] : null;
  }

  /* ---------- 词书与选择 ---------- */

  // 返回内置七册（外加有自定义词时的“自定义”册）的规范化结构。
  function getBooks() {
    const books = [];
    const seenBooks = new Set();
    const rawBooks = Array.isArray(window.BOOKS) ? window.BOOKS : [];

    rawBooks.forEach(function (rawBook, bookIndex) {
      if (!rawBook || typeof rawBook !== 'object') return;
      const id = toText(rawBook.id) || ('book-' + bookIndex);
      if (!id || seenBooks.has(id)) return;
      seenBooks.add(id);

      const units = [];
      const seenUnits = new Set();
      (Array.isArray(rawBook.units) ? rawBook.units : []).forEach(function (rawUnit, unitIndex) {
        if (!rawUnit || typeof rawUnit !== 'object') return;
        const unitId = toText(rawUnit.id) || (id + '-u' + unitIndex);
        if (!unitId || seenUnits.has(unitId)) return;
        seenUnits.add(unitId);
        units.push({
          id: unitId,
          title: toText(rawUnit.title) || ('Unit ' + (unitIndex + 1)),
          n: Math.max(0, toInteger(rawUnit.n, 0))
        });
      });

      books.push({
        id: id,
        name: toText(rawBook.name) || id,
        units: units,
        isCustom: false
      });
    });

    if (state.customWords.length && !seenBooks.has(CUSTOM_BOOK_ID)) {
      books.push({
        id: CUSTOM_BOOK_ID,
        name: CUSTOM_BOOK_NAME,
        units: [{
          id: CUSTOM_UNIT_ID,
          title: CUSTOM_UNIT_TITLE,
          n: state.customWords.length
        }],
        isCustom: true
      });
    }

    return books;
  }

  function getDefaultSelectedUnits() {
    const allUnitIds = [];
    getBooks().forEach(function (book) {
      book.units.forEach(function (unit) {
        allUnitIds.push(unit.id);
      });
    });
    if (allUnitIds.includes(DEFAULT_UNIT_ID)) return [DEFAULT_UNIT_ID];
    return allUnitIds.length ? [allUnitIds[0]] : [];
  }

  // selectedUnits 为 null 时沿用默认选择（必修第一册 Welcome Unit）。
  function getSelectedUnits() {
    return Array.isArray(state.selectedUnits)
      ? state.selectedUnits.slice()
      : getDefaultSelectedUnits();
  }

  function getSelectedUnitSet() {
    return new Set(getSelectedUnits());
  }

  function getSelectionSummary() {
    const selected = getSelectedUnitSet();
    const units = [];
    getBooks().forEach(function (book) {
      book.units.forEach(function (unit) {
        if (!selected.has(unit.id)) return;
        units.push({
          bookId: book.id,
          bookName: book.name,
          unitId: unit.id,
          title: unit.title,
          tag: book.name + ' · ' + unit.title,
          n: unit.n
        });
      });
    });

    const wordCount = getActiveWords().filter(function (word) {
      return selected.has(word.unit || '');
    }).length;

    return {
      units: units,
      unitCount: units.length,
      bookCount: new Set(units.map(function (unit) {
        return unit.bookId;
      })).size,
      wordCount: wordCount
    };
  }

  // 兼容旧版本：旧进度以单词文本为键，这里迁移到该单词第一次出现的 id。
  function migrateLegacyProgress() {
    const idSet = new Set();
    const firstIdByWord = new Map();
    const builtinWords = Array.isArray(window.WORDS) ? window.WORDS : [];
    // words.js 同时提供被移除变体的旧 id → 宿主词 id 映射。
    const wordRemap = window.WORD_REMAP && typeof window.WORD_REMAP === 'object' && !Array.isArray(window.WORD_REMAP)
      ? window.WORD_REMAP
      : {};

    builtinWords.forEach(function (raw, index) {
      const normalized = normalizeWord(raw, '');
      if (!normalized) return;
      const id = toText(raw.id) || ('builtin-' + index + ':' + (wordKey(normalized) || 'word'));
      idSet.add(id);
      const key = wordKey(normalized);
      if (key && !firstIdByWord.has(key)) firstIdByWord.set(key, id);
    });

    state.customWords.forEach(function (word) {
      const id = word.id || ('custom:' + wordKey(word));
      if (!id) return;
      idSet.add(id);
      const key = wordKey(word);
      if (key && !firstIdByWord.has(key)) firstIdByWord.set(key, id);
    });

    let changed = false;

    // 嵌套变形词条已合并到宿主词：把旧 id 的进度迁移到宿主词上。
    Object.keys(state.progress).forEach(function (key) {
      const host = wordRemap[key];
      if (typeof host !== 'string' || !host || host === key) return;
      // 宿主已有进度时保留宿主的记录，避免重复。
      if (!state.progress[host]) {
        state.progress[host] = state.progress[key];
      }
      delete state.progress[key];
      changed = true;
    });

    Object.keys(state.progress).forEach(function (key) {
      if (idSet.has(key)) return;
      const targetId = firstIdByWord.get(wordKey(key));
      if (!targetId || targetId === key) return;
      // 目标 id 已有进度时以新记录为准，避免重复。
      if (!state.progress[targetId]) {
        state.progress[targetId] = state.progress[key];
      }
      delete state.progress[key];
      changed = true;
    });

    if (changed) saveState();
  }

  function getDueWords(now) {
    const currentTime = now === undefined ? Date.now() : now;
    return getActiveWords()
      .filter(function (word) {
        const progress = getProgress(word);
        return Boolean(
          progress &&
          !progress.masteredAt &&
          progress.nextReviewAt > 0 &&
          progress.nextReviewAt <= currentTime
        );
      })
      .sort(function (a, b) {
        const pa = getProgress(a);
        const pb = getProgress(b);
        return (pa.nextReviewAt - pb.nextReviewAt) || a.w.localeCompare(b.w);
      });
  }

  // 新词只从所选单元按词表顺序抽取；复习（getDueWords）则不受选择影响。
  function getNewWords() {
    const selected = getSelectedUnitSet();
    return getActiveWords().filter(function (word) {
      return selected.has(word.unit || '') && !getProgress(word);
    });
  }

  function getNextReviewTime() {
    const now = Date.now();
    let nextTime = 0;
    getActiveWords().forEach(function (word) {
      const progress = getProgress(word);
      if (!progress || progress.masteredAt || !progress.nextReviewAt) return;
      if (progress.nextReviewAt > now && (!nextTime || progress.nextReviewAt < nextTime)) {
        nextTime = progress.nextReviewAt;
      }
    });
    return nextTime;
  }

  /* ---------- 日期与统计 ---------- */

  function ensureDaily(key) {
    if (!state.daily[key]) {
      state.daily[key] = { learned: 0, reviewed: 0 };
    }
    return state.daily[key];
  }

  function getDaily(key) {
    return state.daily[key] || { learned: 0, reviewed: 0 };
  }

  function getNewTodayCount() {
    const today = getDayKey();
    const dailyLearned = getDaily(today).learned;

    // 兼容备份文件缺少 daily 字段的情况：以词条首次学习时间兜底。
    let introducedToday = 0;
    getActiveWords().forEach(function (word) {
      const progress = getProgress(word);
      if (progress && progress.learnedAt && getDayKey(progress.learnedAt) === today) {
        introducedToday += 1;
      }
    });

    return Math.max(dailyLearned, introducedToday);
  }

  function getRemainingNewCount() {
    return Math.max(0, state.settings.dailyNew - getNewTodayCount());
  }

  // 每日新词数是“软目标”：每轮仍按目标数量取词，完成后可以继续。
  function getNewBatchSize() {
    return state.settings.dailyNew > 0 ? state.settings.dailyNew : 0;
  }

  function getAvailableNewCount() {
    return Math.min(getNewBatchSize(), getNewWords().length);
  }

  function hasActivityOn(key) {
    const day = state.daily[key];
    return Boolean(day && (day.learned > 0 || day.reviewed > 0));
  }

  function getStreak() {
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);

    // 今天还没学，则从昨天开始判断，保证白天打开时已有连续记录不会归零。
    if (!hasActivityOn(getDayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;
    let guard = 0;
    while (guard < 3660 && hasActivityOn(getDayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      guard += 1;
    }
    return streak;
  }

  function getWeekSeries() {
    const series = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);

    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() - offset);
      const key = getDayKey(date);
      const day = getDaily(key);
      series.push({
        key: key,
        date: date,
        weekday: WEEKDAY_NAMES[date.getDay()],
        month: date.getMonth() + 1,
        day: date.getDate(),
        learned: day.learned,
        reviewed: day.reviewed,
        total: day.learned + day.reviewed,
        isToday: offset === 0
      });
    }
    return series;
  }

  function getStats() {
    const words = getActiveWords();
    const now = Date.now();
    let learned = 0;
    let mastered = 0;
    let learning = 0;
    let due = 0;
    const masteredFreq = { '高': 0, '中': 0, '低': 0 };

    words.forEach(function (word) {
      const progress = getProgress(word);
      if (!progress) return;
      learned += 1;
      if (progress.masteredAt) {
        mastered += 1;
        if (masteredFreq[word.freq] !== undefined) masteredFreq[word.freq] += 1;
      } else {
        learning += 1;
        if (progress.nextReviewAt > 0 && progress.nextReviewAt <= now) {
          due += 1;
        }
      }
    });

    const today = getDaily(getDayKey());
    return {
      total: words.length,
      learned: learned,
      mastered: mastered,
      masteredFreq: masteredFreq,
      learning: learning,
      due: due,
      newCount: Math.max(0, words.length - learned),
      newToday: getNewTodayCount(),
      reviewToday: today.reviewed,
      streak: getStreak(),
      week: getWeekSeries()
    };
  }

  /* ---------- 学习队列与进度更新 ---------- */

  // 学习页只负责新词；到期词统一进入「复习」模块。
  function buildStudyQueue() {
    return getNewWords()
      .slice(0, getNewBatchSize())
      .map(function (word) {
        return { word: word, isNew: true, isRetry: false };
      });
  }

  function intervalForStage(stage) {
    const safeStage = clamp(toInteger(stage, 1), 1, STAGE_COUNT);
    return STAGE_INTERVALS[safeStage - 1];
  }

  // 阅读页把词库里的生词加入复习：只建立进度，不计入今日新学数量。
  function ensureLearningProgress(word) {
    if (!word) return null;
    const existing = getProgress(word);
    if (existing) return existing;
    const now = Date.now();
    const progress = {
      stage: 0,
      nextReviewAt: now + FIVE_MINUTES,
      learnedAt: now,
      lastReviewedAt: 0,
      masteredAt: null,
      reviews: 0,
      lapses: 0,
      lastResult: null
    };
    state.progress[word.key] = progress;
    return progress;
  }

  // 直接标为已掌握：跳过阶段推进和复习排期。
  function markWordMasteredDirect(word) {
    if (!word) return false;
    const key = word.key || word.id;
    if (!key) return false;

    let progress = getProgress(word);
    if (progress && progress.masteredAt) return false;

    const now = Date.now();
    if (!progress) {
      progress = {
        stage: 0,
        nextReviewAt: 0,
        learnedAt: now,
        lastReviewedAt: 0,
        masteredAt: null,
        reviews: 0,
        lapses: 0,
        lastResult: null
      };
      state.progress[key] = progress;
    }

    progress.stage = STAGE_COUNT;
    progress.masteredAt = now;
    progress.nextReviewAt = 0;
    if (!progress.learnedAt) progress.learnedAt = now;
    progress.lastReviewedAt = now;
    progress.lastResult = 'known';
    saveState();
    return true;
  }

  function makeSession(queue) {
    return {
      queue: queue,
      total: queue.length,
      done: 0,
      ratings: { known: 0, fuzzy: 0, unknown: 0 },
      revealed: false
    };
  }

  function startStudy() {
    const queue = buildStudyQueue();
    if (!queue.length) {
      if (getSelectionSummary().unitCount === 0 && getActiveWords().length) {
        showToast('还没有选择学习单元，请先到「选择词书」勾选。');
      } else if (state.settings.dailyNew === 0 && getNewWords().length) {
        showToast('每日新词已暂停，可在设置中开启。');
      } else if (getDueWords().length) {
        showToast('新词已经学完，可以去「复习」巩固待复习的词。');
      } else {
        showToast('所选单元暂时没有可学习的新词了。');
      }
      return;
    }
    session = makeSession(queue);
    navigate('study');
  }

  // 学习与复习共用的评分调度；复习传入 isIntroduction: false。
  function applyRating(word, rating, options) {
    if (!word || (rating !== 'known' && rating !== 'fuzzy' && rating !== 'unknown')) return null;

    const now = Date.now();
    let progress = getProgress(word);
    const isIntroduction = options && typeof options.isIntroduction === 'boolean'
      ? options.isIntroduction
      : !progress;

    if (!progress) {
      progress = {
        stage: 0,
        nextReviewAt: now + FIVE_MINUTES,
        learnedAt: now,
        lastReviewedAt: 0,
        masteredAt: null,
        reviews: 0,
        lapses: 0,
        lastResult: null
      };
      state.progress[word.key] = progress;
    }

    const daily = ensureDaily(getDayKey(now));
    if (isIntroduction) {
      daily.learned += 1;
    } else {
      daily.reviewed += 1;
    }

    progress.reviews += 1;
    progress.lastReviewedAt = now;
    progress.lastResult = rating;

    let toastMessage = '';

    if (rating === 'known') {
      if (progress.stage >= STAGE_COUNT) {
        // 走完 6 个阶段后再次答“认识”，即视为已掌握。
        progress.stage = STAGE_COUNT;
        progress.masteredAt = now;
        progress.nextReviewAt = 0;
        toastMessage = '已掌握「' + word.w + '」';
      } else {
        progress.stage += 1;
        progress.nextReviewAt = now + intervalForStage(progress.stage);
      }
    } else if (rating === 'fuzzy') {
      // 模糊：阶段不变，5 分钟后再出现。
      progress.nextReviewAt = now + FIVE_MINUTES;
      toastMessage = '已安排 5 分钟后复习';
    } else {
      // 不认识：阶段重置，并在学习页本轮稍后再出现一次。
      progress.stage = 0;
      progress.nextReviewAt = now + FIVE_MINUTES;
      progress.lapses += 1;
      toastMessage = '已加入本轮稍后复习';
    }

    return {
      isIntroduction: isIntroduction,
      toastMessage: toastMessage
    };
  }

  function rateCurrent(rating) {
    if (studyLocked || !session || !session.queue.length) return;
    if (rating !== 'known' && rating !== 'fuzzy' && rating !== 'unknown') return;

    studyLocked = true;
    appEl.classList.add('is-answering');

    const card = session.queue.shift();
    const word = card.word;
    const result = applyRating(word, rating);

    session.ratings[rating] += 1;
    if (!card.isRetry) {
      session.done = Math.min(session.total, session.done + 1);
    }

    if (rating === 'unknown') {
      const retryCard = { word: word, isNew: false, isRetry: true };
      // 隔两三个词再出现；如果已经是最后一个，则马上再巩固一次。
      const insertAt = Math.min(2, session.queue.length);
      session.queue.splice(insertAt, 0, retryCard);
    }

    session.revealed = false;
    const sessionEnded = session.queue.length === 0;
    saveState();
    renderStudy();

    if (result && result.toastMessage) showToast(result.toastMessage);
    if (sessionEnded) maybeAutoUploadProgress();

    window.setTimeout(function () {
      studyLocked = false;
      appEl.classList.remove('is-answering');
    }, 320);
  }

  function masterCurrentWord() {
    if (studyLocked || !session || !session.queue.length) return;
    const card = session.queue[0];
    const word = card.word;
    const progress = getProgress(word);
    if (progress && progress.masteredAt) {
      showToast('这个词已掌握。');
      return;
    }

    const ok = window.confirm('确定已完全掌握「' + word.w + '」吗？确认后会直接标为已掌握，不再进入复习计划。');
    if (!ok) return;
    if (!markWordMasteredDirect(word)) return;

    session.queue.shift();
    if (!card.isRetry) {
      session.done = Math.min(session.total, session.done + 1);
    }
    session.revealed = false;
    const sessionEnded = session.queue.length === 0;
    renderStudy();
    showToast('已掌握「' + word.w + '」');
    if (sessionEnded) maybeAutoUploadProgress();
  }

  function continueStudy() {
    const queue = buildStudyQueue();
    if (!queue.length) {
      showToast('暂时没有新的学习任务了。');
      navigate('home');
      return;
    }
    session = makeSession(queue);
    renderStudy();
  }

  /* ---------- 发音 ---------- */

  function stopPronunciation() {
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.removeAttribute('src');
        activeAudio.load();
      } catch (error) {
        // 忽略停止音频时的浏览器差异。
      }
      activeAudio = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (error) {
        // 忽略。
      }
    }
  }

  function speakFallback(word, notify) {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      if (notify) showToast('当前浏览器不支持语音播放。', 'error');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      if (notify) showToast('发音播放失败，请检查网络或浏览器设置。', 'error');
    }
  }

  function playPronunciation(word, type, notify) {
    stopPronunciation();
    const text = toText(word);
    if (!text) return;

    const voiceType = Number(type) === 1 ? 1 : 2;
    const shouldNotify = Boolean(notify);

    try {
      // 有道词典音频；type=1 英音，type=2 美音。
      const url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&type=' + voiceType;
      const audio = new Audio(url);
      activeAudio = audio;
      audio.preload = 'auto';

      let fallbackUsed = false;
      const fallback = function () {
        if (fallbackUsed) return;
        fallbackUsed = true;
        if (activeAudio !== audio) return;
        speakFallback(text, shouldNotify);
      };

      audio.addEventListener('error', fallback, { once: true });
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {
          if (activeAudio === audio) fallback();
        });
      }
    } catch (error) {
      speakFallback(text, shouldNotify);
    }
  }

  /* ---------- Toast ---------- */

  function showToast(message, type) {
    if (!toastEl) return;
    window.clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = 'toast is-visible' + (type === 'error' ? ' is-error' : '');
    toastTimer = window.setTimeout(function () {
      toastEl.className = 'toast';
    }, 2600);
  }

  /* ---------- 首页 ---------- */

  function renderHome() {
    const stats = getStats();
    const dailyTarget = state.settings.dailyNew;
    const availableNew = getAvailableNewCount();
    const due = stats.due;
    const hasWords = stats.total > 0;
    const nextReviewAt = getNextReviewTime();
    const selection = getSelectionSummary();
    const selectionEmpty = selection.unitCount === 0;
    const goalDone = dailyTarget > 0 && stats.newToday >= dailyTarget;
    const targetText = dailyTarget > 0 ? stats.newToday + ' / ' + dailyTarget : '已暂停';
    const newProgress = dailyTarget > 0
      ? Math.min(100, Math.round((stats.newToday / dailyTarget) * 100))
      : 0;
    const masteryProgress = stats.learned > 0
      ? Math.min(100, Math.round((stats.mastered / stats.learned) * 100))
      : 0;

    let ctaText = '暂无新词';
    if (!hasWords) {
      ctaText = '词库还没有单词';
    } else if (selectionEmpty) {
      ctaText = '去选择词书';
    } else if (dailyTarget === 0) {
      ctaText = '新词学习已暂停';
    } else if (availableNew > 0 && goalDone) {
      ctaText = '继续学新词';
    } else if (availableNew > 0) {
      ctaText = '学新词';
    }

    let helperText = '';
    if (!hasWords) {
      helperText = '在设置中粘贴自定义词，或替换 words.js 即可开始。';
    } else if (selectionEmpty) {
      helperText = '还没有选择学习单元，先到「选择词书」勾选想学的单元。';
    } else if (availableNew > 0 && goalDone) {
      helperText = '今日目标已完成，仍可继续学新词' + (due > 0 ? '；另有 ' + due + ' 个词待复习。' : '。');
    } else if (availableNew > 0) {
      helperText = '状态不错，趁现在认识 ' + availableNew + ' 个新词。';
    } else if (due > 0) {
      helperText = '新词已经学完，去「复习」巩固 ' + due + ' 个到期词。';
    } else if (dailyTarget === 0 && stats.newCount > 0) {
      helperText = '每日新词已暂停，可去设置里恢复学习新词。';
    } else if (nextReviewAt) {
      helperText = '今天的任务完成了，' + formatRelativeTime(nextReviewAt - Date.now()) + '会有新的复习。';
    } else if (stats.newCount > 0) {
      helperText = '所选单元的新词学完了，可到「选择词书」再选几个单元。';
    } else {
      helperText = '所有词都已掌握，去词表里随意巩固一下也很好。';
    }

    let selectionTitle = '尚未选择学习单元';
    let selectionDesc = '点此勾选词书中的单元，新词会按词表顺序出现';
    if (selection.unitCount === 1) {
      selectionTitle = selection.units[0].tag;
      selectionDesc = selection.wordCount + ' 个词 · 点此调整';
    } else if (selection.unitCount > 1) {
      selectionTitle = selection.units[0].tag + ' 等 ' + selection.unitCount + ' 个单元';
      selectionDesc = '来自 ' + selection.bookCount + ' 册 · 共 ' + selection.wordCount + ' 个词';
    }

    const ctaHtml = selectionEmpty && hasWords
      ? '<button class="hero-cta" type="button" data-nav="books">' +
          '<span>去选择词书</span>' +
          '<span class="hero-cta-arrow">' + icon('arrow-right', 17) + '</span>' +
        '</button>'
      : '<button class="hero-cta" type="button" data-action="start-study"' + (availableNew === 0 ? ' disabled' : '') + '>' +
          '<span>' + ctaText + '</span>' +
          '<span class="hero-cta-arrow">' + icon('arrow-right', 17) + '</span>' +
        '</button>';
    const reviewCtaHtml = due > 0
      ? '<button class="hero-review-cta" type="button" data-nav="review">' +
          '<span class="hero-review-copy">' + icon('refresh', 16) +
            '<span>复习</span><strong>' + due + '</strong><small>个待复习</small>' +
          '</span>' +
          '<span class="hero-review-arrow">' + icon('chevron-right', 15) + '</span>' +
        '</button>'
      : '';

    const today = new Date();
    const dateText = getDateLabel(today);

    views.home.innerHTML =
      '<div class="page home-page">' +
        '<header class="home-head">' +
          '<div>' +
            '<p class="date-label">' + escapeHtml(dateText) + '</p>' +
            '<h1>今天，记几个词。</h1>' +
          '</div>' +
          '<button class="streak-chip" type="button" data-nav="stats" aria-label="连续打卡 ' + stats.streak + ' 天，查看统计">' +
            icon('flame', 17) + '<strong>' + stats.streak + '</strong><span>天</span>' +
          '</button>' +
        '</header>' +

        '<section class="hero-card" aria-labelledby="hero-title">' +
          '<p class="hero-kicker" id="hero-title">今日学习</p>' +
          '<div class="hero-stats">' +
            '<div class="hero-stat">' +
              '<span class="hero-number">' + due + '</span><span class="hero-unit">个</span>' +
              '<span class="hero-label">待复习</span>' +
            '</div>' +
            '<div class="hero-divider" aria-hidden="true"></div>' +
            '<div class="hero-stat">' +
              '<span class="hero-number">' + availableNew + '</span><span class="hero-unit">个</span>' +
              '<span class="hero-label">可学新词</span>' +
            '</div>' +
          '</div>' +
          '<p class="hero-copy">' + escapeHtml(helperText) + '</p>' +
          ctaHtml +
          reviewCtaHtml +
          '<div class="hero-foot">' +
            '<span>' + (dailyTarget > 0 ? '今日新词 ' + stats.newToday + ' / ' + dailyTarget : '今日新词已暂停') + '</span>' +
            '<span>目标可超额完成 · 复习单独进行</span>' +
          '</div>' +
        '</section>' +

        '<section class="section selection-section">' +
          '<div class="section-head"><h2>当前词书</h2><button class="text-link" type="button" data-nav="books">管理 ' + icon('chevron-right', 13) + '</button></div>' +
          '<button class="link-card selection-card" type="button" data-nav="books" aria-label="选择词书和单元">' +
            '<span class="link-icon">' + icon('book', 19) + '</span>' +
            '<span class="link-copy"><strong>' + escapeHtml(selectionTitle) + '</strong><span>' + escapeHtml(selectionDesc) + '</span></span>' +
            '<span class="link-arrow">' + icon('chevron-right', 15) + '</span>' +
          '</button>' +
        '</section>' +

        '<div class="stats-grid">' +
          '<div class="stat-card"><span class="stat-label">已学</span><span class="stat-value">' + stats.learned + '<small>/ ' + stats.total + '</small></span></div>' +
          '<div class="stat-card"><span class="stat-label">已掌握</span><span class="stat-value">' + stats.mastered + '<small>个</small></span></div>' +
          '<div class="stat-card"><span class="stat-label">今日学习</span><span class="stat-value">' + stats.newToday + '<small>词</small></span></div>' +
          '<div class="stat-card"><span class="stat-label">今日复习</span><span class="stat-value">' + stats.reviewToday + '<small>次</small></span></div>' +
        '</div>' +

        '<section class="section">' +
          '<div class="section-head"><h2>今日进度</h2><button class="text-link" type="button" data-nav="stats">查看统计 ' + icon('chevron-right', 13) + '</button></div>' +
          '<div class="panel">' +
            '<div class="goal-row">' +
              '<div class="goal-head"><strong>新词目标</strong><span>' + targetText + '</span></div>' +
              '<div class="progress-track" role="progressbar" aria-label="今日新词进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + newProgress + '"><span class="progress-fill" style="width:' + newProgress + '%"></span></div>' +
            '</div>' +
            '<div class="goal-row">' +
              '<div class="goal-head"><strong>掌握进度</strong><span>' + masteryProgress + '%</span></div>' +
              '<div class="progress-track" role="progressbar" aria-label="已学单词掌握进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + masteryProgress + '"><span class="progress-fill is-warm" style="width:' + masteryProgress + '%"></span></div>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="section">' +
          '<div class="section-head"><h2>继续看看</h2></div>' +
          '<div class="link-grid">' +
            '<button class="link-card" type="button" data-nav="browse">' +
              '<span class="link-icon">' + icon('book', 19) + '</span>' +
              '<span class="link-copy"><strong>词表浏览</strong><span>共 ' + stats.total + ' 个单词</span></span>' +
              '<span class="link-arrow">' + icon('chevron-right', 15) + '</span>' +
            '</button>' +
            '<button class="link-card" type="button" data-nav="reading">' +
              '<span class="link-icon">' + icon('read', 19) + '</span>' +
              '<span class="link-copy"><strong>每日阅读</strong><span>用今日生词做一篇高考阅读</span></span>' +
              '<span class="link-arrow">' + icon('chevron-right', 15) + '</span>' +
            '</button>' +
            '<button class="link-card" type="button" data-nav="settings">' +
              '<span class="link-icon">' + icon('sliders', 19) + '</span>' +
              '<span class="link-copy"><strong>学习设置</strong><span>每日 ' + dailyTarget + ' 个新词</span></span>' +
              '<span class="link-arrow">' + icon('chevron-right', 15) + '</span>' +
            '</button>' +
          '</div>' +
        '</section>' +

        '<p class="muted-note">学习记录会自动保存在本机浏览器。</p>' +
      '</div>';
  }

  /* ---------- 学习页 ---------- */

  function getCardMeta(card) {
    const progress = getProgress(card.word);
    if (card.isNew) {
      return { badge: '新词', badgeClass: 'is-new', stage: '首次学习' };
    }
    if (card.isRetry) {
      return {
        badge: '再认一次',
        badgeClass: 'is-review',
        stage: '稍后巩固'
      };
    }
    return {
      badge: '复习',
      badgeClass: 'is-review',
      stage: progress ? '阶段 ' + progress.stage + ' / ' + STAGE_COUNT : '复习'
    };
  }

  function meaningCoverHtml() {
    return (
      '<button class="meaning-cover" type="button" data-action="reveal-meaning" aria-label="显示释义、搭配和例句">' +
        '<span class="meaning-cover-icon">' + icon('eye', 22) + '</span>' +
        '<span class="meaning-cover-title">轻点显示释义</span>' +
        '<span class="meaning-cover-sub">先在心里回想一下，再看答案</span>' +
      '</button>'
    );
  }

  function meaningContentHtml(word) {
    const collocations = Array.isArray(word.col) ? word.col.filter(function (item) {
      return item && (item.en || item.cn);
    }) : [];

    let html = '<div class="meaning-content" tabindex="-1">';
    html +=
      '<div class="definition-line">' +
        (word.pos ? '<span class="pos-pill">' + escapeHtml(word.pos) + '</span>' : '') +
        '<p class="definition-text">' + escapeHtml(word.cn || '暂无释义') + '</p>' +
      '</div>';

    const formsLine = formsLineHtml(word);
    if (formsLine) {
      html += formsLine;
    }

    if (collocations.length) {
      html +=
        '<div class="info-block">' +
          '<p class="info-title">常用搭配</p>' +
          '<ul class="collocation-list">' +
            collocations.map(function (item) {
              return (
                '<li class="collocation-item">' +
                  '<span class="collocation-en">' + escapeHtml(item.en) + '</span>' +
                  (item.cn ? '<span class="collocation-cn">' + escapeHtml(item.cn) + '</span>' : '') +
                '</li>'
              );
            }).join('') +
          '</ul>' +
        '</div>';
    }

    if (word.ex && (word.ex.en || word.ex.cn)) {
      html +=
        '<div class="info-block">' +
          '<p class="info-title">例句</p>' +
          '<blockquote class="example-box">' +
            (word.ex.en ? '<p class="example-en">' + escapeHtml(word.ex.en) + '</p>' : '') +
            (word.ex.cn ? '<p class="example-cn">' + escapeHtml(word.ex.cn) + '</p>' : '') +
          '</blockquote>' +
        '</div>';
    }

    html += '</div>';
    return html;
  }

  function studyCardHtml(card) {
    const word = card.word;
    const meta = getCardMeta(card);
    const phonetic = formatPhonetic(word.ph);
    const longClass = word.w.length > 14 ? ' is-long' : '';
    const wordAttr = escapeAttr(word.w);

    return (
      '<div class="study-main">' +
        '<article class="word-card" aria-label="单词 ' + escapeAttr(word.w) + '">' +
          '<div class="card-meta">' +
            '<div class="card-meta-left">' +
              '<span class="mode-badge ' + meta.badgeClass + '">' + meta.badge + '</span>' +
              freqTagHtml(word) +
              (word.tag ? '<span class="card-tag">' + escapeHtml(word.tag) + '</span>' : '') +
            '</div>' +
            '<span class="stage-label">' + escapeHtml(meta.stage) + '</span>' +
          '</div>' +
          '<div class="word-main">' +
            '<h2 class="word-title' + longClass + '">' + escapeHtml(word.w) + '</h2>' +
            (phonetic ? '<p class="word-phonetic">' + escapeHtml(phonetic) + '</p>' : '') +
            '<div class="audio-actions">' +
              '<button class="audio-pill" type="button" data-speak="2" data-word="' + wordAttr + '" aria-label="播放 ' + wordAttr + ' 的美式发音">' + icon('speaker', 15) + '<span>美</span></button>' +
              '<button class="audio-pill" type="button" data-speak="1" data-word="' + wordAttr + '" aria-label="播放 ' + wordAttr + ' 的英式发音">' + icon('speaker', 15) + '<span>英</span></button>' +
            '</div>' +
          '</div>' +
          '<div class="meaning-zone">' +
            (session.revealed ? meaningContentHtml(word) : meaningCoverHtml()) +
          '</div>' +
        '</article>' +
        '<div class="study-bottom">' +
          '<div class="rating-bar" role="group" aria-label="选择记忆程度">' +
            '<button class="rating-btn rating-known" type="button" data-rating="known" aria-label="认识，短按进入下一阶段；长按直接标为已掌握">' +
              '<span class="rating-icon">✓</span>' +
              '<span class="rating-copy"><b>认识</b><small>长按掌握</small></span>' +
            '</button>' +
            '<button class="rating-btn rating-fuzzy" type="button" data-rating="fuzzy" aria-label="模糊，5分钟后再复习">' +
              '<span class="rating-icon">~</span>' +
              '<span class="rating-copy"><b>模糊</b><small>有点忘</small></span>' +
            '</button>' +
            '<button class="rating-btn rating-unknown" type="button" data-rating="unknown" aria-label="不认识，重新学习并在本轮稍后再现">' +
              '<span class="rating-icon">×</span>' +
              '<span class="rating-copy"><b>不认识</b><small>重学</small></span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function summaryHtml() {
    const canContinue = buildStudyQueue().length > 0;
    return (
      '<div class="summary-shell">' +
        '<div class="summary-card">' +
          '<div class="summary-orbit"><span class="summary-icon">' + icon('check', 26) + '</span></div>' +
          '<p class="summary-eyebrow">本组完成</p>' +
          '<h2 class="summary-title">今天又向目标<br>近了一步。</h2>' +
          '<p class="summary-copy">共完成 ' + session.total + ' 个单词，每一次回想都在加深记忆。</p>' +
          '<div class="summary-metrics">' +
            '<div class="summary-metric"><strong>' + session.ratings.known + '</strong><span>认识</span></div>' +
            '<div class="summary-metric"><strong>' + session.ratings.fuzzy + '</strong><span>模糊</span></div>' +
            '<div class="summary-metric"><strong>' + session.ratings.unknown + '</strong><span>不认识</span></div>' +
          '</div>' +
          '<div class="summary-actions">' +
            (canContinue ? '<button class="btn btn-primary btn-block" type="button" data-action="continue-study">继续学习</button>' : '') +
            '<button class="btn ' + (canContinue ? 'btn-secondary' : 'btn-primary') + ' btn-block" type="button" data-action="finish-session">回到首页</button>' +
          '</div>' +
          '<p class="summary-note">模糊和不认识的词已按计划安排复习时间。</p>' +
        '</div>' +
      '</div>'
    );
  }

  function renderStudy() {
    if (!session) {
      navigate('home');
      return;
    }

    const card = session.queue[0] || null;
    const hasCard = Boolean(card);
    const progressPercent = session.total > 0
      ? Math.round((session.done / session.total) * 100)
      : 100;
    let rightLabel = '完成';
    if (card) {
      const meta = getCardMeta(card);
      rightLabel = meta.badge === '新词' ? '新词' : meta.stage;
    }

    views.study.innerHTML =
      '<div class="study-page">' +
        '<h1 class="sr-only">学习单词</h1>' +
        '<header class="study-topbar">' +
          '<button class="icon-button study-back" type="button" data-action="exit-study" aria-label="退出学习，返回首页">' + icon('arrow-left', 20) + '</button>' +
          '<div class="study-progress">' +
            '<div class="study-progress-copy"><span><strong>' + session.done + ' / ' + session.total + '</strong> 已完成</span><span>' + escapeHtml(rightLabel) + '</span></div>' +
            '<div class="study-progress-track" role="progressbar" aria-label="本轮学习进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPercent + '"><span class="study-progress-fill" style="width:' + progressPercent + '%"></span></div>' +
          '</div>' +
        '</header>' +
        (hasCard ? studyCardHtml(card) : summaryHtml()) +
      '</div>';

    if (hasCard && state.settings.autoPronounce && !session.revealed) {
      playPronunciation(card.word.w, 2, false);
    }
  }

  function revealMeaning() {
    if (!session || !session.queue.length || session.revealed) return;
    session.revealed = true;
    const card = session.queue[0];
    const zone = views.study.querySelector('.meaning-zone');
    if (!zone) return;
    zone.innerHTML = meaningContentHtml(card.word);
    const content = zone.querySelector('.meaning-content');
    if (content) {
      try {
        content.focus({ preventScroll: true });
      } catch (error) {
        // 不支持 focus 参数时忽略。
      }
    }
  }

  function exitStudy() {
    stopPronunciation();
    session = null;
    navigate('home');
  }

  /* ---------- 复习 ---------- */

  function getUnmasteredWords() {
    return getActiveWords().filter(function (word) {
      const progress = getProgress(word);
      return Boolean(progress && !progress.masteredAt);
    }).sort(function (a, b) {
      const pa = getProgress(a);
      const pb = getProgress(b);
      const na = pa && pa.nextReviewAt > 0 ? pa.nextReviewAt : Number.MAX_SAFE_INTEGER;
      const nb = pb && pb.nextReviewAt > 0 ? pb.nextReviewAt : Number.MAX_SAFE_INTEGER;
      return (na - nb) || a.w.localeCompare(b.w);
    });
  }

  function shuffleItems(items) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const value = result[index];
      result[index] = result[swapIndex];
      result[swapIndex] = value;
    }
    return result;
  }

  function hashText(text) {
    const value = String(text || '');
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededFraction(seed, index) {
    let value = (seed + Math.imul(index + 1, 2654435761)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function getReviewModeLabel(mode) {
    if (mode === 'spell') return '分格拼写';
    if (mode === 'mixed') return '混合';
    return '三选一';
  }

  function getWordPromptText(word, promptType) {
    return promptType === 'cn' ? word.w : word.cn;
  }

  function buildChoiceOptions(word, promptType) {
    const correctText = getWordPromptText(word, promptType);
    const selectedUnits = getSelectedUnitSet();
    const allWords = getActiveWords();
    const isUsable = function (candidate) {
      if (!candidate || candidate.key === word.key) return false;
      const text = getWordPromptText(candidate, promptType);
      return Boolean(text) && text.toLowerCase() !== correctText.toLowerCase();
    };

    // 优先使用所选单元内的词做干扰项，不够时再从整个词库补齐。
    let pool = allWords.filter(function (candidate) {
      return selectedUnits.has(candidate.unit || '') && isUsable(candidate);
    });
    if (pool.length < 2) pool = allWords.filter(isUsable);

    const seen = new Set([correctText.toLowerCase()]);
    const distractors = [];
    shuffleItems(pool).forEach(function (candidate) {
      if (distractors.length >= 2) return;
      const text = getWordPromptText(candidate, promptType);
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      distractors.push(text);
    });

    const options = [{ text: correctText, isCorrect: true }].concat(
      distractors.map(function (text) {
        return { text: text, isCorrect: false };
      })
    );
    return shuffleItems(options);
  }

  function buildChoiceCard(word) {
    const promptType = Math.random() < 0.5 ? 'en' : 'cn';
    return {
      mode: 'choice',
      word: word,
      promptType: promptType,
      options: buildChoiceOptions(word, promptType),
      pickedIndex: -1,
      correctText: getWordPromptText(word, promptType)
    };
  }

  function buildSpellCard(word) {
    const chars = word.w.split('');
    const letterPositions = [];
    chars.forEach(function (char, index) {
      if (/[A-Za-z]/.test(char)) letterPositions.push(index);
    });

    const hints = new Set();
    let hintCount = 0;
    if (letterPositions.length > 1) {
      hintCount = clamp(Math.round(letterPositions.length * 0.35), 1, letterPositions.length - 1);
    }

    // 使用稳定的词条哈希挑选提示位，并略微优先元音，刷新后提示位置不变。
    const seed = hashText(word.key || word.w);
    const ranked = letterPositions.map(function (index) {
      const vowelBonus = /[aeiou]/i.test(chars[index]) ? -0.16 : 0;
      return { index: index, score: seededFraction(seed, index) + vowelBonus };
    }).sort(function (a, b) {
      return (a.score - b.score) || (a.index - b.index);
    });
    ranked.slice(0, hintCount).forEach(function (item) {
      hints.add(item.index);
    });

    const values = {};
    chars.forEach(function (char, index) {
      if (!/[A-Za-z]/.test(char)) {
        values[index] = char;
      } else {
        values[index] = hints.has(index) ? char : '';
      }
    });

    return {
      mode: 'spell',
      word: word,
      chars: chars,
      hints: hints,
      values: values,
      editableIndices: letterPositions.filter(function (index) {
        return !hints.has(index);
      }),
      correctText: word.w
    };
  }

  function prepareReviewCard() {
    if (!reviewSession) return;
    const word = reviewSession.cards[reviewSession.index];
    if (!word) {
      reviewSession.finished = true;
      reviewSession.cardState = null;
      return;
    }
    const mode = reviewSession.mode === 'mixed'
      ? (Math.random() < 0.5 ? 'choice' : 'spell')
      : reviewSession.mode;
    const cardState = mode === 'spell' ? buildSpellCard(word) : buildChoiceCard(word);
    reviewSession.cardState = cardState;
    reviewSession.answered = false;
    reviewSession.lastResult = null;
  }

  function startReviewSession(mode) {
    if (mode !== 'choice' && mode !== 'spell' && mode !== 'mixed') return;
    const dueWords = getDueWords();
    const early = dueWords.length === 0;
    const source = early ? getUnmasteredWords() : dueWords;
    if (!source.length) {
      showToast(early ? '暂时没有可复习的未掌握词。' : '暂无待复习的单词。');
      return;
    }

    reviewBrowse = null;
    reviewListen = null;
    reviewSession = {
      mode: mode,
      cards: source.slice(),
      index: 0,
      total: source.length,
      answeredCount: 0,
      correct: 0,
      wrong: 0,
      answered: false,
      lastResult: null,
      cardState: null,
      finished: false,
      early: early
    };
    prepareReviewCard();
    applyRoute();
    window.scrollTo(0, 0);
  }

  function reviewStatHtml(count, label) {
    return '<div class="review-stat">' +
      '<strong>' + count + '</strong><span>' + label + '</span>' +
    '</div>';
  }

  function renderReviewHub() {
    const dueCount = getDueWords().length;
    const unmasteredCount = getUnmasteredWords().length;
    const early = dueCount === 0;
    const canReview = dueCount > 0 || unmasteredCount > 0;
    const todayReviewed = getDaily(getDayKey()).reviewed;
    const modes = [
      { id: 'choice', iconName: 'sparkle', title: '三选一', desc: '英中互选，快速唤醒记忆' },
      { id: 'spell', iconName: 'read', title: '分格拼写', desc: '按字母格拼出完整单词' },
      { id: 'mixed', iconName: 'refresh', title: '混合', desc: '两种题型随机切换' },
      { id: 'browse', iconName: 'eye', action: 'start-review-browse', title: '查看复习词来背', desc: '只背不考核，只浏览、不算过关' },
      { id: 'listen', iconName: 'speaker', action: 'start-review-listen', title: '听力听写', desc: '听发音默写整词 · 可选巩固 · 不推进艾宾浩斯' }
    ];

    let sourceNote = '所有已学单词都已掌握，暂时没有待复习的内容。';
    if (dueCount > 0) {
      sourceNote = '按到期时间排序复习；答对会推进下一阶段，答错会重新安排。';
    } else if (unmasteredCount > 0) {
      sourceNote = '暂无到期词，可选择任意模式提前复习 ' + unmasteredCount + ' 个未掌握词。';
    }

    views.review.innerHTML =
      '<div class="page review-page">' +
        '<header class="page-head">' +
          '<div>' +
            '<p class="page-kicker">间隔复习</p>' +
            '<h1 class="page-title">复习</h1>' +
            '<p class="page-sub">把到期的词重新想起来。复习与学新词分开，结果会写入原有的艾宾浩斯进度。</p>' +
          '</div>' +
        '</header>' +

        '<section class="review-overview" aria-label="复习概况">' +
          '<div class="review-stat-grid">' +
            reviewStatHtml(dueCount, '今日待复习') +
            reviewStatHtml(unmasteredCount, '未掌握') +
          '</div>' +
          '<p class="review-overview-note">今日已复习 ' + todayReviewed + ' 次 · ' + escapeHtml(sourceNote) + '</p>' +
        '</section>' +

        '<section class="section review-modes-section" aria-labelledby="review-mode-title">' +
          '<div class="section-head"><h2 id="review-mode-title">' +
            (early && unmasteredCount > 0 ? '提前复习未掌握词' : '选择复习方式') +
          '</h2></div>' +
          '<div class="review-mode-list">' +
            modes.map(function (mode) {
              const optionalClass = mode.id === 'browse' || mode.id === 'listen' ? ' is-browse' : '';
              const listenClass = mode.id === 'listen' ? ' is-listen' : '';
              return '<button class="review-mode-card' + optionalClass + listenClass + '" type="button" data-action="' +
                (mode.action || 'start-review') + '" data-mode="' + mode.id + '">' +
                '<span class="review-mode-icon">' + icon(mode.iconName, 20) + '</span>' +
                '<span class="review-mode-copy"><strong>' + mode.title + '</strong><span>' + mode.desc + '</span></span>' +
                '<span class="review-mode-arrow">' + icon('chevron-right', 16) + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
          '<p class="review-section-note">' + (canReview ? '每组复习会从当前待复习或未掌握词池中取词。' : '去学几个新词后，这里就会出现可复习的内容。') + '</p>' +
          '<p class="review-section-note">三选一、分格拼写、混合会推进艾宾浩斯进度；「查看复习词来背」与「听力听写」为可选巩固。</p>' +
        '</section>' +

        '<p class="muted-note">答对按「认识」推进阶段 · 拼写只差一个字母按「模糊」安排</p>' +
      '</div>';
  }

  // 只背不考核：只读取词和进度，不调用 applyRating，也不写任何统计。
  function startReviewBrowse() {
    const dueWords = getDueWords();
    const source = dueWords.length ? dueWords : getUnmasteredWords();
    if (!source.length) {
      showToast('暂时没有可浏览的复习词，先去学几个单词。');
      return;
    }
    reviewSession = null;
    reviewListen = null;
    reviewBrowse = {
      words: source.slice(),
      index: 0,
      fromDue: dueWords.length > 0
    };
    applyRoute();
    window.scrollTo(0, 0);
  }

  function exitReviewBrowse() {
    reviewBrowse = null;
    applyRoute();
    window.scrollTo(0, 0);
  }

  function reviewBrowseStep(delta) {
    if (!reviewBrowse) return;
    const next = reviewBrowse.index + delta;
    if (next < 0 || next >= reviewBrowse.words.length) return;
    reviewBrowse.index = next;
    renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderReviewBrowse() {
    if (!views.review) return;
    if (!reviewBrowse) {
      renderReviewHub();
      return;
    }

    const total = reviewBrowse.words.length;
    const index = clamp(reviewBrowse.index, 0, total - 1);
    reviewBrowse.index = index;
    const word = reviewBrowse.words[index];
    const progress = getProgress(word);
    const phonetic = formatPhonetic(word.ph);
    const stageLabel = progress
      ? (progress.masteredAt ? '已掌握' : '阶段 ' + progress.stage + ' / ' + STAGE_COUNT)
      : '尚未学习';
    const collocations = (Array.isArray(word.col) ? word.col : []).filter(function (item) {
      return item && item.en;
    }).slice(0, 3);
    const example = word.ex && word.ex.en ? word.ex : null;
    const percent = Math.round(((index + 1) / total) * 100);

    views.review.innerHTML =
      '<div class="page review-browse-page">' +
        '<header class="study-topbar">' +
          '<button class="icon-button study-back" type="button" data-action="review-browse-exit" aria-label="返回复习">' + icon('arrow-left', 20) + '</button>' +
          '<div class="study-progress">' +
            '<div class="study-progress-copy"><span><strong>' + (index + 1) + ' / ' + total + '</strong> ' +
              (reviewBrowse.fromDue ? '今日待复习' : '未掌握词') +
            '</span><span>只背不考核</span></div>' +
            '<div class="study-progress-track" role="progressbar" aria-label="浏览进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span class="study-progress-fill" style="width:' + percent + '%"></span></div>' +
          '</div>' +
        '</header>' +
        '<article class="review-browse-card" aria-label="浏览单词 ' + escapeAttr(word.w) + '">' +
          '<div class="review-browse-meta">' +
            '<span class="mode-badge is-review">只背不考核</span>' +
            freqTagHtml(word) +
            (word.tag ? '<span class="card-tag">' + escapeHtml(word.tag) + '</span>' : '') +
            '<span class="stage-label">' + escapeHtml(stageLabel) + '</span>' +
          '</div>' +
          '<h2 class="review-browse-word">' + escapeHtml(word.w) + '</h2>' +
          (phonetic ? '<p class="review-browse-ph">' + escapeHtml(phonetic) + '</p>' : '') +
          formsLineHtml(word) +
          '<button class="audio-pill" type="button" data-speak="2" data-word="' + escapeAttr(word.w) + '" aria-label="播放 ' + escapeAttr(word.w) + ' 的发音">' +
            icon('speaker', 15) + '<span>发音</span>' +
          '</button>' +
          '<div class="review-browse-def">' +
            (word.pos ? '<span class="pos-pill">' + escapeHtml(word.pos) + '</span>' : '') +
            '<p class="review-browse-cn">' + escapeHtml(word.cn || '暂无释义') + '</p>' +
          '</div>' +
          (collocations.length
            ? '<ul class="review-browse-col">' + collocations.map(function (item) {
                return '<li><span>' + escapeHtml(item.en) + '</span>' +
                  (item.cn ? '<small>' + escapeHtml(item.cn) + '</small>' : '') + '</li>';
              }).join('') + '</ul>'
            : '') +
          (example
            ? '<p class="review-browse-example">' + escapeHtml(example.en) +
                (example.cn ? '<span>' + escapeHtml(example.cn) + '</span>' : '') + '</p>'
            : '') +
        '</article>' +
        '<div class="review-browse-actions">' +
          '<button class="btn btn-secondary" type="button" data-action="review-browse-prev"' + (index === 0 ? ' disabled' : '') + '>上一个</button>' +
          '<button class="btn btn-primary" type="button" data-action="review-browse-next"' + (index >= total - 1 ? ' disabled' : '') + '>下一个</button>' +
        '</div>' +
        '<p class="review-browse-note">这里只能翻看和发音，不改动下次复习时间、阶段和今日复习次数。想过关请回到复习页使用三选一或分格拼写。</p>' +
      '</div>';
  }

  // 听力听写：可选巩固，只读词池和释义，绝不调用 applyRating，也不写任何进度。
  function startReviewListen() {
    const dueWords = getDueWords();
    const source = dueWords.length ? dueWords : getUnmasteredWords();
    if (!source.length) {
      showToast('暂时没有可听写的复习词，先去学几个单词。');
      return;
    }
    reviewSession = null;
    reviewBrowse = null;
    reviewListen = {
      words: source.slice(),
      index: 0,
      fromDue: dueWords.length > 0,
      answered: false,
      lastResult: null,
      correct: 0,
      wrong: 0,
      played: false,
      finished: false
    };
    applyRoute();
    window.scrollTo(0, 0);
  }

  function exitReviewListen() {
    stopPronunciation();
    reviewListen = null;
    applyRoute();
    window.scrollTo(0, 0);
  }

  function playReviewListenWord() {
    if (!reviewListen || reviewListen.finished) return;
    const word = reviewListen.words[reviewListen.index];
    if (word) playPronunciation(word.w, '2', true);
  }

  function submitReviewListen() {
    if (!reviewListen || reviewListen.answered || reviewListen.finished) return;
    const word = reviewListen.words[reviewListen.index];
    if (!word) return;
    const input = document.getElementById('review-listen-input');
    const raw = input ? String(input.value || '').trim() : '';
    if (!normalizeSpellText(raw)) {
      showToast('先写下你听到的单词，再检查。', 'error');
      if (input) input.focus();
      return;
    }
    // 仅本地计分：不修改 stage / nextReviewAt / daily.reviewed。
    const correct = normalizeSpellText(raw) === normalizeSpellText(word.w);
    reviewListen.answered = true;
    reviewListen.correct += correct ? 1 : 0;
    reviewListen.wrong += correct ? 0 : 1;
    reviewListen.lastResult = {
      correct: correct,
      answer: raw,
      correctText: word.w
    };
    renderReview();
  }

  function nextReviewListen() {
    if (!reviewListen || !reviewListen.answered) return;
    const next = reviewListen.index + 1;
    if (next >= reviewListen.words.length) {
      reviewListen.finished = true;
      reviewListen.answered = false;
      reviewListen.lastResult = null;
      renderReview();
      return;
    }
    reviewListen.index = next;
    reviewListen.answered = false;
    reviewListen.lastResult = null;
    reviewListen.played = false;
    renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderReviewListenSummary() {
    if (!reviewListen) {
      renderReviewHub();
      return;
    }
    const total = reviewListen.correct + reviewListen.wrong;
    const accuracy = total > 0 ? Math.round((reviewListen.correct / total) * 100) : 0;
    views.review.innerHTML =
      '<div class="study-page review-quiz-page">' +
        '<div class="summary-shell">' +
          '<div class="summary-card">' +
            '<div class="summary-orbit"><span class="summary-icon">' + icon('check', 26) + '</span></div>' +
            '<p class="summary-eyebrow">听力听写完成</p>' +
            '<h2 class="summary-title">本轮听写正确 ' + reviewListen.correct + ' 个</h2>' +
            '<p class="summary-copy">听力听写是可选巩固练习，未写入艾宾浩斯进度。阶段、下次复习时间和今日复习次数都保持不变。</p>' +
            '<div class="summary-metrics">' +
              '<div class="summary-metric"><strong>' + reviewListen.correct + '</strong><span>听写正确</span></div>' +
              '<div class="summary-metric"><strong>' + reviewListen.wrong + '</strong><span>听写错误</span></div>' +
              '<div class="summary-metric"><strong>' + accuracy + '%</strong><span>正确率</span></div>' +
            '</div>' +
            '<div class="summary-actions">' +
              '<button class="btn btn-primary btn-block" type="button" data-action="review-back-hub">回到复习</button>' +
              '<button class="btn btn-secondary btn-block" type="button" data-action="review-home">回到首页</button>' +
            '</div>' +
            '<p class="summary-note">未写入艾宾浩斯进度；想推进复习阶段，请使用三选一、分格拼写或混合。</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderReviewListen() {
    if (!views.review) return;
    if (!reviewListen) {
      renderReviewHub();
      return;
    }
    if (reviewListen.finished) {
      renderReviewListenSummary();
      return;
    }

    const total = reviewListen.words.length;
    const index = clamp(reviewListen.index, 0, total - 1);
    reviewListen.index = index;
    const word = reviewListen.words[index];
    const answered = reviewListen.answered;
    const result = reviewListen.lastResult;
    const percent = Math.round(((index + (answered ? 1 : 0)) / total) * 100);
    const feedbackHtml = answered && result
      ? '<div class="review-feedback ' + (result.correct ? 'is-correct' : 'is-wrong') + '" role="status">' +
          '<p class="review-feedback-title">' + (result.correct ? '听写正确' : '这次没听对') + '</p>' +
          '<p class="review-feedback-copy">正确拼写：<strong class="review-listen-reveal">' + escapeHtml(result.correctText) + '</strong></p>' +
        '</div>'
      : '';
    const answerHtml = answered
      ? '<div class="review-listen-answer">' +
          '<span class="review-listen-answer-label">你的答案</span>' +
          '<p class="review-listen-answer-text">' + escapeHtml(result && result.answer ? result.answer : '（未填写）') + '</p>' +
        '</div>'
      : '<label class="review-listen-field">' +
          '<span class="sr-only">输入你听到的单词</span>' +
          '<input id="review-listen-input" class="review-listen-input" type="text" ' +
            'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ' +
            'placeholder="听发音，写出完整单词">' +
        '</label>';

    views.review.innerHTML =
      '<div class="page review-listen-page">' +
        '<header class="study-topbar">' +
          '<button class="icon-button study-back" type="button" data-action="review-listen-exit" aria-label="返回复习">' + icon('arrow-left', 20) + '</button>' +
          '<div class="study-progress">' +
            '<div class="study-progress-copy"><span><strong>已听写 ' + (index + 1) + ' / ' + total + '</strong> · 可选巩固（不计入复习进度）</span></div>' +
            '<div class="study-progress-track" role="progressbar" aria-label="听写进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span class="study-progress-fill" style="width:' + percent + '%"></span></div>' +
          '</div>' +
        '</header>' +
        '<article class="review-listen-card" aria-label="听力听写">' +
          '<div class="review-browse-meta">' +
            '<span class="mode-badge is-review">听力听写</span>' +
            (word.tag ? '<span class="card-tag">' + escapeHtml(word.tag) + '</span>' : '') +
            '<span class="stage-label">' + (reviewListen.fromDue ? '今日待复习' : '未掌握词') + '</span>' +
          '</div>' +
          '<div class="review-listen-meaning">' +
            '<p class="review-listen-label">根据发音写出完整单词</p>' +
            (word.pos ? '<span class="pos-pill">' + escapeHtml(word.pos) + '</span>' : '') +
            '<p class="review-listen-cn">' + escapeHtml(word.cn || '暂无释义') + '</p>' +
          '</div>' +
          '<button class="review-listen-play" type="button" data-action="review-listen-play" aria-label="播放发音">' +
            icon('speaker', 24) + '<span>播放发音</span>' +
          '</button>' +
          answerHtml +
          feedbackHtml +
          '<div class="review-listen-actions">' +
            (answered
              ? '<button class="btn btn-primary btn-block" type="button" data-action="review-listen-next">' +
                  (index >= total - 1 ? '查看本轮结果' : '下一词') + '</button>'
              : '<button class="btn btn-primary btn-block" type="button" data-action="review-listen-submit">检查</button>') +
          '</div>' +
          '<p class="review-listen-note">听发音默写整词 · 可选巩固，不推进艾宾浩斯进度。</p>' +
        '</article>' +
      '</div>';

    if (!answered) {
      if (!reviewListen.played) {
        reviewListen.played = true;
        window.setTimeout(function () {
          if (reviewListen && !reviewListen.finished && !reviewListen.answered &&
              reviewListen.words[reviewListen.index] === word) {
            playPronunciation(word.w, '2', true);
          }
        }, 160);
      }
      window.setTimeout(function () {
        const input = document.getElementById('review-listen-input');
        if (input) input.focus();
      }, 80);
    }
  }

  function choicePromptHtml(cardState) {
    const word = cardState.word;
    const isEnglish = cardState.promptType === 'en';
    const phonetic = formatPhonetic(word.ph);
    const subText = isEnglish ? phonetic : (word.pos || '');
    return '<div class="review-prompt">' +
      '<p class="review-prompt-label">' + (isEnglish ? '选择正确的中文释义' : '选择正确的英文单词') + '</p>' +
      '<p class="review-prompt-word' + (isEnglish ? '' : ' is-meaning') + '">' +
        escapeHtml(isEnglish ? word.w : word.cn) +
      '</p>' +
      (subText ? '<p class="review-prompt-sub">' + escapeHtml(subText) + '</p>' : '') +
    '</div>';
  }

  function choiceOptionsHtml(cardState, answered) {
    return '<div class="review-options" role="group" aria-label="选择答案">' +
      cardState.options.map(function (option, index) {
        let className = 'review-option';
        if (answered && option.isCorrect) className += ' is-correct';
        if (answered && index === cardState.pickedIndex && !option.isCorrect) className += ' is-wrong';
        return '<button class="' + className + '" type="button" data-action="review-choice" data-index="' + index + '"' +
          (answered ? ' disabled' : '') + '>' +
          '<span class="review-option-key">' + String.fromCharCode(65 + index) + '</span>' +
          '<span class="review-option-text">' + escapeHtml(option.text) + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  function spellPromptHtml(cardState, answered) {
    const word = cardState.word;
    const phonetic = formatPhonetic(word.ph);
    const subText = [phonetic, word.pos].filter(Boolean).join(' · ');
    const boxes = cardState.chars.map(function (char, index) {
      if (!/[A-Za-z]/.test(char)) {
        const spaceClass = char === ' ' ? ' is-space' : '';
        return '<span class="letter-box letter-fixed' + spaceClass + '" aria-hidden="true">' +
          (char === ' ' ? '' : escapeHtml(char)) +
        '</span>';
      }
      const isHint = cardState.hints.has(index);
      const value = cardState.values[index] || '';
      return '<input class="letter-box letter-input' + (isHint ? ' is-hint' : '') + '"' +
        ' type="text" inputmode="text" maxlength="1" autocomplete="off" autocapitalize="off"' +
        ' spellcheck="false" data-letter-index="' + index + '"' +
        ' value="' + escapeAttr(value) + '"' +
        ' aria-label="第 ' + (index + 1) + ' 个字母"' +
        (isHint ? ' readonly tabindex="-1"' : '') +
        (answered ? ' disabled' : '') + '>' +
        '';
    }).join('');

    return '<div class="review-prompt review-spell-prompt">' +
        '<p class="review-prompt-label">根据释义拼出单词</p>' +
        '<p class="review-prompt-word is-meaning">' + escapeHtml(word.cn || '暂无释义') + '</p>' +
        (subText ? '<p class="review-prompt-sub">' + escapeHtml(subText) + '</p>' : '') +
      '</div>' +
      '<div class="spell-boxes" style="--letter-count:' + cardState.chars.length + '" role="group" aria-label="拼写单词">' +
        boxes +
      '</div>' +
      '<p class="spell-hint">已给出部分字母提示 · 填满后自动检查</p>';
  }

  function reviewFeedbackHtml() {
    if (!reviewSession || !reviewSession.answered || !reviewSession.lastResult) return '';
    const result = reviewSession.lastResult;
    const word = reviewSession.cards[reviewSession.index];
    const isLast = reviewSession.index >= reviewSession.cards.length - 1;
    let title = result.correct ? '回答正确' : '这次没答对';
    let note = '';
    if (result.correct) {
      note = '已按「认识」推进复习阶段。';
    } else if (result.nearMiss) {
      note = '正确拼写是「' + result.correctText + '」，只差一个字母，已按「模糊」安排 5 分钟后复习。';
    } else {
      note = '正确答案是「' + result.correctText + '」，已按「不认识」重新安排复习。';
    }
    return '<div class="review-feedback ' + (result.correct ? 'is-correct' : 'is-wrong') + '" role="status">' +
        '<p class="review-feedback-title">' + title + '</p>' +
        '<p class="review-feedback-copy">' + escapeHtml(note) + (word && word.cn ? ' ' + escapeHtml(word.cn) : '') + '</p>' +
      '</div>' +
      '<div class="review-quiz-actions">' +
        '<button class="btn btn-primary btn-block" type="button" data-action="review-next">' +
          (isLast ? '查看本轮结果' : '下一题') +
        '</button>' +
      '</div>';
  }

  function renderReviewQuiz() {
    if (!reviewSession) {
      renderReviewHub();
      return;
    }
    if (reviewSession.finished) {
      renderReviewSummary();
      return;
    }
    if (!reviewSession.cardState) prepareReviewCard();
    if (reviewSession.finished) {
      renderReviewSummary();
      return;
    }

    const index = reviewSession.index;
    const word = reviewSession.cards[index];
    const cardState = reviewSession.cardState;
    const progress = getProgress(word);
    const answered = reviewSession.answered;
    const progressPercent = reviewSession.total > 0
      ? Math.round((reviewSession.answeredCount / reviewSession.total) * 100)
      : 100;
    const modeLabel = getReviewModeLabel(cardState.mode);
    const stageLabel = progress ? '阶段 ' + progress.stage + ' / ' + STAGE_COUNT : '复习';
    const promptHtml = cardState.mode === 'spell'
      ? spellPromptHtml(cardState, answered)
      : choicePromptHtml(cardState) + choiceOptionsHtml(cardState, answered);
    const hintHtml = answered || cardState.mode === 'spell'
      ? ''
      : '<p class="review-quiz-hint">选择一项作答，提交前不会显示答案。</p>';

    views.review.innerHTML =
      '<div class="study-page review-quiz-page">' +
        '<h1 class="sr-only">复习单词</h1>' +
        '<header class="study-topbar">' +
          '<button class="icon-button study-back" type="button" data-action="review-exit" aria-label="退出复习，返回复习页">' + icon('arrow-left', 20) + '</button>' +
          '<div class="study-progress">' +
            '<div class="study-progress-copy"><span><strong>' + reviewSession.answeredCount + ' / ' + reviewSession.total + '</strong> 已作答</span><span>' + modeLabel + (reviewSession.early ? ' · 提前复习' : '') + '</span></div>' +
            '<div class="study-progress-track" role="progressbar" aria-label="本轮复习进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPercent + '"><span class="study-progress-fill" style="width:' + progressPercent + '%"></span></div>' +
          '</div>' +
        '</header>' +
        '<div class="review-quiz-main">' +
          '<article class="review-card" aria-label="复习单词 ' + escapeAttr(word.w) + '">' +
            '<div class="review-card-meta">' +
              '<span class="mode-badge is-review">' + modeLabel + '</span>' +
              (word.tag ? '<span class="card-tag">' + escapeHtml(word.tag) + '</span>' : '') +
              '<span class="stage-label">' + escapeHtml(stageLabel) + '</span>' +
            '</div>' +
            promptHtml +
            hintHtml +
            reviewFeedbackHtml() +
          '</article>' +
        '</div>' +
      '</div>';

    if (cardState.mode === 'spell' && !answered) {
      window.setTimeout(focusFirstReviewLetter, 40);
    }
  }

  function renderReviewSummary() {
    if (!reviewSession) {
      renderReviewHub();
      return;
    }
    const total = reviewSession.correct + reviewSession.wrong;
    const accuracy = total > 0 ? Math.round((reviewSession.correct / total) * 100) : 0;
    views.review.innerHTML =
      '<div class="study-page review-quiz-page">' +
        '<div class="summary-shell">' +
          '<div class="summary-card">' +
            '<div class="summary-orbit"><span class="summary-icon">' + icon('check', 26) + '</span></div>' +
            '<p class="summary-eyebrow">复习完成</p>' +
            '<h2 class="summary-title">本轮答对 ' + reviewSession.correct + ' 个</h2>' +
            '<p class="summary-copy">复习结果已经写回艾宾浩斯进度。答对的词会进入下一阶段，答错的词会按计划重新出现。</p>' +
            '<div class="summary-metrics">' +
              '<div class="summary-metric"><strong>' + reviewSession.correct + '</strong><span>答对</span></div>' +
              '<div class="summary-metric"><strong>' + reviewSession.wrong + '</strong><span>答错</span></div>' +
              '<div class="summary-metric"><strong>' + accuracy + '%</strong><span>正确率</span></div>' +
            '</div>' +
            '<div class="summary-actions">' +
              '<button class="btn btn-primary btn-block" type="button" data-action="review-back-hub">回到复习</button>' +
              '<button class="btn btn-secondary btn-block" type="button" data-action="review-home">回到首页</button>' +
            '</div>' +
            '<p class="summary-note">拼写差一个字母会按「模糊」处理，其余错误按「不认识」处理。</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderReview() {
    if (!views.review) return;
    if (reviewSession) renderReviewQuiz();
    else if (reviewListen) renderReviewListen();
    else if (reviewBrowse) renderReviewBrowse();
    else renderReviewHub();
  }

  function recordReviewAnswer(correct, details) {
    if (!reviewSession || reviewSession.answered || !reviewSession.cardState) return;
    const word = reviewSession.cards[reviewSession.index];
    if (!word) return;
    const nearMiss = Boolean(details && details.nearMiss);
    const rating = correct ? 'known' : (nearMiss ? 'fuzzy' : 'unknown');

    applyRating(word, rating, { isIntroduction: false });
    reviewSession.answered = true;
    reviewSession.answeredCount += 1;
    reviewSession.correct += correct ? 1 : 0;
    reviewSession.wrong += correct ? 0 : 1;
    reviewSession.lastResult = {
      correct: correct,
      rating: rating,
      nearMiss: nearMiss,
      correctText: details && details.correctText ? details.correctText : reviewSession.cardState.correctText
    };
    saveState();
    renderReview();
  }

  function chooseReviewOption(index) {
    if (!reviewSession || reviewSession.answered || !reviewSession.cardState) return;
    const cardState = reviewSession.cardState;
    if (cardState.mode !== 'choice') return;
    const option = cardState.options[index];
    if (!option) return;
    cardState.pickedIndex = index;
    recordReviewAnswer(option.isCorrect, {
      correctText: cardState.correctText
    });
  }

  function normalizeSpellText(value) {
    return String(value || '').normalize('NFKC').toLowerCase();
  }

  function getSpellAnswer(cardState) {
    return cardState.chars.map(function (char, index) {
      return cardState.values[index] || '';
    }).join('');
  }

  function isSpellComplete(cardState) {
    return cardState.editableIndices.every(function (index) {
      return Boolean(cardState.values[index]);
    });
  }

  function editDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    const previous = [];
    for (let column = 0; column <= right.length; column += 1) previous[column] = column;
    for (let row = 1; row <= left.length; row += 1) {
      let diagonal = previous[0];
      previous[0] = row;
      for (let column = 1; column <= right.length; column += 1) {
        const saved = previous[column];
        const cost = left.charAt(row - 1) === right.charAt(column - 1) ? 0 : 1;
        previous[column] = Math.min(
          previous[column] + 1,
          previous[column - 1] + 1,
          diagonal + cost
        );
        diagonal = saved;
      }
    }
    return previous[right.length];
  }

  function submitSpellReview() {
    if (!reviewSession || reviewSession.answered || !reviewSession.cardState) return;
    const cardState = reviewSession.cardState;
    if (cardState.mode !== 'spell' || !isSpellComplete(cardState)) return;
    const word = reviewSession.cards[reviewSession.index];
    if (!word) return;
    const answer = normalizeSpellText(getSpellAnswer(cardState));
    const target = normalizeSpellText(word.w);
    const correct = answer === target;
    const nearMiss = !correct && editDistance(answer, target) === 1;
    recordReviewAnswer(correct, {
      correctText: word.w,
      nearMiss: nearMiss
    });
  }

  function nextReviewCard() {
    if (!reviewSession || !reviewSession.answered) return;
    reviewSession.index += 1;
    if (reviewSession.index >= reviewSession.cards.length) {
      reviewSession.finished = true;
      reviewSession.cardState = null;
      reviewSession.answered = false;
      maybeAutoUploadProgress();
      renderReview();
      return;
    }
    prepareReviewCard();
    renderReview();
  }

  function exitReviewSession() {
    stopPronunciation();
    reviewSession = null;
    maybeAutoUploadProgress();
    applyRoute();
    window.scrollTo(0, 0);
  }

  function getReviewLetterInputs() {
    if (!views.review) return [];
    return Array.prototype.slice.call(views.review.querySelectorAll('.letter-input:not([readonly])'));
  }

  function focusFirstReviewLetter() {
    if (!reviewSession || reviewSession.answered || !reviewSession.cardState) return;
    if (reviewSession.cardState.mode !== 'spell') return;
    const inputs = getReviewLetterInputs();
    for (let index = 0; index < inputs.length; index += 1) {
      if (!inputs[index].value) {
        try {
          inputs[index].focus({ preventScroll: true });
        } catch (error) {
          inputs[index].focus();
        }
        return;
      }
    }
  }

  function focusReviewLetterAtOrAfter(index) {
    const inputs = getReviewLetterInputs();
    for (let cursor = 0; cursor < inputs.length; cursor += 1) {
      if (Number(inputs[cursor].getAttribute('data-letter-index')) >= index) {
        try {
          inputs[cursor].focus({ preventScroll: true });
        } catch (error) {
          inputs[cursor].focus();
        }
        return;
      }
    }
  }

  function focusReviewLetterBefore(index) {
    const inputs = getReviewLetterInputs();
    for (let cursor = inputs.length - 1; cursor >= 0; cursor -= 1) {
      if (Number(inputs[cursor].getAttribute('data-letter-index')) < index) {
        try {
          inputs[cursor].focus({ preventScroll: true });
        } catch (error) {
          inputs[cursor].focus();
        }
        return;
      }
    }
  }

  function handleReviewLetterInput(input) {
    if (!reviewSession || reviewSession.answered || !reviewSession.cardState) return;
    const cardState = reviewSession.cardState;
    if (cardState.mode !== 'spell') return;
    const index = Number(input.getAttribute('data-letter-index'));
    const char = input.value.replace(/[^A-Za-z]/g, '').slice(-1);
    input.value = char;
    cardState.values[index] = char;

    if (char) focusReviewLetterAtOrAfter(index + 1);
    if (isSpellComplete(cardState)) {
      const pendingCardState = cardState;
      window.setTimeout(function () {
        if (reviewSession && reviewSession.cardState === pendingCardState && !reviewSession.answered && isSpellComplete(pendingCardState)) {
          submitSpellReview();
        }
      }, 120);
    }
  }

  function handleReviewKeydown(event) {
    if (currentRoute !== 'review') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;

    if (reviewListen) {
      if (reviewListen.finished || event.key !== 'Enter') return;
      if (target instanceof Element && target.closest('button, a, summary')) return;
      event.preventDefault();
      if (reviewListen.answered) nextReviewListen();
      else submitReviewListen();
      return;
    }

    if (!reviewSession || reviewSession.finished) return;
    const cardState = reviewSession.cardState;

    if (target instanceof Element && target.classList.contains('letter-input') && cardState && cardState.mode === 'spell' && !reviewSession.answered) {
      const index = Number(target.getAttribute('data-letter-index'));
      if (event.key === 'Backspace' && !target.value) {
        event.preventDefault();
        focusReviewLetterBefore(index);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusReviewLetterBefore(index);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusReviewLetterAtOrAfter(index + 1);
        return;
      }
    }

    if (reviewSession.answered) {
      if ((event.key === 'Enter' || event.key === ' ') && !isTypingTarget(target)) {
        if (target instanceof Element && target.closest('button, a, summary')) return;
        event.preventDefault();
        nextReviewCard();
      }
      return;
    }

    if (cardState && cardState.mode === 'choice' && !isTypingTarget(target)) {
      const optionIndex = ['1', '2', '3'].indexOf(event.key);
      if (optionIndex !== -1) {
        event.preventDefault();
        chooseReviewOption(optionIndex);
      }
    }
  }

  /* ---------- 词表浏览 ---------- */

  function getStatusInfo(word, now) {
    const progress = getProgress(word);
    if (!progress) {
      return { key: 'new', label: '未学', className: 'status-new' };
    }
    if (progress.masteredAt) {
      return { key: 'mastered', label: '已掌握', className: 'status-mastered' };
    }
    if (progress.nextReviewAt > 0 && progress.nextReviewAt <= now) {
      return { key: 'due', label: '待复习', className: 'status-due' };
    }
    return { key: 'learning', label: '学习中', className: 'status-learning' };
  }

  function wordMatches(word, query) {
    if (!query) return true;
    if (word.w.toLowerCase().includes(query)) return true;
    if (word.cn.toLowerCase().includes(query)) return true;
    if (word.pos.toLowerCase().includes(query)) return true;
    if (word.tag.toLowerCase().includes(query)) return true;
    if (word.col.some(function (item) {
      return (item.en + ' ' + item.cn).toLowerCase().includes(query);
    })) return true;
    if ((word.ex.en + ' ' + word.ex.cn).toLowerCase().includes(query)) return true;
    if (word.wf && ['n', 'v', 'adj', 'adv'].some(function (kind) {
      return Array.isArray(word.wf[kind]) && word.wf[kind].join(' ').toLowerCase().includes(query);
    })) return true;
    if ((word.freq || '').toLowerCase().includes(query)) return true;
    return false;
  }

  function matchesFilter(statusKey, filter) {
    if (filter === 'all') return true;
    if (filter === 'learning') return statusKey === 'learning' || statusKey === 'due';
    return statusKey === filter;
  }

  function browseRowHtml(word, status) {
    const progress = getProgress(word);
    const phonetic = formatPhonetic(word.ph);
    let stageText = '';
    if (progress && !progress.masteredAt) {
      stageText = '阶段 ' + progress.stage + ' / ' + STAGE_COUNT;
    } else if (progress && progress.masteredAt) {
      stageText = '已完成全部复习';
    } else {
      stageText = '尚未学习';
    }

    return (
      '<article class="vocab-row">' +
        '<div class="vocab-copy">' +
          '<div class="vocab-wordline"><h3 class="vocab-word">' + escapeHtml(word.w) + '</h3>' +
            (phonetic ? '<span class="vocab-phonetic">' + escapeHtml(phonetic) + '</span>' : '') +
            freqTagHtml(word) +
          '</div>' +
          formsLineHtml(word) +
          '<p class="vocab-def">' +
            (word.pos ? '<span class="vocab-pos">' + escapeHtml(word.pos) + '</span>' : '') +
            escapeHtml(word.cn || '暂无释义') +
          '</p>' +
          '<div class="vocab-meta">' +
            '<span class="vocab-tag">' + escapeHtml(word.tag) + '</span>' +
            '<span class="vocab-stage">· ' + escapeHtml(stageText) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="vocab-side">' +
          '<span class="vocab-status ' + status.className + '">' + status.label + '</span>' +
          '<button class="speak-mini" type="button" data-speak="2" data-word="' + escapeAttr(word.w) + '" aria-label="播放 ' + escapeAttr(word.w) + ' 的发音">' + icon('speaker', 16) + '</button>' +
          (status.key === 'mastered'
            ? ''
            : '<button class="master-direct-btn" type="button" data-action="master-browse-word" data-word-key="' + escapeAttr(word.key) + '">直接已掌握</button>') +
        '</div>' +
      '</article>'
    );
  }

  function masterBrowseWord(key) {
    const word = getWordData().map.get(key);
    if (!word) return;
    const progress = getProgress(word);
    if (progress && progress.masteredAt) {
      showToast('这个词已掌握。');
      renderBrowseList();
      return;
    }

    const ok = window.confirm('确定已完全掌握「' + word.w + '」吗？确认后会直接标为已掌握，不再进入复习计划。');
    if (!ok) return;
    if (!markWordMasteredDirect(word)) return;
    renderBrowseList();
    showToast('已掌握「' + word.w + '」');
  }

  function renderBrowseList() {
    const listEl = document.getElementById('browse-list');
    if (!listEl) return;

    const allWords = getActiveWords();
    const query = browseQuery.trim().toLowerCase();
    const now = Date.now();
    const filtered = allWords.filter(function (word) {
      const status = getStatusInfo(word, now);
      const bookOk = browseBookFilter === 'all' || (word.book || '') === browseBookFilter;
      const unitOk = browseUnitFilter === 'all' || (word.unit || '') === browseUnitFilter;
      const freqOk = browseFreqFilter === 'all' || word.freq === browseFreqFilter;
      return bookOk && unitOk && freqOk && matchesFilter(status.key, browseFilter) && wordMatches(word, query);
    });
    const groupByFreq = browseFilter === 'mastered' && browseFreqFilter === 'all';
    let ordered = filtered;
    if (groupByFreq) {
      const groupRank = { '高': 0, '中': 1, '低': 2, '': 3 };
      ordered = filtered.slice().sort(function (a, b) {
        const rankA = groupRank[a.freq] === undefined ? 3 : groupRank[a.freq];
        const rankB = groupRank[b.freq] === undefined ? 3 : groupRank[b.freq];
        return rankA - rankB;
      });
    }
    const shown = ordered.slice(0, browseLimit);

    if (!shown.length) {
      const hasQuery = Boolean(query) ||
        browseFilter !== 'all' ||
        browseFreqFilter !== 'all' ||
        browseBookFilter !== 'all' ||
        browseUnitFilter !== 'all';
      listEl.innerHTML =
        '<div class="empty-state">' +
          '<span class="empty-icon">' + icon(allWords.length ? 'search' : 'book', 23) + '</span>' +
          '<h3>' + (allWords.length ? (hasQuery ? '没有找到匹配的词' : '暂时没有单词') : '词库还是空的') + '</h3>' +
          '<p>' + (allWords.length ? '换个关键词或筛选条件再试试。' : '去设置页粘贴自定义词，或替换 words.js。') + '</p>' +
        '</div>';
    } else if (groupByFreq) {
      const groupCounts = {};
      filtered.forEach(function (word) {
        const key = word.freq || '';
        groupCounts[key] = (groupCounts[key] || 0) + 1;
      });
      let currentGroup = null;
      let html = '';
      shown.forEach(function (word) {
        const key = word.freq || '';
        if (key !== currentGroup) {
          currentGroup = key;
          const meta = FREQ_META[key];
          html += '<h3 class="freq-group-title">' + (meta ? meta.text : '无频次') +
            ' · ' + (groupCounts[key] || 0) + '</h3>';
        }
        html += browseRowHtml(word, getStatusInfo(word, now));
      });
      listEl.innerHTML = html;
    } else {
      listEl.innerHTML = shown.map(function (word) {
        return browseRowHtml(word, getStatusInfo(word, now));
      }).join('');
    }

    const summaryEl = document.getElementById('browse-summary');
    if (summaryEl) {
      summaryEl.textContent = filtered.length === allWords.length
        ? '共 ' + allWords.length + ' 个词'
        : '找到 ' + filtered.length + ' 个词';
    }

    const moreBtn = document.getElementById('browse-more');
    if (moreBtn) {
      const hidden = shown.length >= filtered.length;
      moreBtn.hidden = hidden;
      moreBtn.textContent = hidden ? '' : '加载更多（还有 ' + Math.max(0, filtered.length - shown.length) + ' 个）';
    }
  }

  function browseBookOptionsHtml() {
    const books = getBooks();
    return '<option value="all"' + (browseBookFilter === 'all' ? ' selected' : '') + '>全部册</option>' +
      books.map(function (book) {
        return '<option value="' + escapeAttr(book.id) + '"' +
          (browseBookFilter === book.id ? ' selected' : '') + '>' +
          escapeHtml(book.name) + '</option>';
      }).join('');
  }

  function browseUnitOptionsHtml() {
    let html = '<option value="all"' + (browseUnitFilter === 'all' ? ' selected' : '') + '>全部单元</option>';
    getBooks().forEach(function (book) {
      if (browseBookFilter !== 'all' && book.id !== browseBookFilter) return;
      if (!book.units.length) return;
      html += '<optgroup label="' + escapeAttr(book.name) + '">';
      book.units.forEach(function (unit) {
        html += '<option value="' + escapeAttr(unit.id) + '"' +
          (browseUnitFilter === unit.id ? ' selected' : '') + '>' +
          escapeHtml(unit.title) + '（' + unit.n + ' 词）</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  function syncBrowseUnitOptions() {
    const unitSelect = document.getElementById('browse-unit-filter');
    if (!unitSelect) return;
    if (browseUnitFilter !== 'all') {
      const hasUnit = getBooks().some(function (book) {
        if (browseBookFilter !== 'all' && book.id !== browseBookFilter) return false;
        return book.units.some(function (unit) {
          return unit.id === browseUnitFilter;
        });
      });
      if (!hasUnit) browseUnitFilter = 'all';
    }
    unitSelect.innerHTML = browseUnitOptionsHtml();
    unitSelect.value = browseUnitFilter;
  }

  function renderBrowse() {
    const words = getActiveWords();
    const filterOptions = [
      { key: 'all', label: '全部' },
      { key: 'new', label: '未学' },
      { key: 'learning', label: '学习中' },
      { key: 'due', label: '待复习' },
      { key: 'mastered', label: '已掌握' }
    ];
    const freqOptions = [
      { key: 'all', label: '全部频次' },
      { key: '高', label: '高频' },
      { key: '中', label: '中频' },
      { key: '低', label: '低频' }
    ];

    views.browse.innerHTML =
      '<div class="page browse-page">' +
        '<header class="page-head">' +
          '<div>' +
            '<p class="page-kicker">词库 · ' + words.length + ' 个词</p>' +
            '<h1 class="page-title">词表浏览</h1>' +
            '<p class="page-sub">搜索单词，或按册、单元和学习状态筛选。点小喇叭即可听发音。</p>' +
          '</div>' +
        '</header>' +
        '<div class="search-box">' +
          '<span class="search-icon">' + icon('search', 19) + '</span>' +
          '<input class="search-input" id="browse-search" type="search" autocomplete="off" spellcheck="false" placeholder="搜索单词、释义或标签" aria-label="搜索单词" value="' + escapeAttr(browseQuery) + '">' +
          '<button class="search-clear" id="browse-clear" type="button" data-action="clear-search" aria-label="清空搜索"' + (browseQuery ? '' : ' hidden') + '>' + icon('close', 15) + '</button>' +
        '</div>' +
        '<div class="filter-strip" role="group" aria-label="按学习状态筛选">' +
          filterOptions.map(function (option) {
            const active = browseFilter === option.key;
            return '<button class="filter-chip' + (active ? ' is-active' : '') + '" type="button" data-action="browse-filter" data-filter="' + option.key + '" aria-pressed="' + active + '">' + option.label + '</button>';
          }).join('') +
        '</div>' +
        '<div class="filter-strip filter-strip-freq" role="group" aria-label="按高考频次筛选">' +
          freqOptions.map(function (option) {
            const active = browseFreqFilter === option.key;
            return '<button class="filter-chip freq-chip' + (active ? ' is-active' : '') + '" type="button" data-action="browse-freq" data-freq="' + option.key + '" aria-pressed="' + active + '">' + option.label + '</button>';
          }).join('') +
        '</div>' +
        '<div class="filter-row" role="group" aria-label="按册和单元筛选">' +
          '<label class="filter-field"><span class="filter-label">册</span>' +
            '<select class="filter-select" id="browse-book-filter" aria-label="按册筛选">' + browseBookOptionsHtml() + '</select>' +
          '</label>' +
          '<label class="filter-field"><span class="filter-label">单元</span>' +
            '<select class="filter-select" id="browse-unit-filter" aria-label="按单元筛选">' + browseUnitOptionsHtml() + '</select>' +
          '</label>' +
        '</div>' +
        '<p class="browse-summary" id="browse-summary"></p>' +
        '<div class="vocab-list" id="browse-list"></div>' +
        '<button class="btn btn-secondary btn-block load-more" id="browse-more" type="button" data-action="browse-more">加载更多</button>' +
      '</div>';

    renderBrowseList();
  }

  function setBrowseFilter(filter) {
    if (!['all', 'new', 'learning', 'due', 'mastered'].includes(filter)) return;
    browseFilter = filter;
    browseLimit = BROWSE_PAGE_SIZE;

    document.querySelectorAll('[data-action="browse-filter"]').forEach(function (button) {
      const isActive = button.getAttribute('data-filter') === filter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    renderBrowseList();
  }

  function setBrowseFreqFilter(filter) {
    if (!['all', '高', '中', '低'].includes(filter)) return;
    browseFreqFilter = filter;
    browseLimit = BROWSE_PAGE_SIZE;

    document.querySelectorAll('[data-action="browse-freq"]').forEach(function (button) {
      const isActive = button.getAttribute('data-freq') === filter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    renderBrowseList();
  }

  function updateSearchClearButton() {
    const clearButton = document.getElementById('browse-clear');
    if (clearButton) clearButton.hidden = !browseQuery;
  }

  /* ---------- 选择词书 ---------- */

  function ensureExpandedBooks() {
    if (expandedBooks) return expandedBooks;
    expandedBooks = new Set();
    const books = getBooks();
    const selected = getSelectedUnitSet();
    const booksWithSelection = books.filter(function (book) {
      return book.units.some(function (unit) {
        return selected.has(unit.id);
      });
    });
    const initial = booksWithSelection.length
      ? booksWithSelection
      : (books.length ? [books[0]] : []);
    initial.forEach(function (book) {
      expandedBooks.add(book.id);
    });
    return expandedBooks;
  }

  function bookUnitSummary(book, selected) {
    let selectedCount = 0;
    let totalWords = 0;
    book.units.forEach(function (unit) {
      totalWords += unit.n;
      if (selected.has(unit.id)) selectedCount += 1;
    });
    return {
      selectedCount: selectedCount,
      totalUnits: book.units.length,
      totalWords: totalWords
    };
  }

  function bookCardHtml(book, isOpen, selected) {
    const info = bookUnitSummary(book, selected);
    const countText = info.selectedCount
      ? '已选 ' + info.selectedCount + '/' + info.totalUnits + ' 单元 · 共 ' + info.totalWords + ' 词'
      : '共 ' + info.totalUnits + ' 单元 · ' + info.totalWords + ' 词';
    const bookIdAttr = escapeAttr(book.id);

    const unitRows = book.units.map(function (unit) {
      const checked = selected.has(unit.id);
      return (
        '<label class="unit-option' + (checked ? ' is-selected' : '') + '">' +
          '<input type="checkbox" data-unit-toggle="' + escapeAttr(unit.id) + '"' + (checked ? ' checked' : '') +
            ' aria-label="' + escapeAttr(unit.title + '，' + unit.n + ' 个词') + '">' +
          '<span class="unit-copy">' +
            '<span class="unit-title">' + escapeHtml(unit.title) + '</span>' +
            '<span class="unit-count">' + unit.n + ' 词</span>' +
          '</span>' +
        '</label>'
      );
    }).join('');

    return (
      '<section class="book-card' + (info.selectedCount ? ' has-selection' : '') + '" data-book-card="' + bookIdAttr + '">' +
        '<div class="book-card-head">' +
          '<button class="book-toggle" type="button" data-action="toggle-book-panel" data-book="' + bookIdAttr + '"' +
            ' aria-expanded="' + (isOpen ? 'true' : 'false') + '" aria-controls="book-panel-' + bookIdAttr + '">' +
            '<span class="book-toggle-copy">' +
              '<span class="book-name">' + escapeHtml(book.name) + '</span>' +
              '<span class="book-count" data-book-count="' + bookIdAttr + '">' + escapeHtml(countText) + '</span>' +
            '</span>' +
            '<span class="book-chevron' + (isOpen ? ' is-open' : '') + '" aria-hidden="true">' + icon('chevron-right', 15) + '</span>' +
          '</button>' +
          '<label class="book-select-all">' +
            '<input type="checkbox" data-book-select-all="' + bookIdAttr + '" aria-label="全选' + escapeAttr(book.name) + '">' +
            '<span data-book-select-label="' + bookIdAttr + '">全选</span>' +
          '</label>' +
        '</div>' +
        '<div class="book-panel" id="book-panel-' + bookIdAttr + '" data-book-panel="' + bookIdAttr + '"' + (isOpen ? '' : ' hidden') + '>' +
          unitRows +
        '</div>' +
      '</section>'
    );
  }

  function updateBooksSummaryDom() {
    const countEl = document.getElementById('books-summary-count');
    const copyEl = document.getElementById('books-summary-copy');
    if (!countEl || !copyEl) return;

    const summary = getSelectionSummary();
    if (summary.unitCount) {
      countEl.textContent = summary.unitCount + ' 个单元 · ' + summary.wordCount + ' 个词';
      copyEl.textContent = '来自 ' + summary.bookCount + ' 册，新词会按词表顺序抽取；复习仍包含所有已学词。';
    } else {
      countEl.textContent = '尚未选择单元';
      copyEl.textContent = '勾选下方任意单元后，新词会从这些单元里按词表顺序出现。';
    }

    const clearButton = document.querySelector('[data-action="clear-unit-selection"]');
    if (clearButton) clearButton.hidden = getSelectedUnits().length === 0;
  }

  function syncBooksSelectionDom() {
    if (!document.getElementById('books-summary')) return;
    const selected = getSelectedUnitSet();
    const books = getBooks();
    const booksById = new Map();
    books.forEach(function (book) {
      booksById.set(book.id, book);
    });

    document.querySelectorAll('[data-unit-toggle]').forEach(function (input) {
      const unitId = input.getAttribute('data-unit-toggle');
      const checked = selected.has(unitId);
      input.checked = checked;
      const label = input.closest('.unit-option');
      if (label) label.classList.toggle('is-selected', checked);
    });

    document.querySelectorAll('[data-book-select-all]').forEach(function (input) {
      const book = booksById.get(input.getAttribute('data-book-select-all'));
      if (!book) return;
      const info = bookUnitSummary(book, selected);
      const allSelected = info.totalUnits > 0 && info.selectedCount === info.totalUnits;
      input.checked = allSelected;
      input.indeterminate = info.selectedCount > 0 && !allSelected;

      const label = document.querySelector('[data-book-select-label="' + book.id + '"]');
      if (label) label.textContent = allSelected ? '取消全选' : '全选';
    });

    document.querySelectorAll('[data-book-count]').forEach(function (el) {
      const book = booksById.get(el.getAttribute('data-book-count'));
      if (!book) return;
      const info = bookUnitSummary(book, selected);
      el.textContent = info.selectedCount
        ? '已选 ' + info.selectedCount + '/' + info.totalUnits + ' 单元 · 共 ' + info.totalWords + ' 词'
        : '共 ' + info.totalUnits + ' 单元 · ' + info.totalWords + ' 词';
    });

    document.querySelectorAll('[data-book-card]').forEach(function (card) {
      const book = booksById.get(card.getAttribute('data-book-card'));
      if (!book) return;
      card.classList.toggle('has-selection', bookUnitSummary(book, selected).selectedCount > 0);
    });

    updateBooksSummaryDom();
  }

  function toggleBookPanel(bookId) {
    if (!bookId) return;
    const expanded = ensureExpandedBooks();
    const willOpen = !expanded.has(bookId);
    if (willOpen) expanded.add(bookId);
    else expanded.delete(bookId);

    document.querySelectorAll('[data-book-panel]').forEach(function (panel) {
      if (panel.getAttribute('data-book-panel') !== bookId) return;
      panel.hidden = !willOpen;
    });
    document.querySelectorAll('[data-action="toggle-book-panel"]').forEach(function (button) {
      if (button.getAttribute('data-book') !== bookId) return;
      button.setAttribute('aria-expanded', String(willOpen));
      const chevron = button.querySelector('.book-chevron');
      if (chevron) chevron.classList.toggle('is-open', willOpen);
    });
  }

  function toggleUnitSelection(unitId, checked) {
    if (!unitId) return;
    const selection = new Set(getSelectedUnits());
    if (checked) selection.add(unitId);
    else selection.delete(unitId);
    state.selectedUnits = Array.from(selection);
    saveState();
    syncBooksSelectionDom();
  }

  function toggleBookSelection(bookId, checked) {
    const book = getBooks().find(function (item) {
      return item.id === bookId;
    });
    if (!book) return;

    const selection = new Set(getSelectedUnits());
    book.units.forEach(function (unit) {
      if (checked) selection.add(unit.id);
      else selection.delete(unit.id);
    });
    state.selectedUnits = Array.from(selection);
    saveState();
    syncBooksSelectionDom();
  }

  function clearUnitSelection() {
    state.selectedUnits = [];
    saveState();
    syncBooksSelectionDom();
  }

  function renderBooks() {
    const books = getBooks();
    const expanded = ensureExpandedBooks();
    const selected = getSelectedUnitSet();

    views.books.innerHTML =
      '<div class="page books-page">' +
        '<header class="page-head">' +
          '<div>' +
            '<p class="page-kicker">词书 · ' + books.length + ' 册</p>' +
            '<h1 class="page-title">选择词书</h1>' +
            '<p class="page-sub">可跨册任意组合单元。新词只从所选单元按词表顺序抽取，复习仍包含所有已学词。</p>' +
          '</div>' +
        '</header>' +
        '<section class="books-summary" id="books-summary" aria-live="polite">' +
          '<div class="books-summary-main">' +
            '<p class="books-summary-count" id="books-summary-count">尚未选择单元</p>' +
            '<p class="books-summary-copy" id="books-summary-copy"></p>' +
          '</div>' +
          '<button class="text-link" type="button" data-action="clear-unit-selection" hidden>清空选择</button>' +
        '</section>' +
        '<div class="book-list">' +
          books.map(function (book) {
            return bookCardHtml(book, expanded.has(book.id), selected);
          }).join('') +
        '</div>' +
        '<p class="muted-note">选择会自动保存在本机浏览器，随时可以回来调整。</p>' +
      '</div>';

    syncBooksSelectionDom();
  }

  /* ---------- 统计 ---------- */

  function renderStats() {
    const stats = getStats();
    const week = stats.week;
    const weekTotal = week.reduce(function (sum, day) {
      return sum + day.total;
    }, 0);
    const maxTotal = Math.max(1, ...week.map(function (day) {
      return day.total;
    }));
    const hasWeekData = weekTotal > 0;
    const masteryPercent = stats.learned > 0
      ? Math.round((stats.mastered / stats.learned) * 100)
      : 0;

    const chartHtml = week.map(function (day) {
      const barHeight = day.total > 0 ? Math.max(4, Math.round((day.total / maxTotal) * 100)) : 0;
      const ariaLabel = (day.month + '月' + day.day + '日') +
        (day.isToday ? '，今天' : '') +
        '，新学 ' + day.learned + ' 个，复习 ' + day.reviewed + ' 个';

      let segments = '';
      if (day.reviewed > 0) {
        segments += '<span class="chart-seg review" style="flex-grow:' + day.reviewed + '"></span>';
      }
      if (day.learned > 0) {
        segments += '<span class="chart-seg learned" style="flex-grow:' + day.learned + '"></span>';
      }

      return (
        '<div class="chart-col' + (day.isToday ? ' is-today' : '') + '" tabindex="0" role="listitem" aria-label="' + escapeAttr(ariaLabel) + '">' +
          '<span class="chart-value">' + (day.isToday ? day.total : '') + '</span>' +
          '<div class="chart-track">' +
            (day.total > 0
              ? '<div class="chart-bar" style="height:' + barHeight + '%">' + segments + '</div>'
              : '<span class="chart-zero" aria-hidden="true"></span>') +
          '</div>' +
          '<span class="chart-day">' + (day.isToday ? '今天' : '周' + day.weekday) + '</span>' +
          '<span class="chart-date">' + day.month + '/' + day.day + '</span>' +
          '<div class="chart-tooltip" aria-hidden="true">' +
            '<span class="chart-tooltip-date">' + (day.isToday ? '今天 · ' : '') + day.month + '月' + day.day + '日</span>' +
            '<div class="chart-tooltip-row"><span class="chart-tooltip-key"><span class="chart-tooltip-dot learned"></span>新学</span><strong>' + day.learned + '</strong></div>' +
            '<div class="chart-tooltip-row"><span class="chart-tooltip-key"><span class="chart-tooltip-dot review"></span>复习</span><strong>' + day.reviewed + '</strong></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    const tableRows = week.map(function (day) {
      return (
        '<tr>' +
          '<td>' + (day.isToday ? '今天' : '周' + day.weekday) + ' · ' + day.month + '/' + day.day + '</td>' +
          '<td>' + day.learned + '</td>' +
          '<td>' + day.reviewed + '</td>' +
          '<td>' + day.total + '</td>' +
        '</tr>'
      );
    }).join('');

    views.stats.innerHTML =
      '<div class="page stats-page">' +
        '<header class="page-head">' +
          '<div>' +
            '<p class="page-kicker">学习报告</p>' +
            '<h1 class="page-title">数据与节奏</h1>' +
            '<p class="page-sub">看见每天累积的一点点，把复习交给节奏。</p>' +
          '</div>' +
        '</header>' +

        '<section class="streak-banner" aria-label="连续打卡">' +
          '<span class="streak-flame">' + icon('flame', 25) + '</span>' +
          '<div class="streak-copy">' +
            '<p class="streak-label">' + (stats.streak > 0 ? '连续打卡' : '打卡记录') + '</p>' +
            '<div class="streak-figure"><span class="streak-number">' + stats.streak + '</span><span class="streak-unit">天</span></div>' +
            '<p class="streak-sub">' + (stats.streak > 0 ? '保持节奏，明天也来见一面吧。' : '完成一次学习或复习，就能点亮今天。') + '</p>' +
          '</div>' +
        '</section>' +

        '<div class="kpi-grid">' +
          '<div class="kpi-card"><p class="kpi-label">已学</p><p class="kpi-value">' + stats.learned + '<small>词</small></p><p class="kpi-detail">词库共 ' + stats.total + ' 词</p></div>' +
          '<div class="kpi-card"><p class="kpi-label">已掌握</p><p class="kpi-value">' + stats.mastered + '<small>词</small></p><p class="kpi-detail">占已学 ' + masteryPercent + '%</p></div>' +
          '<div class="kpi-card"><p class="kpi-label">学习中</p><p class="kpi-value">' + stats.learning + '<small>词</small></p><p class="kpi-detail">正在复习循环中</p></div>' +
          '<div class="kpi-card"><p class="kpi-label">待复习</p><p class="kpi-value">' + stats.due + '<small>词</small></p><p class="kpi-detail">现在可复习</p></div>' +
          '<div class="kpi-card"><p class="kpi-label">今日学习</p><p class="kpi-value">' + stats.newToday + '<small>词</small></p><p class="kpi-detail">目标 ' + state.settings.dailyNew + ' 个</p></div>' +
          '<div class="kpi-card"><p class="kpi-label">今日复习</p><p class="kpi-value">' + stats.reviewToday + '<small>次</small></p><p class="kpi-detail">每一次回想都算数</p></div>' +
        '</div>' +

        '<section class="freq-summary" aria-labelledby="freq-summary-title">' +
          '<div class="freq-summary-head">' +
            '<h2 class="freq-summary-title" id="freq-summary-title">已掌握 · 高考频次</h2>' +
            '<p class="freq-summary-note">按词库标注统计</p>' +
          '</div>' +
          '<div class="freq-summary-grid">' +
            '<div class="freq-summary-item is-high"><span class="freq-summary-label">高频</span><strong>' + stats.masteredFreq['高'] + '</strong><small>词</small></div>' +
            '<div class="freq-summary-item is-mid"><span class="freq-summary-label">中频</span><strong>' + stats.masteredFreq['中'] + '</strong><small>词</small></div>' +
            '<div class="freq-summary-item is-low"><span class="freq-summary-label">低频</span><strong>' + stats.masteredFreq['低'] + '</strong><small>词</small></div>' +
          '</div>' +
        '</section>' +

        '<section class="chart-card" aria-labelledby="chart-title">' +
          '<div class="chart-header">' +
            '<div>' +
              '<h2 class="chart-title" id="chart-title">近 7 天学习节奏</h2>' +
              '<p class="chart-subtitle">过去 7 天共作答 ' + weekTotal + ' 次</p>' +
            '</div>' +
            '<div class="chart-legend" aria-label="图例">' +
              '<span class="legend-item"><span class="legend-swatch learned"></span>新学</span>' +
              '<span class="legend-item"><span class="legend-swatch review"></span>复习</span>' +
            '</div>' +
          '</div>' +
          '<div class="week-chart" role="list" aria-label="近 7 天每日新学与复习数量柱状图">' + chartHtml + '</div>' +
          (!hasWeekData ? '<p class="chart-empty-note">近 7 天还没有学习记录，完成一轮学习后就会在这里留下痕迹。</p>' : '') +
          '<details class="data-details">' +
            '<summary>查看数据表</summary>' +
            '<table class="data-table">' +
              '<caption class="sr-only">近 7 天新学、复习与合计数据</caption>' +
              '<thead><tr><th scope="col">日期</th><th scope="col">新学</th><th scope="col">复习</th><th scope="col">合计</th></tr></thead>' +
              '<tbody>' + tableRows + '</tbody>' +
            '</table>' +
          '</details>' +
        '</section>' +

        '<p class="muted-note">统计按本机时间计算；悬停或点按柱子可查看当天明细。</p>' +
      '</div>';
  }

  /* ---------- 同步进度到 GitHub ---------- */

  function loadGithubSyncPrefs() {
    try {
      const raw = window.localStorage.getItem(GITHUB_SYNC_PREFS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        autoUpload: !parsed || parsed.autoUpload !== false,
        lastAutoUploadAt: parsed && Number(parsed.lastAutoUploadAt) > 0 ? Number(parsed.lastAutoUploadAt) : 0,
        lastUploadAt: parsed && Number(parsed.lastUploadAt) > 0 ? Number(parsed.lastUploadAt) : 0,
        lastUploadOk: Boolean(parsed && parsed.lastUploadOk)
      };
    } catch (error) {
      return { autoUpload: true, lastAutoUploadAt: 0, lastUploadAt: 0, lastUploadOk: false };
    }
  }

  function saveGithubSyncPrefs() {
    try {
      window.localStorage.setItem(GITHUB_SYNC_PREFS_KEY, JSON.stringify({
        autoUpload: githubSyncPrefs.autoUpload !== false,
        lastAutoUploadAt: githubSyncPrefs.lastAutoUploadAt || 0,
        lastUploadAt: githubSyncPrefs.lastUploadAt || 0,
        lastUploadOk: Boolean(githubSyncPrefs.lastUploadOk)
      }));
    } catch (error) {
      console.warn('保存同步偏好失败：', error);
    }
  }

  function readGithubToken() {
    try {
      return normalizeGithubToken(window.localStorage.getItem(GITHUB_TOKEN_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function normalizeGithubToken(raw) {
    let token = String(raw || '').replace(/^\uFEFF/, '').trim();
    token = token.replace(/^bearer\s+/i, '').trim();
    token = token.replace(/\s+/g, '');
    return token;
  }

  function tokenSavedText() {
    const token = readGithubToken();
    if (!token) return '尚未保存令牌。';
    return '已保存在本机（末四位 ' + token.slice(-4) + '）。页面和仓库里都不会留下完整令牌。';
  }

  function formatShanghai(timestamp) {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const map = {};
    formatter.formatToParts(date).forEach(function (part) {
      map[part.type] = part.value;
    });
    let hour = map.hour || '00';
    if (hour === '24') hour = '00';
    return map.year + '-' + map.month + '-' + map.day + 'T' + hour + ':' + map.minute + ':' + map.second + '+08:00';
  }

  function shanghaiDayKey(timestamp) {
    const formatted = formatShanghai(timestamp);
    return formatted ? formatted.slice(0, 10) : '';
  }

  function exportLastResult(progress) {
    if (progress.lastResult === 'known' || progress.lastResult === 'fuzzy' || progress.lastResult === 'unknown') {
      return progress.lastResult;
    }
    if (progress.masteredAt) return 'known';
    if (progress.stage === 0 && progress.lapses > 0) return 'unknown';
    if (progress.stage > 0) return 'known';
    return null;
  }

  function lastResultLabel(result) {
    if (result === 'known') return '认识';
    if (result === 'fuzzy') return '模糊';
    if (result === 'unknown') return '不认识';
    return '';
  }

  function describeWordPlace(word) {
    if (word.book === CUSTOM_BOOK_ID || word.unit === CUSTOM_UNIT_ID) {
      return {
        book: CUSTOM_BOOK_NAME,
        bookId: CUSTOM_BOOK_ID,
        unit: CUSTOM_UNIT_TITLE,
        unitId: CUSTOM_UNIT_ID
      };
    }
    const meta = findUnitMeta(word.unit);
    return {
      book: (meta && meta.bookName) || findBookName(word.book) || word.book || '',
      bookId: (meta && meta.bookId) || word.book || '',
      unit: (meta && meta.unitTitle) || word.unit || '',
      unitId: word.unit || ''
    };
  }

  function toProgressRecord(word, progress) {
    const place = describeWordPlace(word);
    const lastResult = exportLastResult(progress);
    return {
      word: word.w,
      book: place.book,
      bookId: place.bookId,
      unit: place.unit,
      unitId: place.unitId,
      stage: progress.masteredAt ? STAGE_COUNT : progress.stage,
      nextReviewTime: progress.masteredAt ? null : formatShanghai(progress.nextReviewAt),
      wrongCount: progress.lapses,
      lastResult: lastResult,
      lastResultLabel: lastResultLabel(lastResult)
    };
  }

  function isDifficultProgress(progress, record) {
    if (progress.masteredAt) return false;
    if (progress.lapses > 0) return true;
    return record.lastResult === 'unknown' || record.lastResult === 'fuzzy';
  }

  function compareProgressRecords(a, b) {
    return String(a.book).localeCompare(String(b.book), 'zh') ||
      String(a.unit).localeCompare(String(b.unit), 'zh') ||
      String(a.word).localeCompare(String(b.word), 'en');
  }

  function buildSelectedExport() {
    const summary = getSelectionSummary();
    const books = [];
    const seen = new Set();
    summary.units.forEach(function (unit) {
      if (seen.has(unit.bookId)) return;
      seen.add(unit.bookId);
      books.push({ id: unit.bookId, name: unit.bookName });
    });
    return {
      books: books,
      units: summary.units.map(function (unit) {
        return {
          id: unit.unitId,
          title: unit.title,
          bookId: unit.bookId,
          book: unit.bookName
        };
      })
    };
  }

  function buildProgressExport() {
    const now = Date.now();
    const todayKey = shanghaiDayKey(now);
    const stats = getStats();
    const words = [];
    const unmasteredWords = [];
    const difficultWords = [];
    let learned = 0;
    let mastered = 0;
    let dueToday = 0;

    getActiveWords().forEach(function (word) {
      const progress = getProgress(word);
      if (!progress) return;
      learned += 1;
      const record = toProgressRecord(word, progress);
      words.push(record);
      if (progress.masteredAt) {
        mastered += 1;
        return;
      }
      unmasteredWords.push(record);
      if (isDifficultProgress(progress, record)) difficultWords.push(record);
      if (progress.nextReviewAt > 0) {
        const reviewDay = shanghaiDayKey(progress.nextReviewAt);
        if (progress.nextReviewAt <= now || reviewDay === todayKey) dueToday += 1;
      }
    });

    words.sort(compareProgressRecords);
    unmasteredWords.sort(compareProgressRecords);
    difficultWords.sort(compareProgressRecords);

    return {
      schemaVersion: 1,
      exportedAt: formatShanghai(now),
      timezone: 'Asia/Shanghai',
      repository: GITHUB_REPO,
      path: GITHUB_PROGRESS_PATH,
      selected: buildSelectedExport(),
      stats: {
        totalWords: stats.total,
        learned: stats.learned,
        mastered: stats.mastered,
        learning: stats.learning,
        dueNow: stats.due,
        dueToday: dueToday,
        newToday: stats.newToday,
        reviewToday: stats.reviewToday,
        streakDays: stats.streak,
        last7Days: stats.week.map(function (day) {
          return {
            date: day.key,
            learned: day.learned,
            reviewed: day.reviewed
          };
        })
      },
      totals: {
        learned: learned,
        mastered: mastered,
        dueToday: dueToday
      },
      words: words,
      unmasteredWords: unmasteredWords,
      difficultWords: difficultWords,
      reading: latestReadingExport(),
      recentReadingScores: recentReadingScores(),
      // 同时带上可还原的本机数据，另一台设备「下载进度」时可原样恢复。
      data: state
    };
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const slice = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  function base64ToUtf8(text) {
    const binary = atob(String(text || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  }

  function githubErrorMessage(status, data) {
    if (!status) return '上传失败：无法连接 GitHub，请检查网络后再试。';
    if (status === 401) return '上传失败：令牌无效或已过期，请重新生成并保存。';
    if (status === 403) return '上传失败：令牌没有 yoreverse2423/English 的 Contents 读写权限。';
    if (status === 404) return '上传失败：找不到仓库 yoreverse2423/English，或令牌无权访问它。';
    if (status === 409) return '上传失败：远程进度刚被更新，请再试一次。';
    const apiMessage = data && data.message ? String(data.message) : '';
    if (status === 422) {
      return '上传失败：GitHub 拒绝了这次提交。' + (apiMessage ? '（' + apiMessage + '）' : '');
    }
    return '上传失败（HTTP ' + status + '）。' + (apiMessage ? ' ' + apiMessage : '');
  }

  function isUnchangedContent(data) {
    const message = data && data.message ? String(data.message).toLowerCase() : '';
    return message.indexOf('does not need') !== -1 ||
      message.indexOf('identical') !== -1 ||
      message.indexOf('already up-to-date') !== -1;
  }

  function githubContents(method, token, body) {
    return fetch('https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + GITHUB_PROGRESS_PATH, {
      method: method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      return response.text().then(function (text) {
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = { message: String(text).slice(0, 180) };
          }
        }
        return { ok: response.ok, status: response.status, data: data };
      });
    }).catch(function (error) {
      if (error && error.message && error.message.indexOf('上传失败') === 0) throw error;
      throw new Error('上传失败：无法连接 GitHub，请检查网络后再试。');
    });
  }

  function putProgressFile(token, content, attempt) {
    return githubContents('GET', token).then(function (got) {
      if (got.status === 401 || got.status === 403) {
        throw new Error(githubErrorMessage(got.status, got.data));
      }
      let sha = '';
      if (got.status === 200 && got.data && got.data.sha) {
        sha = String(got.data.sha);
      } else if (got.status !== 404) {
        throw new Error(githubErrorMessage(got.status, got.data));
      }

      const body = {
        message: 'sync progress',
        content: content,
        branch: 'main'
      };
      if (sha) body.sha = sha;

      return githubContents('PUT', token, body).then(function (put) {
        if (put.ok) return { unchanged: false };
        if (put.status === 409 && isUnchangedContent(put.data)) return { unchanged: true };
        if (put.status === 409 && attempt < 1) return putProgressFile(token, content, attempt + 1);
        throw new Error(githubErrorMessage(put.status, put.data));
      });
    });
  }

  function setGithubSyncStatus(state, message) {
    githubSyncStatus = { state: state, message: message };
    const el = document.getElementById('github-sync-status');
    if (!el) return;
    el.className = 'sync-status' + (state && state !== 'idle' ? ' is-' + state : '');
    el.textContent = message || '';
  }

  function syncStatusText() {
    if (githubSyncStatus.message) return githubSyncStatus.message;
    if (!githubSyncPrefs.lastUploadAt) return '还没有上传过。';
    const when = formatShanghai(githubSyncPrefs.lastUploadAt);
    if (githubSyncPrefs.lastUploadOk) return '上次上传成功：' + when + '（北京时间）。';
    return '上次上传未成功。可以再点一次「上传进度」。';
  }

  function uploadProgress(options) {
    const auto = Boolean(options && options.auto);
    if (githubSyncInFlight) {
      if (!auto) showToast('正在上传，请稍候。');
      return;
    }

    const token = readGithubToken();
    if (!token) {
      if (!auto) {
        const message = '请先保存 GitHub 令牌，再上传进度。';
        setGithubSyncStatus('error', message);
        showToast(message, 'error');
      }
      return;
    }

    if (auto) {
      if (!githubSyncPrefs.autoUpload) return;
      const elapsed = Date.now() - (githubSyncPrefs.lastAutoUploadAt || 0);
      if (githubSyncPrefs.lastAutoUploadAt && elapsed < GITHUB_AUTO_UPLOAD_GAP) return;
      githubSyncPrefs.lastAutoUploadAt = Date.now();
      saveGithubSyncPrefs();
    }

    githubSyncInFlight = true;
    setGithubSyncStatus('pending', auto ? '正在自动上传进度…' : '正在上传进度…');
    const uploadButton = document.getElementById('github-upload-button');
    if (uploadButton) uploadButton.disabled = true;

    let content = '';
    try {
      content = utf8ToBase64(JSON.stringify(buildProgressExport(), null, 2) + '\n');
    } catch (error) {
      githubSyncInFlight = false;
      const message = '上传失败：无法整理学习进度。';
      setGithubSyncStatus('error', message);
      showToast(message, 'error');
      if (uploadButton) uploadButton.disabled = false;
      return;
    }

    putProgressFile(token, content, 0).then(function (result) {
      githubSyncInFlight = false;
      githubSyncPrefs.lastUploadAt = Date.now();
      githubSyncPrefs.lastUploadOk = true;
      saveGithubSyncPrefs();
      const message = result && result.unchanged
        ? '进度没有变化，GitHub 上已是最新。'
        : '进度已上传到 data/progress.json。';
      setGithubSyncStatus('success', message);
      showToast(message);
      const button = document.getElementById('github-upload-button');
      if (button) button.disabled = false;
    }).catch(function (error) {
      githubSyncInFlight = false;
      githubSyncPrefs.lastUploadAt = Date.now();
      githubSyncPrefs.lastUploadOk = false;
      saveGithubSyncPrefs();
      const message = error && error.message ? error.message : '上传失败，请稍后再试。';
      setGithubSyncStatus('error', message);
      showToast(message, 'error');
      const button = document.getElementById('github-upload-button');
      if (button) button.disabled = false;
    });
  }

  function githubDownloadErrorMessage(status, data) {
    if (status === 401) return '下载失败：令牌无效或已过期，请重新生成并保存。';
    if (status === 403) return '下载失败：令牌没有 yoreverse2423/English 的 Contents 读取权限。';
    if (status === 404) return '仓库还没有进度文件（data/progress.json），请先在任一设备上传一次。';
    const apiMessage = data && data.message ? String(data.message) : '';
    return '下载失败（HTTP ' + status + '）。' + (apiMessage ? ' ' + apiMessage : '');
  }

  function downloadProgress() {
    if (githubSyncInFlight) {
      showToast('正在同步，请稍候。');
      return;
    }

    const token = readGithubToken();
    if (!token) {
      const message = '请先保存 GitHub 令牌，再下载进度。';
      setGithubSyncStatus('error', message);
      showToast(message, 'error');
      return;
    }

    githubSyncInFlight = true;
    setGithubSyncStatus('pending', '正在下载进度…');
    const downloadButton = document.getElementById('github-download-button');
    const uploadButton = document.getElementById('github-upload-button');
    if (downloadButton) downloadButton.disabled = true;
    if (uploadButton) uploadButton.disabled = true;

    function finish() {
      githubSyncInFlight = false;
      if (downloadButton) downloadButton.disabled = false;
      if (uploadButton) uploadButton.disabled = false;
    }

    githubContents('GET', token).then(function (got) {
      if (!got.ok) {
        throw new Error(githubDownloadErrorMessage(got.status, got.data));
      }
      if (!got.data || !got.data.content) {
        throw new Error('下载失败：仓库里的进度文件缺少内容。');
      }
      let parsed = null;
      try {
        parsed = JSON.parse(base64ToUtf8(got.data.content));
      } catch (error) {
        throw new Error('下载失败：仓库里的进度文件不是有效的 JSON。');
      }
      const restorable = parsed && typeof parsed === 'object' && (
        parsed.data ||
        ['settings', 'progress', 'daily', 'customWords', 'selectedUnits'].some(function (key) {
          return Object.prototype.hasOwnProperty.call(parsed, key);
        })
      );
      if (!restorable) {
        throw new Error('下载失败：仓库里是旧版进度报告，缺少可恢复的学习数据；请先在已更新小单词机的设备上重新上传一次。');
      }

      finish();
      const applied = importBackupData(parsed, {
        confirmMessage: '将用仓库中的进度覆盖本机学习数据，确定？',
        successMessage: '已用仓库进度覆盖本机数据。'
      });
      if (applied) {
        setGithubSyncStatus('success', '已下载 data/progress.json 并覆盖本机进度。');
      } else {
        setGithubSyncStatus('idle', '已取消下载，本机进度未改动。');
      }
    }).catch(function (error) {
      finish();
      let message = error && error.message ? error.message : '下载失败，请稍后再试。';
      if (message.indexOf('上传失败') === 0) {
        message = '下载失败：无法连接 GitHub，请检查网络后再试。';
      } else if (message.indexOf('下载失败') !== 0) {
        message = '下载失败：' + message;
      }
      setGithubSyncStatus('error', message);
      showToast(message, 'error');
    });
  }

  function maybeAutoUploadProgress() {
    if (!githubSyncPrefs.autoUpload) return;
    if (!readGithubToken()) return;
    uploadProgress({ auto: true });
  }

  function saveGithubTokenFromInput() {
    const input = document.getElementById('github-token-input');
    const token = normalizeGithubToken(input ? input.value : '');
    if (!token) {
      showToast('请先粘贴 GitHub 令牌。', 'error');
      if (input) input.focus();
      return;
    }
    if (token.length < 20) {
      showToast('令牌太短，请粘贴完整的细粒度个人访问令牌。', 'error');
      return;
    }

    try {
      window.localStorage.setItem(GITHUB_TOKEN_KEY, token);
    } catch (error) {
      showToast('无法把令牌写入本地存储。', 'error');
      return;
    }

    if (input) input.value = '';
    const looksFineGrained = token.indexOf('github_pat_') === 0;
    showToast(looksFineGrained ? '令牌已保存在本机。' : '令牌已保存。细粒度令牌一般以 github_pat_ 开头，请确认权限。');
    renderSettings();
  }

  function clearGithubToken() {
    if (!readGithubToken()) {
      showToast('当前没有已保存的令牌。');
      return;
    }
    const confirmed = window.confirm('确定清除保存在本机的 GitHub 令牌吗？已上传的进度文件不会被删除。');
    if (!confirmed) return;
    try {
      window.localStorage.removeItem(GITHUB_TOKEN_KEY);
    } catch (error) {
      showToast('清除令牌失败。', 'error');
      return;
    }
    const input = document.getElementById('github-token-input');
    if (input) input.value = '';
    showToast('已清除本机令牌。');
    renderSettings();
  }

  function updateGithubAutoUpload(enabled) {
    githubSyncPrefs.autoUpload = Boolean(enabled);
    saveGithubSyncPrefs();
    showToast(enabled ? '已开启学习结束后自动上传' : '已关闭自动上传');
  }

  /* ---------- 每日阅读 · DeepSeek ---------- */

  function readDeepseekKey() {
    try {
      return normalizeGithubToken(window.localStorage.getItem(DEEPSEEK_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function deepseekKeyText() {
    const key = readDeepseekKey();
    if (!key) return '尚未保存 API Key。';
    return '已保存在本机（末四位 ' + key.slice(-4) + '）。不会写入代码或仓库。';
  }

  function readDeepseekModel() {
    try {
      const raw = window.localStorage.getItem(DEEPSEEK_PREFS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const model = parsed && typeof parsed.model === 'string' ? parsed.model : '';
      if (DEEPSEEK_MODELS.indexOf(model) !== -1) return model;
    } catch (error) {
      // 使用默认模型。
    }
    return 'deepseek-chat';
  }

  function saveDeepseekModel(model) {
    const next = DEEPSEEK_MODELS.indexOf(model) === -1 ? 'deepseek-chat' : model;
    try {
      window.localStorage.setItem(DEEPSEEK_PREFS_KEY, JSON.stringify({ model: next }));
    } catch (error) {
      showToast('无法保存模型选择。', 'error');
      return;
    }
    showToast('已选择模型 ' + next);
  }

  function saveDeepseekKeyFromInput() {
    const input = document.getElementById('deepseek-key-input');
    const key = normalizeGithubToken(input ? input.value : '');
    if (!key) {
      showToast('请先粘贴 DeepSeek API Key。', 'error');
      if (input) input.focus();
      return;
    }
    if (key.length < 12) {
      showToast('API Key 太短，请粘贴完整密钥。', 'error');
      return;
    }
    try {
      window.localStorage.setItem(DEEPSEEK_KEY, key);
    } catch (error) {
      showToast('无法把 API Key 写入本地存储。', 'error');
      return;
    }
    if (input) input.value = '';
    readingError = '';
    showToast('API Key 已保存在本机。');
    renderSettings();
  }

  function clearDeepseekKey() {
    if (!readDeepseekKey()) {
      showToast('当前没有已保存的 API Key。');
      return;
    }
    const confirmed = window.confirm('确定清除保存在本机的 DeepSeek API Key 吗？已生成的阅读仍会留在本机。');
    if (!confirmed) return;
    try {
      window.localStorage.removeItem(DEEPSEEK_KEY);
    } catch (error) {
      showToast('清除 API Key 失败。', 'error');
      return;
    }
    showToast('已清除本机 API Key。');
    renderSettings();
  }

  function normalizeChoice(value) {
    const text = String(value || '').trim().toUpperCase();
    const match = text.match(/[ABCD]/);
    return match ? match[0] : '';
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function countEnglishWords(text) {
    const matches = String(text || '').replace(/\*\*/g, '').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
    return matches ? matches.length : 0;
  }

  function collectReadingTargets() {
    const now = Date.now();
    const today = getDayKey(now);
    const items = [];

    getActiveWords().forEach(function (word) {
      const progress = getProgress(word);
      if (!progress) return;
      const learnedToday = Boolean(progress.learnedAt && getDayKey(progress.learnedAt) === today);
      const unmastered = !progress.masteredAt;
      const due = Boolean(unmastered && progress.nextReviewAt > 0 && progress.nextReviewAt <= now);
      if (!learnedToday && !unmastered) return;
      const hard = progress.lapses > 0 || progress.lastResult === 'unknown' || progress.lastResult === 'fuzzy';
      let rank = 4;
      if (unmastered && due) rank = 0;
      else if (unmastered && hard) rank = 1;
      else if (unmastered && learnedToday) rank = 2;
      else if (unmastered) rank = 3;
      items.push({
        word: word,
        rank: rank,
        lapses: progress.lapses || 0,
        learnedToday: learnedToday
      });
    });

    items.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.lapses !== b.lapses) return b.lapses - a.lapses;
      if (a.learnedToday !== b.learnedToday) return a.learnedToday ? -1 : 1;
      return String(a.word.w).localeCompare(String(b.word.w), 'en');
    });

    const seen = new Set();
    const result = [];
    items.forEach(function (item) {
      const key = wordKey(item.word);
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (result.length >= READING_WORD_CAP) return;
      result.push(item.word);
    });
    return result;
  }

  function readingTargetSummary(words) {
    if (!words.length) return '今天还没有可融入的生词或未掌握词。';
    return '将优先使用 ' + words.length + ' 个未掌握或今天新学的词（最多 ' + READING_WORD_CAP + ' 个）。';
  }

  function extractJsonObject(text) {
    let raw = String(text || '').trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) raw = fence[1].trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw invalidReadingError();
    }
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (error) {
      throw invalidReadingError();
    }
  }

  function invalidReadingError() {
    const error = new Error('模型返回的不是有效题目，请再试一次。');
    error.code = 'invalid-json';
    return error;
  }

  function normalizeGeneratedReading(payload, targets) {
    const data = payload && payload.passage ? payload : null;
    if (!data || typeof data.passage !== 'string') throw invalidReadingError();
    const passage = data.passage.replace(/\*\*/g, '').trim();
    const wordCount = countEnglishWords(passage);
    if (wordCount < 200 || wordCount > 480) throw invalidReadingError();
    if (!Array.isArray(data.questions) || data.questions.length < 4) throw invalidReadingError();

    const questions = [];
    for (let index = 0; index < 4; index += 1) {
      const item = data.questions[index];
      if (!item || typeof item !== 'object') throw invalidReadingError();
      const stem = toText(item.stem || item.question);
      const rawOptions = Array.isArray(item.options) ? item.options : item.choices;
      if (!stem || !Array.isArray(rawOptions) || rawOptions.length < 4) throw invalidReadingError();
      const options = [];
      for (let optionIndex = 0; optionIndex < 4; optionIndex += 1) {
        const option = rawOptions[optionIndex];
        const fallbackKey = 'ABCD'.charAt(optionIndex);
        let key = fallbackKey;
        let text = '';
        if (typeof option === 'string') {
          text = option.replace(/^[A-D][\.、\s]+/i, '').trim();
        } else if (option && typeof option === 'object') {
          key = normalizeChoice(option.key || option.label) || fallbackKey;
          text = toText(option.text || option.content);
        }
        if (!text) throw invalidReadingError();
        options.push({ key: key, text: text });
      }
      const answer = normalizeChoice(item.answer || item.correct);
      if (!answer || !options.some(function (option) { return option.key === answer; })) {
        throw invalidReadingError();
      }
      questions.push({
        id: index + 1,
        stem: stem,
        options: options,
        answer: answer,
        explanation: toText(item.explanation || item.analysis) || '暂无解析'
      });
    }

    const used = targets.filter(function (word) {
      const pattern = new RegExp('\\b' + escapeRegex(word.w) + '\\b', 'i');
      return pattern.test(passage);
    }).map(function (word) {
      return word.w;
    });

    return {
      title: toText(data.title) || '阅读理解',
      passage: passage,
      wordCount: wordCount,
      targetWords: used.length ? used : targets.map(function (word) { return word.w; }),
      questions: questions
    };
  }

  function buildReadingMessages(targets, isRetry) {
    const glossary = targets.map(function (word, index) {
      return (index + 1) + '. ' + word.w +
        (word.pos ? ' (' + word.pos + ')' : '') +
        (word.cn ? ' — ' + word.cn : '');
    }).join('\n');
    const system = '你是高考英语阅读命题老师。只输出一个 JSON 对象，不要使用 Markdown 代码块，不要附加解释。';
    let user = '请写一篇原创英语阅读短文，难度对标高考阅读理解（新课标，约 CEFR B1–B2）。\n' +
      '要求：\n' +
      '1. passage 为 300 到 350 个英文单词，主题完整，不要抄袭真题或已发表文章。\n' +
      '2. 下列每个目标词都要以原形至少出现一次，并用双星号标出，例如 **exchange**。\n' +
      '3. 出 4 道单项选择题。题干和选项用英文，explanation 用一两句中文。覆盖主旨、细节、推理、词义或作者态度。每题恰好四个选项，key 为 A/B/C/D，answer 只能是其中一个。\n' +
      '4. 只返回如下 JSON：{"title":"","passage":"","wordCount":320,"questions":[{"id":1,"stem":"","options":[{"key":"A","text":""},{"key":"B","text":""},{"key":"C","text":""},{"key":"D","text":""}],"answer":"A","explanation":""}]}\n' +
      '目标词：\n' + glossary;
    if (isRetry) {
      user += '\n\n上一次输出无法解析成上述 JSON。这次只输出一个合法 JSON 对象，不要代码块。';
    }
    return [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
  }

  function deepseekFailure(status, data) {
    if (!status) return '无法连接 DeepSeek。请检查网络；如果浏览器拦截了跨域（CORS），网页也不能直接调用该接口。';
    if (status === 401) return 'DeepSeek API Key 无效或已失效，请在设置中重新保存。';
    if (status === 402) return 'DeepSeek 账户余额不足，暂时无法生成。';
    if (status === 429) return 'DeepSeek 请求过于频繁，请稍后再试。';
    const apiMessage = data && data.error && data.error.message
      ? String(data.error.message)
      : (data && data.message ? String(data.message) : '');
    const safe = apiMessage.replace(/sk-[A-Za-z0-9_\-]+/g, 'sk-…').slice(0, 180);
    if (status === 400) return 'DeepSeek 拒绝了这次请求。' + (safe ? '（' + safe + '）' : '');
    return 'DeepSeek 请求失败（HTTP ' + status + '）。' + (safe ? ' ' + safe : '');
  }

  function requestDeepseekReading(targets, isRetry) {
    const key = readDeepseekKey();
    const model = readDeepseekModel();
    const body = {
      model: model,
      messages: buildReadingMessages(targets, isRetry)
    };
    if (model !== 'deepseek-reasoner') {
      body.temperature = 0.7;
      body.response_format = { type: 'json_object' };
    }
    return fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.text().then(function (text) {
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = { message: String(text).slice(0, 180) };
          }
        }
        if (!response.ok) {
          const error = new Error(deepseekFailure(response.status, data));
          error.code = 'http';
          throw error;
        }
        const content = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : '';
        const parsed = content && typeof content === 'object' ? content : extractJsonObject(content);
        return normalizeGeneratedReading(parsed, targets);
      });
    }).catch(function (error) {
      if (error && (error.code === 'invalid-json' || error.code === 'http')) throw error;
      const networkError = new Error(deepseekFailure(0, null));
      networkError.code = 'network';
      throw networkError;
    });
  }

  /* ---------- 阅读生词自动补全 ---------- */

  // 与 highlightPassageHtml 使用同一套 token 规则，按首次出现顺序返回未收录的词。
  function collectReadingOovTokens(passage) {
    const clean = String(passage || '').replace(/\*\*/g, '');
    const pattern = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
    const matches = clean.match(pattern) || [];
    const seen = new Set();
    const result = [];
    for (let i = 0; i < matches.length; i += 1) {
      const token = matches[i];
      const key = wordKey(token);
      if (!key || key.length < 2) continue;
      if (OOV_STOP_WORDS.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      if (lookupReadingWord(token)) continue;
      result.push(token);
    }
    return result;
  }

  function buildOovEnrichMessages(words) {
    const list = words.map(function (word, index) {
      return (index + 1) + '. ' + word;
    }).join('\n');
    const system = '你是高中英语词典编辑，熟悉高考词汇和完形填空搭配。只输出一个 JSON 对象，不要使用 Markdown 代码块，不要附加任何解释。';
    const user = '请为下面每个英文单词生成一条词库条目，供背单词应用直接使用。\n' +
      '要求：\n' +
      '1. 每条对象字段：{"w":"词典原形","ph":"/音标/","pos":"词性（如 v. / n. / adj. / adv.）","cn":"中文释义",' +
        '"col":[{"en":"高考完形或阅读常见搭配","cn":"中文"}],"ex":{"en":"一句原创英文例句","cn":"中文翻译"},' +
        '"wf":{"n":[],"v":[],"adj":[],"adv":[]},"freq":"高|中|低"}\n' +
      '2. w 用词典原形（lemma）。如果给出的词是屈折形式，请把该形式放进 wf 对应的类别。\n' +
      '3. cn 用适合高中生的简明中文释义；col 给 2 到 3 条高考完形或阅读常见搭配。\n' +
      '4. ex 给一句原创英文例句和中文翻译，不要照抄阅读原文。\n' +
      '5. wf 只填真实存在的名词、动词、形容词、副词形式；没有就留空数组。\n' +
      '6. freq 按高考频率判断：常见核心词为“高”，一般课标词为“中”，生僻或文学词为“低”。\n' +
      '7. 不要输出阅读题答案，不要输出 JSON 以外的任何文字。\n' +
      '只返回 {"words":[...]}，为每个请求词各生成一条。\n' +
      '单词：\n' + list;
    return [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
  }

  function invalidOovError() {
    const error = new Error('模型没有返回可用的生词释义，请稍后再试。');
    error.code = 'invalid-json';
    return error;
  }

  function requestDeepseekOovEnrich(words) {
    const key = readDeepseekKey();
    const model = readDeepseekModel();
    const body = {
      model: model,
      messages: buildOovEnrichMessages(words)
    };
    if (model !== 'deepseek-reasoner') {
      body.temperature = 0.3;
      body.response_format = { type: 'json_object' };
    }
    return fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.text().then(function (text) {
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = { message: String(text).slice(0, 180) };
          }
        }
        if (!response.ok) {
          const error = new Error(deepseekFailure(response.status, data));
          error.code = 'http';
          throw error;
        }
        const content = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : '';
        let parsed;
        try {
          parsed = content && typeof content === 'object' ? content : extractJsonObject(content);
        } catch (parseError) {
          throw invalidOovError();
        }
        const rawList = Array.isArray(parsed)
          ? parsed
          : (parsed && Array.isArray(parsed.words) ? parsed.words : []);
        if (!rawList.length) throw invalidOovError();
        return rawList;
      });
    }).catch(function (error) {
      if (error && (error.code === 'invalid-json' || error.code === 'http')) throw error;
      const networkError = new Error(deepseekFailure(0, null));
      networkError.code = 'network';
      throw networkError;
    });
  }

  // 把 wf 里的真实词形轻微镜像到 forms，阅读查词索引就能命中屈折形式。
  function syncWordFormsFromWf(word) {
    if (!word || !word.wf || typeof word.wf !== 'object') return word;
    const baseKey = wordKey(word);
    const seen = new Set();
    const forms = [];
    ['n', 'v', 'adj', 'adv'].forEach(function (kind) {
      const list = Array.isArray(word.wf[kind]) ? word.wf[kind] : [];
      list.forEach(function (item) {
        const text = toText(item);
        const key = wordKey(text);
        if (!text || !key || key === baseKey || seen.has(key)) return;
        seen.add(key);
        forms.push({ w: text, ph: '', pos: '', cn: '' });
      });
    });
    if (forms.length) word.forms = forms;
    return word;
  }

  function normalizeOovEnrichResults(rawList) {
    const result = [];
    const seen = new Set();
    (Array.isArray(rawList) ? rawList : []).forEach(function (raw) {
      const word = normalizeCustomWord(raw);
      if (!word) return;
      const key = wordKey(word);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(word);
    });
    return result;
  }

  // 与手动添加共用 normalizeCustomWord → 去重 → 保存并失效缓存。
  // 注意：补全只写入自定义词库，不选中“自定义”单元、不创建学习进度；
  // 是否进入复习由用户在阅读页点「加入复习」自行决定。
  function addEnrichedCustomWords(wordObjs) {
    const existing = new Set(getActiveWords().map(function (word) {
      return wordKey(word);
    }));
    const added = [];

    (Array.isArray(wordObjs) ? wordObjs : []).forEach(function (wordObj) {
      const normalized = normalizeCustomWord(wordObj);
      if (!normalized) return;
      const key = wordKey(normalized);
      if (!key || existing.has(key)) return;
      syncWordFormsFromWf(normalized);
      state.customWords.push(normalized);
      existing.add(key);
      added.push(normalized);
    });

    if (!added.length) return 0;

    saveState();
    invalidateWordCache();
    return added.length;
  }

  function enrichReadingOov(passage) {
    const text = String(passage || '');
    if (!text) return;
    if (readingEnrichBusy) {
      // 上一轮还没结束，记下最新文章，结束后继续补全。
      readingEnrichPending = text;
      return;
    }
    if (!readDeepseekKey()) return;

    const tokens = collectReadingOovTokens(text);
    if (!tokens.length) return;

    const batches = [];
    for (let i = 0; i < tokens.length; i += OOV_ENRICH_BATCH) {
      batches.push(tokens.slice(i, i + OOV_ENRICH_BATCH));
    }

    readingEnrichBusy = true;
    readingEnrichPassage = text;
    showToast('正在补全阅读生词…');
    if (currentRoute === 'reading') renderReading();

    let batchIndex = 0;
    let consecutiveFailures = 0;
    let added = 0;
    let lastError = null;

    function finish() {
      readingEnrichBusy = false;
      readingEnrichPassage = '';
      if (added > 0) {
        invalidateWordCache();
        if (currentRoute === 'reading') renderReading();
        if (lastError) {
          showToast('已补 ' + added + ' 个生词进词库，部分生词补全失败', 'error');
        } else {
          showToast('已补 ' + added + ' 个生词进词库');
        }
      } else if (lastError) {
        if (currentRoute === 'reading') renderReading();
        showToast('阅读生词补全失败：' +
          (lastError.message || '请稍后再试'), 'error');
      } else if (currentRoute === 'reading') {
        renderReading();
      }

      const pending = readingEnrichPending;
      readingEnrichPending = '';
      if (pending && pending !== text) enrichReadingOov(pending);
    }

    function runNextBatch() {
      if (batchIndex >= batches.length) {
        finish();
        return;
      }
      const batch = batches[batchIndex];
      batchIndex += 1;
      requestDeepseekOovEnrich(batch).then(function (rawList) {
        consecutiveFailures = 0;
        added += addEnrichedCustomWords(normalizeOovEnrichResults(rawList));
        runNextBatch();
      }).catch(function (error) {
        lastError = error;
        consecutiveFailures += 1;
        // 连续两次失败就停止，避免反复消耗额度。
        if (consecutiveFailures >= 2) {
          finish();
          return;
        }
        runNextBatch();
      });
    }

    runNextBatch();
  }

  function sanitizeReadingEntry(raw) {
    if (!raw || typeof raw !== 'object' || !raw.passage || !Array.isArray(raw.questions)) return null;
    const questions = [];
    raw.questions.slice(0, 4).forEach(function (item, index) {
      if (!item || !Array.isArray(item.options)) return;
      const options = item.options.slice(0, 4).map(function (option, optionIndex) {
        return {
          key: normalizeChoice(option && option.key) || 'ABCD'.charAt(optionIndex),
          text: toText(option && option.text)
        };
      }).filter(function (option) {
        return option.text;
      });
      const answer = normalizeChoice(item.answer);
      if (!toText(item.stem) || options.length < 4 || !answer) return;
      questions.push({
        id: index + 1,
        stem: toText(item.stem),
        options: options,
        answer: answer,
        explanation: toText(item.explanation) || '暂无解析'
      });
    });
    if (questions.length !== 4) return null;
    const selections = {};
    if (raw.selections && typeof raw.selections === 'object') {
      Object.keys(raw.selections).forEach(function (key) {
        const choice = normalizeChoice(raw.selections[key]);
        if (choice) selections[String(key)] = choice;
      });
    }
    return {
      id: String(raw.id || ''),
      createdAt: toTimestamp(raw.createdAt) || Date.now(),
      model: DEEPSEEK_MODELS.indexOf(raw.model) === -1 ? 'deepseek-chat' : raw.model,
      targetWords: Array.isArray(raw.targetWords) ? raw.targetWords.map(function (word) {
        return String(word);
      }).filter(Boolean).slice(0, READING_WORD_CAP) : [],
      title: toText(raw.title) || '阅读理解',
      passage: String(raw.passage),
      wordCount: countEnglishWords(raw.passage),
      questions: questions,
      selections: selections,
      submitted: Boolean(raw.submitted),
      score: raw.submitted ? clamp(toInteger(raw.score, 0), 0, 4) : null,
      submittedAt: raw.submitted ? (toTimestamp(raw.submittedAt) || raw.createdAt || Date.now()) : null
    };
  }

  function loadReadingHistory() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(READING_HISTORY_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.map(sanitizeReadingEntry).filter(Boolean).slice(0, READING_HISTORY_LIMIT);
    } catch (error) {
      return [];
    }
  }

  function saveReadingHistory(entries) {
    try {
      window.localStorage.setItem(
        READING_HISTORY_KEY,
        JSON.stringify(entries.slice(0, READING_HISTORY_LIMIT))
      );
    } catch (error) {
      showToast('阅读记录保存失败，请检查浏览器存储空间。', 'error');
    }
  }

  function upsertReadingEntry(entry) {
    const history = loadReadingHistory().filter(function (item) {
      return item.id !== entry.id;
    });
    history.unshift(entry);
    saveReadingHistory(history);
    return entry;
  }

  function getReadingEntry(id) {
    const history = loadReadingHistory();
    for (let index = 0; index < history.length; index += 1) {
      if (history[index].id === id) return history[index];
    }
    return history[0] || null;
  }

  function recentReadingScores() {
    return loadReadingHistory().filter(function (entry) {
      return entry.submitted;
    }).slice(0, 5).map(function (entry) {
      return {
        id: entry.id,
        title: entry.title,
        model: entry.model,
        createdAt: formatShanghai(entry.createdAt),
        submittedAt: entry.submittedAt ? formatShanghai(entry.submittedAt) : null,
        score: entry.score,
        total: entry.questions.length
      };
    });
  }

  function latestReadingExport() {
    const latest = loadReadingHistory()[0] || null;
    if (!latest) return null;
    return {
      id: latest.id,
      createdAt: formatShanghai(latest.createdAt),
      model: latest.model,
      title: latest.title,
      passage: latest.passage,
      wordCount: latest.wordCount,
      targetWords: latest.targetWords.slice(),
      submitted: Boolean(latest.submitted),
      submittedAt: latest.submittedAt ? formatShanghai(latest.submittedAt) : null,
      score: latest.submitted ? latest.score : null,
      total: latest.questions.length,
      results: latest.questions.map(function (question) {
        const picked = latest.selections[String(question.id)] || '';
        return {
          id: question.id,
          stem: question.stem,
          userAnswer: picked || null,
          correctAnswer: latest.submitted ? question.answer : null,
          correct: latest.submitted ? picked === question.answer : null,
          explanation: latest.submitted ? question.explanation : null
        };
      })
    };
  }

  // 阅读查词索引：headword 与 forms 都指向同一个词条，覆盖 window.WORDS 全部条目。
  function getReadingWordIndex() {
    if (readingWordIndex) return readingWordIndex;

    const map = new Map();
    const words = [];
    function addHead(word) {
      if (!word || !word.w) return;
      const key = wordKey(word);
      if (!key) return;
      if (!word.id) word.id = 'reading:' + key;
      if (!word.key) word.key = word.id;
      if (!map.has(key)) {
        map.set(key, word);
        words.push(word);
      }
    }

    // 先用带 key 的活动词条，保证「加入复习」写入的进度能被现有队列识别。
    getActiveWords().forEach(addHead);
    // 自定义词/生词补全结果始终参与阅读查词，不受当前选中单元影响。
    state.customWords.forEach(function (raw) {
      const word = normalizeCustomWord(raw);
      if (word) addHead(word);
    });
    // 再兜底扫描 window.WORDS 原始条目，避免任何词条漏网。
    const rawWords = Array.isArray(window.WORDS) ? window.WORDS : [];
    rawWords.forEach(function (raw) {
      const word = normalizeWord(raw, '');
      if (word) addHead(word);
    });

    // forms 第二轮挂靠，避免变形词遮挡真正的 headword。
    words.forEach(function (word) {
      (Array.isArray(word.forms) ? word.forms : []).forEach(function (form) {
        if (!form || !form.w) return;
        const key = wordKey(form.w);
        if (key && !map.has(key)) map.set(key, word);
      });
    });

    readingWordIndex = { map: map, words: words };
    return readingWordIndex;
  }

  // 简单 lemma 回退：ies→y、es、s、ied→y、ed、ing、双写辅音、比较级/副词等。
  function lemmaCandidates(token) {
    const w = toText(token).toLowerCase();
    const out = [];
    function add(value) {
      if (value && value.length > 1 && out.indexOf(value) === -1) out.push(value);
    }
    function addDouble(base) {
      if (base.length > 2 &&
          base.charAt(base.length - 1) === base.charAt(base.length - 2) &&
          'aeiou'.indexOf(base.charAt(base.length - 1)) === -1) {
        add(base.slice(0, -1));
      }
    }
    if (!/^[a-z]+(?:'[a-z]+)?$/.test(w)) return out;
    add(w);
    if (w.endsWith('ies') && w.length > 4) add(w.slice(0, -3) + 'y');
    if (w.endsWith('ied') && w.length > 4) add(w.slice(0, -3) + 'y');
    if (w.endsWith('ves') && w.length > 4) {
      add(w.slice(0, -3) + 'f');
      add(w.slice(0, -3) + 'fe');
    }
    if (w.endsWith('es') && w.length > 3) add(w.slice(0, -2));
    if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) add(w.slice(0, -1));
    if (w.endsWith('ed') && w.length > 3) {
      const base = w.slice(0, -2);
      add(base);
      add(base + 'e');
      addDouble(base);
    }
    if (w.endsWith('ing') && w.length > 4) {
      const base = w.slice(0, -3);
      add(base);
      add(base + 'e');
      addDouble(base);
    }
    if (w.endsWith('ier') && w.length > 4) add(w.slice(0, -3) + 'y');
    if (w.endsWith('iest') && w.length > 5) add(w.slice(0, -4) + 'y');
    if (w.endsWith('er') && w.length > 4) {
      const base = w.slice(0, -2);
      add(base);
      add(base + 'e');
      addDouble(base);
    }
    if (w.endsWith('est') && w.length > 5) {
      const base = w.slice(0, -3);
      add(base);
      add(base + 'e');
      addDouble(base);
    }
    if (w.endsWith('ily') && w.length > 4) add(w.slice(0, -3) + 'y');
    if (w.endsWith('ly') && w.length > 4) {
      add(w.slice(0, -2));
      add(w.slice(0, -2) + 'e');
    }
    return out;
  }

  function lookupReadingWord(spelling) {
    const key = wordKey(spelling);
    if (!key) return null;
    const index = getReadingWordIndex();
    if (index.map.has(key)) return index.map.get(key);
    const candidates = lemmaCandidates(spelling);
    for (let i = 0; i < candidates.length; i += 1) {
      const found = index.map.get(candidates[i]);
      if (found) return found;
    }
    return null;
  }

  function findWordBySpelling(spelling) {
    return lookupReadingWord(spelling);
  }

  function highlightPassageHtml(passage, targetWords) {
    const clean = String(passage || '').replace(/\*\*/g, '');
    const targets = new Set();
    (Array.isArray(targetWords) ? targetWords : []).forEach(function (word) {
      const text = toText(word);
      if (text) targets.add(text.toLowerCase());
    });

    // 每一个英文 token 都包成按钮：词库命中 / 未命中（OOV）都可点开。
    const pattern = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
    let html = '';
    let cursor = 0;
    clean.replace(pattern, function (match, offset) {
      const found = lookupReadingWord(match);
      const isTarget = targets.has(match.toLowerCase()) ||
        Boolean(found && targets.has(found.w.toLowerCase()));
      html += escapeHtml(clean.slice(cursor, offset));
      let className = 'reading-hit';
      if (isTarget) className += ' is-target';
      if (!found) className += ' is-oov';
      html += '<button class="' + className + '" type="button" data-action="reading-word" data-word="' +
        escapeAttr(match) + '">' + escapeHtml(match) + '</button>';
      cursor = offset + match.length;
      return match;
    });
    html += escapeHtml(clean.slice(cursor));
    return html;
  }

  function readingOptionHtml(entry, question, option) {
    const selected = entry.selections[String(question.id)] === option.key;
    let className = 'reading-option';
    if (!entry.submitted && selected) className += ' is-selected';
    if (entry.submitted && option.key === question.answer) className += ' is-correct';
    if (entry.submitted && selected && option.key !== question.answer) className += ' is-wrong';
    const pressed = selected ? 'true' : 'false';
    return (
      '<button class="' + className + '" type="button" data-action="reading-choice" data-question="' +
        question.id + '" data-choice="' + option.key + '" aria-pressed="' + pressed + '"' +
        (entry.submitted ? ' disabled' : '') + '>' +
        '<span class="reading-key">' + option.key + '</span>' +
        '<span class="reading-option-text">' + escapeHtml(option.text) + '</span>' +
      '</button>'
    );
  }

  function readingQuestionsHtml(entry) {
    return entry.questions.map(function (question) {
      let extra = '';
      if (entry.submitted) {
        const picked = entry.selections[String(question.id)] || '';
        const right = picked === question.answer;
        extra =
          '<p class="reading-result-line' + (right ? ' is-correct' : ' is-wrong') + '">' +
            (right ? '答对了' : '正确答案 ' + question.answer) +
          '</p>' +
          '<p class="reading-explain">' + escapeHtml(question.explanation) + '</p>';
      }
      return (
        '<fieldset class="reading-question">' +
          '<legend>' + question.id + '. ' + escapeHtml(question.stem) + '</legend>' +
          '<div class="reading-options">' +
            question.options.map(function (option) {
              return readingOptionHtml(entry, question, option);
            }).join('') +
          '</div>' +
          extra +
        '</fieldset>'
      );
    }).join('');
  }

  function readingSheetHtml() {
    if (!readingLookup) return '';
    const word = findWordBySpelling(readingLookup);
    const head = word ? word.w : readingLookup;
    const phonetic = word ? formatPhonetic(word.ph) : '';
    const progress = word ? getProgress(word) : null;
    const isLemma = Boolean(word && wordKey(word) !== wordKey(readingLookup));

    let reviewAction = '';
    if (!word) {
      reviewAction = '<p class="reading-sheet-status">词库暂无，暂不能加入复习。</p>';
    } else if (!progress) {
      reviewAction =
        '<button class="btn btn-primary btn-block reading-sheet-add" type="button" data-action="add-reading-to-review" data-word="' +
          escapeAttr(head) + '">加入复习</button>';
    } else if (progress.masteredAt) {
      reviewAction = '<p class="reading-sheet-status">已掌握</p>';
    } else {
      reviewAction = '<p class="reading-sheet-status">已在复习 · 阶段 ' + progress.stage + ' / ' + STAGE_COUNT + '</p>';
    }

    return (
      '<div class="reading-sheet" role="dialog" aria-modal="false" aria-label="单词释义">' +
        '<div class="reading-sheet-card">' +
          '<div class="reading-sheet-top">' +
            '<div>' +
              '<h3 class="reading-sheet-word">' + escapeHtml(head) + freqTagHtml(word) + '</h3>' +
              (phonetic ? '<p class="reading-sheet-ph">' + escapeHtml(phonetic) + '</p>' : '') +
            '</div>' +
            '<button class="icon-button" type="button" data-action="close-reading-word" aria-label="关闭释义">' + icon('close', 16) + '</button>' +
          '</div>' +
          (isLemma
            ? '<p class="reading-sheet-lemma">原文 ' + escapeHtml(readingLookup) + ' · 原形 ' + escapeHtml(head) + '</p>'
            : '') +
          '<p class="reading-sheet-def">' +
            (word && word.pos ? '<span class="pos-pill">' + escapeHtml(word.pos) + '</span>' : '') +
            escapeHtml(word && word.cn ? word.cn : '词库暂无') +
          '</p>' +
          formsLineHtml(word) +
          '<button class="audio-pill" type="button" data-speak="2" data-word="' + escapeAttr(head) + '" aria-label="播放 ' + escapeAttr(head) + ' 的发音">' +
            icon('speaker', 15) + '<span>发音</span>' +
          '</button>' +
          reviewAction +
        '</div>' +
      '</div>'
    );
  }

  function renderReading() {
    if (!views.reading) return;
    const targets = collectReadingTargets();
    const history = loadReadingHistory();
    const hasKey = Boolean(readDeepseekKey());
    if (!readingActiveId && history[0]) readingActiveId = history[0].id;
    const entry = getReadingEntry(readingActiveId);
    const busyText = readingPhase === 'retrying' ? '返回内容无法解析，正在重试一次…' : '正在生成阅读，大约需要十几秒…';

    let article = '';
    if (entry) {
      const answered = entry.questions.filter(function (question) {
        return Boolean(entry.selections[String(question.id)]);
      }).length;
      article =
        '<article class="reading-article">' +
          '<header class="reading-article-head">' +
            '<p class="page-kicker">' + escapeHtml(entry.model) + ' · 约 ' + entry.wordCount + ' 词</p>' +
            '<h2 class="reading-article-title">' + escapeHtml(entry.title) + '</h2>' +
          '</header>' +
          '<div class="reading-passage">' + highlightPassageHtml(entry.passage, entry.targetWords) + '</div>' +
          (readingEnrichBusy && entry.passage === readingEnrichPassage
            ? '<p class="reading-enrich-status" role="status">正在补全生词释义…</p>'
            : '') +
          '<p class="reading-tap-hint">点任意英文单词可看释义；词库词可加入复习；绿色为目标词。做完 4 题再提交，提交前不显示答案。</p>' +
          readingQuestionsHtml(entry) +
          (entry.submitted
            ? '<div class="reading-score" role="status">得分 ' + entry.score + ' / 4</div>'
            : '<button class="btn btn-primary btn-block" type="button" data-action="submit-reading"' + (readingBusy ? ' disabled' : '') + '>提交（已选 ' + answered + ' / 4）</button>') +
        '</article>';
    }

    const historyHtml = history.length
      ? '<ul class="reading-history">' + history.map(function (item) {
          const active = item.id === (entry && entry.id);
          const mark = item.submitted ? (item.score + '/4') : '未提交';
          return '<li class="reading-history-row">' +
            '<button class="reading-history-item' + (active ? ' is-active' : '') + '" type="button" data-action="open-reading" data-reading-id="' +
              escapeAttr(item.id) + '"><span>' + escapeHtml(item.title) + '</span><small>' + mark + '</small></button>' +
            '<button class="reading-history-delete" type="button" data-action="delete-reading" data-reading-id="' +
              escapeAttr(item.id) + '" aria-label="删除阅读记录">删除</button>' +
          '</li>';
        }).join('') + '</ul>'
      : '<p class="reading-empty-note">生成后的文章和作答会留在本机，方便回头再看。</p>';

    views.reading.innerHTML =
      '<div class="page reading-page">' +
        '<header class="page-head">' +
          '<div>' +
            '<p class="page-kicker">高考阅读理解</p>' +
            '<h1 class="page-title">每日阅读</h1>' +
            '<p class="page-sub">用今天新学和尚未掌握的词，在浏览器里直接请 DeepSeek 写一篇原创短文和四道选择题。</p>' +
          '</div>' +
        '</header>' +
        '<section class="settings-card reading-target-card">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title">本次目标词</h2>' +
            '<p class="settings-card-desc">' + escapeHtml(readingTargetSummary(targets)) + '</p>' +
          '</div>' +
          '<div class="settings-body">' +
            (hasKey ? '' : '<p class="reading-empty-note">还没有保存 DeepSeek API Key，请先到设置页保存后再生成。</p>') +
            (targets.length
              ? '<div class="reading-chips">' + targets.map(function (word) {
                  return '<span class="reading-chip">' + escapeHtml(word.w) + '</span>';
                }).join('') + '</div>'
              : '<p class="reading-empty-note">先完成一轮学习或复习，这里才会有词可以写进文章。</p>') +
            '<button class="btn btn-primary btn-block" type="button" data-action="generate-reading"' +
              (readingBusy || !targets.length ? ' disabled' : '') + '>' +
              (readingBusy ? busyText : '生成今日阅读') +
            '</button>' +
            (readingError ? '<p class="sync-status is-error" role="alert">' + escapeHtml(readingError) + '</p>' : '') +
          '</div>' +
        '</section>' +
        article +
        '<section class="reading-history-wrap">' +
          '<h2 class="reading-history-title">本机记录</h2>' +
          historyHtml +
        '</section>' +
        readingSheetHtml() +
      '</div>';
  }

  function finishReadingGeneration(generated, targets) {
    const entry = {
      id: String(Date.now()),
      createdAt: Date.now(),
      model: readDeepseekModel(),
      targetWords: generated.targetWords.length ? generated.targetWords : targets.map(function (word) { return word.w; }),
      title: generated.title,
      passage: generated.passage,
      wordCount: generated.wordCount,
      questions: generated.questions,
      selections: {},
      submitted: false,
      score: null,
      submittedAt: null
    };
    upsertReadingEntry(entry);
    readingActiveId = entry.id;
    readingLookup = '';
    readingBusy = false;
    readingPhase = '';
    readingError = '';
    renderReading();
    showToast('阅读已生成，先做题再提交。');
    // 文章先显示，随后在后台把未收录的词补进自定义词库。
    try {
      enrichReadingOov(entry.passage);
    } catch (error) {
      console.warn('补全阅读生词失败：', error);
    }
  }

  function generateReading(attempt) {
    const retrying = attempt > 0;
    if (!retrying) {
      if (readingBusy) return;
      const key = readDeepseekKey();
      if (!key) {
        readingError = '请先在设置里保存 DeepSeek API Key。';
        showToast(readingError, 'error');
        renderReading();
        return;
      }
      const targets = collectReadingTargets();
      if (!targets.length) {
        readingError = '还没有今天新学或未掌握的词，先去学几个单词。';
        showToast(readingError, 'error');
        renderReading();
        return;
      }
      readingBusy = true;
      readingPhase = 'generating';
      readingError = '';
      readingLookup = '';
      renderReading();
      generateReading.targets = targets;
    } else {
      readingPhase = 'retrying';
      renderReading();
    }

    const targets = generateReading.targets || collectReadingTargets();
    requestDeepseekReading(targets, retrying).then(function (generated) {
      finishReadingGeneration(generated, targets);
    }).catch(function (error) {
      if (error && error.code === 'invalid-json' && !retrying) {
        generateReading(1);
        return;
      }
      readingBusy = false;
      readingPhase = '';
      readingError = error && error.message ? error.message : '生成失败，请稍后再试。';
      renderReading();
      showToast(readingError, 'error');
    });
  }

  function chooseReadingOption(questionId, choice) {
    const entry = getReadingEntry(readingActiveId);
    if (!entry || entry.submitted || readingBusy) return;
    const key = normalizeChoice(choice);
    if (!key) return;
    entry.selections[String(questionId)] = key;
    upsertReadingEntry(entry);
    readingActiveId = entry.id;
    const buttons = document.querySelectorAll('[data-question="' + questionId + '"]');
    if (!buttons.length || currentRoute !== 'reading') {
      renderReading();
      return;
    }
    buttons.forEach(function (button) {
      const selected = button.getAttribute('data-choice') === key;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const submit = document.querySelector('[data-action="submit-reading"]');
    if (submit) {
      const answered = entry.questions.filter(function (question) {
        return Boolean(entry.selections[String(question.id)]);
      }).length;
      submit.textContent = '提交（已选 ' + answered + ' / 4）';
    }
  }

  function submitReading() {
    const entry = getReadingEntry(readingActiveId);
    if (!entry || entry.submitted) return;
    const missing = entry.questions.some(function (question) {
      return !entry.selections[String(question.id)];
    });
    if (missing) {
      showToast('请先答完 4 道题再提交。', 'error');
      return;
    }
    let score = 0;
    entry.questions.forEach(function (question) {
      if (entry.selections[String(question.id)] === question.answer) score += 1;
    });
    entry.submitted = true;
    entry.score = score;
    entry.submittedAt = Date.now();
    upsertReadingEntry(entry);
    readingActiveId = entry.id;
    readingLookup = '';
    renderReading();
    showToast('得分 ' + score + ' / 4');
    maybeAutoUploadProgress();
  }

  function openReadingHistory(id) {
    readingActiveId = id;
    readingLookup = '';
    readingError = '';
    renderReading();
  }

  function deleteReadingHistory(id) {
    const history = loadReadingHistory();
    const target = history.filter(function (item) {
      return item.id === id;
    })[0];
    if (!target) return;

    const ok = window.confirm('确定删除这篇阅读记录「' + target.title + '」吗？删除后无法恢复。');
    if (!ok) return;

    const remaining = history.filter(function (item) {
      return item.id !== id;
    });
    saveReadingHistory(remaining);
    if (readingActiveId === id) {
      readingActiveId = remaining[0] ? remaining[0].id : '';
      readingLookup = '';
    }
    renderReading();
    showToast('已删除阅读记录');
  }

  function openReadingWord(spelling) {
    const word = toText(spelling);
    readingLookup = word;
    // 点击高亮词时同时播放发音，复用学习卡片的发音逻辑。
    if (word) playPronunciation(word, 2, false);
    renderReading();
  }

  function addReadingWordToReview(spelling) {
    const word = findWordBySpelling(spelling);
    if (!word) {
      showToast('词库没有这个词的释义，无法加入复习。', 'error');
      return;
    }
    const progress = getProgress(word);
    if (progress) {
      showToast(progress.masteredAt ? '这个词已掌握。' : '这个词已经在复习计划里了。');
      renderReading();
      return;
    }
    ensureLearningProgress(word);
    saveState();
    showToast('已加入复习');
    renderReading();
  }

  /* ---------- 设置 ---------- */

  // 密码框 + 眼睛按钮；按钮只切换输入框的 type，不重新渲染设置页，避免丢失已输入内容。
  function secretInputHtml(options) {
    const id = options.id;
    const showLabel = options.toggleShowLabel || '显示密码';
    const hideLabel = options.toggleHideLabel || '隐藏密码';
    return (
      '<div class="secret-input-wrap">' +
        '<input class="sync-token-input" id="' + escapeAttr(id) + '" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="' + escapeAttr(options.placeholder || '') + '" aria-label="' + escapeAttr(options.ariaLabel || '') + '">' +
        '<button class="secret-toggle" type="button" data-action="toggle-secret" data-secret-target="' + escapeAttr(id) + '" data-show-label="' + escapeAttr(showLabel) + '" data-hide-label="' + escapeAttr(hideLabel) + '" aria-label="' + escapeAttr(showLabel) + '" aria-pressed="false" title="' + escapeAttr(showLabel) + '">' + icon('eye-off', 18) + '</button>' +
      '</div>'
    );
  }

  function toggleSecretVisibility(button) {
    if (!button) return;
    const targetId = button.getAttribute('data-secret-target');
    const input = targetId ? document.getElementById(targetId) : null;
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    const nextLabel = showing
      ? (button.getAttribute('data-show-label') || '显示密码')
      : (button.getAttribute('data-hide-label') || '隐藏密码');
    button.setAttribute('aria-label', nextLabel);
    button.setAttribute('title', nextLabel);
    button.setAttribute('aria-pressed', showing ? 'false' : 'true');
    button.innerHTML = icon(showing ? 'eye-off' : 'eye', 18);
  }

  function renderSettings() {
    const customCount = state.customWords.length;
    const total = getActiveWords().length;
    const dailyNew = state.settings.dailyNew;

    views.settings.innerHTML =
      '<div class="page settings-page">' +
        '<header class="page-head">' +
          '<div>' +
            '<p class="page-kicker">偏好与数据</p>' +
            '<h1 class="page-title">学习设置</h1>' +
            '<p class="page-sub">调整节奏，备份记录，或把进度同步到 GitHub。访问令牌只保存在当前浏览器。</p>' +
          '</div>' +
        '</header>' +

        '<section class="settings-card" aria-labelledby="plan-title">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title" id="plan-title">学习计划</h2>' +
            '<p class="settings-card-desc">每天的新词目标；达到后仍可继续学新词，复习在「复习」中单独进行。</p>' +
          '</div>' +
          '<div class="setting-row">' +
            '<div class="setting-copy">' +
              '<span class="setting-title">每日新词</span>' +
              '<p class="setting-desc">设为 0 可以暂停学习新词，只做复习。</p>' +
            '</div>' +
            '<label class="number-field">' +
              '<input class="number-input" id="daily-new-input" type="number" inputmode="numeric" min="0" max="' + MAX_DAILY_NEW + '" step="1" value="' + dailyNew + '" aria-label="每日新词数量">' +
              '<span class="number-unit">个 / 天</span>' +
            '</label>' +
          '</div>' +
          '<div class="setting-row">' +
            '<div class="setting-copy">' +
              '<span class="setting-title">卡片自动发音</span>' +
              '<p class="setting-desc">新卡片出现时自动播放美式发音。</p>' +
            '</div>' +
            '<label class="switch" aria-label="卡片自动发音">' +
              '<input id="auto-pronounce-checkbox" type="checkbox" aria-label="卡片自动发音"' + (state.settings.autoPronounce ? ' checked' : '') + '>' +
              '<span class="switch-track" aria-hidden="true"></span>' +
            '</label>' +
          '</div>' +
        '</section>' +

        '<section class="settings-card" aria-labelledby="backup-title">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title" id="backup-title">备份与恢复</h2>' +
            '<p class="settings-card-desc">导出 JSON 备份可在其他设备恢复学习进度。导入会覆盖当前全部数据。</p>' +
          '</div>' +
          '<div class="settings-body">' +
            '<div class="button-row">' +
              '<button class="btn btn-secondary" type="button" data-action="export-backup">' + icon('download', 17) + '导出 JSON</button>' +
              '<button class="btn btn-secondary" type="button" data-action="import-backup">' + icon('upload', 17) + '导入 JSON</button>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="settings-card" aria-labelledby="watch-download-title">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title" id="watch-download-title">手表离线安装包</h2>' +
            '<p class="settings-card-desc">OPPO Watch 3 等手表需安装 <strong>32 位（armeabi-v7a）</strong> APK；用电脑 ADB 或甲壳虫等工具安装。包内已含词库，学新词 / 复习 / 词库可离线；阅读生成与 GitHub 同步需联网。</p>' +
          '</div>' +
          '<div class="settings-body">' +
            '<a class="btn btn-primary btn-block watch-download-btn" href="downloads/xiaodancici-watch-armeabi-v7a.apk" download>' + icon('download', 17) + '下载 Watch 版 APK（armeabi-v7a）</a>' +
            '<p class="watch-download-hint">已签名 APK · 仅含 armeabi-v7a · 适合 OPPO Watch 3 等 32 位手表</p>' +
          '</div>' +
        '</section>' +

        '<section class="settings-card" aria-labelledby="github-sync-title">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title" id="github-sync-title">同步进度到 GitHub</h2>' +
            '<p class="settings-card-desc">把学习进度写入 yoreverse2423/English 的 data/progress.json，也可以从仓库下载覆盖本机。上传与下载共用同一令牌，便于手机与手表互相同步。令牌只放在本机 localStorage，不会写进代码或仓库。</p>' +
          '</div>' +
          '<div class="settings-body">' +
            '<ol class="sync-steps">' +
              '<li>打开 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens/new</a>，新建细粒度个人访问令牌。</li>' +
              '<li>仓库只勾选 <strong>yoreverse2423/English</strong>。</li>' +
              '<li>Repository permissions 里把 Contents 设为 Read and write（读写）。</li>' +
              '<li>生成后粘贴到下方并保存。需要换设备时，在新浏览器里再粘贴一次即可。</li>' +
            '</ol>' +
            '<label class="sync-label" for="github-token-input">GitHub 令牌</label>' +
            secretInputHtml({
              id: 'github-token-input',
              placeholder: 'github_pat_…',
              ariaLabel: 'GitHub 细粒度个人访问令牌',
              toggleShowLabel: '显示令牌',
              toggleHideLabel: '隐藏令牌'
            }) +
            '<p class="sync-token-state" id="github-token-state">' + escapeHtml(tokenSavedText()) + '</p>' +
            '<div class="button-row">' +
              '<button class="btn btn-secondary" type="button" data-action="save-github-token">保存令牌</button>' +
              '<button class="btn btn-ghost" type="button" data-action="clear-github-token">清除令牌</button>' +
            '</div>' +
            '<div class="setting-row sync-auto-row">' +
              '<div class="setting-copy">' +
                '<span class="setting-title">学习结束自动上传</span>' +
                '<p class="setting-desc">每轮学习结束或离开学习页时上传，最多每 10 分钟一次。</p>' +
              '</div>' +
              '<label class="switch" aria-label="学习结束自动上传">' +
                '<input id="github-auto-upload" type="checkbox" aria-label="学习结束自动上传"' + (githubSyncPrefs.autoUpload ? ' checked' : '') + '>' +
                '<span class="switch-track" aria-hidden="true"></span>' +
              '</label>' +
            '</div>' +
            '<div class="button-row">' +
              '<button class="btn btn-primary" id="github-upload-button" type="button" data-action="upload-progress"' + (githubSyncInFlight ? ' disabled' : '') + '>' + icon('upload', 17) + '上传进度</button>' +
              '<button class="btn btn-secondary" id="github-download-button" type="button" data-action="download-progress"' + (githubSyncInFlight ? ' disabled' : '') + '>' + icon('download', 17) + '下载进度</button>' +
            '</div>' +
            '<p class="sync-hint">上传会写入 data/progress.json；下载会读取同一个文件，并先询问是否覆盖本机进度。文件里有导出时间（北京时间）、所选词书和单元、已学 / 已掌握 / 今日到期，以及每个词的阶段、下次复习时间、错词次数和最近一次结果，还有尚未掌握的难词列表。若已做过每日阅读，也会带上最近一篇的得分和解析。文件同时包含可恢复的完整学习数据，另一台设备下载后即可接着用。</p>' +
            '<p class="sync-status' + (githubSyncStatus.state && githubSyncStatus.state !== 'idle' ? ' is-' + githubSyncStatus.state : '') + '" id="github-sync-status" role="status" aria-live="polite">' + escapeHtml(syncStatusText()) + '</p>' +
          '</div>' +
        '</section>' +

        '<section class="settings-card" aria-labelledby="deepseek-title">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title" id="deepseek-title">每日阅读 · DeepSeek</h2>' +
            '<p class="settings-card-desc">API Key 只放在本机 localStorage，请求由浏览器直接发到 DeepSeek，不会写进代码或仓库。</p>' +
          '</div>' +
          '<div class="settings-body">' +
            '<ol class="sync-steps">' +
              '<li>打开 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">platform.deepseek.com/api_keys</a> 创建密钥。</li>' +
              '<li>粘贴到下方并保存。换设备时需要重新粘贴。</li>' +
            '</ol>' +
            '<label class="sync-label" for="deepseek-key-input">DeepSeek API Key</label>' +
            secretInputHtml({
              id: 'deepseek-key-input',
              placeholder: 'sk-…',
              ariaLabel: 'DeepSeek API Key',
              toggleShowLabel: '显示 API Key',
              toggleHideLabel: '隐藏 API Key'
            }) +
            '<p class="sync-token-state">' + escapeHtml(deepseekKeyText()) + '</p>' +
            '<div class="button-row">' +
              '<button class="btn btn-secondary" type="button" data-action="save-deepseek-key">保存密钥</button>' +
              '<button class="btn btn-ghost" type="button" data-action="clear-deepseek-key">清除密钥</button>' +
            '</div>' +
            '<label class="sync-label" for="deepseek-model-select">模型</label>' +
            '<select class="reading-model-select" id="deepseek-model-select" aria-label="DeepSeek 模型">' +
              DEEPSEEK_MODELS.map(function (model) {
                const selected = model === readDeepseekModel() ? ' selected' : '';
                const label = model === 'deepseek-chat' ? 'deepseek-chat（默认）' : model;
                return '<option value="' + model + '"' + selected + '>' + label + '</option>';
              }).join('') +
            '</select>' +
            '<p class="sync-hint">默认使用 deepseek-chat。生成内容是高考阅读理解难度的原创短文和四道选择题。</p>' +
          '</div>' +
        '</section>' +

        '<section class="settings-card" aria-labelledby="custom-title">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title" id="custom-title">自定义词</h2>' +
            '<p class="settings-card-desc">当前词库共 ' + total + ' 个词，其中自定义词 ' + customCount + ' 个。</p>' +
          '</div>' +
          '<div class="settings-body">' +
            '<textarea class="custom-textarea" id="custom-words-input" spellcheck="false" placeholder="每行一个词，例如：&#10;serendipity|/ˌserənˈdɪpəti/|n. 意外发现珍奇事物的运气|a happy serendipity; by serendipity"></textarea>' +
            '<p class="format-hint">每行格式：单词 | 音标 | 释义 | 搭配1;搭配2（后两项可省略）。释义开头可写 n. / v. / adj. 等词性。' +
              '<code>wander|/ˈwɒndə(r)/|v. 漫步；闲逛|wander around; wander off</code>' +
            '</p>' +
            '<div class="button-row">' +
              '<button class="btn btn-primary" type="button" data-action="add-custom-words">' + icon('sparkle', 17) + '添加到词库</button>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="settings-card" aria-labelledby="danger-title">' +
          '<div class="settings-card-head">' +
            '<h2 class="settings-card-title" id="danger-title">重置</h2>' +
            '<p class="settings-card-desc">清空学习记录、统计数据与自定义词，并恢复默认设置。</p>' +
          '</div>' +
          '<div class="danger-row">' +
            '<span class="settings-count">操作不可撤销</span>' +
            '<button class="btn btn-danger btn-small" type="button" data-action="reset-data">' + icon('refresh', 16) + '重置全部数据</button>' +
          '</div>' +
        '</section>' +

        '<p class="settings-footer">小单词机 · 纯静态本地应用<br>学习记录默认只在本机。同步时令牌只发给 GitHub，不会写入仓库。</p>' +
      '</div>';
  }

  /* ---------- 备份导入导出 ---------- */

  function exportBackup() {
    try {
      const payload = {
        app: STORAGE_KEY,
        version: 1,
        exportedAt: new Date().toISOString(),
        data: state
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bcz-backup-' + getDayKey() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1200);
      showToast('备份文件已导出');
    } catch (error) {
      console.error('导出备份失败：', error);
      showToast('导出失败，请稍后再试。', 'error');
    }
  }

  function prepareBackupState(parsed) {
    const rawData = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      throw new Error('备份内容格式不正确');
    }

    const hasKnownField = ['settings', 'progress', 'daily', 'customWords', 'selectedUnits'].some(function (key) {
      return Object.prototype.hasOwnProperty.call(rawData, key);
    });
    if (!hasKnownField) {
      throw new Error('没有找到可导入的学习数据');
    }

    return sanitizeState(rawData);
  }

  function applyBackupState(nextState) {
    stopPronunciation();
    session = null;
    reviewSession = null;
    reviewBrowse = null;
    reviewListen = null;
    state = nextState;
    invalidateWordCache();
    expandedBooks = null;
    migrateLegacyProgress();
    saveState();
    renderCurrentRoute();
  }

  // options.confirmMessage / options.successMessage 让「下载进度」复用同一套导入逻辑。
  function importBackupData(parsed, options) {
    const nextState = prepareBackupState(parsed);
    const opts = options || {};
    const confirmed = window.confirm(
      opts.confirmMessage || '导入备份会覆盖当前全部学习记录、统计和自定义词，确定继续吗？'
    );
    if (!confirmed) return false;

    applyBackupState(nextState);
    showToast(opts.successMessage || '备份导入成功');
    return true;
  }

  function handleBackupFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('备份文件过大，请选择 5MB 以内的文件。', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        importBackupData(parsed);
      } catch (error) {
        console.warn('导入备份失败：', error);
        showToast('导入失败：' + (error.message || '文件内容不是有效的 JSON'), 'error');
      }
    };
    reader.onerror = function () {
      showToast('读取备份文件失败，请重试。', 'error');
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ---------- 自定义词导入 ---------- */

  function extractPartOfSpeech(definition) {
    const match = definition.match(/^((?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|det|phr)\.)\s*(.+)$/i);
    if (!match) return { pos: '', cn: definition };
    return { pos: match[1], cn: match[2].trim() };
  }

  function parseCollocation(text) {
    const value = toText(text);
    if (!value) return null;
    const match = value.match(/^(.+?)\s*[=：]\s*(.+)$/);
    if (match) {
      return { en: match[1].trim(), cn: match[2].trim() };
    }
    return { en: value, cn: '' };
  }

  function parseCustomWordLines(text) {
    const words = [];
    const errors = [];

    text.split(/\r?\n/).forEach(function (line, index) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const parts = trimmed.split('|');
      if (parts.length < 3) {
        errors.push('第 ' + (index + 1) + ' 行缺少字段');
        return;
      }

      const w = toText(parts[0]);
      const ph = toText(parts[1]);
      const definitionRaw = toText(parts[2]);
      const colRaw = toText(parts.slice(3).join('|'));

      if (!w || !definitionRaw) {
        errors.push('第 ' + (index + 1) + ' 行的单词或释义为空');
        return;
      }

      const definition = extractPartOfSpeech(definitionRaw);
      const col = colRaw
        ? colRaw.split(/[;；]/).map(parseCollocation).filter(Boolean)
        : [];

      words.push({
        w: w,
        ph: ph,
        pos: definition.pos,
        cn: definition.cn,
        col: col,
        ex: { en: '', cn: '' },
        tag: '自定义'
      });
    });

    return { words: words, errors: errors };
  }

  function addCustomWords() {
    const textarea = document.getElementById('custom-words-input');
    if (!textarea) return;
    const rawText = textarea.value.trim();
    if (!rawText) {
      showToast('请先粘贴要添加的单词。', 'error');
      textarea.focus();
      return;
    }

    const parsed = parseCustomWordLines(textarea.value);
    if (!parsed.words.length) {
      showToast(parsed.errors.length ? parsed.errors[0] : '没有识别到可添加的词。', 'error');
      return;
    }

    // 同一单词仍只保留一条自定义记录；内置词书里的同名词也不会重复添加。
    const existing = new Set(getActiveWords().map(function (word) {
      return wordKey(word);
    }));
    let added = 0;
    let duplicates = 0;

    parsed.words.forEach(function (rawWord) {
      const normalized = normalizeCustomWord(rawWord);
      if (!normalized) return;
      const key = wordKey(normalized);
      if (!key || existing.has(key)) {
        duplicates += 1;
        return;
      }
      state.customWords.push(normalized);
      existing.add(key);
      added += 1;
    });

    if (!added) {
      showToast(duplicates ? '这些词已经在词库中了。' : '没有添加新词。', 'error');
      return;
    }

    // 新加的自定义词放在“自定义”册；自动勾选该单元，避免添加后学不到。
    const selection = new Set(getSelectedUnits());
    selection.add(CUSTOM_UNIT_ID);
    state.selectedUnits = Array.from(selection);

    saveState();
    invalidateWordCache();
    textarea.value = '';
    renderCurrentRoute();

    const extra = [];
    if (duplicates) extra.push('跳过 ' + duplicates + ' 个重复词');
    if (parsed.errors.length) extra.push(parsed.errors.length + ' 行格式有误');
    showToast('已添加 ' + added + ' 个单词' + (extra.length ? '，' + extra.join('，') : ''));
  }

  /* ---------- 设置操作 ---------- */

  function updateDailyNew(rawValue) {
    const parsed = Number(rawValue);
    let nextValue = Number.isFinite(parsed) ? Math.round(parsed) : state.settings.dailyNew;
    nextValue = clamp(nextValue, 0, MAX_DAILY_NEW);

    state.settings.dailyNew = nextValue;
    saveState();

    const input = document.getElementById('daily-new-input');
    if (input) input.value = String(nextValue);
    showToast('每日新词数已更新为 ' + nextValue + ' 个');
  }

  function updateAutoPronounce(enabled) {
    state.settings.autoPronounce = Boolean(enabled);
    saveState();
    showToast(enabled ? '已开启卡片自动发音' : '已关闭卡片自动发音');
  }

  function resetAllData() {
    const confirmed = window.confirm('确定要清空所有学习记录、统计和自定义词，并恢复默认设置吗？此操作不可撤销。');
    if (!confirmed) return;

    stopPronunciation();
    session = null;
    state = defaultState();
    invalidateWordCache();
    browseQuery = '';
    browseFilter = 'all';
    browseBookFilter = 'all';
    browseUnitFilter = 'all';
    browseLimit = BROWSE_PAGE_SIZE;
    expandedBooks = null;

    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // 忽略；后面还会尝试保存默认状态。
    }
    saveState();
    showToast('学习数据已重置');
    navigate('home');
  }

  /* ---------- 路由与渲染 ---------- */

  function getRouteFromHash() {
    const hash = String(window.location.hash || '').replace(/^#\/?/, '');
    const route = hash.split('?')[0];
    return ROUTES.includes(route) ? route : 'home';
  }

  function setRouteHash(route) {
    const targetHash = '#/' + route;
    if (window.location.hash === targetHash) return;
    try {
      window.history.replaceState(null, '', targetHash);
    } catch (error) {
      // file:// 环境下少数浏览器不允许 replaceState，界面仍然可以正常使用。
    }
  }

  function syncNavigation(route) {
    // “选择词书”是首页的子页面，底部导航仍高亮首页。
    const tabRoute = route === 'books' ? 'home' : route;
    document.querySelectorAll('[data-nav]').forEach(function (button) {
      if (!button.classList.contains('tab-item')) return;
      const active = button.getAttribute('data-nav') === tabRoute;
      button.classList.toggle('is-active', active);
      if (active) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    const hideTabbar = route === 'study' ||
      (route === 'review' && (Boolean(reviewSession) || Boolean(reviewListen)));
    if (tabbarEl) tabbarEl.setAttribute('aria-hidden', hideTabbar ? 'true' : 'false');
  }

  function renderCurrentRoute() {
    if (currentRoute === 'home') renderHome();
    else if (currentRoute === 'study') renderStudy();
    else if (currentRoute === 'browse') renderBrowse();
    else if (currentRoute === 'review') renderReview();
    else if (currentRoute === 'reading') renderReading();
    else if (currentRoute === 'stats') renderStats();
    else if (currentRoute === 'settings') renderSettings();
    else if (currentRoute === 'books') renderBooks();
  }

  function applyRoute() {
    let route = getRouteFromHash();
    if (route === 'study' && !session) route = 'home';
    if (!ROUTES.includes(route)) route = 'home';

    if (getRouteFromHash() !== route) setRouteHash(route);

    const previousRoute = currentRoute;
    if (previousRoute === 'study' && route !== 'study') {
      session = null;
      stopPronunciation();
      maybeAutoUploadProgress();
    }
    if (previousRoute === 'review' && route !== 'review') {
      reviewSession = null;
      reviewBrowse = null;
      reviewListen = null;
      maybeAutoUploadProgress();
    }

    currentRoute = route;
    document.title = PAGE_TITLES[route] || PAGE_TITLES.home;

    Object.keys(views).forEach(function (key) {
      if (views[key]) views[key].hidden = key !== route;
    });
    appEl.classList.toggle('is-studying', route === 'study');
    appEl.classList.toggle('is-reviewing', route === 'review' && (Boolean(reviewSession) || Boolean(reviewListen)));
    syncNavigation(route);

    if (previousRoute !== route) {
      window.scrollTo(0, 0);
    }

    renderCurrentRoute();
  }

  function navigate(route) {
    if (!ROUTES.includes(route)) route = 'home';
    if (route === 'study' && !session) route = 'home';

    if (window.location.hash === '#/' + route) {
      if (currentRoute === route) {
        if (route !== 'study') window.scrollTo({ top: 0, behavior: 'smooth' });
        else applyRoute();
      } else {
        applyRoute();
      }
      return;
    }

    window.location.hash = '#/' + route;
  }

  /* ---------- 事件处理 ---------- */

  // 学习卡「认识」长按：短按照常推进复习阶段，长按直接标为已掌握。
  const KNOWN_LONG_PRESS_MS = 550;
  const KNOWN_LONG_PRESS_MOVE_PX = 12;
  let knownPressTimer = null;
  let knownPressStartX = 0;
  let knownPressStartY = 0;
  let suppressKnownTap = false;

  function knownRatingButtonFrom(target) {
    return target && typeof target.closest === 'function'
      ? target.closest('.rating-known[data-rating="known"]')
      : null;
  }

  function clearKnownPressTimer() {
    if (knownPressTimer) {
      window.clearTimeout(knownPressTimer);
      knownPressTimer = null;
    }
  }

  function eventPoint(event) {
    if (event.touches && event.touches.length) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event.changedTouches && event.changedTouches.length) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    if (typeof event.clientX === 'number') {
      return { x: event.clientX, y: event.clientY };
    }
    return null;
  }

  function handleKnownPressStart(event) {
    const button = knownRatingButtonFrom(event.target);
    if (!button) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.touches && event.touches.length !== 1) return;

    clearKnownPressTimer();
    suppressKnownTap = false;
    const point = eventPoint(event);
    knownPressStartX = point ? point.x : 0;
    knownPressStartY = point ? point.y : 0;

    knownPressTimer = window.setTimeout(function () {
      knownPressTimer = null;
      suppressKnownTap = true;
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
      masterCurrentWord();
    }, KNOWN_LONG_PRESS_MS);
  }

  function handleKnownPressMove(event) {
    if (!knownPressTimer) return;
    const point = eventPoint(event);
    if (!point) return;
    const dx = point.x - knownPressStartX;
    const dy = point.y - knownPressStartY;
    if ((dx * dx) + (dy * dy) > KNOWN_LONG_PRESS_MOVE_PX * KNOWN_LONG_PRESS_MOVE_PX) {
      clearKnownPressTimer();
    }
  }

  function handleKnownPressEnd() {
    clearKnownPressTimer();
  }

  function handleKnownPressLeave(event) {
    if (!knownPressTimer) return;
    // 子元素之间的移动不算离开按钮；point 事件在触摸设备上只针对按下时的元素。
    const button = knownRatingButtonFrom(event.target);
    if (!button) return;
    if (event.relatedTarget && button.contains(event.relatedTarget)) return;
    clearKnownPressTimer();
  }

  function handleKnownContextMenu(event) {
    if (knownRatingButtonFrom(event.target)) event.preventDefault();
  }

  function handleDocumentClick(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    const navButton = target.closest('[data-nav]');
    if (navButton) {
      event.preventDefault();
      navigate(navButton.getAttribute('data-nav'));
      return;
    }

    const speakButton = target.closest('[data-speak]');
    if (speakButton) {
      event.preventDefault();
      event.stopPropagation();
      playPronunciation(
        speakButton.getAttribute('data-word'),
        speakButton.getAttribute('data-speak'),
        true
      );
      return;
    }

    const ratingButton = target.closest('[data-rating]');
    if (ratingButton) {
      event.preventDefault();
      const rating = ratingButton.getAttribute('data-rating');
      // 长按已经触发「直接掌握」，随后的 click 不再按短按评分。
      if (suppressKnownTap && rating === 'known') {
        suppressKnownTap = false;
        return;
      }
      suppressKnownTap = false;
      rateCurrent(rating);
      return;
    }

    const actionEl = target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');

    if (action === 'start-study') {
      startStudy();
    } else if (action === 'exit-study') {
      exitStudy();
    } else if (action === 'reveal-meaning') {
      revealMeaning();
    } else if (action === 'finish-session') {
      navigate('home');
    } else if (action === 'continue-study') {
      continueStudy();
    } else if (action === 'start-review') {
      startReviewSession(actionEl.getAttribute('data-mode'));
    } else if (action === 'start-review-browse') {
      startReviewBrowse();
    } else if (action === 'start-review-listen') {
      startReviewListen();
    } else if (action === 'review-browse-exit') {
      exitReviewBrowse();
    } else if (action === 'review-browse-prev') {
      reviewBrowseStep(-1);
    } else if (action === 'review-browse-next') {
      reviewBrowseStep(1);
    } else if (action === 'review-listen-exit') {
      exitReviewListen();
    } else if (action === 'review-listen-play') {
      playReviewListenWord();
    } else if (action === 'review-listen-submit') {
      submitReviewListen();
    } else if (action === 'review-listen-next') {
      nextReviewListen();
    } else if (action === 'review-choice') {
      chooseReviewOption(Number(actionEl.getAttribute('data-index')));
    } else if (action === 'review-next') {
      nextReviewCard();
    } else if (action === 'review-exit') {
      exitReviewSession();
    } else if (action === 'review-back-hub') {
      stopPronunciation();
      reviewSession = null;
      reviewBrowse = null;
      reviewListen = null;
      applyRoute();
      window.scrollTo(0, 0);
    } else if (action === 'review-home') {
      stopPronunciation();
      reviewSession = null;
      reviewBrowse = null;
      reviewListen = null;
      navigate('home');
    } else if (action === 'browse-filter') {
      setBrowseFilter(actionEl.getAttribute('data-filter'));
    } else if (action === 'browse-freq') {
      setBrowseFreqFilter(actionEl.getAttribute('data-freq'));
    } else if (action === 'browse-more') {
      browseLimit += BROWSE_PAGE_SIZE;
      renderBrowseList();
    } else if (action === 'master-browse-word') {
      masterBrowseWord(actionEl.getAttribute('data-word-key'));
    } else if (action === 'clear-search') {
      browseQuery = '';
      browseLimit = BROWSE_PAGE_SIZE;
      const input = document.getElementById('browse-search');
      if (input) {
        input.value = '';
        input.focus();
      }
      updateSearchClearButton();
      renderBrowseList();
    } else if (action === 'export-backup') {
      exportBackup();
    } else if (action === 'toggle-secret') {
      toggleSecretVisibility(actionEl);
    } else if (action === 'save-github-token') {
      saveGithubTokenFromInput();
    } else if (action === 'clear-github-token') {
      clearGithubToken();
    } else if (action === 'upload-progress') {
      uploadProgress({ auto: false });
    } else if (action === 'download-progress') {
      downloadProgress();
    } else if (action === 'save-deepseek-key') {
      saveDeepseekKeyFromInput();
    } else if (action === 'clear-deepseek-key') {
      clearDeepseekKey();
    } else if (action === 'generate-reading') {
      generateReading(0);
    } else if (action === 'reading-choice') {
      chooseReadingOption(actionEl.getAttribute('data-question'), actionEl.getAttribute('data-choice'));
    } else if (action === 'submit-reading') {
      submitReading();
    } else if (action === 'open-reading') {
      openReadingHistory(actionEl.getAttribute('data-reading-id'));
    } else if (action === 'delete-reading') {
      deleteReadingHistory(actionEl.getAttribute('data-reading-id'));
    } else if (action === 'reading-word') {
      openReadingWord(actionEl.getAttribute('data-word'));
    } else if (action === 'add-reading-to-review') {
      addReadingWordToReview(actionEl.getAttribute('data-word'));
    } else if (action === 'close-reading-word') {
      readingLookup = '';
      renderReading();
    } else if (action === 'import-backup') {
      if (importInput) importInput.click();
    } else if (action === 'add-custom-words') {
      addCustomWords();
    } else if (action === 'reset-data') {
      resetAllData();
    } else if (action === 'toggle-book-panel') {
      toggleBookPanel(actionEl.getAttribute('data-book'));
    } else if (action === 'clear-unit-selection') {
      clearUnitSelection();
    }
  }

  function handleDocumentInput(event) {
    const target = event.target;
    if (!target) return;

    if (currentRoute === 'review' && reviewSession && typeof target.classList !== 'undefined' &&
        target.classList.contains('letter-input')) {
      handleReviewLetterInput(target);
      return;
    }

    if (target.id === 'browse-search') {
      browseQuery = target.value;
      browseLimit = BROWSE_PAGE_SIZE;
      updateSearchClearButton();
      renderBrowseList();
    }
  }

  function handleDocumentChange(event) {
    const target = event.target;
    if (!target) return;

    if (typeof target.hasAttribute === 'function' && target.hasAttribute('data-unit-toggle')) {
      toggleUnitSelection(target.getAttribute('data-unit-toggle'), target.checked);
    } else if (typeof target.hasAttribute === 'function' && target.hasAttribute('data-book-select-all')) {
      toggleBookSelection(target.getAttribute('data-book-select-all'), target.checked);
    } else if (target.id === 'daily-new-input') {
      updateDailyNew(target.value);
    } else if (target.id === 'auto-pronounce-checkbox') {
      updateAutoPronounce(target.checked);
    } else if (target.id === 'github-auto-upload') {
      updateGithubAutoUpload(target.checked);
    } else if (target.id === 'deepseek-model-select') {
      saveDeepseekModel(target.value);
    } else if (target.id === 'browse-book-filter') {
      browseBookFilter = target.value || 'all';
      browseUnitFilter = 'all';
      browseLimit = BROWSE_PAGE_SIZE;
      syncBrowseUnitOptions();
      renderBrowseList();
    } else if (target.id === 'browse-unit-filter') {
      browseUnitFilter = target.value || 'all';
      browseLimit = BROWSE_PAGE_SIZE;
      renderBrowseList();
    }
  }

  function isTypingTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
  }

  function handleDocumentKeydown(event) {
    if (currentRoute === 'review') {
      handleReviewKeydown(event);
      return;
    }
    if (currentRoute !== 'study' || !session) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === '1' || event.key === '2' || event.key === '3') {
      if (event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      const ratingMap = { '1': 'known', '2': 'fuzzy', '3': 'unknown' };
      rateCurrent(ratingMap[event.key]);
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      if (isTypingTarget(event.target)) return;
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, summary')) return;
      if (session.queue.length && !session.revealed) {
        event.preventDefault();
        revealMeaning();
      }
    }
  }

  function handleVisibilityChange() {
    if (!document.hidden && currentRoute === 'home') {
      renderHome();
    }
  }

  /* ---------- 初始化 ---------- */

  document.addEventListener('click', handleDocumentClick);
  if (window.PointerEvent) {
    document.addEventListener('pointerdown', handleKnownPressStart);
    document.addEventListener('pointermove', handleKnownPressMove);
    document.addEventListener('pointerup', handleKnownPressEnd);
    document.addEventListener('pointercancel', handleKnownPressEnd);
    document.addEventListener('pointerleave', handleKnownPressLeave, true);
  } else {
    document.addEventListener('touchstart', handleKnownPressStart, { passive: true });
    document.addEventListener('touchmove', handleKnownPressMove, { passive: true });
    document.addEventListener('touchend', handleKnownPressEnd);
    document.addEventListener('touchcancel', handleKnownPressEnd);
    document.addEventListener('mouseup', handleKnownPressEnd);
    document.addEventListener('mouseleave', handleKnownPressEnd, true);
  }
  document.addEventListener('contextmenu', handleKnownContextMenu);
  document.addEventListener('input', handleDocumentInput);
  document.addEventListener('change', handleDocumentChange);
  document.addEventListener('keydown', handleDocumentKeydown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('hashchange', applyRoute);

  if (importInput) {
    importInput.addEventListener('change', handleBackupFile);
  }

  // 旧版本进度以单词文本为键，启动时迁移到新的 id 键。
  function bootAfterWordsLoaded() {
    invalidateWordCache();
    migrateLegacyProgress();

    // 首页停留时定时刷新到期数量（例如 5 分钟后的第一次复习）。
    window.setInterval(function () {
      if (currentRoute === 'home' && !document.hidden) {
        renderHome();
      }
    }, 30000);

    applyRoute();

    if (initialToast) {
      window.setTimeout(function () {
        showToast(initialToast, 'error');
      }, 450);
    }
  }

  if (Array.isArray(window.WORDS) && window.WORDS.length) {
    bootAfterWordsLoaded();
  } else {
    const homeView = document.getElementById('view-home');
    if (homeView) {
      homeView.innerHTML = '<div class="empty-state"><p>正在加载词库…</p></div>';
    }
    const wordsScript = document.createElement('script');
    wordsScript.src = 'words.js';
    wordsScript.onload = function () {
      bootAfterWordsLoaded();
    };
    wordsScript.onerror = function () {
      const home = document.getElementById('view-home');
      if (home) {
        home.innerHTML = '<div class="empty-state"><p>词库加载失败</p><p class="muted">请确认 words.js 与 app.js 位于同一目录后重试。</p></div>';
      }
    };
    document.body.appendChild(wordsScript);
  }
})();
