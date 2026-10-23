#!/usr/bin/env python3
"""Stop app deployment until the hosted application has been reviewed for staging."""
import json
import sys
from pathlib import Path
from stage_readiness import incomplete_checks

report = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("iac/stage/application-readiness.json")
checks = json.loads(report.read_text())
incomplete = incomplete_checks(checks)
if incomplete:
    print("Staging app deployment is not ready. Complete and review these tasks:")
    for name in incomplete:
        print(f"- {name}")
    raise SystemExit(1)
print("All tracked staging application prerequisites have been reviewed.")
