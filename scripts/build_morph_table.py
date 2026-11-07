#!/usr/bin/env python3
"""Build morph-table.js from lemminflect (offline). No network, no LLM."""

import json
import re
from pathlib import Path

from lemminflect import getAllInflections
from lemminflect.core.Inflections import Inflections
from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parents[1]
WORDS_PATH = ROOT / "words.js"
PROGRESS_PATH = ROOT / "data" / "progress.json"
OUT_PATH = ROOT / "morph-table.js"

SINGLE = re.compile(r"[a-z]+(?:'[a-z]+)?$")
ZIPF_MIN = 1.0
# 词表里没有、但屈折不规则且足够常见的词，也写进表，自定义词能用。
ZIPF_EXTRA = 3.4
# 原形也被标成复数时，只丢掉明显比原形稀得多的规则复数（informations），
# 正常复数（helpers）要留下。
UNCOUNT_GAP = 2.0
UNCOUNT_FLOOR = 2.4

EXTRA = """
go be have do say get make know think take see come want look use find give
tell work call try ask need feel become leave put mean keep let begin seem
help talk turn start show hear play run move live believe hold bring happen
write sit stand lose pay meet include continue set learn change lead understand
watch follow stop create speak read spend grow open walk win teach offer
remember consider appear buy wait serve die send build stay fall cut reach
kill remain suggest raise pass sell require report decide fly eat drink
sleep sing swim sit stand lie lay rise drive draw break choose forget freeze
speak wear wake beat bite blow burn dig feed fight hide hit hurt lead lend
light lose mean ride ring seek sell send shake shoot show shut sing sink
sit sleep speak spend stand steal stick swim swing teach tear tell think
throw understand wake wear win write abide arise awake bear bind bleed breed
broadcast burst cast cling creep deal dig dream dwell feed flee fling forbid
forgive forsake grind hang kneel knit lay lead lean leap learn leave lend
lie light mislead mistake overcome overtake prove quit rid rise seek sew
shed shine shrink shut sing sink slide slit sow speed spell spill spin spit
split spoil spread spring sting stink stride strike string strive swear sweep
swim swing teach tear tell think throw thrust tread undergo undertake upset
wake weave weep wet win wind wring
child children ox person man woman mouse louse foot tooth goose knife life
wife leaf thief wolf half self elf shelf potato tomato hero quiz bus city
box watch sheep deer fish series species analysis crisis phenomenon criterion
focus nucleus index medium cactus fungus thesis basis diagnosis appendix
formula curriculum bacterium stimulus syllabus phenomenon child good bad far
many much little big small happy easy hot cold tall short long young old new
fast hard early late large great high low busy dirty funny angry heavy lucky
noisy pretty quiet simple gentle narrow clever common handsome polite nice
safe free close wide strong weak poor rich cheap long early best better worse
worst study run see get information advice homework knowledge equipment
furniture research evidence news water people die lie focus beautiful
important careful helpful public basic happy easy heavy healthy angry busy
lucky similar regular popular particular familiar
final national usual actual normal special general natural personal
official original local total central annual practical typical historic
historical specific automatic dramatic classic academic scientific
economic creative serious different simple possible real global
""".split()


def load_surface_lemmas():
    text = WORDS_PATH.read_text(encoding="utf-8")
    start = text.index("window.WORDS=") + len("window.WORDS=")
    words, _ = json.JSONDecoder().raw_decode(text, start)
    found = set()

    def add(token):
        low = str(token or "").strip().lower()
        if SINGLE.fullmatch(low):
            found.add(low)

    for word in words:
        add(word.get("w"))
        wf = word.get("wf") or {}
        for values in wf.values():
            for token in values or []:
                add(str(token).split("/")[0] if False else token)
                for part in str(token).split("/"):
                    add(part)
    if PROGRESS_PATH.exists():
        progress = json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
        custom = ((progress.get("data") or {}).get("customWords")) or []
        for word in custom:
            add(word.get("w"))
            wf = word.get("wf") or {}
            for values in wf.values():
                for token in values or []:
                    for part in str(token).split("/"):
                        add(part)
    for token in EXTRA:
        add(token)
    return found


