# Benny automation intent for Pi

Benny has two Pi-native scheduled workflows: `benny-triage` classifies one new top-level report and posts exactly one verdict in its original thread; `benny-reproduce` waits for a trusted triage marker, drives a configured control adapter, and requires two independent matching UI observations before verification or a bounded fix.

Install at `.pi/pstack/benny/`. Keep secrets, configuration, routing maps, and feature maps outside the pack. The coordinator alone may perform Slack, tracker, or repository writes. Child briefs are read-only, contain no credentials, and forbid all Slack writes. Source channel and root-thread coordinates are immutable. Missing coordinates, adapters, actions, or feature coverage fail closed with zero writes. Existing fixes are verified, never edited over. New fixes can create draft PRs only; merge and deploy are impossible.
