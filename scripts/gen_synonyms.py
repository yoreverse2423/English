#!/usr/bin/env python3
"""Batch-generate synonyms for WORDS via deepseek-flash. Checkpointable."""
from __future__ import annotations
import json, os, re, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORDS_PATH = ROOT / "words.js"
OUT_DIR = ROOT / "data" / "syn-batches"
OUT_DIR.mkdir(parents=True, exist_ok=True)
STATE_PATH = OUT_DIR / "state.json"
MERGED_PATH = OUT_DIR / "syn_merged.json"
MODEL = "deepseek-flash"
BATCH = 12
ENDPOINT = "https://api.deepseek.com/chat/completions"

def load_words():
    text = WORDS_PATH.read_text(encoding="utf-8")
    start = text.index("window.WORDS=") + len("window.WORDS=")
    # find matching end before ;window. or ;\nwindow.
    i = start
    depth = 0
    in_str = False
    esc = False
    quote = ""
    end = None
    while i < len(text):
        ch = text[i]
        if in_str:
            if esc: esc = False
            elif ch == "\\": esc = True
            elif ch == quote: in_str = False
        else:
            if ch in "\"'":
                in_str = True; quote = ch
            elif ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        i += 1
    if end is None:
        raise SystemExit("cannot parse WORDS")
    words = json.loads(text[start:end])
    return words, text, start, end

