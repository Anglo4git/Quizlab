import { defineConfig } from 'vite';

// Netlify serves this site from the domain root, so base stays '/' there.
// A GitHub Pages *project* page (https://<user>.github.io/<repo>/) is served
// from a subpath instead, so the GitHub Actions workflow sets
// GITHUB_PAGES_BASE=/<repo-name>/ as a build-time env var. Without this,
// built asset paths would 404 under GitHub Pages and the page would be blank.
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE || '/',
});
