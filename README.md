# OpenCourse — offline MIT OpenCourseWare reader (Android)

A phone app for downloading MIT OpenCourseWare courses and learning them offline.
Built as a web app (React + Vite) wrapped with **Capacitor** into a native Android
app you open and run from **Android Studio**.

- 📚 **Library** of courses (a bookshelf you add to)
- 🧭 **Lessons** mode — the course restructured into Lesson 1…N, each bundling that
  lecture's video + slides + code + readings on one page, with a work-through flow
  (progress bar, “Mark lesson complete”, “Next lesson →”). Problem sets get their own track.
- ✨ **Enrich with AI** (round trip, no API key) — each lesson builds a prompt from the
  lecture's transcript that tells the AI to reply in a strict JSON schema; you run it in
  ChatGPT / Claude / Gemini, paste the reply back, and the app parses it into an
  **interactive problem set**, saved per lesson:
  - **Multiple choice** — options shuffled, instant right/wrong feedback, running score
  - **Short answer** — type your answer, then check it against a bullet-point rubric
  - **Coding (LeetCode-style)** — write a function in an editor and **Run** it against
    multiple test cases (pass/fail each). Runs real Python via **Pyodide, bundled into the
    app** → works fully offline, no download. (`tools/copy-pyodide.mjs` copies the runtime
    from `node_modules` into `public/` on build; `npm install` is required first.)
- 📖 Clean mobile **reader** for syllabus / readings / assignments (also “Browse by type”)
- ▶ **Video** lectures (stream from YouTube, or download the MP4 for offline)
- 📄 In-app **PDF viewer** for slides & notes — works offline
- `{ }` **Code viewer** for `.py` files, with copy
- ✅ Progress tracking — videos **resume where you left off**, auto-complete at 90%, plus manual “mark complete” and “Continue”
- Everything except streaming video is **bundled in the app** and works with no internet

The app currently ships with **6.0002 — Introduction to Computational Thinking and
Data Science**. Add more courses with the importer (below).

---

## One-time setup

```bash
npm install
```

You also need **Android Studio** installed (you already have it). It supplies the
Java/Android SDK used to build the APK — you don't need Java on your PATH.

---

## Run it on your phone

```bash
npm run android
```

That runs `build` → `cap sync android` → opens the project in Android Studio.
Then in Android Studio:

1. Plug in your Android phone (USB) with **USB debugging** enabled
   (Settings → About phone → tap *Build number* 7× → Developer options → USB debugging).
2. Pick your phone from the device dropdown at the top.
3. Press **Run ▶**. The app installs and launches on your phone.

To build a shareable **APK** instead: Android Studio → *Build → Build Bundle(s) / APK(s)
→ Build APK(s)*. The APK lands in `android/app/build/outputs/apk/`.

---

## Add another course

1. On [ocw.mit.edu](https://ocw.mit.edu), open a course → **Download course** →
   get the course materials. You want the folder that contains `data.json`,
   `content_map.json`, `pages/`, `resources/`, `static_resources/`, etc.
   (the same shape as the included 6.0002 folder).
2. Import it:

   ```bash
   npm run import -- "C:\path\to\the-course-folder"
   ```

   This normalizes the course, copies its files into the app, and adds it to the
   library. Repeat for as many courses as you like.
3. Rebuild and redeploy:

   ```bash
   npm run android
   ```

That's it — the new course appears on the bookshelf, fully offline.

> Tip: give a course a custom id with `npm run import -- "<folder>" --id my-id`.

---

## About offline video

Lecture videos are hosted on **YouTube**, so playing them in-app needs internet.
Each lecture also has a **“Download MP4 (offline)”** button that points to the
course's video on archive.org — save those to your phone to watch fully offline.
(All text, slides, notes, transcripts and code are already bundled offline.)

---

## Project layout

```
tools/import-course.mjs   # OCW folder -> normalized manifest + files
public/content/           # bundled courses (index.json + <id>/manifest.json + <id>/files/)
src/
  lib/            content loading, hash router, progress
  components/     PdfViewer, CodeViewer, shared UI
  screens/        Library, Course, Section, Resource
android/                  # generated Capacitor Android Studio project
```

## Dev preview in a browser

```bash
npm run dev      # http://localhost:5173
```

Useful for quick UI tweaks without rebuilding the Android app.