def keep_form(form, lemma):
    if not form or form == lemma:
        return False
    if not SINGLE.fullmatch(form):
        return False
    if " " in form or "/" in form:
        return False
    # skiis 这种错误复数：正确的 skis 更常见时丢掉。
    if form == lemma + "is" and zipf_frequency(lemma + "s", "en") > zipf_frequency(form, "en"):
        return False
    return zipf_frequency(form, "en") >= ZIPF_MIN


def is_irregular(lemma, forms):
    verb_past = [item.lower() for item in (forms.get("VBD") or ()) if item]
    if any(not item.endswith("ed") for item in verb_past):
        return True
    verb_pp = [item.lower() for item in (forms.get("VBN") or ()) if item]
    if any(item not in verb_past and not item.endswith("ed") for item in verb_pp):
        return True
    nouns = [item.lower() for item in (forms.get("NNS") or ()) if item]
    # 复数与原形相同（sheep / 不可数）不整表收录；词表里的词会单独写入。
    extra_nouns = [item for item in nouns if item != lemma]
    if any(not (item.endswith("s") or item.endswith("es")) for item in extra_nouns):
        return True
    comparatives = [item.lower() for item in (forms.get("JJR") or ()) if item]
    if any(not (item.endswith("er") or item.endswith("r")) for item in comparatives):
        return True
    return False


def syllable_count(word):
    base = word[:-1] if word.endswith("e") else word
    groups = re.findall(r"[aeiouy]+", base)
    count = len(groups) or 1
    if len(word) > 2 and word.endswith("le") and word[-3] not in "aeiouy":
        count += 1
    return max(1, count)


def should_double(word):
    if len(word) < 3:
        return False
    if not re.search(r"[^aeiou][aeiouy][^aeiouwxy]$", word):
        return False
    return syllable_count(word) == 1


def regular_verb_forms(lemma):
    """规则动词三单 / 过去式 / -ing。过去分词与过去式相同，不重复。"""
    if len(lemma) < 3 or lemma.endswith("ing") or lemma.endswith("ed"):
        return None
    if re.search(r"(?:[sxz]|ch|sh)$", lemma):
        third = lemma + "es"
    elif re.search(r"[^aeiou]y$", lemma):
        third = lemma[:-1] + "ies"
    else:
        third = lemma + "s"
    if re.search(r"[^aeiou]y$", lemma):
        past = lemma[:-1] + "ied"
        ing = lemma[:-1] + "ying"
    elif lemma.endswith("ie"):
        past = lemma + "d"
        ing = lemma[:-2] + "ying"
    elif re.search(r"[^iyeo]e$", lemma):
        past = lemma + "d"
        ing = lemma[:-1] + "ing"
    elif should_double(lemma):
        stem = lemma + lemma[-1]
        past = stem + "ed"
        ing = stem + "ing"
    else:
        past = lemma + "ed"
        ing = lemma + "ing"
    return third, past, ing


def regular_plural(lemma):
    if len(lemma) < 3 or lemma.endswith("ing"):
        return None
    # pants / bus / analysis 的复数不靠这条补。bus 等已经在词典里。
    if re.search(r"(?:s|x|z|ch|sh|ies|ves|men)$", lemma):
        return None
    if re.search(r"[^aeiou]y$", lemma):
        return lemma[:-1] + "ies"
    return lemma + "s"


def zipf_ok(form, floor):
    return bool(form) and SINGLE.fullmatch(form) and zipf_frequency(form, "en") >= floor


