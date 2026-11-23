#!/usr/bin/env python3
"""Fail-closed setup for DrivMatch Stream transactional Auth email.

No user emails are sent by this setup command. No API keys or email addresses
are printed. This is separate from DrivMatch News and other Supabase projects.
"""
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

PROJECT_REF = "ysrpfwemqrysjkoahoaa"
MGMT_ORIGIN = "https://api.supabase.com"
RESEND_ORIGIN = "https://api.resend.com"

class ConfigurationBlocked(RuntimeError):
    pass

def get_env(name):
    return os.environ.get(name, "").strip()

def api(url, token, method="GET", payload=None):
    if not url.startswith((MGMT_ORIGIN + "/", RESEND_ORIGIN + "/")):
        raise ConfigurationBlocked("Unexpected API host")
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, method=method, headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "DrivMatch-Stream-Auth-Email/1",
        })
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.loads(response.read(1024 * 1024))
    except urllib.error.HTTPError as exc:
        # Provider errors can include sensitive response details; never echo.
        raise ConfigurationBlocked(
            "Provider API returned HTTP " + str(exc.code)
        ) from None
    except (OSError, ValueError):
        raise ConfigurationBlocked("Provider API request failed") from None

def validate_inputs():
    root=get_env("STREAM_SUPABASE_URL")
    parsed=urlsplit(root)
    if parsed.scheme!="https" or parsed.hostname!=PROJECT_REF + ".supabase.co":
        raise ConfigurationBlocked("Dedicated Supabase project URL not verified")
    if parsed.username or parsed.password or parsed.port:
        raise ConfigurationBlocked("Unexpected Supabase URL format")
    manager=get_env("STREAM_SUPABASE_MANAGEMENT_TOKEN")
    if not manager:
        raise ConfigurationBlocked("Missing Supabase Management API authorization")
    resend=get_env("STREAM_RESEND_API_KEY")
    sender=get_env("STREAM_EMAIL_SENDER")
    if manager==resend:
        raise ConfigurationBlocked("Management token and SMTP API key must be distinct")
    return manager,resend,sender

def validate_resend_domain(resend):
    domains=api(RESEND_ORIGIN+"/domains",resend)
    values=domains.get("data") if isinstance(domains,dict) else None
    if not isinstance(values,list):
        raise ConfigurationBlocked("Cannot verify sender domain in email provider")
    if not any(d.get("name","").lower()=="drivmatch.com" and
               d.get("status","").lower()=="verified" for d in values if isinstance(d,dict)):
        raise ConfigurationBlocked("DrivMatch domain is not verified with Resend")
    print("Sender domain verified with email provider (no account data exposed).")

def load_email():
    subject=Path("supabase/email/invite-subject.txt").read_text(encoding="utf-8").strip()
    body=Path("supabase/email/invite.html").read_text(encoding="utf-8")
    if not 10<=len(subject)<=160 or body.count("{{ .ConfirmationURL }}")!=1:
        raise ConfigurationBlocked("Invitation email template is invalid")
    if "<script" in body.lower() or "password=" in body.lower():
        raise ConfigurationBlocked("Unsafe invitation email template")
    if "https://drivmatch-stream-v2-test.drivmatch.workers.dev/stream/" not in body:
        raise ConfigurationBlocked("Expected Stream URL missing from invitation")
    if "https://github.com/DrivMatch/drivmatch-stream/releases/download/" not in body:
        raise ConfigurationBlocked("Expected APK URL missing from invitation")
    return subject,body

def run():
    manager,resend,sender=validate_inputs()
    subject,body=load_email()
    target=MGMT_ORIGIN+"/v1/projects/"+PROJECT_REF+"/config/auth"
    existing=api(target,manager)
    if not isinstance(existing,dict):
        raise ConfigurationBlocked("Supabase Auth configuration could not be confirmed")

    payload={
        "mailer_subjects_invite":subject,
        "mailer_templates_invite_content":body,
    }
    already_smtp=bool(existing.get("smtp_host") and existing.get("smtp_admin_email"))
    if not already_smtp:
        if not resend or not sender:
            raise ConfigurationBlocked(
                "No custom SMTP configured. Setup requires a verified sender "
                "and an email provider SMTP credential"
            )
        if not re.fullmatch(r"[a-z0-9._%+-]+@drivmatch\.com",sender,re.IGNORECASE):
            raise ConfigurationBlocked("Sender must use a verified DrivMatch domain")
        validate_resend_domain(resend)
        payload.update({
            "smtp_admin_email":sender,
            "smtp_host":"smtp.resend.com",
            "smtp_port":"465",
            "smtp_user":"resend",
            "smtp_pass":resend,
            "smtp_sender_name":"DrivMatch Stream",
        })
    else:
        print("Existing custom SMTP recognized; will retain sender configuration.")

    if get_env("STREAM_EMAIL_APPLY")!="true":
        print("CHECK PASS: target project and email template verified; no changes made.")
        return
    # This PATCH is deliberately scoped to invitation-related fields plus
    # SMTP only when the project had no existing configured provider.
    api(target,manager,"PATCH",payload)
    after=api(target,manager)
    if after.get("mailer_subjects_invite")!=subject or \
       after.get("mailer_templates_invite_content")!=body:
        raise ConfigurationBlocked("Supabase did not confirm the branded invite template")
    if not already_smtp and after.get("smtp_host")!="smtp.resend.com":
        raise ConfigurationBlocked("Supabase did not confirm the SMTP server")
    print("CONFIGURED: dedicated DrivMatch Stream branded invitation template.")
    print("Next: explicitly test a consented invitation and verify actual inbox delivery.")

if __name__=="__main__":
    try:
        run()
    except ConfigurationBlocked as err:
        print("BLOCKED: "+str(err),file=sys.stderr)
        sys.exit(2)
