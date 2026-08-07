#!/usr/bin/env python3
"""Sinh agents/KIEN-TRUC-CSBH.md từ artifacts/kien-truc-csbh.html.

Nguồn sự thật là file HTML. Sửa HTML rồi chạy lại script này, đừng sửa tay bản .md.
    python3 tools/html2md.py

Mỗi <figure> trong HTML được thay bằng nội dung tools/figs/fN.md theo đúng thứ tự
xuất hiện — vì SVG vẽ tay không đọc được trên GitHub, bản .md dùng Mermaid thay thế.
"""
import html, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC  = ROOT / 'artifacts' / 'kien-truc-csbh.html'
DST  = ROOT / 'agents' / 'KIEN-TRUC-CSBH.md'
FIGS = ROOT / 'tools' / 'figs'

S = SRC.read_text(encoding='utf-8')
body = S[S.index('<header class="mast">'):]

figs = []
body = re.sub(r'<figure>.*?</figure>',
              lambda m: figs.append(m.group(0)) or '\n@@FIG%d@@\n' % (len(figs) - 1),
              body, flags=re.S)
body = re.sub(r'<script>.*?</script>', '', body, flags=re.S)

# '<' và '>' sinh ra từ &lt; &gt; phải được che, nếu không bước xoá thẻ cuối cùng
# sẽ ăn từ đó tới dấu '>' gần nhất ở dòng khác và nuốt mất nội dung.
LT, GT = '\x01', '\x02'

def inline(t):
    t = re.sub(r'<span class="chip[^"]*">([^<]*)</span>', r'`\1`', t)
    t = re.sub(r'<code>(.*?)</code>', lambda m: '`%s`' % re.sub(r'<[^>]+>', '', m.group(1)), t, flags=re.S)
    t = re.sub(r'</?(strong|b)>', '**', t)
    t = re.sub(r'</?(em|i)>', '*', t)
    t = re.sub(r'<br\s*/?>', ' · ', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t).replace('<', LT).replace('>', GT)
    return re.sub(r'[ \t\n]+', ' ', t).strip()

def cell(t):
    return inline(t).replace('|', r'\|')

def table(m):
    blk = m.group(0)
    h = re.search(r'<thead>(.*?)</thead>', blk, re.S)
    heads = [cell(c) for c in re.findall(r'<th[^>]*>(.*?)</th>', h.group(1), re.S)] if h else []
    tb = re.search(r'<tbody>(.*?)</tbody>', blk, re.S)
    rows = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', (tb.group(1) if tb else blk), re.S):
        cs = [cell(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, re.S)]
        if cs:
            rows.append(cs)
    if not heads and rows:
        heads = [''] * len(rows[0])
    n = max([len(heads)] + [len(r) for r in rows] or [1])
    heads += [''] * (n - len(heads))
    out = ['| ' + ' | '.join(heads) + ' |', '|' + '---|' * n]
    for r in rows:
        out.append('| ' + ' | '.join(r + [''] * (n - len(r))) + ' |')
    return '\n' + '\n'.join(out) + '\n'

def note(m):
    inner = m.group(1)
    lbl = re.search(r'<span class="lbl">(.*?)</span>', inner, re.S)
    lines = ['> **%s**' % inline(lbl.group(1))] if lbl else []
    inner = re.sub(r'<span class="lbl">.*?</span>', '', inner, flags=re.S)
    for p in re.findall(r'<p>(.*?)</p>', inner, re.S):
        lines += ['>', '> ' + inline(p)]
    return '\n' + '\n'.join(lines) + '\n'

def lst(m):
    tag, inner = m.group(1), m.group(2)
    items = re.findall(r'<li>(.*?)</li>', inner, re.S)
    pre_ = (lambda i: '%d. ' % i) if tag == 'ol' else (lambda i: '- ')
    return '\n' + '\n'.join(pre_(i) + inline(t) for i, t in enumerate(items, 1)) + '\n'

def pre(m):
    t = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).replace('<', LT).replace('>', GT)
    return '\n```\n' + t.strip('\n') + '\n```\n'

body = re.sub(r'<pre>(.*?)</pre>', pre, body, flags=re.S)
body = re.sub(r'<div class="note[^"]*">(.*?)</div>', note, body, flags=re.S)   # trước table
body = re.sub(r'<table[^>]*>.*?</table>', table, body, flags=re.S)
body = re.sub(r'<(ul|ol)>(.*?)</\1>', lst, body, flags=re.S)
body = re.sub(r'<h2>\s*<span class="no">§ (\d+)</span>(.*?)</h2>',
              lambda m: '\n## %s. %s\n' % (m.group(1), inline(m.group(2))), body, flags=re.S)
