# Putting Heloria Sim on GitHub and online

You need a computer for this (GitHub's upload page doesn't handle whole folders on phones).

## 1. Create the repository
1. Go to github.com, sign in, click **+** (top right) > **New repository**.
2. Name it `heloria-sim`, set it to **Public**, leave "Add a README" and "Add a licence" unticked (they're already in the project). Click **Create repository**.

## 2. Upload the code
**Easiest (git installed):** unzip the project, open a terminal in the `hsim` folder and run:

    git init
    git add .
    git commit -m "Heloria Sim 0.1.2"
    git branch -M main
    git remote add origin https://github.com/YOUR-USERNAME/heloria-sim.git
    git push -u origin main

**Without git:** on the new repository's page click **uploading an existing file**, drag in everything inside the unzipped `hsim` folder, and click **Commit changes**. Check that the hidden folders `.streamlit` (the app's colours) and `.github` (automatic tests) came across; on a Mac press Cmd+Shift+. in Finder to show them before dragging.

## 3. Put the app online (free)
1. Go to share.streamlit.io and sign in with GitHub.
2. Click **Create app** > **Deploy a public app from GitHub**.
3. Repository: `YOUR-USERNAME/heloria-sim`, branch: `main`, main file path: `streamlit_app.py`.
4. Click **Deploy**. The first build takes a few minutes (it installs RocketPy and Java).
5. Open the link on your phone. To turn on the OpenRocket engine, press **Download the OpenRocket engine** in the sidebar once.

## 4. After that
Every time you push a change to GitHub, the app updates itself, and the tests run automatically under the repository's **Actions** tab.
