#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer


class SelfHealHandler(BaseHTTPRequestHandler):
    request_count = 0

    def log_message(self, format: str, *args) -> None:
        return

    def do_POST(self) -> None:
        if self.path != "/calculate_odds":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(content_length) or b"{}")
        SelfHealHandler.request_count += 1
        attempt = SelfHealHandler.request_count

        match_id = payload.get("match_id")
        state_version = payload.get("state_version", 1)

        if attempt == 1:
          body = {
              "match_id": match_id,
              "state_version": state_version,
              "reviewer_decision": "approve",
              "markets": [
                  {
                      "market_key": "match_winner",
                      "selection_key": "team1",
                      "label": "Team A",
                      "price": "2.05",
                      "trace_meta": {},
                  }
              ],
              "fancy_markets": [],
              "fair_probability": 0.48,
              "display_probability": 0.50,
              "shading_magnitude": 0.02,
              "active_playbooks": ["early_wicket_trap"],
              "bookmaker_summary": {},
              "bookmaker_node_latency_ms": "bad-latency",
          }
        elif attempt == 2:
          body = {
              "match_id": match_id,
              "state_version": state_version,
              "reviewer_decision": "reject_and_retry",
              "markets": [],
              "fancy_markets": [],
              "fair_probability": 0.48,
              "display_probability": 0.50,
              "shading_magnitude": 0.02,
              "active_playbooks": ["early_wicket_trap"],
              "bookmaker_summary": {"phase": "retry"},
              "bookmaker_node_latency_ms": 27,
          }
        else:
          body = {
              "match_id": match_id,
              "state_version": state_version,
              "engine_trace_id": "self-heal-smoke",
              "reviewer_decision": "approve",
              "markets": [
                  {
                      "market_key": "match_winner",
                      "selection_key": "team1",
                      "label": "Team A",
                      "price": "2.05",
                      "trace_meta": {
                          "approved_probability": 0.49,
                          "fair_probability": 0.48,
                          "display_probability": 0.50,
                      },
                  }
              ],
              "fancy_markets": [],
              "fair_probability": 0.48,
              "display_probability": 0.50,
              "shading_magnitude": 0.02,
              "active_playbooks": ["early_wicket_trap"],
              "bookmaker_summary": {"phase": "recovered"},
              "bookmaker_node_latency_ms": 19,
          }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))
        sys.stdout.write(f"served_attempt={attempt}\n")
        sys.stdout.flush()

        if attempt >= 3:
            threading.Thread(target=self.server.shutdown, daemon=True).start()


def main() -> int:
    host = "127.0.0.1"
    port = 8765
    server = HTTPServer((host, port), SelfHealHandler)
    print(f"self_heal_mock_server http://{host}:{port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
