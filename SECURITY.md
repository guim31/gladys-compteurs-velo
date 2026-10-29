# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **No secret**: the open data portals it reads need no account and no key.
- **Stored in `/data`**: `records.json`, the best day of each counter added
  (date and number of passages, public data). The cities chosen live in the
  Gladys configuration, the last readings in memory only.
- **Network**: outgoing HTTPS requests only, to the open data portals of the
  cities (opendata.paris.fr, data.nantesmetropole.fr, data.tours-metropole.fr,
  data.saintnazaireagglo.fr, opendata.hauts-de-seine.fr), with a timeout and a
  size cap on every answer. No port is opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the open data portals the integration reads.
