export type ResourceKind =
  | "video"
  | "pdf"
  | "code"
  | "archive"
  | "image"
  | "file"
  | "html";

export interface Caption {
  lang: string;
  file: string;
}

export interface CourseResource {
  slug: string;
  title: string;
  kind: ResourceKind;
  description: string; // rewritten HTML
  youtubeId: string | null;
  archiveUrl: string | null;
  transcript: string | null; // basename under files/
  captions: Caption[];
  file: string | null; // basename under files/
  fileType: string | null;
  size: string | number | null;
}

export interface CourseSection {
  slug: string;
  title: string;
  kind: "page" | "gallery";
  contentHtml: string;
}

export interface LessonItem {
  slug: string;
  kind: ResourceKind;
  label: string;
}

export interface Lesson {
  n: number;
  title: string;
  video: string | null; // resource slug
  notesPdf?: string | null; // basename under files/ — lecture notes source (notes-based courses with no video)
  reading: string | null; // plain text (e.g. "Chapter 12.1")
  items: LessonItem[];
}

export interface ProblemSetFile {
  name: string; // path under files/, e.g. "assignments/ps1/ps1a.py"
  label: string; // basename shown in the UI
  kind: "code" | "data" | "other";
}

export interface ProblemSet {
  slug: string;
  title: string;
  kind: ResourceKind;
  number?: number; // PS number parsed from the title/slug
  lessons?: number[]; // lesson numbers this PS is attached to (by topic)
  pdf?: string | null; // the handout PDF, path under files/
  files?: ProblemSetFile[]; // starter code + data extracted from the archive
  archive?: string | null; // original .zip basename under files/ (download-all)
}

export interface CourseManifest {
  id: string;
  title: string;
  number: string;
  term: string;
  year: string;
  level: string;
  descriptionHtml: string;
  image: string | null;
  instructors: string[];
  topics: string[];
  learningResourceTypes: string[];
  lessons: Lesson[];
  problemSets: ProblemSet[];
  sections: CourseSection[];
  resources: Record<string, CourseResource>;
}

export interface CourseCard {
  id: string;
  title: string;
  number: string;
  term: string;
  year: string;
  image: string | null;
  instructors: string[];
  topics: string[];
}
