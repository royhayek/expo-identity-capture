/** VisionCamera returns a bare path; the rest of the pipeline expects a file:// URI */
export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}