# 这些副词不规则，或 -le/-able 不能按开放规则生成。其余候选还要过 wordfreq。
LY_EXACT = {
    "public": "publicly", "true": "truly", "whole": "wholly", "due": "duly", "real": "really",
    "full": "fully", "dull": "dully",
    "possible": "possibly", "impossible": "impossibly", "probable": "probably",
    "capable": "capably", "comfortable": "comfortably", "reasonable": "reasonably",
    "considerable": "considerably", "remarkable": "remarkably", "preferable": "preferably",
    "understandable": "understandably", "visible": "visibly", "responsible": "responsibly",
    "terrible": "terribly", "horrible": "horribly", "miserable": "miserably",
    "flexible": "flexibly", "incredible": "incredibly", "sensible": "sensibly",
    "suitable": "suitably", "valuable": "valuably", "notable": "notably",
    "inevitable": "inevitably", "reliable": "reliably", "agreeable": "agreeably",
    "enjoyable": "enjoyably", "fashionable": "fashionably", "favourable": "favourably",
    "favorable": "favorably", "honourable": "honourably", "honorable": "honorably",
    "acceptable": "acceptably", "comparable": "comparably",
    "necessary": "necessarily", "unnecessary": "unnecessarily",
    "ordinary": "ordinarily", "extraordinary": "extraordinarily",
    "secondary": "secondarily", "primary": "primarily",
    "temporary": "temporarily", "voluntary": "voluntarily",
    "satisfactory": "satisfactorily", "imaginary": "imaginarily",
    "simple": "simply", "gentle": "gently", "single": "singly", "double": "doubly",
    "noble": "nobly", "subtle": "subtly", "humble": "humbly",
}


# less/incident 不能按后缀规则变成 lessly / incidently。
SKIP_LY = {"less", "more", "most", "least", "little", "much", "many", "incident"}


def candidate_ly(adj):
    if adj in LY_EXACT:
        return LY_EXACT[adj]
    if adj in SKIP_LY or len(adj) < 4 or adj.endswith("ly"):
        return ""
    if adj.endswith(("ful", "less", "ous")):
        suffix = "ous" if adj.endswith("ous") else ("less" if adj.endswith("less") else "ful")
        if len(adj) - len(suffix) < 3:
            return ""
        return adj + "ly"
    if adj.endswith("ic") and len(adj) >= 5:
        return adj + "ally"
    if (
        re.search(r"[^aeiou]y$", adj)
        and 5 <= len(adj) <= 7
        and syllable_count(adj) <= 2
        and not adj.endswith(("ary", "ory", "ery", "ity"))
        and adj != "nearby"
    ):
        return adj[:-1] + "ily"
    if adj.endswith("al") and len(adj) >= 5:
        return adj + "ly"
    if adj.endswith("ive") and len(adj) >= 6:
        return adj + "ly"
    if adj.endswith(("ent", "ant")) and len(adj) >= 6:
        return adj + "ly"
    return ""


def rule_fill_missing(lemma, row, plural_floor, verb_past_floor, verb_ing_floor):
    """词典没收录的词性，只补 wordfreq 认得出的规则形式。"""
    if "n" not in row:
        plural = regular_plural(lemma)
        if zipf_ok(plural, plural_floor):
            row["n"] = [plural]
    if "v" not in row:
        forms = regular_verb_forms(lemma)
        if forms:
            third, past, ing = forms
            if zipf_ok(past, verb_past_floor) and zipf_ok(ing, verb_ing_floor):
                row["v"] = [form for form in forms if zipf_ok(form, 1.0)]
    return row


def paradigm_for(lemma):
    infl = getAllInflections(lemma)
    if not infl:
        return None

    def collect(tags, skip_lemma=True):
        out = []
        for tag in tags:
            for form in infl.get(tag) or ():
                low = form.lower()
                if skip_lemma and low == lemma:
                    continue
                if low in out:
                    continue
                if not keep_form(low, lemma):
                    continue
                out.append(low)
        return out

    nouns = collect(["NNS"])
    nns_raw = [form.lower() for form in (infl.get("NNS") or ())]
    if lemma in nns_raw:
        lemma_zipf = zipf_frequency(lemma, "en")
        floor = max(UNCOUNT_FLOOR, lemma_zipf - UNCOUNT_GAP)
        nouns = [form for form in nouns if zipf_frequency(form, "en") >= floor]
    nouns.sort(key=lambda form: -zipf_frequency(form, "en"))

    verbs = []
    for tag in ("VBZ", "VBP", "VBD", "VBN", "VBG"):
        for form in infl.get(tag) or ():
            low = form.lower()
            if low == lemma or low in verbs:
                continue
            if not keep_form(low, lemma):
                continue
            verbs.append(low)

    adjectives = []
    for tag in ("JJR", "JJS"):
        group = []
        for form in infl.get(tag) or ():
            low = form.lower()
            if low == lemma or " " in low or low in adjectives or low in group:
                continue
            if not keep_form(low, lemma):
                continue
            group.append(low)
        group.sort(key=lambda form: -zipf_frequency(form, "en"))
        adjectives.extend(group)

    adverbs = []
    for tag in ("RBR", "RBS"):
        group = []
        for form in infl.get(tag) or ():
            low = form.lower()
            if low == lemma or " " in low or low in adverbs or low in group:
                continue
            if not keep_form(low, lemma):
                continue
            group.append(low)
        group.sort(key=lambda form: -zipf_frequency(form, "en"))
        adverbs.extend(group)

    row = {}
    if "NN" in infl or "NNS" in infl:
        row["n"] = nouns
    if any(tag in infl for tag in ("VB", "VBD", "VBG", "VBN", "VBZ", "VBP")):
        row["v"] = verbs
    if "JJ" in infl or "JJR" in infl or "JJS" in infl:
        row["adj"] = adjectives
    if ("RB" in infl or "RBR" in infl or "RBS" in infl) and adverbs:
        row["adv"] = adverbs
    elif "RB" in infl and not adverbs:
        # 副词原形在表里，比较级留给规则或保持空，避免 fast 被规则漏掉时无标记。
        if not adjectives:
            row["adv"] = []
    return row or None


