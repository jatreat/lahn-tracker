#!/usr/bin/env python3
"""Talk to the tracker's Google Sheet backend (the Apps Script web app).

  tracker.py pull  OUTDIR            -> writes Claude-page mirror docs (meta.json, <kind>-<n>.json)
  tracker.py save  KIND ID JSONFILE  -> saves one row (ID may be '' for a new row)
  tracker.py source-absentee CSVFILE REPORT_LABEL
        CSV columns: county,R,D,NP,R_outstanding  -> source/absentee row
  tracker.py source-brief TEXTFILE   -> source/brief row (Claude's written read)

Needs env TRACKER_URL (the /exec URL) and TRACKER_KEY (team passcode).
"""
import csv, json, os, sys, time, urllib.request

KINDS = ['crossover', 'counties', 'turnout', 'chase', 'incidents', 'source']
CHUNK_BYTES = 180_000  # stays well under the 256 KiB per-document limit


def call(body):
    body = dict(body, key=os.environ['TRACKER_KEY'])
    req = urllib.request.Request(os.environ['TRACKER_URL'], data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req, timeout=60) as r:  # follows Google's redirect to the result
        out = json.loads(r.read())
    if not out.get('ok'):
        raise SystemExit('backend error: %s' % out.get('error'))
    return out


def pull(outdir):
    data = call({'action': 'all'})['data']
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith('.json'):
            os.remove(os.path.join(outdir, f))
    ids, counts = ['meta'], {}
    for kind in KINDS:
        rows = data.get(kind) or []
        counts[kind] = len(rows)
        part, cur, size = 0, [], 0
        def flush():
            nonlocal part, cur, size
            doc_id = '%s-%d' % (kind, part)
            json.dump({'kind': kind, 'part': part, 'rows': cur}, open(os.path.join(outdir, doc_id + '.json'), 'w'))
            ids.append(doc_id); part += 1; cur, size = [], 0
        for r in rows:
            n = len(json.dumps(r))
            if cur and size + n > CHUNK_BYTES:
                flush()
            cur.append(r); size += n
        if cur or part == 0:
            flush()
    json.dump({'syncedAt': int(time.time() * 1000), 'counts': counts}, open(os.path.join(outdir, 'meta.json'), 'w'))
    print(json.dumps({'docs': ids, 'counts': counts}))


def save(kind, rid, row):
    row = dict(row); row.setdefault('byName', 'Claude'); row['at'] = int(time.time() * 1000)
    print(json.dumps(call({'action': 'save', 'kind': kind, 'id': rid, 'row': row})))


def main(a):
    if a[0] == 'pull':
        pull(a[1])
    elif a[0] == 'save':
        save(a[1], a[2], json.load(open(a[3])))
    elif a[0] == 'source-absentee':
        c = {}
        for r in csv.DictReader(open(a[1])):
            c[r['county']] = [int(r['R']), int(r['D']), int(r['NP']),
                              int(r['R_outstanding']) if r.get('R_outstanding') else None]
        save('source', 'absentee', {'json': json.dumps({'report': a[2], 'c': c}, separators=(',', ':')),
                                    'report': a[2]})
    elif a[0] == 'source-brief':
        save('source', 'brief', {'text': open(a[1]).read().strip()})
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:] or ['help'])
