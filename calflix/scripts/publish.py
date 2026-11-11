#!/usr/bin/env python3
"""CalFlix -> BuiltByCal. Run on Artemis, never in the public browser.
Env: CALFLIX_JELLYFIN_URL, CALFLIX_JELLYFIN_API_KEY, CALFLIX_GITHUB_TOKEN.
Only sanitized status and weekly summary are published; suggestions stay private.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = "calvinmill22/builtbycal"
JF = (os.getenv("CALFLIX_JELLYFIN_URL") or os.getenv("ARTEMIS_JELLYFIN_BASE_URL", "")).rstrip("/")
KEY = os.getenv("CALFLIX_JELLYFIN_API_KEY") or os.getenv("ARTEMIS_JELLYFIN_API_KEY", "")
TOKEN = os.getenv("CALFLIX_GITHUB_TOKEN", "")
OLLAMA = os.getenv("CALFLIX_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
MODEL = os.getenv("CALFLIX_OLLAMA_MODEL", "artemis-v2")

CANDIDATES = {
    "Science Fiction": ["2001: A Space Odyssey", "Moon", "Arrival", "Gattaca", "Contact", "Children of Men"],
    "Thriller": ["Heat", "Zodiac", "The Conversation", "Sicario", "The Fugitive", "No Country for Old Men"],
    "Comedy": ["Hot Fuzz", "Clue", "The Nice Guys", "Young Frankenstein", "What We Do in the Shadows"],
    "Mystery": ["Knives Out", "The Prestige", "Memento", "Chinatown", "Rear Window"],
    "War": ["Das Boot", "Paths of Glory", "The Great Escape", "1917", "The Bridge on the River Kwai"],
    "Horror": ["The Thing", "Alien", "The Descent", "The Fly", "The Others"],
    "Drama": ["12 Angry Men", "The Truman Show", "Whiplash", "The Lives of Others", "There Will Be Blood"],
    "Adventure": ["The Princess Bride", "The Mummy", "The Rocketeer", "Hunt for the Wilderpeople"]
}

def utcnow():
    return datetime.now(timezone.utc)

def http_json(url, method="GET", body=None, headers=None, timeout=15):
    h = {"Accept":"application/json", "User-Agent":"Artemis-CalFlix-Bridge/1.0"}
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read())

def jellyfin(path):
    if not JF or not KEY:
        raise RuntimeError("Set CALFLIX_JELLYFIN_URL and CALFLIX_JELLYFIN_API_KEY")
    return http_json(JF + path, headers={"Authorization": f'MediaBrowser Token="{KEY}"'})

def publish(path, value, message):
    if not TOKEN:
        raise RuntimeError("Set CALFLIX_GITHUB_TOKEN (fine-grained Contents read/write, builtbycal only)")
    url = "https://api.github.com/repos/" + REPO + "/contents/calflix/data/" + path
    headers = {"Authorization":"Bearer " + TOKEN, "X-GitHub-Api-Version":"2022-11-28"}
    current = http_json(url, headers=headers)
    encoded = base64.b64encode((json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()).decode()
    http_json(url, "PUT", {"message":message, "sha":current["sha"], "branch":"main", "content":encoded}, headers)
    print("Published", path)

def health():
    if not JF or not KEY:
        raise RuntimeError("Jellyfin connection configuration incomplete")
    status = "unknown"
    try:
        jellyfin("/System/Info")
        status = "online"
    except urllib.error.HTTPError as exc:
        status = "unknown" if exc.code in (401,403) else "offline"
        print("Jellyfin HTTP error", exc.code, file=sys.stderr)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        status = "offline"
        print("Jellyfin unreachable:", type(exc).__name__, file=sys.stderr)
    publish("status.json", {"state":status,"checked_at":utcnow().isoformat()},
            "CalFlix heartbeat: " + status)
    print("Health:", status)

def norm(name):
    return re.sub(r"[^a-z0-9]", "", str(name).casefold())

def parsed_date(item):
    try:
        return datetime.fromisoformat(item["DateCreated"].replace("Z","+00:00")).astimezone(timezone.utc)
    except (KeyError, ValueError, TypeError):
        return None

def comment(facts):
    prompt = ("You are Artemis, a dryly sarcastic, articulate British home AI. "
              "Write ONE brief, welcoming sentence (maximum 25 words) for a private "
              "movie club weekly update, using only these verified facts. "
              "Invent no films, counts, outages, or events. Plain text, no markdown. "
              + json.dumps(facts, ensure_ascii=False))
    try:
        obj = http_json(OLLAMA + "/api/generate", "POST",
                        {"model":MODEL,"prompt":prompt,"stream":False,
                         "options":{"temperature":0.4,"num_predict":110}}, timeout=75)
        s = re.sub(r"<think>.*?</think>", "", str(obj.get("response","")), flags=re.S).strip()
        s = " ".join(s.split()).strip('"')
        if 10 <= len(s) <= 220 and "<" not in s and ">" not in s:
            return s
    except (OSError, ValueError) as exc:
        print("Ollama unavailable:", type(exc).__name__)
    return "The projectionist is doing splendidly, despite the utterly unreasonable infrastructure involved in a modest film night."

def recommendations(items):
    movies = [x for x in items if x.get("Type") == "Movie"]
    owned = {norm(x.get("Name","")) for x in movies}
    genres = Counter(norm(g) for x in movies for g in x.get("Genres",[]))
    categories = sorted(CANDIDATES, key=lambda g:(genres[norm(g)],g))
    picks = []
    for genre in categories:
        candidates = [x for x in CANDIDATES[genre] if norm(x) not in owned]
        if candidates:
            picks.append((candidates[utcnow().isocalendar().week % len(candidates)],genre,genres[norm(genre)]))
    folder = Path.home() / ".local/share/artemis/calflix"
    folder.mkdir(parents=True,exist_ok=True)
    target = folder / ("suggestions-" + utcnow().date().isoformat() + ".md")
    lines = ["# Artemis: private CalFlix collection-gap recommendations","",
             "Filtered against today's Jellyfin movie titles. Nothing was acquired.",""]
    for movie,genre,num in picks:
        lines.append("- " + movie + " — " + genre + " (library has " + str(num) + " movie genre tags in this category)")
    if not picks: lines.append("Candidate list exhausted; add more films to CANDIDATES.")
    target.write_text("\n".join(lines)+"\n",encoding="utf-8")
    target.chmod(0o600)
    print("Private suggestions:",target)
    for movie,genre,_ in picks: print(" -",movie,"/",genre)

def weekly():
    query = urllib.parse.urlencode({"Recursive":"true", "IncludeItemTypes":"Movie,Series,Episode",
                                    "Fields":"DateCreated,Genres", "Limit":"10000"})
    result = jellyfin("/Items?" + query)
    items = result.get("Items",[])
    if result.get("TotalRecordCount",len(items)) > len(items):
        raise RuntimeError("Incomplete Jellyfin listing; aborting inaccurate weekly report")
    counts = Counter(x.get("Type") for x in items)
    cutoff = utcnow()-timedelta(days=7)
    added = [x for x in items if x.get("Type") in ("Movie","Series")
             and parsed_date(x) and parsed_date(x) >= cutoff]
    added.sort(key=parsed_date,reverse=True)
    titles = [str(x["Name"])[:100] for x in added[:8] if x.get("Name")]
    facts = {"movies":counts["Movie"],"series":counts["Series"],
             "episodes":counts["Episode"],"new_additions":len(added),"arrivals":titles}
    body = ("The library now has " + str(counts["Movie"]) + " movies, " +
            str(counts["Series"]) + " series, and " + str(counts["Episode"]) +
            " episodes. This week: " + str(len(added)) + " new movie or series additions." +
            "\n\nArty's observation: " + comment(facts))
    publish("weekly.json",{"published_at":utcnow().isoformat(),
            "headline":"A fresh dispatch from the server room",
            "body":body,"new_titles":titles}, "Artemis: CalFlix weekly dispatch")
    recommendations(items)

if __name__ == "__main__":
    if len(sys.argv)!=2 or sys.argv[1] not in ("health","weekly"):
        sys.exit("Usage: python3 publish.py health|weekly")
    {"health":health,"weekly":weekly}[sys.argv[1]]()