def main():
    vocab = load_surface_lemmas()
    infl_dict = Inflections()._getInflDict()
    selected = set(vocab)
    for lemma, forms in infl_dict.items():
        if not SINGLE.fullmatch(lemma):
            continue
        if lemma in selected:
            continue
        if not is_irregular(lemma, forms):
            continue
        if zipf_frequency(lemma, "en") >= ZIPF_EXTRA:
            selected.add(lemma)

    rows = {}
    for lemma in sorted(selected):
        row = paradigm_for(lemma)
        if row:
            rows[lemma] = row

    # 词表里的词都占一行。词典没有的词性不再交给前端规则去编造。
    # 完全没收录的词，只补 wordfreq 认得出的规则复数 / 动词屈折。
    for lemma in vocab:
        if lemma not in rows:
            rows[lemma] = rule_fill_missing(lemma, {}, 1.8, 1.3, 1.3)
        elif "v" not in rows[lemma]:
            # 已有词典行时只补很常见的动词（flavour/flavoured），不把 applies 当成名词。
            rule_fill_missing(lemma, rows[lemma], 99, 2.4, 2.0)

    for lemma, row in rows.items():
        if "adj" not in row:
            continue
        ly = candidate_ly(lemma)
        if ly and ly != lemma and zipf_ok(ly, 1.0):
            row["ly"] = ly

    # 词典缺口：人 / 牛 / many / little 的常用不规则。
    rows.setdefault("ox", {}).update({"n": ["oxen"]})
    rows.setdefault("many", {}).update({"adj": ["more", "most"]})
    person = rows.setdefault("person", {})
    nouns = person.setdefault("n", [])
    if "people" not in nouns:
        nouns.insert(0, "people")
    little = rows.setdefault("little", {})
    little["adj"] = ["less", "least", "littler", "littlest"]
    little["adv"] = ["less", "least"]
    lie = rows.setdefault("lie", {})
    lie_verbs = lie.get("v") or []
    for form in ("lies", "lied", "lay", "lain", "lying"):
        if form not in lie_verbs:
            lie_verbs.append(form)
    lie["v"] = lie_verbs

    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    text = (
        "/* Generated by scripts/build_morph_table.py from lemminflect. Do not edit by hand. */\n"
        "(function (root) {\n"
        "  var api = root.XDCMorph;\n"
        "  if (!api && typeof require === 'function') {\n"
        "    try { api = require('./morphology.js'); } catch (error) { api = null; }\n"
        "  }\n"
        "  if (api && api.installTable) api.installTable(" + payload + ");\n"
        "})(typeof globalThis !== 'undefined' ? globalThis : this);\n"
    )
    OUT_PATH.write_text(text, encoding="utf-8")
    print(f"lemmas {len(rows)} bytes {OUT_PATH.stat().st_size}")
    for sample in ("go", "be", "child", "good", "study", "ox", "person", "little", "many", "sheep", "knife", "analysis", "information", "beautiful", "big", "happy", "lie", "run", "freeze"):
        print(sample, rows.get(sample))


if __name__ == "__main__":
    main()
