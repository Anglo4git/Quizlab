# QuizLab

QuizLab is a Vite frontend connected to a Supabase backend. The intended deployment flow is:

**GitHub → Netlify → Supabase**

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite (normally `http://localhost:5173`).

## Environment variables

Create a `.env` file locally from `.env.example`:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Never put a Supabase service-role key in the frontend or commit it to GitHub.

## Production build

```bash
npm run build
```

Netlify is configured to run `npm run build` and publish `dist/`.

## GitHub → Netlify

1. Create a new GitHub repository.
2. Upload/push this project to the repository.
3. In Netlify, choose **Add new project → Import an existing project**.
4. Select the GitHub repository.
5. Build command: `npm run build`.
6. Publish directory: `dist`.
7. Add the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values in Netlify environment variables.
8. Deploy.

After that, pushes to the GitHub repository can trigger automatic Netlify deployments.
