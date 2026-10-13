# Udi Waizer — portfolio

Static site. No build step.

## Deploy (GitHub Pages)
1. Create a repo, upload the contents of this folder to the root.
2. Settings → Pages → Source: `main` branch, `/ (root)`.
3. Custom domain: enter your domain, then at your DNS provider add:
   - `A` records for `@` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   - `CNAME` for `www` → `<your-username>.github.io`
4. Tick "Enforce HTTPS" once the certificate is issued.

## Pages
- `index.html` — home
- `socure.html`, `zepl.html`, `folloze.html`, `xtend.html` — case studies
