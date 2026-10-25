# Game domain setup

Configured 2026-10-24 for `issarahatayanna.gay` and `www.issarahatayanna.gay`.

- Registrar: Porkbun; authoritative nameservers changed to `alfred.ns.cloudflare.com` and `elaine.ns.cloudflare.com`.
- Cloudflare zone: `7ebb1c22b1251444f5fbfa45bbed0e30` in the existing game account.
- Both hostnames use Worker Custom Domains for `bus-club-rooms`; Cloudflare manages DNS and certificates.
- Free Cloudflare zone; SSL mode Full (strict), Always Use HTTPS enabled.
- Web Analytics: automatic installation, all hosts/paths in this zone. Site tag `921b0c356dee4fd088730a47d703c662`.
- Worker logs: enabled, persisted, invocation logs enabled, sampling 100%.
- Traffic and security analytics are available on the zone dashboard.

## Google Search Console

Domain property `issarahatayanna.gay` is verified in `ramirumc@gmail.com`.
Verification uses a root TXT record in Cloudflare DNS. Retain that record to
preserve ownership. The sitemap URL is `https://issarahatayanna.gay/sitemap.xml`.
Submitted on 2026-10-25; Google reported Success with one discovered page.
- The `workers.dev` address remains available during DNS propagation or certificate issuance.

Analytics dashboard: https://dash.cloudflare.com/d87aefd95be53f43c0e2492efc2e782a/web-analytics/overview?siteTag=921b0c356dee4fd088730a47d703c662
