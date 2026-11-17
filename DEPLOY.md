# Putting TRIDGE on the internet for free

TRIDGE is a static website, so any free static host works. These steps use **Cloudflare Pages**, which is free, accepts private GitHub repositories, and does everything in the browser. A GitHub Pages option is at the end.

You need: a GitHub account with this repository pushed (it is already at `hafizhpk7/TRIDGE-3D-Generator`), and a free Cloudflare account.

## Cloudflare Pages

1. Go to <https://dash.cloudflare.com> and sign in (or sign up; the free plan is enough).
2. In the left menu choose **Workers & Pages**, then **Create**, then the **Pages** tab, then **Connect to Git**.
3. Choose **GitHub**. If asked, click **Install & Authorize** and allow access to the `TRIDGE-3D-Generator` repository (you can allow only that one).
4. Pick the repository and press **Begin setup**.
5. Fill in the build settings:
   - **Project name:** anything, for example `tridge`. This becomes `tridge.pages.dev`.
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
6. Open **Environment variables (advanced)** and add one: name `NODE_VERSION`, value `22`.
7. Press **Save and Deploy**. The first build takes a minute or two. When it says **Success**, open the address it shows.
8. From now on, every push to `main` redeploys by itself.

### Check that it works

Work through the **After deploying** part of [TESTING.md](TESTING.md). In short: the fox appears, **Remove background** works on a picture, and one online provider (for example **From text**) answers.

### If something goes wrong

- **Build fails with "too big" or a file over 25 MiB:** the build already removes the one oversized file. If you see this message, a new large file has been added to `public/`; remove it or host it elsewhere.
- **Build fails on the Node version:** make sure the `NODE_VERSION` variable from step 6 is set, then **Retry deployment**.
- **The page loads but Remove background hangs:** open the browser's developer tools (F12), look at **Network**, and check that `/ort/ort-wasm-simd-threaded.wasm` returns 200. That file is copied into the build by `npm run build`.
- **Free online models fail:** that is the providers, not the deploy. Hugging Face Spaces can be asleep, busy or out of free allowance. Wait a minute, try the other provider, or use Craft.

### Custom address (optional)

In the project, open **Custom domains** and follow the steps. It is free if you already own a domain.

## GitHub Pages instead

GitHub Pages is free for public repositories (a private repository needs a paid plan).

1. In the repository on github.com, open **Settings, then Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Add a file `.github/workflows/pages.yml` containing the standard "Deploy static content to Pages" workflow, with the build steps `npm ci` and `npm run build`, and upload the `dist` folder. GitHub offers this as a starter workflow on the same Pages settings screen.
4. Push to `main`. The address will be `https://<your-name>.github.io/TRIDGE-3D-Generator/`.

The app uses relative paths and hash links, so it works from that sub-folder without changes.
