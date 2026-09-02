#!/usr/bin/env python3
"""Build single-file, self-contained versions of Blacktop Blitz.

Each portal gets its own build because their SDKs are mutually exclusive:
CrazyGames forbids external requests other than their own SDK, and shipping a
competitor's script inside GameDistribution's iframe would be worse than
pointless. Everything else - game code, fonts, icons - is shared and inlined,
so a build is one HTML file with no relative paths.

  python build.py cg
  python build.py gd <gameId>
"""
import base64, io, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

CG_HEAD = (
    '  <!-- CrazyGames SDK. Absent/blocked is handled: the game runs standalone. -->\n'
    '  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'
)

GD_HEAD = """  <!-- GameDistribution SDK. GD_OPTIONS must exist before the SDK loads, and
       events can arrive before game.js runs, so they are buffered for it. -->
  <script>
    window.__gdEvents = [];
    window["GD_OPTIONS"] = {
      "gameId": "%s",
      "onEvent": function (event) {
        (window.__gdEvent || function (e) { window.__gdEvents.push(e); })(event);
      }
    };
  </script>
  <script>
    (function (d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = 'https://html5.api.gamedistribution.com/main.min.js';
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'gamedistribution-jssdk'));
  </script>"""


def b64(path):
    with open(os.path.join(ROOT, path), 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def build(target, game_id=None):
    html = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    js = io.open(os.path.join(ROOT, 'game.js'), encoding='utf-8').read()

    # swap the portal SDK in the head
    assert CG_HEAD in html, 'CrazyGames head block not found'
    if target == 'cg':
        head = CG_HEAD
    else:
        assert game_id, 'gd build needs a gameId'
        head = GD_HEAD % game_id
    html = html.replace(CG_HEAD, head)

    # fonts and icons -> data URIs
    for slug in ('azeret-mono', 'plus-jakarta-sans'):
        src = "url('fonts/%s.woff2')" % slug
        assert src in html, src
        html = html.replace(src, 'url(data:font/woff2;base64,%s)' % b64('fonts/%s.woff2' % slug))
    for icon in ('icons/icon-192.png', 'icons/icon-512.png'):
        html = html.replace('href="%s"' % icon, 'href="data:image/png;base64,%s"' % b64(icon))

    # the PWA manifest is a separate file and pointless inside a portal iframe
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)

    # inline the game
    tag = re.search(r'<script src="game\.js\?v=[^"]*"></script>', html)
    assert tag, 'game.js script tag not found'
    html = html.replace(tag.group(0), '<script>\n' + js + '\n</script>')

    outdir = os.path.join(ROOT, 'dist', 'upload' if target == 'cg' else 'gd')
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, 'index.html')
    io.open(out, 'w', encoding='utf-8').write(html)

    externals = sorted(set(re.findall(r'(?:src|href)="(https?://[^"]+)"', html)))
    print('%s -> %s  (%.1f KB)' % (target, out, os.path.getsize(out) / 1024))
    for e in externals:
        print('   external: %s' % e)
    assert not re.search(r'(?:src|href)="http://', html), 'insecure http reference'
    return out


if __name__ == '__main__':
    t = sys.argv[1] if len(sys.argv) > 1 else 'cg'
    gid = sys.argv[2] if len(sys.argv) > 2 else None
    build(t, gid)