body = re.sub(r'<div class="grpttl">\s*<h3>(.*?)</h3>.*?</div>',
              lambda m: '\n### ' + inline(m.group(1)) + '\n', body, flags=re.S)
for h in ('h3', 'h4'):
    body = re.sub(r'<%s>(.*?)</%s>' % (h, h),
                  lambda m, h=h: '\n%s %s\n' % ('#' * int(h[1]), inline(m.group(1))), body, flags=re.S)
body = re.sub(r'<p[^>]*>(.*?)</p>', lambda m: '\n' + inline(m.group(1)) + '\n', body, flags=re.S)
body = re.sub(r'</section>', '\n\n---\n', body)
body = re.sub(r'<[^>]+>', '', body)
body = html.unescape(body).replace(LT, '<').replace(GT, '>')
body = re.sub(r'\n{3,}', '\n\n', body)

md = body[body.index('## 01. '):]
for i in range(len(figs)):
    f = FIGS / ('f%d.md' % i)
    if not f.exists():
        sys.exit('thiếu %s (HTML có %d figure)' % (f, len(figs)))
    md = md.replace('@@FIG%d@@' % i, f.read_text(encoding='utf-8').strip())
if '@@FIG' in md:
    sys.exit('còn chỗ giữ chỗ sơ đồ chưa thay')

n_tc = len(re.findall(r'data-tc="\w+"', S))
app_v = '1.0.0'

def anchor(t):
    a = re.sub(r'[^\w\s-]', '', t.lower(), flags=re.U)
    return '#' + re.sub(r'\s', '-', a)

heads = re.findall(r'^## (\d+)\. (.+)$', md, re.M)
rows = []
half = (len(heads) + 1) // 2
for i in range(half):
    l = heads[i]
    r = heads[i + half] if i + half < len(heads) else None
    cl = '| %s | [%s](%s)' % (l[0], l[1], anchor('%s. %s' % l))
    cr = ' | %s | [%s](%s) |' % (r[0], r[1], anchor('%s. %s' % r)) if r else ' | | |'
    rows.append(cl + cr)

head = f"""# Kiến trúc & kế hoạch kiểm thử — Phần mềm Chính sách bán hàng

| | |
|---|---|
| **Đơn vị yêu cầu** | Công ty TNHH Dược phẩm Nutricare |
| **Phiên bản phần mềm** | **{app_v}** — bản đầu tiên, xem mục 16 |
| **Phiên bản tài liệu** | 1.1 · 06/08/2026 |
| **Nguồn nghiệp vụ** | `YEU-CAU-NGHIEP-VU-CSBH.md` v4.1 — khi mâu thuẫn, **tài liệu nghiệp vụ có hiệu lực cao hơn** |
| **Bản web** | `../artifacts/kien-truc-csbh.html` · https://claude.ai/code/artifact/d9e72525-6df5-475d-8b76-52f8a3202aea |

> Bản `.md` này **sinh tự động** từ file HTML bằng `python3 tools/html2md.py`.
> Sửa HTML rồi chạy lại script, đừng sửa tay file này.

Bản thiết kế triển khai cho YCNV v4.1: phân rã microservice chạy bằng Docker Compose, techstack kèm
lý do chọn, thiết kế giao diện chạy được trên cả máy tính lẫn điện thoại, danh mục {n_tc} test case
cho backend lẫn frontend, và quy trình kiểm thử local trước khi lên production.

| | | | |
|---|---|---|---|
| **10** service ứng dụng | **{n_tc}** test case | **11** trạng thái hồ sơ | **6** vai trò |
| **10** tài khoản mẫu | **3** khung nhìn được test | **8 GB** RAM một VM là đủ | **~50** người dùng |

## Mục lục

| # | Mục | # | Mục |
|---|---|---|---|
""" + '\n'.join(rows) + "\n\n---\n\n"

out = re.sub(r'\n{3,}', '\n\n', head + md.strip() + '\n')
DST.write_text(out, encoding='utf-8')
print('%s · %d test case · %d mục · %d figure · %d KB'
      % (DST.relative_to(ROOT), n_tc, len(heads), len(figs), len(out.encode()) // 1024))
