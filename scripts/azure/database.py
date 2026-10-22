#!/usr/bin/env python3
"""Stage database target discovery, read-only previews, and temporary firewall cleanup."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import time
from uuid import UUID, uuid4


def azure(*arguments):
    output = subprocess.check_output(["az", *arguments, "--output", "json"], text=True, timeout=90)
    return json.loads(output) if output.strip() else None


def validate_target(target):
    if target.get("environment") != "stage" or target.get("databaseName") != "hockey-stage":
        raise ValueError("Only the staging database can be prepared by these scripts.")
    server = target.get("serverName", "")
    if not re.fullmatch(r"sql-hockey-stage-[a-z0-9]+", server):
        raise ValueError("Unexpected staging SQL server name.")
    if target.get("serverHost") != f"{server}.database.windows.net":
        raise ValueError("The SQL hostname must match the discovered staging server.")
    for key in ("runtimeIdentityObjectId", "deploymentIdentityObjectId"):
        identifier = UUID(target[key])
        if identifier.int == 0:
            raise ValueError("A real managed-identity object ID is required.")
        target[key] = str(identifier)
    if target["runtimeIdentityObjectId"] == target["deploymentIdentityObjectId"]:
        raise ValueError("Deployment and application runtime identities must remain separate.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,58}[A-Za-z0-9]", target.get("runtimeIdentityName", "")):
        raise ValueError("Unexpected web application name.")
    if target["runtimeIdentityName"] == "hockey-stage-deployer":
        raise ValueError("The application cannot use the SQL migration operator name.")
    if not target.get("resourceGroup"):
        raise ValueError("A resource group is required.")
    return target


def load_target(path):
    return validate_target(json.loads(Path(path).read_text()))


def discover_target():
    group = os.environ["AZURE_RESOURCE_GROUP"]
    web_name = os.environ["AZURE_WEBAPP_NAME"]
    client_id = str(UUID(os.environ["AZURE_CLIENT_ID"]))
    account = azure("account", "show")
    if account["id"].lower() != os.environ["AZURE_SUBSCRIPTION_ID"].lower():
        raise ValueError("Select the configured Azure subscription before preparing SQL.")
    outputs = azure("deployment", "group", "show", "--name", "hockey-stage", "--resource-group", group)["properties"]["outputs"]
    value = lambda key: outputs[key]["value"]
    if value("webAppName") != web_name:
        raise ValueError("The configured web app does not match the staging deployment.")
    if outputs.get("environmentName", {}).get("value", "stage") != "stage":
        raise ValueError("The deployment is not staging.")
    app = azure("webapp", "show", "--resource-group", group, "--name", web_name)
    identities = azure("identity", "list", "--resource-group", group)
    deployers = [identity for identity in identities if identity["clientId"].lower() == client_id]
    if len(deployers) != 1:
        raise ValueError("Expected the existing user-assigned deployment identity matching AZURE_CLIENT_ID.")
    return validate_target({
        "environment": "stage", "resourceGroup": group,
        "serverName": value("sqlServerName"), "serverHost": value("sqlServerHost"),
        "databaseName": value("databaseName"), "runtimeIdentityName": web_name,
        "runtimeIdentityObjectId": app["identity"]["principalId"],
        "deploymentIdentityObjectId": deployers[0]["principalId"],
    })


def manage_firewall(operation, target_path, lease_path):
    target = load_target(target_path)
    lease = Path(lease_path)
    arguments = ("--resource-group", target["resourceGroup"], "--server", target["serverName"])
    if operation == "add":
        if lease.exists():
            raise ValueError("Clean up the existing firewall lease before creating another.")
        address = str(ipaddress.IPv4Address(subprocess.check_output(
            ["curl", "--fail", "--silent", "--show-error", "--ipv4", "--max-time", "15", "https://api.ipify.org"], text=True,
        ).strip()))
        if not ipaddress.IPv4Address(address).is_global:
            raise ValueError("Expected a public caller IPv4 address.")
        rule = "temporary-database-" + uuid4().hex
        lease.parent.mkdir(parents=True, exist_ok=True)
        lease.write_text(json.dumps({"rule": rule, "server": target["serverName"], "group": target["resourceGroup"]}))
        azure("sql", "server", "firewall-rule", "create", *arguments, "--name", rule,
              "--start-ip-address", address, "--end-ip-address", address)
        print("Created one temporary caller-IP rule. Cleanup runs after success or failure.")
        return
    if operation != "remove":
        raise ValueError("Use add or remove.")
    if not lease.exists():
        print("No temporary firewall rule to remove.")
        return
    saved = json.loads(lease.read_text())
    if (saved["server"] != target["serverName"] or saved["group"] != target["resourceGroup"] or
            not re.fullmatch(r"temporary-database-[a-f0-9]{32}", saved["rule"])):
        raise ValueError("Refusing to remove an unrelated firewall rule.")
    for attempt in range(5):
        try:
            rules = azure("sql", "server", "firewall-rule", "list", *arguments)
            if any(rule["name"] == saved["rule"] for rule in rules):
                azure("sql", "server", "firewall-rule", "delete", *arguments, "--name", saved["rule"])
                remaining = azure("sql", "server", "firewall-rule", "list", *arguments)
                if any(rule["name"] == saved["rule"] for rule in remaining):
                    raise RuntimeError("Azure still reports the temporary rule.")
            lease.unlink()
            print("Confirmed removal of this operation's temporary SQL firewall rule.")
            return
        except (subprocess.SubprocessError, OSError, RuntimeError, ValueError):
            if attempt == 4:
                raise RuntimeError("Firewall cleanup failed after five attempts. The lease was retained for explicit cleanup.") from None
            print("Retrying temporary SQL firewall cleanup.")
            time.sleep(2 ** attempt)


def connection_string(target):
    return (f"Server=tcp:{target['serverHost']},1433;Database={target['databaseName']};"
            "Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;Connection Timeout=60;")


def check_app_settings(target):
    app = azure("webapp", "show", "--resource-group", target["resourceGroup"], "--name", target["runtimeIdentityName"])
    settings = azure("webapp", "config", "appsettings", "list", "--resource-group", target["resourceGroup"], "--name", target["runtimeIdentityName"])
    values = {setting['name']: setting['value'] for setting in settings}
    expected_connection = (f"Server=tcp:{target['serverHost']},1433;Database={target['databaseName']};"
                           "Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;")
    if (values.get("Database__Provider") != "SqlServer" or values.get("ConnectionStrings__Hockey") != expected_connection or
            app["defaultHostName"] not in values.get("AllowedHosts", "").split(";") or
            app["identity"]["principalId"].lower() != target["runtimeIdentityObjectId"].lower() or
            not app.get("virtualNetworkSubnetId")):
        raise ValueError("Apply the reviewed SQL/VNet application settings before deploying.")
    print("Verified SQL Server settings, runtime identity, hostname, and VNet integration; no credentials printed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["discover", "preview", "connection", "check-app", "firewall-add", "firewall-remove"])
    parser.add_argument("target")
    parser.add_argument("file", nargs="?")
    args = parser.parse_args()
    if args.operation == "discover":
        target = discover_target()
        path = Path(args.target)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(target, indent=2) + "\n")
        print(f"Staging database: {target['serverHost']}/{target['databaseName']}")
    elif args.operation.startswith("firewall-"):
        if not args.file:
            parser.error("A firewall lease path is required.")
        manage_firewall(args.operation.removeprefix("firewall-"), args.target, args.file)
    else:
        target = load_target(args.target)
        if args.operation == "connection":
            print(connection_string(target))
        elif args.operation == "check-app":
            check_app_settings(target)
        else:
            if not args.file:
                parser.error("A reviewed SQL file is required.")
            sql = Path(args.file).read_bytes()
            print(f"Target: {target['serverHost']}/{target['databaseName']}")
            print(f"Migration SHA256: {hashlib.sha256(sql).hexdigest()}")
            print(sql.decode('utf-8-sig'))
            print("Preview only. No SQL connection, schema change, or permission change.")


if __name__ == "__main__":
    main()
