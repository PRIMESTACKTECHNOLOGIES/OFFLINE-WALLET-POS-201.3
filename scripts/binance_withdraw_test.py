#!/usr/bin/env python3
"""
Safe Binance withdrawal test script.

This script reads values from a .env file or the environment and prepares a Binance
withdrawal request for BTC. By default it runs in dry-run (prints the signed request
and a curl command). To actually send the withdrawal, set ENABLE_WITHDRAWALS=true
in your .env and run the script on a secure machine.

Do NOT commit your .env file or API secrets to git.
"""
import os
import time
import hmac
import hashlib
import urllib.parse
import urllib.request


def load_env_from_file(path):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k not in os.environ:
                os.environ[k] = v


def is_likely_btc_address(addr: str) -> bool:
    if not addr or len(addr) < 26 or len(addr) > 90:
        return False
    return addr.startswith("1") or addr.startswith("3") or addr.lower().startswith("bc1")


def sign(query: str, secret: str) -> str:
    return hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()


def build_withdraw_request(base_url, coin, address, amount, recvWindow, secret, timestamp_ms=None):
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)
    params = {
        "coin": coin,
        "address": address,
        "amount": amount,
        "timestamp": str(timestamp_ms),
        "recvWindow": str(recvWindow),
    }
    # Sort params alphabetically for signature
    qs = "&".join(f"{k}={urllib.parse.quote_plus(str(params[k]))}" for k in sorted(params))
    signature = sign(qs, secret)
    qs_with_sig = qs + "&signature=" + signature
    url = f"{base_url.rstrip('/')}/sapi/v1/capital/withdraw/apply?{qs_with_sig}"
    return url, params, signature


def print_dry_run(url, params, signature, api_key):
    print("DRY RUN: This is the signed request the script WOULD send to Binance")
    print()
    print("URL:")
    print(url)
    print()
    print("Headers:")
    print(f"X-MBX-APIKEY: {api_key}")
    print()
    print("curl command (you can run this from a secure host):")
    # build human-friendly curl (unescaped params for readability)
    curl_qs = "&".join(f"{k}={params[k]}" for k in sorted(params)) + f"&signature={signature}"
    curl_cmd = (
        f"curl -H \"X-MBX-APIKEY: {api_key}\" -X POST \"{os.environ.get('BINANCE_BASE_URL','https://api.binance.com')}/sapi/v1/capital/withdraw/apply?{curl_qs}\""
    )
    print(curl_cmd)


def do_http_post(url, api_key):
    req = urllib.request.Request(url, method="POST")
    req.add_header("X-MBX-APIKEY", api_key)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            print("Response:")
            print(body)
    except Exception as e:
        print("Request failed:", e)


def main():
    # Load .env if present in repo root
    load_env_from_file(".env")

    API_KEY = os.environ.get("BINANCE_API_KEY")
    API_SECRET = os.environ.get("BINANCE_API_SECRET")
    BASE_URL = os.environ.get("BINANCE_BASE_URL", "https://api.binance.com")
    RECV_WINDOW = int(os.environ.get("BINANCE_RECV_WINDOW", "5000"))
    ENABLE_WITHDRAWALS = os.environ.get("ENABLE_WITHDRAWALS", "false").lower() in ("1", "true", "yes")
    REQUIRE_MANUAL = os.environ.get("REQUIRE_MANUAL_CONFIRMATION", "true").lower() in ("1", "true", "yes")

    coin = os.environ.get("DEFAULT_COIN", "BTC")
    address = os.environ.get("DEFAULT_BTC_DEST_ADDRESS")
    amount = os.environ.get("WITHDRAWAL_TEST_AMOUNT", "0.0001")

    if not API_KEY or not API_SECRET:
        print("Missing BINANCE_API_KEY or BINANCE_API_SECRET in environment or .env. Aborting.")
        return

    if not address:
        print("Missing DEFAULT_BTC_DEST_ADDRESS in environment or .env. Aborting.")
        return

    if not is_likely_btc_address(address):
        print("Warning: destination does not look like a standard BTC address. Double-check it.")

    url, params, signature = build_withdraw_request(BASE_URL, coin, address, amount, RECV_WINDOW, API_SECRET)

    # Dry-run by default
    if not ENABLE_WITHDRAWALS:
        print_dry_run(url, params, signature, API_KEY)
        print("\nENABLE_WITHDRAWALS is false — no network request will be made. Set ENABLE_WITHDRAWALS=true to allow sending.")
        return

    # If enabled, optionally require manual confirmation
    print_dry_run(url, params, signature, API_KEY)
    if REQUIRE_MANUAL:
        ans = input("Proceed with live withdrawal? Type 'YES' to continue: ")
        if ans.strip() != "YES":
            print("Aborted by operator.")
            return

    # Perform the HTTP POST
    print("Sending withdrawal request to Binance...")
    do_http_post(url, API_KEY)


if __name__ == "__main__":
    main()
