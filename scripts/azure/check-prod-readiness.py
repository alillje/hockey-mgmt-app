#!/usr/bin/env python3
"""Allow only the explicitly approved temporary production-project evaluation."""
import json
import sys
from pathlib import Path

from stage_readiness import incomplete_checks


report = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("iac/prod/application-readiness.json")
checks = json.loads(report.read_text())
if checks.get("temporaryProdEvaluationApproved") is not True:
    raise SystemExit("The temporary production-project evaluation has not been approved.")
incomplete = incomplete_checks(checks)
if incomplete:
    print("Production-project evaluation is not ready. Complete and review these tasks:")
    for name in incomplete:
        print(f"- {name}")
    raise SystemExit(1)
print("Temporary production-project evaluation prerequisites have been reviewed.")
