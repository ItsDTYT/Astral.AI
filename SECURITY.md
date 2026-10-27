# Reporting a security problem

Please use [GitHub private vulnerability reporting](https://github.com/ItsDTYT/Astral.AI/security/advisories/new) for vulnerabilities. Include the affected version, steps to reproduce, and the impact. Remove personal chats, profile details, images, and credentials from examples.

Use normal Issues for bugs without a security impact. Do not put exploit details or private data in a public issue. There is no promised response time or independent security certification.

Astral binds its services to loopback and restricts desktop access. It does not encrypt user data or protect it from other software running as the same Windows user. Downloads and imported files still need validation; arbitrary local models can produce unsuitable replies.

The current dependency findings and mitigations are recorded in [astral/SECURITY-AUDIT.md](astral/SECURITY-AUDIT.md). An unsigned release and a passing test suite do not establish that a build is free of vulnerabilities.
