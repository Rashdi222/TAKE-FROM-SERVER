from __future__ import annotations

import json
import sys
from pathlib import Path

from cricket.replay import CricketReplayRequest, run_replay


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python scripts/cricket_replay.py <frames.json>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1]).resolve()
    payload = json.loads(path.read_text())
    request = CricketReplayRequest.model_validate(payload)
    response = run_replay(request)
    print(response.model_dump_json(indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