def call_ds(messages, max_tokens=8192):
    key = os.environ.get("DEEPSEEK_API_KEY") or ""
    if not key:
        raise SystemExit("DEEPSEEK_API_KEY missing")
    body = json.dumps({
        "model": MODEL,
        "temperature": 0.2,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }, ensure_ascii=False).encode("utf-8")
    last_err = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(ENDPOINT, data=body, headers={
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.load(resp)
            content = data["choices"][0]["message"]["content"]
            if isinstance(content, dict):
                return content
            content = (content or "").strip()
            if not content:
                raise ValueError("empty content")
            if content.startswith("```"):
                content = re.sub(r"^```(?:json)?\s*", "", content)
                content = re.sub(r"\s*```$", "", content)
            # salvage truncated JSON arrays/objects when possible
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                start = content.find("{")
                end = content.rfind("}")
                if start >= 0 and end > start:
                    return json.loads(content[start:end+1])
                raise
        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise last_err

SYSTEM = (
    "你是高考英语词汇老师。只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。"
)

def build_user(batch):
    lines = []
    for i, w in enumerate(batch, 1):
        lines.append(f"{i}. {w['w']} | {(w.get('pos') or '')} | {(w.get('cn') or '')[:40]}")
    return (
        "为下列高考英语单词各写 2～4 个常用同义词（宁缺毋滥；没有把握就少写或不写）。\n"
        "字段：{\"items\":[{\"w\":\"原词\",\"syn\":[{\"w\":\"同义词\",\"note\":\"简短区别或中文提示\"}]}]}\n"
        "规则：\n"
        "1. syn.w 必须是真实英语单词/短语，高考常见；不要编造。\n"
        "2. note 用极短中文说明细微差别或对应义项，例如「更正式」「侧重遗弃」。\n"
        "3. 不要把屈折形式当同义词（abandoned ≠ abandon 的同义词）。\n"
        "4. 没有合适同义词时 syn 可为 []。\n"
        "5. items 顺序与输入一致，w 用给出的原词。\n"
        "单词：\n" + "\n".join(lines)
    )

def normalize_syn(raw_list):
    out = []
    seen = set()
    for item in raw_list or []:
        if not isinstance(item, dict):
            continue
        w = str(item.get("w") or "").strip()
        note = str(item.get("note") or "").strip()[:40]
        key = w.lower()
        if not w or key in seen or len(w) > 40:
            continue
        seen.add(key)
        out.append({"w": w, "note": note})
        if len(out) >= 4:
            break
    return out

def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"next": 0, "done": 0, "fail_streak": 0, "errors": []}

def save_state(st):
    STATE_PATH.write_text(json.dumps(st, ensure_ascii=False, indent=2), encoding="utf-8")

def merge_all():
    merged = {}
    for p in sorted(OUT_DIR.glob("batch_*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        for it in data.get("items") or []:
            w = (it.get("w") or "").strip()
            if w:
                merged[w.lower()] = normalize_syn(it.get("syn"))
    MERGED_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    return merged

def run(limit_batches=None, start_from=None):
    words, *_ = load_words()
    st = load_state()
    if start_from is not None:
        st["next"] = int(start_from)
    fail_streak = int(st.get("fail_streak") or 0)
    batches_run = 0
    while st["next"] < len(words):
        if limit_batches is not None and batches_run >= limit_batches:
            break
        i0 = st["next"]
        i1 = min(len(words), i0 + BATCH)
        batch = words[i0:i1]
        batch_id = f"{i0:04d}_{i1:04d}"
        out_path = OUT_DIR / f"batch_{batch_id}.json"
        if out_path.exists():
            print(f"skip existing {out_path.name}")
            st["next"] = i1
            st["done"] = i1
            save_state(st)
            batches_run += 1
            continue
        print(f"batch {batch_id} ({len(batch)} words)…", flush=True)
        try:
            parsed = call_ds([
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": build_user(batch)},
            ])
            items = parsed.get("items") if isinstance(parsed, dict) else None
            if not isinstance(items, list) or not items:
                raise ValueError("empty items")
            # map back by index / name
            by_w = {}
            for it in items:
                if isinstance(it, dict) and it.get("w"):
                    by_w[str(it["w"]).lower()] = normalize_syn(it.get("syn"))
            fixed = []
            for w in batch:
                key = w["w"].lower()
                fixed.append({"w": w["w"], "syn": by_w.get(key, [])})
            out_path.write_text(json.dumps({"items": fixed}, ensure_ascii=False, indent=2), encoding="utf-8")
            fail_streak = 0
            st["fail_streak"] = 0
            st["next"] = i1
            st["done"] = i1
            save_state(st)
            print(f"  ok → {out_path.name}")
        except Exception as e:
            fail_streak += 1
            st["fail_streak"] = fail_streak
            st.setdefault("errors", []).append({"batch": batch_id, "error": str(e)[:200]})
            save_state(st)
            print(f"  FAIL {e}", flush=True)
            if fail_streak >= 2:
                print("stopped after 2 consecutive failures")
                break
            time.sleep(2)
            continue
        batches_run += 1
        time.sleep(0.4)
    merged = merge_all()
    print(f"merged {len(merged)} lemmas → {MERGED_PATH}")
    return merged

def apply_to_words():
    words, text, start, end = load_words()
    merged = json.loads(MERGED_PATH.read_text(encoding="utf-8")) if MERGED_PATH.exists() else merge_all()
    covered = 0
    nonempty = 0
    for w in words:
        syn = merged.get((w.get("w") or "").lower())
        if syn is None:
            w["syn"] = w.get("syn") or []
            continue
        covered += 1
        w["syn"] = syn
        if syn:
            nonempty += 1
    # rebuild words.js
    remap_at = text.find(";window.", end)
    if remap_at < 0:
        remap_at = text.find(";\n", end)
    header = text[:start]
    # keep comment header
    next_text = header + json.dumps(words, ensure_ascii=False, separators=(",", ":"))
    if remap_at > 0:
        next_text += text[remap_at:]
    else:
        next_text += ";"
    WORDS_PATH.write_text(next_text, encoding="utf-8")
    print(f"applied: covered={covered} nonempty={nonempty} file={WORDS_PATH.stat().st_size}")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    if cmd == "sample":
        run(limit_batches=2)
    elif cmd == "run":
        run()
    elif cmd == "apply":
        apply_to_words()
    elif cmd == "merge":
        m = merge_all(); print(len(m))
    else:
        print("usage: gen_synonyms.py sample|run|merge|apply")
